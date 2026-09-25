# Backlog

Work that is understood and deliberately not being done yet.

## Information architecture

**Done.** Kept here as the record of what was decided and why.

Navigation is inconsistent about where you are and what you can reach from
there, and the same destination is described differently depending on the
screen you happen to be standing on. Symptoms found so far, each patched in
isolation rather than as a whole:

- The public library's only route into the studio was a button reading "Write a
  guide", so nothing else in the studio was discoverable from the front page.
- `/studio` — the page you land on — showed no route to a workspace's things,
  catalog or people; the card was one link into the guide list.
- Inside a workspace the whole navigation group was gated on managing it, so
  somebody who could only read had a studio with no navigation at all.
- The header shows "Workspaces · Library" on one page and "Workspaces · Guides ·
  Things · Catalog · People · Library" on another, with no indication that the
  shorter one is a subset rather than the whole product.

Each of those was fixed and covered by a test, but they were symptoms. The
underlying question — what the top level of this product is, and what belongs
inside a workspace rather than beside it — is now partly answered.

**Done.** An installation names the workspace it serves at its root, instead of
a string in five files, two of which decided whether a published guide was
reachable. One header across both surfaces, with a workspace's own sections
beneath the installation's rather than beside them. A guide is edited from the
page you read it on. The tree, the catalog and the people sit behind one Manage
entry, so the persistent navigation carries what you do daily and the structure
is somewhere you go deliberately. The front page answers "which library" rather
than "which section of the one workspace": a visitor gets the public one, a
member gets a tab for each library they can read. The old switch offered Public
and Internal for a single workspace, which on this installation meant an empty
destination beside the one holding the guides — and it could not reach a
separate team workspace at all. The public library is called Public guides,
because "Repair collective" is an operator's word for their own workspace.

**Also done, by being answered rather than built.** Where a draft belongs was
filed here as the last structural question. It is not one: a draft has no
reader, and the studio is where things without readers live. Published guides
are in a library, drafts are in the studio, and that is the answer rather than a
tension to resolve.

The front page opens on its search and its guides. It used to spend 613px on a
hero and another 407px on a picture grid of categories, putting the first guide
at 1401px on a desktop screen and 1769px on a phone — and the same categories
were drawn twice from the same query, once as that grid and again as a chip row
400px below it. Now: heading, search, one chip row carrying each thing's
picture, then the guides, with the first at 448px.

And a category has one address. `/?category=x` filtered the library in place
while `/categories/x` was the same guides on a page that also carried the
picture, the description and whatever sat inside — two URLs to bookmark, two to
keep working, and one of them reachable only from a grid that has since been
deleted. The chips now lead to the category's own page, that page carries the
chips so choosing one is not a dead end, and the old address redirects. The
sample library is why both existed: it stored only a category name per guide,
so its chips could not be links. It has ids now.

The workspace picker no longer appears when there is one workspace, which on a
real installation is always. It remains for the development seed, which has two.

**Decided against.** Creating a second workspace from inside the product. An
installation serves one organisation, and one workspace already carries both
audiences — a public library anyone may read and an internal section only
members see, with a guide moving between them. Several workspaces would be for
keeping separate groups apart in one installation, which is not what this is
for. The development seed makes two, which is what made the absence look like a
gap; it is a fixture, not a shape to reproduce.

## Known issues deferred during the first release work

Found while building the self-hosted release and deliberately left for later.
Each is understood well enough to fix; none blocks the current phase. The
browser reliability items must be resolved before the release gate, which
requires green runs in all three engines.

### Browser test reliability

- **The five-level category journey times out in WebKit now and then.** It
  recurred after the warm-up and JIT fixes (run 36193524832, commit 318cf89),
  again waiting for a dialog's Name field at line 168, so an exhausted time
  budget is ruled out: a dialog doesn't open after its button is clicked.
  Suspect a click landing before the page responds. Hosted run
  36124541652 first waited out the test's 120 s budget for the Name field of the
  next category dialog. Which level is unknown: CI deliberately keeps no
  traces, so only the pending step is reported. It passed 34 of 35 local
  WebKit runs; the output of the one early failure was not kept. Two costs
  inside that budget have since been removed (first-request route compiles,
  and about 0.75 s of PostgreSQL JIT on every Things table request, twice per
  created thing), so an exhausted budget is the likely explanation, but it is
  not proven. Reproduce a recurrence locally with a scaled-down assertion
  timeout.
- **A reader step link once left no fragment in Chromium CI.** In run
  36125062720, "library filters and reader navigation" clicked
  "03 Inspect the contact points" and the address stayed
  `/guides/mechanical-keyboard`. Not reproduced; a click before hydration keeps
  the fragment locally. It was probably the first test to open a reader on a
  cold server, which the route warm-up now prevents, but that is unconfirmed.
- **The authoring suite can reach the write limit of its single account.**
  Every authoring test signs in as the same owner, and the API allows 120
  writes per account per minute. With route warm-up and the faster Things
  table, the local Chromium run fell from 4.2 to 2.9 minutes, and one of two
  such runs was refused a cover upload ("Too many requests"). The catalog
  sorting test already waits out that limit for its own writes. Hosted runners
  are slower and have not hit it. Give write-heavy tests their own accounts
  rather than raising the limit.

### Restore and backup

- **Discard doesn't re-check that the target is still closed.** A restore at
  its last checkpoint that someone opened and used by hand would be wiped.
  Refuse discard unless the runtime role and PUBLIC still lack CONNECT.
- **A verification failure report is only written to the private state file.**
  Print a summary to stderr as well.
- **The activation probe connection has no error listener,** so a failure after
  it connects can crash the command. The gate has already closed again.
- **The backup compares the operator container's clock with the database's.**
  Skew fails the backup late, though safely.
- **A `lost+found` directory on a dedicated picture volume blocks restore.**
- **Missing tests:** concurrent backups with held writes and cancellation,
  backup refusing dangling references and damaged files, and restoring the
  frozen pre-withdrawal baseline with its own image before upgrading it.

### Runtime role and operator command

- **The per-request runtime-role check is narrower than the migration-time
  check.** It misses predefined-role and role-creation memberships and the
  replication attribute. Make them one rule.
- **Local migration errors no longer show the underlying database error.**
- **Interrupting `migrate` doesn't stop it between files;** the five-second
  forced exit is safe but blunt. Pass the signal through and cancel the running
  statement.
- **An older image's `migrate` reports "current" against a newer database,**
  and a role refusal after migrating doesn't say migrations were applied.
- **Every login-probe failure is reported as a password problem.** Distinguish
  authentication errors from an unavailable database.
- **Creating or changing the runtime role sends its password in the SQL text,**
  which can reach the database log if the statement fails. Send a verifier.
- **Studio error messages don't show the request ID.** Only the Finish setting
  up form displays it; elsewhere the transport drops it, so people can't quote it to
  the operator. Show it as a reference in studio error messages.

### Deployment and security hardening

- **The Caddy image runs as root,** and no service drops capabilities or uses a
  read-only filesystem. Web can reach the internet through the proxy network.
  The one-shot init service runs as root only to hand the secret files over.
- **The database owner is the PostgreSQL superuser** in the default deployment.
  A non-superuser owner would limit what a crafted backup could do.
- **The default login returns if the database is ever empty again,** for
  example after deleting every account and workspace by hand: `migrate`
  creates it in any database with no account and no workspace.
- **A redeploy stops the old web before migrations run.** Compose recreates
  web first, so a failed migration during Update the stack leaves the site
  down until the previous version is put back. `upgrade.sh` avoids this on
  the command line; a Portainer-friendly equivalent (for example a web
  container that waits for its own schema) is not offered yet.
- **The bundled certificate names only localhost.** Browsers warn about the
  name as well as the issuer; including `PASSDOWN_URL`'s host would need the
  proxy to know it.
- **Supply chain:** the build installs pnpm without an integrity check, system
  packages aren't version-pinned, and unused package-manager shims stay in the
  runtime image.
- **HTTP/3** is advertised without UDP being published.
- **Installation-wide request counters** for invitation lookups and failed
  sign-ins let a few clients slow everyone down. There is no Content Security
  Policy yet. Both belong to the release security review.

### Low-severity findings from the pre-release security review

The review found nothing high-severity; its medium findings are fixed. None of
these is reachable through Passdown's own routes and interface today, or
each needs operator-controlled input.

- **Database checks the application already makes:** `guide_public_blockers`
  and `category_blockers` lack a manager check; leaving `withdrawn` can change
  the release in the same update, and inserts can set any publication state;
  `accept_invitation` doesn't bind the address or refuse existing members;
  several transactions rely on the default `read committed` isolation.
- **Accounts:** the 032 backfill can make an ordinary member the first
  administrator if the setup account is gone; one administrator can reset
  another's password; suspended accounts can still complete sign-in (they
  can do nothing); suspending doesn't close an open reset link; invitations
  and membership changes aren't audited, and admin deletions are recorded as
  operator actions.
- **Sign-in and links:** parallel requests can exceed the per-address failure
  limit; `get-session` and the sign-in response return the session token;
  an interrupted
  invitation can leave an unverified account that blocks its address;
  passwords over 128 characters are refused with a misleading message;
  reset-link and invitation counters are installation-wide.
- **Uploads and logs:** without a proxy, a chunked upload has no size limit;
  every image decoder runs before the type check; resized copies aren't
  written atomically; log redaction misses 32-character tokens, and the
  framework's own error output isn't redacted.
- **Deployment:** Caddy doesn't validate the limit settings; Caddy has no
  explicit request timeouts;
  the archive reader lacks tests for link and extended-header members.

### Interface

- **A mark placed while a photo is still loading** is measured against the
  default shape. Pass the stored picture dimensions to the annotation editor.
- **New guide can wait indefinitely** if the work-type options never load. Add
  a timeout that falls through to Retry.
- **Page changes in management tables aren't announced** to screen readers.
- **Preparation notes buttons all share one accessible name,** notes added to an
  existing item start collapsed, some heading levels are flattened, a focused
  choice card shows a light gap in dark mode, and switching an item from used up
  to kept leaves its unit unchanged.
