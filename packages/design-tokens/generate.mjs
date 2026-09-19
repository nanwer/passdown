import { readFileSync, writeFileSync } from 'node:fs';
const source = JSON.parse(readFileSync(new URL('./tokens.json', import.meta.url), 'utf8'));
const name = (value) => '--gp-' + value.replaceAll('.', '-');
function value(raw) {
  return raw.replace(/\{([^}]+)\}/g, (_, path) => {
    const [layer, ...parts] = path.split('.');
    const key = parts.join('.');
    const exists =
      layer === 'semantic'
        ? key in source.semantic.light && key in source.semantic.dark
        : key in (source[layer] ?? {});
    if (!exists) throw new Error(`Unknown token reference: ${path}`);
    return `var(${name(path)})`;
  });
}
const declarations = (layer, entries) =>
  Object.entries(entries)
    .map(([key, raw]) => `  ${name(`${layer}.${key}`)}: ${value(raw)};`)
    .join('\n');
const css = `/* Generated from tokens.json. Run pnpm tokens:generate; do not hand-edit. */\n:root {\n${declarations('primitive', source.primitive)}\n}\n:root, [data-theme="light"] {\n  color-scheme: light;\n${declarations('semantic', source.semantic.light)}\n}\n[data-theme="dark"] {\n  color-scheme: dark;\n${declarations('semantic', source.semantic.dark)}\n}\n:root {\n${declarations('component', source.component)}\n}\n`;
const output = new URL('./tokens.css', import.meta.url);
if (process.argv.includes('--check')) {
  if (readFileSync(output, 'utf8') !== css)
    throw new Error('Generated tokens are stale. Run pnpm tokens:generate.');
} else writeFileSync(output, css);
console.log(
  `Tokens ${process.argv.includes('--check') ? 'verified' : 'generated'} for both themes.`,
);
