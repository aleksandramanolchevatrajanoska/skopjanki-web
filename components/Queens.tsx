/** The two crowned queens from the Skopjanki logo, redrawn as an icon. */
export function Queens({ className }: { className?: string }) {
  const queen = (
    <g>
      <polygon fill="#DE86BC" points="113,66 152,96 180,32 208,96 246,66 232,125 127,125" />
      <circle cx="180" cy="185" r="45" fill="currentColor" />
      <polygon fill="currentColor" points="158,232 202,232 205,255 250,262 212,345 268,548 98,548 150,345 112,262 155,255" />
    </g>
  );
  return (
    <svg viewBox="92 24 400 530" aria-hidden="true" className={className}>
      {queen}
      <g transform="translate(218 0)">{queen}</g>
    </svg>
  );
}
