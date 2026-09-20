// Next rewrites next-env.d.ts on every dev run and build, pointing it at
// whichever build directory that run used (.next, .next-fixtures,
// .next-authoring), so that file is generated output and is not tracked.
//
// These two references are the part that never varies. Keeping them here means
// `pnpm typecheck` sees the same Next ambient types on a fresh checkout as it
// does on a machine that has already run a build.
/// <reference types="next" />
/// <reference types="next/image-types/global" />
