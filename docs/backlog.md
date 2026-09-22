# Backlog

Work that is understood and deliberately not being done yet.

## Information architecture

**Deferred until the front-end migration and theme change are finished.**

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
picture, then the guides, with the first at 448px. Choosing a category offers a
row leading to its own page, which is where a picture, a description and
anything inside it belong.

The workspace picker no longer appears when there is one workspace, which on a
real installation is always. It remains for the development seed, which has two.

**Decided against.** Creating a second workspace from inside the product. An
installation serves one organisation, and one workspace already carries both
audiences — a public library anyone may read and an internal section only
members see, with a guide moving between them. Several workspaces would be for
keeping separate groups apart in one installation, which is not what this is
for. The development seed makes two, which is what made the absence look like a
gap; it is a fixture, not a shape to reproduce.
