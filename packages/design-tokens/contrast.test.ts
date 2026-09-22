import { expect, it } from 'vitest';
import tokens from './tokens.json';
function color(value: string): string {
  if (value.startsWith('{primitive.'))
    return tokens.primitive[value.slice(11, -1) as keyof typeof tokens.primitive];
  return value;
}
function lum(hex: string) {
  const values = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return values[0]! * 0.2126 + values[1]! * 0.7152 + values[2]! * 0.0722;
}
for (const theme of ['light', 'dark'] as const) {
  const semantic = tokens.semantic[theme];
  const pairs: [keyof typeof semantic, keyof typeof semantic, number][] = [
    ['text.primary', 'surface.canvas', 4.5],
    ['editor.text', 'editor.canvas', 4.5],
    ['editor.muted', 'editor.canvas', 4.5],
    ['editor.text', 'editor.toolbar', 4.5],
    ['editor.muted', 'editor.hover', 4.5],
    ['focus.ring', 'editor.canvas', 3],
    ['text.secondary', 'surface.canvas', 4.5],
    // Secondary text sits on sunken panels as often as on the page itself, and
    // only the canvas pairing was checked — so a palette that passed here still
    // shipped unreadable text, which an axe scan caught one page at a time.
    ['text.secondary', 'surface.sunken', 4.5],
    ['text.secondary', 'surface.panel', 4.5],
    ['text.primary', 'surface.panel', 4.5],
    ['text.primary', 'surface.sunken', 4.5],
    ['action.primary.foreground', 'action.primary.background', 4.5],
    // A destructive button is a fill with text on it, which is a different job
    // from the error text that sits on a pale tint — conflating the two put red
    // on pink at 3.4:1.
    ['action.destructive.foreground', 'action.destructive.background', 4.5],
    ...(
      [
        'surface.canvas',
        'surface.panel',
        'surface.raised',
        'status.warning.background',
        'status.error.background',
        'status.success.background',
        'status.info.background',
        'status.note.background',
        'accent.background',
      ] as const
    ).map((bg) => ['focus.ring', bg, 3] as [keyof typeof semantic, keyof typeof semantic, number]),
    ...(['warning', 'error', 'success', 'info', 'note'] as const).flatMap(
      (status) =>
        [
          [`status.${status}.foreground`, `status.${status}.background`, 4.5],
          [`status.${status}.border`, `status.${status}.background`, 3],
        ] as [keyof typeof semantic, keyof typeof semantic, number][],
    ),
  ];
  it.each(pairs)(`${theme}: %s against %s meets %s:1`, (foreground, background, minimum) => {
    const a = lum(color(semantic[foreground])),
      b = lum(color(semantic[background]));
    expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(minimum);
  });
}
