# Cutting a Passdown release

Releases are published only when the project owner says to publish. The [release workflow](../../.github/workflows/release.yml) builds the images, tests them, pushes them to GitHub Container Registry and drafts a GitHub release. It never publishes that release. Only exact version tags are pushed, never `latest` or another moving tag, because every upgrade has to go through `upgrade.sh`'s backup and migration gate.

## What the workflow does

| Job        | Runs                                                                                                                                                                                         | Writes                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **check**  | Confirms the tag is `v<version>`, where `<version>` is the alpha version in `packages/contracts/src/build-info.ts`, every `package.json` and the compose image tags. Then runs `pnpm check`. | nothing                                                              |
| **build**  | Builds `passdown`, `passdown-caddy` and `passdown-nginx` for linux/amd64 and linux/arm64, with provenance and an SBOM.                                                                       | untagged images pushed by digest (`release` environment)             |
| **smoke**  | Renders the install files, then runs the deployment boot check against the amd64 images, once behind Caddy and once behind nginx.                                                            | nothing                                                              |
| **merge**  | Tags each multi-architecture image `ghcr.io/nanwer/<image>:<version>`. Refuses if that tag already exists.                                                                                   | version tags (`release` environment)                                 |
| **assets** | Renders `compose.yaml` and `compose.nginx.yaml` with each image pinned as `:<version>@sha256:<digest>`, copies `init.sh`, `upgrade.sh` and `backup.sh`, and writes `SHA256SUMS`.             | a **draft** pre-release with those six files (`release` environment) |

Starting the workflow by hand (**Actions → Release → Run workflow**) is a dry run unless you clear **dry_run**. A dry run builds both architectures and runs the smoke job from locally built images, but pushes nothing, logs in to no registry and creates no release. Clearing **dry_run** is only accepted when you start it from a release tag.

## One-time setup

1. **Settings → Code security → Private vulnerability reporting:** enable it, so the reporting route in `SECURITY.md` works.
2. **Settings → Environments → New environment** named `release`. Add the owner as a required reviewer and restrict deployments to tags matching `v*`. The check job refuses to publish if this environment is missing or has no required reviewer.
3. Leave the three GHCR packages alone until the first release has been published (step 7 below).

## Steps

1. Run a dry run from `main` and wait for it to pass.
2. Make sure the version everywhere is the one being released: `packages/contracts/src/build-info.ts`, every `package.json`, the image tags in `deploy/compose.yaml` and `deploy/compose.nginx.yaml`, and the `PASSDOWN_VERSION` defaults. The build-information test fails if these disagree. In the same commit, give the version's `CHANGELOG.md` heading its release date in place of `(unreleased)`, and remove the README's sentence that the release's images are not yet published and the install guide's **Before the first release** note. Commit and push that change to `main`.
3. The owner says "publish". Until then, nobody pushes a tag.
4. Push the annotated tag for that exact commit:

   ```sh
   git tag -a v0.1.0-alpha.1 -m "Passdown 0.1.0-alpha.1"
   git push origin v0.1.0-alpha.1
   ```

   Push only this tag: never `--tags`, `--all` or `--mirror`.

5. In **Actions → Release**, the owner approves the `release` environment when the build jobs wait. Approve again for **merge** and then **assets** once the smoke test has passed.
6. Open the draft under **Releases**. Replace the placeholder notes with the reviewed release notes. Download the files, run `sha256sum --check SHA256SUMS`, and confirm every image in `compose.yaml` reads `ghcr.io/nanwer/…:<version>@sha256:…`. The owner then publishes the draft.
7. After the first release only: open each of the `passdown`, `passdown-caddy` and `passdown-nginx` packages under the owner's GitHub **Packages**. Set its visibility to **Public** and check that it is linked to the `nanwer/passdown` repository. Packages that a personal account creates start out private, so installs fail until this is done.

If a run fails before **merge**, nothing has been tagged: fix the cause, delete and push the tag again only if the commit changed, and re-run. Once a version tag exists, it is never replaced. Release the fix under the next alpha number.
