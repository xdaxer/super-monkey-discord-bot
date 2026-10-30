import { ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils.js';

/** Ekranın üst başlığı. */
export function EkranBaslik({
  ikon: Ikon, baslik, aciklama, sag, className,
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="flex items-center gap-3">
        {Ikon && (
          <div className="grid size-11 place-items-center rounded-2xl bg-gradient-to-b from-muz to-muz-koyu text-muz-metin shadow-[0_6px_20px_-8px_rgb(255_212_59/0.7)]">
            <Ikon className="size-[22px]" strokeWidth={2.2} />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold leading-none sm:text-[28px]">{baslik}</h1>
          {aciklama && <p className="mt-1.5 text-sm text-soluk">{aciklama}</p>}
        </div>
      </div>
      {sag}
    </div>
  );
}

/** Küçük istatistik kutusu: etiket üstte, değer altta. Tıklanabilirse sağda ok (içerikten ayrılsın). */
export function Istatistik({
  etiket, deger, ikon: Ikon, alt, className, onClick,
}) {
  const Kap = onClick ? 'button' : 'div';
  return (
    <Kap
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn('flex min-w-0 flex-col gap-1 rounded-2xl border border-cizgi bg-yuzey/60 p-4 text-left', onClick && 'transition-[background,border-color,transform] hover:border-cizgi-guclu hover:bg-yuzey-2 active:scale-[0.98]', className)}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-silik">
        {Ikon && <Ikon className="size-3.5 shrink-0" />}
        <span className="truncate">{etiket}</span>
        {onClick && <ChevronRight className="-mr-1 ml-auto size-4 shrink-0" aria-hidden />}
      </span>
      <span className="truncate font-display text-xl font-semibold">{deger}</span>
      {alt && <span className="text-xs text-soluk">{alt}</span>}
    </Kap>
  );
}
