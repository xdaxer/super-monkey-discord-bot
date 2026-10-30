import { Medal } from 'lucide-react';

import { Gorsel } from '@/components/Gorsel.jsx';
import { Muz } from '@/components/Muz.jsx';
import { cn } from '@/lib/utils.js';

/** Görev/başarım ödülü: muz ve/veya kasa. */
export function OdulRozeti({ odul, className }) {
  return (
    <span className={cn('inline-flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-yuzey-3 px-2 py-1 text-xs', className)}>
      {odul.muz ? <Muz miktar={odul.muz} boyut={14} /> : null}
      {odul.kasa ? (
        <span className="inline-flex items-center gap-1 font-medium text-soluk"><Gorsel g={odul.kasa.gorsel} boyut={16} />{odul.kasa.ad}</span>
      ) : null}
    </span>
  );
}

/** Başarım kademeleri: renk ve ad. */
export const KADEME = {
  bronz: { ad: 'Bronz', renk: 'var(--color-turuncu)' },
  gumus: { ad: 'Gümüş', renk: 'var(--color-soluk)' },
  altin: { ad: 'Altın', renk: 'var(--color-muz)' },
};

export function KademeIkonu({ kademe, boyut = 40 }) {
  const k = KADEME[kademe] ?? KADEME.bronz;
  return (
    <span
      className="grid shrink-0 place-items-center rounded-xl"
      style={{ width: boyut, height: boyut, color: k.renk, background: `color-mix(in oklab, ${k.renk} 14%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${k.renk} 35%, transparent)` }}
    >
      <Medal style={{ width: boyut * 0.5, height: boyut * 0.5 }} />
    </span>
  );
}
