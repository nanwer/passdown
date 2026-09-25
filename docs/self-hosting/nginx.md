# Using nginx instead of Caddy

Passdown ships two HTTPS proxies that meet the same contract. Caddy is the default and obtains certificates itself. Choose nginx when you already manage certificates, for example with certbot or your organisation's certificate authority.

## What stays the same

Both proxies:

- redirect HTTP to HTTPS on your domain and send `Strict-Transport-Security` (turned off for `localhost`);
- accept pictures up to 22 MB on the upload route and 2 MB bodies elsewhere;
- apply the same request limits to sign-in, setup and invitation links, and administration, configured with `PASSDOWN_SIGN_IN_LIMIT`, `PASSDOWN_LINK_LIMIT` and `PASSDOWN_ADMIN_LIMIT` (see [request limits](development-stack.md#network-addresses-and-request-limits));
- group IPv6 visitors by /64 and IPv4 visitors by address;
- write JSON access logs in which invitation links, reset links, administration paths, setup requests and every query string are replaced with `[redacted]`;
- hide the proxy's name and version from responses.

The differences: nginx limits requests with a leaky bucket (a burst of one less than the limit, then one request per interval) where Caddy uses a sliding window; nginx's own error log is limited to critical messages, because it cannot redact them; and you are responsible for renewing certificates.

## Install with nginx

Put your certificate chain and private key in one folder, named exactly:

```text
fullchain.pem   the server certificate followed by any intermediate certificates
privkey.pem     the private key for that certificate
```

Keep the folder readable only by the account that runs Docker. The proxy mounts it read-only. The folder path may contain letters, digits and `. _ / + @ -`.

Create the settings, naming nginx and the folder:

```bash
sh init.sh --domain guides.example.org --proxy nginx --tls-dir /etc/passdown/tls
```

Then start the stack and finish setup in the browser as usual. `init.sh` refuses a folder that lacks either file, and refuses `--acme-email` and `--internal-tls`, which are Caddy options. The settings record `PASSDOWN_PROXY=nginx`, `PASSDOWN_TLS=files`, the folder's absolute path as `PASSDOWN_TLS_DIR`, and `compose.nginx.yaml` in `COMPOSE_FILE`, so every later `docker compose` command, backup and upgrade uses nginx.

Until the first release images are published, add `--build` to build Passdown and the nginx proxy from this source checkout.

## Renewing certificates

Replace both files in the folder, then tell nginx to load them:

```bash
docker compose exec proxy nginx -s reload
```

With certbot, obtain the first certificate before starting Passdown, while ports 80 and 443 are free:

```bash
certbot certonly --standalone -d guides.example.org
```

Certbot keeps its files as links into its own archive, which the proxy cannot follow, so copy them into your folder with `cp -L` from `/etc/letsencrypt/live/guides.example.org/`. For renewal, certbot's standalone mode needs port 80 for a moment: give `certbot renew` a `--pre-hook` that runs `docker compose stop proxy` and a `--post-hook` that copies the renewed files and runs `docker compose start proxy`, each with `--project-directory` set to your installation folder. The site is unreachable for the few seconds the renewal takes.

## Checking the nginx proxy

From a source checkout, after building the images:

```bash
PASSDOWN_PROXY=nginx node scripts/check-proxy.mjs --live
```

```bash
PASSDOWN_PROXY=nginx sh scripts/deployment-boot-check.sh
```

The first checks the proxy contract with a throwaway certificate: headers, upload limits, request limits, IPv6 grouping and log redaction. The second creates a disposable installation behind nginx, completes setup, uploads a picture, recreates the containers and removes everything it created.
