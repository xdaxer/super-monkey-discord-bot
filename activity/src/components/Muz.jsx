import NumberFlow from '@number-flow/react';

import { useUygulama } from '@/lib/store.js';
import { bicim, cn } from '@/lib/utils.js';
import { Gorsel } from '@/components/Gorsel.jsx';

/**
 * Para simgesi + tutar. `isaretli`: +/− öneki ve renk; `canli`: değişince
 * rakamlar kayarak geçer (bakiye göstergeleri).
 */
export function Muz({
  miktar, isaretli = false, canli = false, boyut = 18, className, renkli = isaretli,
}) {
  const para = useUygulama((s) => s.katalog?.para);
  const n = Number(miktar ?? 0);
  const isaret = isaretli ? (n > 0 ? '+' : n < 0 ? '−' : '±') : '';
  const renk = renkli && n > 0 ? 'text-yesil' : renkli && n < 0 ? 'text-kirmizi' : '';
  return (
    <span className={cn('sayi inline-flex items-center gap-1.5 whitespace-nowrap font-medium', renk, className)}>
      <Gorsel g={para} boyut={boyut} />
      {canli
        ? <NumberFlow value={isaretli ? Math.abs(n) : n} locales="tr-TR" prefix={isaret} />
        : `${isaret}${bicim(isaretli ? Math.abs(n) : n)}`}
    </span>
  );
}
