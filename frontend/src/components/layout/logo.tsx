import { cn } from '@/lib/utils/cn';

export const CUBE_MARK_PATHS = {
  top: 'M32 5 55 18 32 31 9 18Z',
  left: 'M9 18 32 31v28L9 46Z',
  right: 'M32 31 55 18v28L32 59Z',
  cut: 'M32 31v28M9 18l23 13 23-13',
} as const;

/** The CrossCubes cube: a lime top and two cobalt faces; drawn in code so it stays sharp at every size. */
export function Logo({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="CrossCubes" className={cn('shrink-0', className)}>
      <path d={CUBE_MARK_PATHS.top} fill="hsl(var(--signal))" />
      <path d={CUBE_MARK_PATHS.left} fill="hsl(228 88% 50%)" />
      <path d={CUBE_MARK_PATHS.right} fill="hsl(229 85% 32%)" />
      <path d={CUBE_MARK_PATHS.cut} fill="none" stroke="hsl(232 42% 6% / 0.35)" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}
