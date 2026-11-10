type Tone = 'signal' | 'primary' | 'deep' | 'ghost';

// Floor grid position (c, r) and stack height z; a stepped stack rising to one lime cube.
const CUBES: { c: number; r: number; z: number; tone: Tone }[] = [
  { c: 0, r: 0, z: 0, tone: 'ghost' },
  { c: 1, r: 0, z: 0, tone: 'ghost' },
  { c: 2, r: 0, z: 0, tone: 'deep' },
  { c: 0, r: 1, z: 0, tone: 'ghost' },
  { c: 1, r: 1, z: 0, tone: 'primary' },
  { c: 2, r: 1, z: 0, tone: 'primary' },
  { c: 0, r: 2, z: 0, tone: 'deep' },
  { c: 1, r: 2, z: 0, tone: 'primary' },
  { c: 2, r: 2, z: 0, tone: 'ghost' },
  { c: 1, r: 1, z: 1, tone: 'primary' },
  { c: 2, r: 1, z: 1, tone: 'deep' },
  { c: 1, r: 2, z: 1, tone: 'deep' },
  { c: 1, r: 1, z: 2, tone: 'signal' },
];

const FACES: Record<Tone, { top: string; left: string; right: string; line: string }> = {
  signal: { top: 'hsl(75 92% 58%)', left: 'hsl(75 72% 44%)', right: 'hsl(75 64% 33%)', line: 'hsl(232 42% 6% / 0.3)' },
  primary: { top: 'hsl(226 100% 68%)', left: 'hsl(228 88% 50%)', right: 'hsl(229 85% 34%)', line: 'hsl(232 42% 6% / 0.3)' },
  deep: { top: 'hsl(228 70% 46%)', left: 'hsl(229 80% 32%)', right: 'hsl(230 75% 22%)', line: 'hsl(232 42% 6% / 0.35)' },
  ghost: { top: 'hsl(226 100% 68% / 0.06)', left: 'hsl(226 100% 68% / 0.03)', right: 'hsl(226 100% 68% / 0.02)', line: 'hsl(226 100% 68% / 0.3)' },
};

const W = 52;
const H = 30;

/** A stepped stack of isometric cubes, the CrossCubes signature; decorative only. */
export function CubeArt({ className }: { className?: string }) {
  // Back to front, bottom to top, so nearer and higher cubes paint over the ones behind them.
  const order = [...CUBES].sort((a, b) => a.c + a.r - (b.c + b.r) || a.z - b.z || a.c - b.c);
  const pos = (q: (typeof CUBES)[number]) => ({ x: (q.c - q.r) * W, y: (q.c + q.r) * H - q.z * H * 2 });
  const xs = CUBES.map((q) => pos(q).x);
  const ys = CUBES.map((q) => pos(q).y);
  const minX = Math.min(...xs) - W - 2;
  const maxX = Math.max(...xs) + W + 2;
  const minY = Math.min(...ys) - H - 2;
  const maxY = Math.max(...ys) + H * 3 + 2;
  return (
    <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} aria-hidden className={className}>
      {order.map((q, i) => {
        const { x, y } = pos(q);
        const f = FACES[q.tone];
        return (
          <g key={i} stroke={f.line} strokeWidth="1" strokeLinejoin="round">
            <path d={`M${x - W} ${y}l${W} ${H}v${H * 2}l-${W}-${H}Z`} fill={f.left} />
            <path d={`M${x} ${y + H}l${W}-${H}v${H * 2}l-${W} ${H}Z`} fill={f.right} />
            <path d={`M${x} ${y - H}l${W} ${H}-${W} ${H}-${W}-${H}Z`} fill={f.top} />
          </g>
        );
      })}
    </svg>
  );
}
