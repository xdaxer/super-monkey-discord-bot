import { Tag } from 'lucide-react';

import { Muz } from '@/components/Muz.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { bicim, cn } from '@/lib/utils.js';

/** Fiyat; indirimde eski fiyat üstü çizili ve "İndirim" rozeti. */
export function Fiyat({
  fiyat, eski, indirimli, adet = 1, className,
}) {
  return (
    <span className={cn('inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-1', className)}>
      {indirimli && <Rozet tur="muz"><Tag />İndirim</Rozet>}
      {indirimli && <s className="sayi text-xs text-silik">{bicim(eski * adet)}</s>}
      <Muz miktar={fiyat * adet} className="text-base font-semibold" />
    </span>
  );
}
