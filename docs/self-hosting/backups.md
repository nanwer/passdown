# Back up an evaluation installation

Passdown can create a consistent database-and-picture backup, check picture integrity, and verify a backup archive offline. **Database restore and upgrade recovery are still being built.** A successful archive check does not prove that an installation has been restored. Continue using disposable evaluation data until the complete recovery procedure is available and rehearsed.

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

Actual database restore, resumable activation, invalidation of old access after restore, and upgrade/rollback rehearsal remain upcoming. Running `restore` without `--check` currently refuses and changes nothing.
