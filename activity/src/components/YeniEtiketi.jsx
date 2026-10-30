import { cn } from '@/lib/utils.js';

/** "Yeni" etiketi: menüde yeni ekranlar ve sekmelerde yeni sekmeler için. */
export function YeniEtiketi({ className }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded-[5px] bg-muz px-1.5 text-[11px] font-bold leading-4 text-muz-metin shadow-[0_0_10px_-2px_rgb(255_212_59/0.7)]', className)}>
      Yeni
    </span>
  );
}
