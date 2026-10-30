import { Check, List } from 'lucide-react';
import { useState } from 'react';

import { GeriSayim } from '@/components/GeriSayim.jsx';
import { Gorsel } from '@/components/Gorsel.jsx';
import { Md } from '@/components/Md.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { useIslem } from '@/lib/kancalar.js';
import { useUygulama } from '@/lib/store.js';
import { AdetSecici } from './AdetSecici.jsx';
import { Fiyat } from './Fiyat.jsx';

/** Ürün görseli: ortada, hafif ışıklı alan. */
export function GorselAlani({ g, boyut = 72, children }) {
  return (
    <div className="relative grid h-24 place-items-center overflow-hidden sm:h-32 rounded-xl border border-cizgi bg-zemin/50 bg-[radial-gradient(circle_at_50%_45%,var(--color-yuzey-3),transparent_70%)]">
      <Gorsel g={g} boyut={boyut} />
      {children}
    </div>
  );
}

/** Mağaza ürün kartı (kasa, takviye, rozet). `onAl(esya, adet)` söz döner. */
export function UrunKarti({
  e, onAl, kasaSiniri, onIcerik,
}) {
  const [adet, setAdet] = useState(1);
  const [calistir, bekliyor] = useIslem();
  const bakiye = useUygulama((s) => s.bakiye);
  const kasa = e.tur === 'kasa';
  const rozet = e.tur === 'rozet';
  const etkin = e.tur === 'etki' && e.bitis && e.bitis > Date.now();
  const toplam = e.fiyat * adet;
  const yetmez = bakiye !== null && toplam > bakiye;
  const kapali = Boolean(e.alinamaz) || (rozet && e.rozetVar);

  let etiket = 'Satın al';
  if (rozet && e.rozetVar) etiket = 'Sende';
  else if (yetmez && !e.alinamaz) etiket = 'Bakiye yetersiz';

  return (
    <div className="yuzey-kart flex flex-col gap-4 p-5">
      <GorselAlani g={e.gorsel}>
        {(kasa || e.tur === 'stok') && e.sahip > 0 && <Rozet tur="notr" className="absolute right-2.5 top-2.5">Sende: <span className="sayi">{e.sahip}</span></Rozet>}
        {rozet && e.rozetVar && <Rozet tur="yesil" className="absolute right-2.5 top-2.5"><Check />Sende</Rozet>}
        {etkin && <Rozet tur="yesil" className="absolute right-2.5 top-2.5">Etkin</Rozet>}
        {rozet && e.calisBonus > 0 && <Rozet tur="muz" className="absolute left-2.5 top-2.5">Çalışma +%{e.calisBonus}</Rozet>}
      </GorselAlani>
      <div className="min-w-0">
        <h3 className="text-base font-semibold leading-tight">{e.ad}</h3>
        {/* Izgarada (sm+) kartlar hizalı kalsın diye iki satır; tek sütunda açıklama kesilmez. */}
        <p className="mt-1.5 text-[13px] leading-5 text-soluk sm:line-clamp-2 sm:min-h-10" title={e.aciklama?.replace(/[*`]/g, '')}><Md metin={e.aciklama} /></p>
      </div>
      {etkin && (
        <p className="text-xs text-soluk">Etkin, kalan <GeriSayim hedef={e.bitis} bitince="bitti" className="sayi text-yesil" /></p>
      )}
      {e.alinamaz && <p className="text-xs text-soluk"><Md metin={e.alinamaz} /></p>}
      <div className="mt-auto flex flex-col gap-3">
        {kasa && (
          <div className="flex items-center justify-between gap-2">
            <AdetSecici deger={adet} degisti={setAdet} max={kasaSiniri} />
            <Button tur="hayalet" boyut="sm" onClick={() => onIcerik(e)}><List />İçerik</Button>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-silik">{kasa ? 'Toplam' : 'Fiyat'}</span>
          <Fiyat fiyat={e.fiyat} eski={e.eski} indirimli={e.indirimli} adet={adet} />
        </div>
        <Button
          tur="ana"
          tam
          bekliyor={bekliyor}
          disabled={kapali || yetmez}
          onClick={() => calistir(() => onAl(e, adet))}
        >
          {etiket}
        </Button>
      </div>
    </div>
  );
}
