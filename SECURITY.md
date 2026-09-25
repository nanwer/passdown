# Security policy

## Supported versions

Passdown is in Open Alpha. Security fixes are made for the latest alpha release only. Upgrade to the newest release with `sh upgrade.sh` before reporting a problem you found in an older one.

| Version                | Supported |
| ---------------------- | --------- |
| Latest `0.1.0-alpha.*` | Yes       |
| Anything older         | No        |

## Reporting a vulnerability

Report vulnerabilities privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. This creates a private advisory that only the maintainers can read.

Please don't report security problems in public issues, discussions or pull requests, and don't publish exploit details before a fix is released.

Include what you can of:

- the Passdown version (`docker compose run --rm -T ops version`, or the commit you built from);
- how the installation is set up: Caddy or nginx, published images or built from source;
- what an attacker needs, such as no account, a member account, or an administrator account;
- the steps to reproduce, and what happens compared with what should happen;
- any logs, with passwords, reset or invitation links, setup codes and personal data removed.

You'll get an acknowledgement when the report has been read. Fixes are released as a new alpha, and the changelog describes them without exploit details. Reporters are credited in the advisory unless they prefer not to be.

## Scope

In scope: the Passdown application, the operator command, the container images and the deployment files in this repository (Compose files, `init.sh`, `upgrade.sh`, `backup.sh` and the proxy configurations).

Out of scope: problems that need an attacker who already controls the server, its Docker engine, or the settings file; vulnerabilities in third-party software that Passdown uses unchanged (report those upstream); and denial of service by sheer traffic volume.

Operators should follow the [self-hosting guide](docs/self-hosting/install.md), keep the settings file private, and keep backups off the server.
