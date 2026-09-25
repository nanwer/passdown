import { createHash, randomBytes } from 'node:crypto';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import { deflateSync } from 'node:zlib';

// This destructive first-run probe is restricted to the boot check's local,
// disposable stack. It never prints credentials, cookies, bodies, or URLs.
let stage = 'arguments';
// Check labels are fixed strings written here, so they are safe to print.
class CheckFailure extends Error {}
const check = (condition, label) => {
  if (!condition) throw new CheckFailure(label);
};
const args = process.argv.slice(2);
const options = new Map();
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--resume') options.set('resume', true);
  else if (['--origin', '--state-file', '--ca-file'].includes(args[i]) && args[i + 1])
    options.set(args[i].slice(2), args[++i]);
  else {
    console.error('Deployment flow failed: arguments.');
    process.exit(2);
  }
}
function privateFile(path) {
  const info = lstatSync(path);
  check(info.isFile() && (info.mode & 0o777) === 0o600, 'Private input file required');
  return readFileSync(path, 'utf8');
}
function png() {
  const crc = (bytes) => {
    let value = 0xffffffff;
    for (const byte of bytes) {
      value ^= byte;
      for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
    return (value ^ 0xffffffff) >>> 0;
  };
  const chunk = (name, data) => {
    const type = Buffer.from(name);
    const size = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(Buffer.concat([type, data])));
    return Buffer.concat([size, type, data, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(64, 0);
  header.writeUInt32BE(64, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc(64 * (64 * 3 + 1), 100);
  for (let row = 0; row < 64; row++) pixels[row * (64 * 3 + 1)] = 0;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
try {
  check(
    /^passdown-check-[a-z0-9-]+$/.test(process.env.PASSDOWN_CHECK_PROJECT || ''),
    'Disposable project required',
  );
  const origin = new URL(options.get('origin'));
  check(
    origin.protocol === 'https:' &&
      origin.hostname === 'localhost' &&
      origin.port &&
      origin.pathname === '/' &&
      !origin.search &&
      !origin.hash &&
      !origin.username &&
      !origin.password,
    'Local HTTPS origin required',
  );
  check(
    options.get('state-file') && options.get('ca-file'),
    'State and certificate files required',
  );
  const ca = readFileSync(options.get('ca-file'));
  // `host` reaches the same server by another name, as a browser opening
  // https://<server-address>:<port> would: same certificate, other address.
  function request(path, { method = 'GET', body, cookie, headers = {}, host } = {}) {
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: '127.0.0.1',
          port: origin.port,
          servername: host ? host : 'localhost',
          ca,
          rejectUnauthorized: true,
          // The one certificate names localhost; any other address gets it too.
          ...(host ? { checkServerIdentity: () => undefined } : {}),
          path,
          method,
          headers: {
            Host: host ? `${host}:${origin.port}` : origin.host,
            Origin: host ? `https://${host}:${origin.port}` : origin.origin,
            ...(body ? { 'Content-Length': body.length } : {}),
            ...(cookie ? { Cookie: cookie } : {}),
            ...headers,
          },
        },
        (res) => {
          const chunks = [];
          let length = 0;
          res.on('data', (chunk) => {
            length += chunk.length;
            if (length > 4 * 1024 * 1024) {
              req.destroy(new Error('Response limit'));
              return;
            }
            chunks.push(chunk);
          });
          res.on('end', () =>
            resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }),
          );
          res.on('error', reject);
        },
      );
      req.setTimeout(20000, () => req.destroy(new Error('Request timeout')));
      req.on('error', reject);
      req.end(body);
    });
  }
  const json = (response) => JSON.parse(response.body.toString('utf8'));
  const post = (path, value, options = {}) =>
    request(path, {
      method: 'POST',
      body: Buffer.from(JSON.stringify(value)),
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
  const cookiesOf = (response) =>
    (response.headers['set-cookie'] || []).map((entry) => entry.split(';')[0]).join('; ');
  async function verifyPicture(state) {
    const picture = await request(state.assetPath, { cookie: state.cookie });
    check(picture.status === 200, 'Owner media read');
    check(picture.headers['content-type']?.startsWith('image/webp'), 'Re-encoded image');
    check(picture.headers['cache-control'] === 'private, no-store', 'Private image caching');
    if (state.digest)
      check(
        createHash('sha256').update(picture.body).digest('hex') === state.digest,
        'Image retained',
      );
    check((await request(state.assetPath)).status === 404, 'Anonymous image denial');
    return createHash('sha256').update(picture.body).digest('hex');
  }
  if (options.get('resume')) {
    stage = 'preserved setup and media after recreation';
    const state = JSON.parse(privateFile(options.get('state-file')));
    check(state.origin === origin.origin, 'Original installation required');
    check(json(await request('/api/health')).status === 'ready', 'Recreated stack ready');
    const signIn = await request('/sign-in');
    check(!signIn.body.includes(Buffer.from('First time?')), 'Default login no longer offered');
    const retired = await post('/api/auth/sign-in/email', {
      email: 'admin@example.com',
      password: 'changeme',
    });
    check(retired.status === 401, 'Default login stays retired');
    await verifyPicture(state);
    console.log('Recreation preserved setup, session access, and the private picture.');
  } else {
    const account = {
      name: 'Deployment check',
      email: 'deployment-check@example.org',
      password: randomBytes(24).toString('hex'),
      workspaceName: 'Deployment check',
    };
    stage = 'first-run pages';
    const initialHealth = await request('/api/health');
    check(
      initialHealth.status === 200 &&
        json(initialHealth).status === 'setup-required' &&
        json(initialHealth).mode === 'persistent',
      'Initial setup health',
    );
    const front = await request('/');
    check(
      front.status === 307 && front.headers.location === '/studio',
      'Front page leads to studio',
    );
    const signInPage = await request('/sign-in');
    check(
      signInPage.status === 200 &&
        signInPage.body.includes(Buffer.from('First time?')) &&
        signInPage.body.includes(Buffer.from('admin@example.com')),
      'Sign-in page offers the default login',
    );
    stage = 'another address';
    // Caddy answers any address; sign-in there is refused with the address to use.
    const elsewhere = await request('/sign-in', { host: 'passdown-check.lan' });
    check(elsewhere.status === 200, 'Any address reaches Passdown');
    const foreign = await post('/api/setup', {}, { host: 'passdown-check.lan' });
    check(
      foreign.status === 403 && json(foreign).error?.message?.includes(origin.origin),
      'Another address is told which address to use',
    );
    stage = 'default login';
    const signedIn = await post('/api/auth/sign-in/email', {
      email: 'admin@example.com',
      password: 'changeme',
    });
    check(signedIn.status === 200, 'Default login signs in');
    const session = (signedIn.headers['set-cookie'] || []).find(
      (cookie) =>
        cookie.startsWith('__Secure-') &&
        /;\s*Secure(?:;|$)/i.test(cookie) &&
        /;\s*HttpOnly(?:;|$)/i.test(cookie) &&
        /;\s*SameSite=Lax(?:;|$)/i.test(cookie),
    );
    check(session, 'Secure authenticated session cookie');
    const cookie = cookiesOf(signedIn);
    const blocked = await request('/api/studio/session', { cookie });
    check(
      blocked.status === 403 && json(blocked).error?.code === 'SETUP_REQUIRED',
      'Default login can only finish setting up',
    );
    stage = 'invalid finish requests';
    const defaultAddress = await post(
      '/api/setup',
      { ...account, email: 'admin@example.com' },
      { cookie },
    );
    check(defaultAddress.status === 422, 'Default address refused');
    const weak = await post('/api/setup', { ...account, password: 'weak' }, { cookie });
    check(
      weak.status === 422 &&
        json(weak).error?.issues?.some(
          (issue) => issue.path === 'password' || issue.path?.includes('password'),
        ),
      'Weak password refused',
    );
    check((await post('/api/setup', account)).status === 401, 'Signed-out finish refused');
    stage = 'race-safe finish';
    const race = await Promise.all([
      post('/api/setup', account, { cookie }),
      post('/api/setup', account, { cookie }),
    ]);
    check(
      race
        .map((response) => response.status)
        .sort()
        .join(',') === '201,404',
      'Exactly one finish succeeds',
    );
    stage = 'default login retired';
    check((await request('/setup')).status === 307, 'Old setup address redirects');
    const retired = await post('/api/auth/sign-in/email', {
      email: 'admin@example.com',
      password: 'changeme',
    });
    check(retired.status === 401, 'Default login refused afterwards');
    const ready = await request('/api/health');
    check(ready.status === 200 && json(ready).status === 'ready', 'Ready health');
    stage = 'workspace and image upload';
    const sessionResponse = await request('/api/studio/session', { cookie });
    check(sessionResponse.status === 200, 'Authenticated workspace session');
    const workspace = json(sessionResponse).workspaces?.[0];
    check(workspace?.id && workspace.role === 'manage', 'Administrator workspace');
    const boundary = `passdown-${randomBytes(16).toString('hex')}`;
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="check.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      png(),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const upload = await request(`/api/studio/${workspace.id}/assets`, {
      method: 'POST',
      body,
      cookie,
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    });
    check(upload.status === 201 && json(upload).asset?.id, 'Image upload');
    const asset = json(upload).asset;
    check(asset.width === 64 && asset.height === 64, 'Image dimensions');
    const state = {
      origin: origin.origin,
      cookie,
      assetPath: `/api/media/${workspace.id}/${asset.id}`,
    };
    stage = 'private media access';
    const digest = await verifyPicture(state);
    writeFileSync(options.get('state-file'), JSON.stringify({ ...state, digest }), {
      flag: 'wx',
      mode: 0o600,
    });
    console.log('First-run setup, secure session, workspace, and private image upload passed.');
  }
} catch (error) {
  const label = error instanceof CheckFailure ? ` (${error.message})` : '';
  console.error(`Deployment flow failed: ${stage}${label}.`);
  process.exitCode = 1;
}
