import { CircleCheck, Hash, Settings2 } from 'lucide-react';

import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { bicim } from '@/lib/utils.js';

/** Değeri türüne göre okunur metne çevirir. */
function Deger({ a }) {
  if (a.kanallar) {
    if (a.kanallar.length === 0) return <span className="text-silik">{a.tur === 'kanalListesi' ? 'Her kanal' : 'Ayarlı değil'}</span>;
    return (
      <span className="flex flex-wrap justify-end gap-1.5">
        {a.kanallar.map((k) => <Rozet key={k}><Hash />{k.replace(/^#/, '')}</Rozet>)}
      </span>
    );
  }
  if (a.tur === 'acik') return a.deger ? <Rozet tur="yesil">Açık</Rozet> : <Rozet>Kapalı</Rozet>;
  if (typeof a.deger === 'number') return <span className="sayi font-medium">{a.anahtar.endsWith('Yuzde') ? `%${bicim(a.deger)}` : bicim(a.deger)}</span>;
  return <span className="sayi">{String(a.deger)}</span>;
}

export default function Sistem({ veri }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <Kart>
        <KartBaslik ikon={Settings2} baslik="Ekonomi ayarları" aciklama="Salt okunur. Değiştirmek için Discord'da /ayar komutunu kullan." />
        <ul className="flex flex-col divide-y divide-cizgi">
          <li className="flex items-center justify-between gap-4 py-3">
            <span className="text-sm text-soluk">Ekonomi sistemi</span>
            <Rozet tur="yesil"><CircleCheck />Açık</Rozet>
          </li>
          {veri.ayarlar.map((a) => (
            <li key={a.anahtar} className="flex items-center justify-between gap-4 py-3">
              <span className="min-w-0 text-sm text-soluk">{a.etiket}</span>
              <span className="shrink-0 text-right text-sm"><Deger a={a} /></span>
            </li>
          ))}
        </ul>
      </Kart>
    </div>
  );
}
