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

- **Category dialogs occasionally fail in Firefox and WebKit.** The five-level
  category journey has twice waited out its budget for a dialog or a created
  category that never appeared, and a thing-picture journey once ended on the
  front page instead of the category page. Each passes on neighbouring runs.
  Two related timing defects were found and fixed this way; these remain.
- **Test API requests occasionally reset.** The authoring helpers' requests to
  the test server fail with a connection reset in Chromium and Firefox, with no
  server error logged. A keep-alive timeout race was tested and did not
  reproduce. The helper now reports the request and how long the connection had
  been idle; use that evidence when it recurs. Don't add retries.
- **A category create request has taken over five seconds in CI.** Track it as
  a speed concern.

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
- **The setup code accepts any length after normalisation.** Require exactly 20
  characters.

### Deployment and security hardening

- **The Caddy and nginx images run as root,** and no service drops capabilities or uses a
  read-only filesystem. Web can reach the internet through the proxy network.
- **nginx certificates come only as a folder.** Separate certificate and key
  paths, and an ACME webroot so certbot can renew without stopping the proxy
  for a few seconds, are not offered yet.
- **The database owner is the PostgreSQL superuser** in the default deployment.
  A non-superuser owner would limit what a crafted backup could do.
- **A used setup code works again** if the database is ever empty again, for
  example after an empty restore.
- **Supply chain:** the build installs pnpm without an integrity check, system
  packages aren't version-pinned, and unused package-manager shims stay in the
  runtime image.
- **Non-standard HTTPS ports:** the HTTP redirect assumes port 443 on both proxies, automatic
  certificates can't be issued, and HTTP/3 is advertised without UDP.
- **Installation-wide request counters** for invitation lookups and failed
  sign-ins let a few clients slow everyone down. There is no Content Security
  Policy yet. Both belong to the release security review.

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
