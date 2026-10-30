import {
  Coins, Dices, Flag, Grid3x3,
} from 'lucide-react';

import { Avatar } from '@/components/Avatar.jsx';
import { Gorsel, nadirlikRengi } from '@/components/Gorsel.jsx';
import { Muz } from '@/components/Muz.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { cn } from '@/lib/utils.js';

export const OYUNLAR = {
  zar: { ad: 'Zar', ikon: Dices, aciklama: 'Büyük toplam kazanır' },
  yazitura: { ad: 'Yazı-tura', ikon: Coins, aciklama: 'Sen seç, tutarsa kazan' },
  at: { ad: 'At yarışı', ikon: Flag, aciklama: 'Yarı yarıya şans' },
  xox: { ad: 'XOX', ikon: Grid3x3, aciklama: 'Hamle başı 60 sn' },
};

export function UyeEtiketi({ uye, boyut = 28, className }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <Avatar uye={uye} boyut={boyut} />
      <span className="truncate font-medium">{uye.ad}</span>
    </span>
  );
}

export const DiscordRozeti = ({ goster }) => (goster ? <Rozet>Discord'da da</Rozet> : null);

/** Takas kalemi: görsel + "adet × ad", nadirlik renkli çerçeve. */
export function EsyaKutusu({ esya, boyut = 32 }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-xl border bg-yuzey-3/60 py-1.5 pl-2 pr-3 text-sm"
      style={{ borderColor: esya.nadirlik ? `color-mix(in oklab, ${nadirlikRengi(esya.nadirlik)} 55%, transparent)` : 'var(--color-cizgi)' }}
    >
      <Gorsel g={esya.gorsel} boyut={boyut} parlak={esya.parlak} />
      <span className="min-w-0 truncate"><span className="sayi text-soluk">{esya.adet}×</span> {esya.ad}</span>
    </span>
  );
}

/** Bir tarafın kalemleri: eşya ve/veya muz. */
export function Kalemler({ taraf, boyut }) {
  const bos = !taraf.esya && !(taraf.muz > 0);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {taraf.esya && <EsyaKutusu esya={taraf.esya} boyut={boyut} />}
      {taraf.muz > 0 && <Muz miktar={taraf.muz} boyut={16} className="rounded-xl border border-cizgi bg-yuzey-3/60 px-2.5 py-2 text-sm" />}
      {bos && <span className="text-soluk">—</span>}
    </div>
  );
}
