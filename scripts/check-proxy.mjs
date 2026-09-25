import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import https from 'node:https';

// Never print request data or container logs. Failures identify the contract only.
// PASSDOWN_PROXY=nginx runs the same live contract against the nginx proxy.
const kind = process.env.PASSDOWN_PROXY || 'caddy';
assert.ok(['caddy', 'nginx'].includes(kind), 'PASSDOWN_PROXY must be caddy or nginx.');
const image = process.env.PASSDOWN_PROXY_IMAGE || `passdown-${kind}:local`;
const token = 'proxy-check-secret-0123456789abcdef';
const paths = [
  `/invite/${token}`,
  `//invite/${token}`,
  `/./invite/${token}`,
  `https://localhost/invite/${token}`,
  `//invite/${token}%41`,
  `/./invite/${token}%41`,
  `https://localhost/invite/${token}%41`,
  `/api/invitations/${token}`,
  `/reset/${token}`,
  `/api/password-resets/${token}`,
  `/api/admin/accounts/${token}/password-reset`,
  `/setup?code=${token}`,
  `/API/Invitations/${token}`,
  `/%69nvite/${token}`,
  `/sign-in?next=%2Finvite%2F${token}`,
  `/api/invitations/${token}/x?y=${token}`,
  `/api/invitations/${token.slice(0, 16)}%41${token.slice(16)}`,
];
const config = readFileSync(process.env.PASSDOWN_CADDYFILE || 'deploy/caddy/Caddyfile', 'utf8');
const filters = [...config.matchAll(/request>uri regexp "([^"]+)" "([^"]+)"/g)];
assert.equal(filters.length, 2, 'Access and error logs must both filter request URIs.');
for (const [, pattern, replacement] of filters) {
  const expression = new RegExp(pattern.replace('(?i)', ''), 'i');
  for (const path of paths) {
    const redacted = path.replace(expression, (...args) =>
      replacement.replace(/\$\{(\d+)\}/g, (_, group) => args[Number(group)] || ''),
    );
    assert.ok(!redacted.includes(token.slice(0, 16)), 'Proxy URI filter leaked a token fragment.');
    assert.ok(redacted.includes('[redacted]'), 'Sensitive route was not redacted.');
  }
  for (const [path, expected] of [
    ['/admin/accounts', '/admin/accounts'],
    [`/invite/${token}`, '/invite/[redacted]'],
    [`/API/Invitations/${token}`, '/API/Invitations/[redacted]'],
    [`/%69nvite/${token}`, '/[redacted]'],
    [`/setup?code=${token}`, '/setup?[redacted]'],
    [`/sign-in?next=%2Finvite%2F${token}`, '/sign-in?[redacted]'],
  ]) {
    const result = path.replace(expression, (...args) =>
      replacement.replace(/\$\{(\d+)\}/g, (_, group) => args[Number(group)] || ''),
    );
    assert.equal(result, expected, 'Proxy URI filter must preserve only the safe route prefix.');
  }
}
assert.equal(
  (config.match(/ipv6_prefix 64/g) || []).length,
  3,
  'All edge limits must group IPv6 by /64.',
);

// nginx: the same redaction expression, applied by its njs helper, and the
// same /64 grouping for its limit keys.
const helperSource = readFileSync('deploy/nginx/passdown.js', 'utf8');
const nginxHelpers = (
  await import(`data:text/javascript;base64,${Buffer.from(helperSource).toString('base64')}`)
).default;
assert.equal(
  nginxHelpers.URI_FILTER.source.replaceAll('\\/', '/'),
  filters[0][1].replace('(?i)', ''),
  'The nginx URI filter must equal the Caddy filter.',
);
assert.ok(nginxHelpers.URI_FILTER.flags.includes('i'), 'The nginx URI filter must ignore case.');
const nginxRedact = (uri) => nginxHelpers.redactedUri({ variables: { request_uri: uri } });
for (const [, pattern, replacement] of filters.slice(0, 1)) {
  const expression = new RegExp(pattern.replace('(?i)', ''), 'i');
  for (const path of [...paths, '/admin/accounts', '/guides/example', '/'])
    assert.equal(
      nginxRedact(path),
      path.replace(expression, (...args) =>
        replacement.replace(/\$\{(\d+)\}/g, (_, group) => args[Number(group)] || ''),
      ),
      'nginx and Caddy must redact identically.',
    );
}
const key = (remote_addr) => nginxHelpers.clientKey({ variables: { remote_addr } });
assert.equal(key('192.0.2.7'), '192.0.2.7', 'IPv4 clients keep their own bucket.');
assert.equal(key('::ffff:192.0.2.7'), '192.0.2.7', 'IPv4-mapped clients are IPv4 clients.');
for (const address of ['fd00:7061:12:1::10', 'fd00:7061:12:1::11', 'fd00:7061:12:1:0:0:0:ffff'])
  assert.equal(key(address), 'fd00:7061:12:1::/64', 'One IPv6 /64 must share a bucket.');
assert.equal(key('fd00:7061:12:2::10'), 'fd00:7061:12:2::/64', 'Another /64 stays independent.');
assert.equal(key('1:2::5:6:7:8:9'), '1:2:0:5::/64', 'Compressed zeros must expand in place.');
assert.equal(key('fd00::1'), 'fd00:0:0:0::/64', 'A short prefix must expand to four groups.');
const nginxTemplate = readFileSync('deploy/nginx/nginx.conf.template', 'utf8');
for (const zone of ['sign_in', 'links', 'admin'])
  assert.match(
    nginxTemplate,
    new RegExp(`limit_req zone=${zone} burst=@[A-Z_]+_BURST@ nodelay;`),
    'Every nginx limit must admit its full per-minute allowance at once.',
  );
for (const zone of ['SIGN_IN', 'LINK', 'ADMIN']) {
  assert.ok(
    config.includes(`PASSDOWN_${zone}_LIMIT:300`),
    'Edge limits must leave room for shared-address traffic.',
  );
}
if (!process.argv.includes('--live')) {
  console.log('Proxy log-redaction and nginx equivalence cases passed.');
} else {
  const suffix = `${process.pid}-${Date.now()}`;
  const network = `passdown-proxy-check-${suffix}`;
  const upstream = `${network}-web`;
  const proxy = `${network}-proxy`;
  const ipv6Prefix = `fd00:7061:${(process.pid % 65536).toString(16)}`;
  const proxyAddress = `${ipv6Prefix}:0::100`;
  const nodeImage =
    'node:22.22.2-alpine3.22@sha256:b77017c37f430e4466ff497058948a2f16e8b59779600d53711eeb7b999b0f4e';
  const docker = (...args) =>
    execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  let port;
  let certificate;
  // nginx serves operator-supplied files; the check makes a throwaway pair.
  const tls = kind === 'nginx' ? mkdtempSync(join(tmpdir(), 'passdown-proxy-tls-')) : null;
  if (tls) {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '1',
        '-subj',
        '/CN=localhost',
        '-addext',
        'subjectAltName=DNS:localhost',
        '-keyout',
        join(tls, 'privkey.pem'),
        '-out',
        join(tls, 'fullchain.pem'),
      ],
      { stdio: 'ignore' },
    );
    certificate = readFileSync(join(tls, 'fullchain.pem'), 'utf8');
  }
  function request(path, options = {}) {
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: '127.0.0.1',
          servername: 'localhost',
          port,
          path,
          ca: options.ca ?? certificate,
          method: options.body ? 'POST' : 'GET',
          headers: {
            Host: 'localhost',
            Referer: token,
            Cookie: token,
            Authorization: token,
            ...options.headers,
          },
        },
        (res) => {
          res.resume();
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers }));
        },
      );
      req.setTimeout(10000, () => req.destroy(new Error('Proxy request timed out.')));
      req.on('error', reject);
      req.end(options.body);
    });
  }
  async function start(limit) {
    docker(
      'run',
      '-d',
      '--name',
      proxy,
      '--network',
      network,
      '--ip6',
      proxyAddress,
      '-p',
      '127.0.0.1::443',
      '-e',
      'PASSDOWN_DOMAIN=localhost',
      '-e',
      'PASSDOWN_TLS=internal',
      ...(limit === undefined
        ? []
        : [
            '-e',
            `PASSDOWN_LINK_LIMIT=${limit}`,
            '-e',
            `PASSDOWN_SIGN_IN_LIMIT=${limit}`,
            '-e',
            `PASSDOWN_ADMIN_LIMIT=${limit}`,
          ]),
      ...(process.env.PASSDOWN_CADDYFILE
        ? ['-v', `${process.env.PASSDOWN_CADDYFILE}:/etc/caddy/Caddyfile:ro`]
        : []),
      ...(tls ? ['-v', `${tls}:/etc/passdown/tls:ro`] : []),
      image,
    );
    port = Number(docker('port', proxy, '443/tcp').split(':').at(-1));
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        if (!tls)
          certificate = docker('exec', proxy, 'cat', '/data/caddy/pki/authorities/local/root.crt');
        await request('/');
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    throw new Error('Proxy did not start.');
  }
  try {
    docker('network', 'create', '--ipv6', '--subnet', `${ipv6Prefix}::/56`, network);
    docker(
      'run',
      '-d',
      '--name',
      upstream,
      '--network',
      network,
      '--network-alias',
      'web',
      nodeImage,
      'node',
      '-e',
      'require("http").createServer((q,s)=>{q.resume();q.on("end",()=>{s.setHeader("X-Observed-Client",q.headers["x-forwarded-for"]||"missing");s.setHeader("Location",q.url);s.setHeader("Set-Cookie","proxy-check-secret-0123456789abcdef");s.end("ok")})}).listen(3000,"0.0.0.0")',
    );
    await start();
    // Successful traffic must not exhaust a classroom's shared edge bucket.
    for (let attempt = 0; attempt < 31; attempt++) {
      assert.equal(
        (await request('/api/auth/sign-in/email', { body: Buffer.from('{}') })).status,
        200,
        'Normal shared-address sign-ins were throttled.',
      );
    }
    await assert.rejects(
      request('/', { ca: [] }),
      /certificate|self.signed|unable to verify/i,
      'HTTPS must reject a certificate when its issuer is not trusted.',
    );
    for (const path of paths)
      assert.equal((await request(path)).status, 200, 'Proxy failed to forward a route.');
    const normal = await request('/');
    assert.ok(
      normal.headers['x-observed-client'],
      'The proxy must forward the observed peer address.',
    );
    console.log(
      `Published-port peer observed by ${kind}: ${normal.headers['x-observed-client']}. Verify distinct external clients on the deployment host.`,
    );
    assert.equal(
      normal.headers['strict-transport-security'],
      'max-age=31536000',
      'HTTPS requires HSTS.',
    );
    assert.equal(normal.headers.server, undefined, 'Proxy must hide its Server header.');
    assert.equal(
      (await request('/api/setup', { body: Buffer.alloc(2 * 1024 * 1024 + 1) })).status,
      413,
      'Non-upload body cap failed.',
    );
    assert.equal(
      (await request('/api/studio/workshop/assets', { body: Buffer.alloc(3 * 1024 * 1024) }))
        .status,
      200,
      'Upload must allow a normal photograph.',
    );
    assert.equal(
      (await request('/api/studio/workshop/assets', { body: Buffer.alloc(22 * 1024 * 1024 + 1) }))
        .status,
      413,
      'Upload body cap failed.',
    );
    docker('stop', upstream);
    for (const path of paths)
      assert.equal((await request(path)).status, 502, 'Unreachable upstream should return 502.');
    // Capture both streams without printing request-bearing log records.
    const result = spawnSync('docker', ['logs', proxy], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.ok(
      !(result.stdout + result.stderr).includes(token.slice(0, 16)),
      'Proxy logs leaked a token fragment.',
    );
    docker('rm', '-f', proxy);
    docker('start', upstream);
    await start(2);
    for (const routes of [
      ['/api/setup', '/API/Invitations/example', '/%69nvite/example'],
      ['/api/admin/accounts', '/API/ADMIN/accounts', '/%61pi/admin/accounts'],
      ['/api/auth/sign-in/email', '/API/AUTH/SIGN-IN/EMAIL', '/%61pi/auth/sign-in/email'],
    ]) {
      for (let index = 0; index < routes.length; index++) {
        const response = await request(routes[index], {
          body: Buffer.from('{}'),
          headers: { 'X-Forwarded-For': `192.0.2.${index}` },
        });
        assert.equal(
          response.status,
          index < 2 ? 200 : 429,
          'Encoded or uppercase route bypassed per-address limits.',
        );
      }
    }
    // Real IPv6 peers, not spoofed forwarding headers: adjacent addresses
    // in one /64 share a bucket; another /64 remains independent.
    const fromIPv6 = (address) =>
      JSON.parse(
        docker(
          'run',
          '--rm',
          '--network',
          network,
          '--ip6',
          address,
          '-e',
          `CHECK_CA=${certificate}`,
          '-e',
          `CHECK_HOST=${proxyAddress}`,
          nodeImage,
          'node',
          '-e',
          `
      const https = require('https');
      const q = https.request({hostname:process.env.CHECK_HOST, servername:'localhost', path:'/api/setup', ca:process.env.CHECK_CA, headers:{Host:'localhost','X-Forwarded-For':'192.0.2.99'}}, r=>{r.resume(); r.on('end',()=>process.stdout.write(JSON.stringify({status:r.statusCode,peer:r.headers['x-observed-client']})))});
      q.on('error',()=>process.exit(1)); q.end();
    `,
        ),
      );
    const firstAddress = `${ipv6Prefix}:1::10`;
    const secondAddress = `${ipv6Prefix}:1::11`;
    const first = fromIPv6(firstAddress);
    assert.deepEqual(
      first,
      { status: 200, peer: firstAddress },
      'The proxy must observe the first real IPv6 peer.',
    );
    const second = fromIPv6(secondAddress);
    assert.deepEqual(
      second,
      { status: 200, peer: secondAddress },
      'The proxy must observe a distinct IPv6 peer.',
    );
    assert.equal(
      fromIPv6(`${ipv6Prefix}:1::12`).status,
      429,
      'Cycling addresses in one /64 bypassed the limit.',
    );
    assert.equal(fromIPv6(`${ipv6Prefix}:2::10`).status, 200, 'An independent /64 was blocked.');
    console.log(
      `Live ${kind} proxy limits, forwarding, body caps, HTTPS headers and log privacy passed.`,
    );
  } finally {
    for (const container of [proxy, upstream]) {
      try {
        docker('rm', '-f', container);
      } catch {
        /* Already removed. */
      }
    }
    try {
      docker('network', 'rm', network);
    } catch {
      /* No network was created. */
    }
    if (tls) rmSync(tls, { recursive: true, force: true });
  }
}
