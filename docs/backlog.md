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

Each of those is now fixed and covered by a test, but they were symptoms. The
underlying question — what the top level of this product is, and what belongs
inside a workspace rather than beside it — has not been answered, and patching
individual routes will keep producing screens that are correct and unreachable.

Worth doing properly after the interface is on one component system, because
the answer will change what the navigation is made of.
