import { test, expect, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { readConfig } from '../../scripts/local-config.mjs';
const credentials = readConfig();
const origin = 'http://127.0.0.1:3101';
const headers = { Origin: origin, Connection: 'close' };
const password = credentials.GUIDE_LOCAL_OWNER_PASSWORD!;

async function database<T>(run: (db: pg.Client) => Promise<T>) {
  const url = new URL(credentials.GUIDE_OWNER_DATABASE_URL!);
  url.pathname = '/guide_app_e2e';
  const db = new pg.Client({ connectionString: url.href });
  await db.connect();
  try {
    return await run(db);
  } finally {
    await db.end();
  }
}
/**
 * An account created straight in the disposable browser database, with the
 * local owner's password hash so the test knows its password without hashing.
 */
async function createAccount(options: { active?: boolean; administrator?: boolean } = {}) {
  const id = randomUUID(),
    suffix = id.slice(0, 8),
    name = `Account ${suffix}`,
    email = `account-${suffix}@example.test`;
  await database(async (db) => {
    await db.query(
      'INSERT INTO public.auth_user(id,name,email,email_verified,active) VALUES($1,$2,$3,true,$4)',
      [id, name, email, options.active ?? true],
    );
    await db.query(
      `INSERT INTO public.auth_account(id,account_id,provider_id,user_id,password)
       SELECT $1,$1,'credential',$1,a.password FROM public.auth_account a
       JOIN public.auth_user u ON u.id=a.user_id
       WHERE u.email=$2 AND a.provider_id='credential'`,
      [id, credentials.GUIDE_LOCAL_OWNER_EMAIL],
    );
    if (options.administrator)
      await db.query('SELECT * FROM app.operator_grant_administrator($1)', [email]);
  });
  return { id, name, email };
}
async function signIn(request: APIRequestContext, email: string, value: string) {
  return request.post('/api/auth/sign-in/email', { headers, data: { email, password: value } });
}

test('@api a suspended account fails sign-in like a wrong password and gets no session', async ({
  request,
}) => {
  const account = await createAccount({ active: false });
  const wrong = await signIn(request, account.email, 'A-deliberately-wrong-password');
  expect(wrong.status()).toBe(401);
  const refusal = (await wrong.json()).error;
  for (let attempt = 0; attempt < 8; attempt++)
    expect((await signIn(request, account.email, 'A-deliberately-wrong-password')).status()).toBe(
      401,
    );
  // The tenth failure: the correct password of a suspended account.
  const suspended = await signIn(request, account.email, password);
  expect(suspended.status()).toBe(401);
  expect(suspended.headers()['set-cookie']).toBeUndefined();
  const body = (await suspended.json()).error;
  expect({ code: body.code, message: body.message }).toEqual({
    code: refusal.code,
    message: refusal.message,
  });
  expect(
    await database(
      async (db) =>
        (await db.query('SELECT count(*) FROM public.auth_session WHERE user_id=$1', [account.id]))
          .rows[0].count,
    ),
  ).toBe('0');
  // It counted as a failure and cleared nothing, so the limit now applies.
  expect((await signIn(request, account.email, password)).status()).toBe(429);
});

test('@api page scripts cannot read the session token from any response', async ({ request }) => {
  const response = await signIn(request, credentials.GUIDE_LOCAL_OWNER_EMAIL!, password);
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).not.toHaveProperty('token');
  const cookies = (await request.storageState()).cookies;
  expect(cookies.length).toBeGreaterThan(0);
  for (const cookie of cookies) {
    expect(cookie.httpOnly).toBe(true);
    expect(JSON.stringify(body)).not.toContain(decodeURIComponent(cookie.value).split('.')[0]);
  }
  expect((await request.get('/api/auth/get-session')).status()).toBe(404);
  // The session itself still works.
  expect((await request.get('/api/studio/session')).status()).toBe(200);
});

test('Administration → Accounts sends another administrator to the server command', async ({
  page,
}) => {
  const colleague = await createAccount({ administrator: true });
  const reader = await createAccount();
  expect(
    (await signIn(page.request, credentials.GUIDE_LOCAL_OWNER_EMAIL!, password)).status(),
  ).toBe(200);
  await page.goto('/admin/accounts');
  const search = page.getByRole('searchbox', { name: 'Search accounts' });
  await search.fill(colleague.email);
  const row = page.getByRole('row').filter({ hasText: colleague.email });
  await expect(row).toContainText('Administrator');
  await expect(
    row.getByText("Another administrator's password can only be reset from the server:"),
  ).toBeVisible();
  await expect(
    row.getByText(`docker compose run --rm ops reset-password --email ${colleague.email}`, {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: `Create reset link for ${colleague.name}`, exact: true }),
  ).toHaveCount(0);
  await search.fill(reader.email);
  await expect(
    page.getByRole('button', { name: `Create reset link for ${reader.name}`, exact: true }),
  ).toBeVisible();
  // The database refuses it too, whatever the interface offers.
  const refused = await page.request.post(`/api/admin/accounts/${colleague.id}/password-reset`, {
    headers,
  });
  expect(refused.status()).toBe(422);
  expect((await refused.json()).error.message).toContain(
    `docker compose run --rm ops reset-password --email ${colleague.email}`,
  );
});
