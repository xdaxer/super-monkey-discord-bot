import { Crown, Star } from 'lucide-react';

import { cn } from '@/lib/utils.js';

/** Prestij amblemi: ortada seviye, çevresinde 10 yıldızlık ilerleme halkası. */
export default function Amblem({ seviye, maks = 10, boyut = 248 }) {
  const r = boyut / 2 - 20;
  return (
    <div className="relative mx-auto shrink-0" style={{ width: boyut, height: boyut }} role="img" aria-label={`Prestij ${seviye} / ${maks}`}>
      <div className="absolute inset-[34px] rounded-full border border-cizgi-guclu bg-gradient-to-b from-yuzey-3 to-yuzey" />
      <div className={cn('absolute inset-[44px] grid place-items-center rounded-full border-2 bg-zemin/60', seviye > 0 ? 'border-muz shadow-[0_0_40px_-8px_rgb(255_212_59/0.5)]' : 'border-cizgi-guclu')}>
        <div className="flex flex-col items-center">
          <Crown className={cn('size-6', seviye > 0 ? 'text-muz' : 'text-silik')} />
          <span className={cn('font-display text-6xl font-bold leading-none', seviye > 0 ? 'text-metin' : 'text-silik')}>{seviye}</span>
          <span className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-silik">/ {maks}</span>
        </div>
      </div>
      {Array.from({ length: maks }, (_, i) => {
        const aci = (i / maks) * Math.PI * 2 - Math.PI / 2;
        const yanik = i < seviye;
        return (
          <Star
            key={i}
            className={cn('absolute size-[22px] -translate-x-1/2 -translate-y-1/2', yanik ? 'fill-muz text-muz drop-shadow-[0_0_6px_rgb(255_212_59/0.7)]' : 'fill-yuzey-3 text-cizgi-guclu')}
            style={{ left: boyut / 2 + r * Math.cos(aci), top: boyut / 2 + r * Math.sin(aci) }}
          />
        );
      })}
    </div>
  );
}
