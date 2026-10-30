import { Minus, Plus } from 'lucide-react';

import { cn } from '@/lib/utils.js';

/** − n + adet seçici. Denetimli: deger / degisti. */
export function AdetSecici({
  deger, degisti, min = 1, max = 10, className,
}) {
  const ayarla = (n) => degisti(Math.max(min, Math.min(max, n)));
  const dugme = 'grid size-9 place-items-center text-soluk transition-colors hover:bg-yuzey-3 hover:text-metin active:bg-yuzey-3 disabled:pointer-events-none disabled:opacity-40 pointer-coarse:size-11';
  return (
    <div className={cn('inline-flex h-9 items-center overflow-hidden rounded-xl border border-cizgi bg-zemin/60 pointer-coarse:h-11', className)}>
      <button type="button" aria-label="Azalt" className={dugme} disabled={deger <= min} onClick={() => ayarla(deger - 1)}><Minus className="size-4" /></button>
      <span className="sayi min-w-8 text-center text-sm font-medium" aria-live="polite">{deger}</span>
      <button type="button" aria-label="Artır" className={dugme} disabled={deger >= max} onClick={() => ayarla(deger + 1)}><Plus className="size-4" /></button>
    </div>
  );
}
