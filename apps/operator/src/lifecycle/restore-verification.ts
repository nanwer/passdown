import type { MediaReference } from '@guide/database';
import type { BackupManifest } from './manifest';
import { unexpectedMissingMedia, type MediaFileVerification } from './verify-files';

/** Excluded backup rows must be absent, not merely omitted from count comparisons. */
export function restoreVerification(
  manifest: BackupManifest,
  inventory: {
    counts: Record<string, number>;
    migrations: { name: string; checksum: string }[];
    dangling: MediaReference[];
  },
  media: MediaFileVerification,
) {
  const names = Object.keys(manifest.counts).sort();
  const countsMatch =
    JSON.stringify(names) === JSON.stringify(Object.keys(inventory.counts).sort()) &&
    names.every((name) => inventory.counts[name] === (manifest.counts[name] ?? 0));
  const migrationsMatch =
    JSON.stringify(inventory.migrations) === JSON.stringify(manifest.migrations);
  const unexpectedMissing = unexpectedMissingMedia(media.missing, manifest.media.missingAtBackup);
  return {
    ok:
      countsMatch &&
      migrationsMatch &&
      !unexpectedMissing.length &&
      !media.damaged.length &&
      !inventory.dangling.length,
    countsMatch,
    migrationsMatch,
    unexpectedMissing,
    damaged: media.damaged,
    dangling: inventory.dangling,
  };
}
