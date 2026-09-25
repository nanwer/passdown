# Back up and restore an evaluation installation

Passdown can back up guides and pictures together, verify archive integrity, and restore them into an empty installation. Interrupted restores can be resumed or discarded. These commands are available for source-built evaluation; published installation images and upgrade recovery remain unfinished. A successful archive check alone does not prove that an installation has been restored.

Use the operator image built from the same source revision as the installation. From `deploy`, rebuild it after updating the source:

```sh
docker compose build web
```

This rebuild does not replace the running web container. These commands use the saved settings and existing database; they do not reset it.

## Check pictures

```sh
docker compose run --rm -T ops verify-media --checksums
```

The report identifies missing display pictures, size/checksum damage, unsafe files, and references that have no matching picture record. It checks draft and published content, guide covers and thing pictures. It never deletes or repairs files. Unreferenced display files are reported separately; resized copies are ignored because they can be regenerated.

For a machine-readable report:

```sh
docker compose run --rm -T ops verify-media --checksums --json
```

The JSON goes to standard output; diagnostics go to standard error. Exit `0` means no missing, damaged or dangling pictures. Exit `1` means verification found problems or could not complete. `--quiet` suppresses routine human-readable output.

## Save a private backup

```sh
sh backup.sh
```

The wrapper creates `deploy/backups` if needed, writes a private temporary file, then checks the complete archive before exposing its final name. Files are readable and writable only by their owner. An interrupted or failed command removes its own partial file. Existing backups are never replaced.

Choose an output directory outside the source checkout, preferably on a separate disk:

```sh
sh backup.sh /path/to/private-backups
```

For an installation using a different settings file:

```sh
sh backup.sh --env-file evaluation.env /path/to/private-backups
```

Keep the settings file separately in a secret store. It is not inside the backup.

The archive contains four members: `database.dump`, `media.tar`, `manifest.json` and `SHA256SUMS`. The database dump and picture list come from the same database snapshot. Concurrent new edits are excluded from that snapshot. Only original display pictures are included, not resized copies. This relies on stored originals remaining immutable; a future picture-deletion feature must preserve this backup contract.

Backups contain **private guides and pictures, account names, email addresses, password hashes, invitation/reset-link hashes and audit records**. Environment secrets, active sessions, verification tokens and rate-limit data are excluded. Encrypt backups, restrict access, and keep a copy off the installation's host. An archive checksum detects corruption; it does not establish who created an archive.

Missing pictures refuse backup by default. To deliberately capture an incomplete installation, the lower-level command supports `backup --allow-missing-media`. It records the exact missing picture identities in the manifest. Damaged files and dangling references always refuse backup. Investigate the integrity report before choosing that exception.

`passdown backup --output <directory>` writes the four members into a new private directory on an operator-mounted volume. The directory must already exist. Default `passdown backup` writes only the tar stream to standard output; do not send that binary stream to a terminal. Use the host wrapper for a checked archive file.

## Verify a saved archive without the database

```sh
docker compose run --rm --no-deps -T ops restore --check < /path/to/private-backups/passdown-example.tar
```

This check does not connect to PostgreSQL or require database credentials. It verifies archive structure, checksums, picture member names/totals, the custom database dump, and an exact migration match with the operator build. It uses temporary private disk space and removes it afterwards. Use an operator build matching the backup; a newer schema is not accepted as automatically compatible.

Expected output: **Backup archive integrity and compatibility checks passed. No database was restored.**

## Restore into a separate installation

Only restore a backup you made yourself, or one from an operator you trust completely. Restoring runs the database dump with the database owner's credentials, which in the default deployment is the PostgreSQL superuser: a crafted dump could run any SQL on the database server and commands inside the database container. Checksums prove an archive is complete and undamaged, not who made it.

Restore unpacks the archive in the operator container's own temporary space, never in the shared picture volume, and deletes it as soon as the database has loaded. That space needs room for the whole archive while the restore runs.

Use source with the **same migration list** as the backup. Keep the original installation and backup intact. From that checkout's `deploy` directory:

1. Create settings for a separate evaluation project and unused ports:

   ```sh
   sh init.sh --domain localhost --build --project passdown-restore-evaluation --http-port 8088 --https-port 8448 --output restore.env
   docker compose --env-file restore.env build web proxy
   ```

   Keep `restore.env` private. Do not open `/setup`, run migrations, or start the web service yet. This project must have empty database and media volumes. Choose another project name if it already exists.

2. Check the archive before connecting to the target:

   ```sh
   docker compose --env-file restore.env run --rm --no-deps -T ops restore --check < /path/to/private-backups/passdown-example.tar
   ```

3. Restore it:

   ```sh
   docker compose --env-file restore.env run --rm -T ops restore < /path/to/private-backups/passdown-example.tar
   ```

   This starts PostgreSQL, but not migrations or the web service. Restore refuses a database containing user objects or a media root containing existing files. It closes application connections while loading, checks exact table counts and migrations, verifies picture checksums, cancels pending invitations, then moves pictures into place. It proves the configured runtime password against the `postgres` database before opening the restored database. If you restricted CONNECT on `postgres`, that proof must be allowed before activation can finish.

4. Read the dated access report. Accounts, password hashes and workspace permissions reflect the backup snapshot. Everyone must sign in again; old invitation and verification links do not carry over. In versions supporting password-reset links, those links are revoked too. Versions without installation-administrator or restore-audit support report that explicitly.

   People removed after the snapshot may have access again, and passwords changed afterwards revert to their old values. Once the web service starts, promptly review **Studio → People** before announcing the restored address. This version does not yet provide the account-recovery UI or an administrator password-reset command.

5. Start the restored installation:

   ```sh
   docker compose --env-file restore.env up -d
   docker compose --env-file restore.env run --rm -T ops verify-media --checksums --json
   ```

   Open `https://localhost:8448` using the local certificate trust instructions in the [evaluation guide](development-stack.md). Expect health to become ready, a manager to sign in using credentials from the snapshot, public guides to load signed out, and private guides to require membership. `/setup` must refuse creating another initial account. Original pictures should match the backup. Resized copies regenerate on demand.

A backup deliberately made with missing pictures preserves that exact missing set: restore warns rather than pretending the pictures were recovered. New missing pictures, damaged files or dangling references prevent activation.

For an extracted four-file backup directory mounted inside the operator container, use `restore --from /mounted/backup`. `restore --check --from /mounted/backup` checks it offline. Paths refer to the container filesystem, not the host.

## Resume or discard an interrupted restore

Keep the same target settings and media volume. The database checkpoint is authoritative; private state under `.passdown-restore` records the matching archive and file ownership. Do not edit that state by hand.

```sh
docker compose --env-file restore.env run --rm -T ops restore --activate
```

After the database has loaded, this resumes verification, access cleanup, picture moves or final activation as needed. Already committed credential cleanup is not repeated. A wrong runtime password keeps application connections closed; correct the configuration and retry. An incomplete upload or failed verification requires discard:

```sh
docker compose --env-file restore.env run --rm -T ops restore --discard
```

Discard removes only the recorded unfinished restore, empties its restored database objects, and restores its previous connection permissions. It refuses a normal or already active installation. If database cleanup completed but its file record remains, it proves the database empty before removing that record. It refuses ambiguous state or files that have been replaced manually.

If state is missing or damaged, use a new empty evaluation project. Only if you intend to destroy this entire disposable restore project, its final fallback is:

```sh
docker compose --env-file restore.env -p passdown-restore-evaluation down --volumes
```

That command deletes this named project's database and media volumes. Never substitute the original installation's settings or project name.

## What the checks establish

- An archive check proves the file set is intact and compatible with this operator build.
- Picture verification checks stored files against database records.
- A completed restore proves loading, row counts, migrations, picture integrity and application database access passed.
- A recovery rehearsal also exercises the running app: sign-in, permissions, published guides and pictures.

Rehearse recovery on a separate installation periodically. Upgrade and rollback tooling, published images and the remaining release checks are still upcoming.
