export type ArtworkKind = 'bicycle' | 'lamp' | 'keyboard' | 'headphones' | 'bench' | 'camera';
export function GuideArtwork({ kind, detail = false }: { kind: ArtworkKind; detail?: boolean }) {
  const shapes = {
    bicycle: (
      <>
        <circle cx="145" cy="239" r="77" />
        <circle cx="445" cy="239" r="77" />
        <circle cx="145" cy="239" r="64" className="opacity-[0.45]" />
        <circle cx="445" cy="239" r="64" className="opacity-[0.45]" />
        <path
          d="M145 239 220 119 311 239 145 239M220 119H379L311 239M445 239 371 94 410 86"
          className="stroke-action [stroke-width:5]"
        />
        <path d="m221 119-8-28m-24 0h51M311 239l27 17m-10 0h21" />
        <circle cx="311" cy="239" r="18" />
        <circle cx="445" cy="239" r="23" className="stroke-action" />
        <path
          d="m394 184 68-78h58"
          className="[stroke-dasharray:4_5] [stroke-width:1] opacity-[0.6]"
        />
        <circle cx="524" cy="106" r="14" className="fill-accent-ink stroke-none" />
        <text
          x="524"
          y="111"
          className="fill-accent-surface stroke-none font-mono text-[14px] [text-anchor:middle]"
        >
          1
        </text>
      </>
    ),
    lamp: (
      <>
        <ellipse cx="300" cy="289" rx="100" ry="20" className="fill-panel" />
        <path d="M300 283V199L239 139l62-69" className="[stroke-width:5]" />
        <path d="m283 61 59 24-23 57-91-37Z" className="fill-action stroke-action-ink" />
        <path
          d="m246 133-38 88m65-76-12 106m39-108 17 103"
          className="[stroke-dasharray:4_5] [stroke-width:1] opacity-[0.6]"
        />
        <circle cx="300" cy="199" r="10" className="fill-panel" />
        <circle cx="239" cy="139" r="10" className="fill-panel" />
        <path
          d="M386 292h52v-36"
          className="[stroke-dasharray:4_5] [stroke-width:1] opacity-[0.6]"
        />
        <circle cx="438" cy="241" r="13" className="fill-accent-ink stroke-none" />
        <text
          x="438"
          y="246"
          className="fill-accent-surface stroke-none font-mono text-[14px] [text-anchor:middle]"
        >
          1
        </text>
      </>
    ),
    keyboard: (
      <>
        <path d="m93 151 310-52 115 110-310 55Z" className="fill-panel" />
        <path d="m93 151 1 24 113 114 311-54v-26M207 264v25" />
        <g transform="matrix(.95,-.16,.52,.53,117,156)">
          {[0, 1, 2, 3].map((row) => (
            <g key={row}>
              {Array.from({ length: 10 }, (_, column) => (
                <rect
                  key={column}
                  x={column * 28}
                  y={row * 34}
                  width="22"
                  height="25"
                  rx="3"
                  className={
                    (row + column) % 7 === 0 ? 'fill-action stroke-action-ink' : 'fill-panel'
                  }
                />
              ))}
            </g>
          ))}
          <rect
            x="57"
            y="137"
            width="158"
            height="24"
            rx="3"
            className="fill-action stroke-action-ink"
          />
        </g>
        <path
          d="m388 92-22-33h-72"
          className="[stroke-dasharray:4_5] [stroke-width:1] opacity-[0.6]"
        />
        <circle cx="279" cy="59" r="13" className="fill-accent-ink stroke-none" />
        <text
          x="279"
          y="64"
          className="fill-accent-surface stroke-none font-mono text-[14px] [text-anchor:middle]"
        >
          1
        </text>
      </>
    ),
    headphones: (
      <>
        <path d="M177 222v-62a123 123 0 0 1 246 0v62" className="[stroke-width:5]" />
        <path d="M198 201v-41a102 102 0 0 1 204 0v41" className="stroke-action [stroke-width:5]" />
        <rect x="160" y="186" width="75" height="113" rx="27" className="fill-panel" />
        <rect x="365" y="186" width="75" height="113" rx="27" className="fill-panel" />
        <rect
          x="215"
          y="190"
          width="28"
          height="105"
          rx="13"
          className="fill-action stroke-action-ink"
        />
        <rect
          x="357"
          y="190"
          width="28"
          height="105"
          rx="13"
          className="fill-action stroke-action-ink"
        />
        <path
          d="M193 299c0 47 60 13 60 40M434 194l55-58h34"
          className="[stroke-dasharray:4_5] [stroke-width:1] opacity-[0.6]"
        />
      </>
    ),
    bench: (
      <>
        <path d="m88 154 281-69 159 92-281 79Z" className="fill-panel" />
        <path
          d="m88 154v25l159 101 281-80v-23M247 256v24M119 199v111m370-99v81m-242-12v54"
          className="[stroke-width:5]"
        />
        <path d="m175 156 151-36 92 54-151 40Z" className="fill-action stroke-action-ink" />
        <path d="m246 161 52-13m-17-11 16 23m44 0 34 18" className="[stroke-width:5]" />
        <rect x="344" y="67" width="34" height="48" rx="5" className="fill-panel" />
        <path
          d="M358 68V38m11 30V48M122 116V82h74"
          className="[stroke-dasharray:4_5] [stroke-width:1] opacity-[0.6]"
        />
      </>
    ),
    camera: (
      <>
        <path d="M127 128h93l22-31h97l24 31h102v148H127Z" className="fill-panel" />
        <rect
          x="139"
          y="105"
          width="47"
          height="21"
          rx="4"
          className="fill-action stroke-action-ink"
        />
        <circle cx="301" cy="203" r="85" className="fill-panel" />
        <circle cx="301" cy="203" r="66" className="fill-action stroke-action-ink" />
        <circle cx="301" cy="203" r="46" className="fill-panel" />
        <path d="m278 176 42-6 21 37-20 27-39-2-25-26Z" className="opacity-[0.45]" />
        <rect x="396" y="149" width="44" height="25" rx="4" />
        <path
          d="m364 130 50-60h80"
          className="[stroke-dasharray:4_5] [stroke-width:1] opacity-[0.6]"
        />
        <circle cx="509" cy="70" r="13" className="fill-accent-ink stroke-none" />
        <text
          x="509"
          y="75"
          className="fill-accent-surface stroke-none font-mono text-[14px] [text-anchor:middle]"
        >
          1
        </text>
      </>
    ),
  };
  return (
    <div
      // The kind and detail names stay: the step reader sizes a detailed
      // drawing, and tests find a drawing by its kind.
      className={`artwork artwork--${kind} relative text-ink [background:color-mix(in_srgb,var(--gp-semantic-action-primary-background)_7%,var(--gp-semantic-surface-panel))] ${detail ? 'artwork--detail aspect-[5/3.4]' : 'aspect-[5/3]'}`}
      aria-hidden="true"
    >
      <svg
        className={`block h-full w-full ${detail ? 'px-2 py-5' : 'px-2.5 py-3.5'}`}
        viewBox="0 0 600 360"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <g className="opacity-[0.055]">
          {[100, 200, 300, 400, 500].map((x) => (
            <path key={x} d={`M${x} 30v300`} />
          ))}
          {[60, 120, 180, 240, 300].map((y) => (
            <path key={y} d={`M40 ${y}h520`} />
          ))}
        </g>
        {shapes[kind]}
        <path
          d="M30 52V30h22M548 30h22v22M570 308v22h-22M52 330H30v-22"
          className="opacity-[0.25] [stroke-width:1]"
        />
      </svg>
      <span className="absolute bottom-[15px] font-mono text-[8px] tracking-[1px] opacity-[0.65] start-5.5">
        FIELD NOTES / {kind.toUpperCase()}
      </span>
      <span className="absolute bottom-[15px] font-mono text-[8px] tracking-[1px] opacity-[0.65] end-5.5">
        01 — 05
      </span>
    </div>
  );
}
