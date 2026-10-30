import {
  Boxes, CircleCheck, Flame, Layers, LayoutGrid, Trophy, Wallet, Dices,
} from 'lucide-react';
import { useState } from 'react';

import { Bos, HataKutusu, Yukleniyor } from '@/components/Durumlar.jsx';
import { Md } from '@/components/Md.jsx';
import { Ilerleme } from '@/components/ui/ilerleme.jsx';
import { Kart } from '@/components/ui/kart.jsx';
import { useApi } from '@/lib/kancalar.js';
import { bicim, cn, tarih } from '@/lib/utils.js';
import { KADEME, KademeIkonu, OdulRozeti } from './ortak.jsx';

const KATEGORI_IKON = {
  koleksiyon: Layers, kasa: Boxes, servet: Wallet, kumar: Dices, surec: Flame,
};

function Basarim({ b }) {
  const kazanildi = Boolean(b.zaman);
  const renk = KADEME[b.kademe]?.renk;
  return (
    <li
      className={cn('flex flex-col gap-3 rounded-2xl border p-4', kazanildi ? 'bg-yuzey-2' : 'border-cizgi bg-yuzey/60')}
      style={kazanildi ? { borderColor: `color-mix(in oklab, ${renk} 45%, transparent)` } : undefined}
    >
      <div className="flex items-start gap-3">
        <div className={cn(!kazanildi && 'opacity-40 grayscale')}><KademeIkonu kademe={b.kademe} /></div>
        <div className="min-w-0 flex-1">
          <p className={cn('font-display font-semibold leading-tight', !kazanildi && 'text-soluk')}>{b.ad}</p>
          <p className="mt-0.5 text-[13px] text-soluk">{b.aciklama}</p>
        </div>
        {kazanildi && <CircleCheck className="size-5 shrink-0 text-yesil" />}
      </div>
      <div className="mt-auto flex items-center justify-between gap-3">
        {kazanildi ? (
          <span className="text-xs text-soluk">Kazanıldı · {tarih(b.zaman)}</span>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Ilerleme oran={b.deger / b.hedef} yukseklik={5} />
            <span className="sayi shrink-0 text-xs text-soluk">{bicim(b.deger)} / {bicim(b.hedef)}</span>
          </div>
        )}
        <OdulRozeti odul={b.odul} className={kazanildi ? 'opacity-60' : ''} />
      </div>
    </li>
  );
}

export function BasarimlarSekmesi() {
  const { veri, hata, yukleniyor, yenile } = useApi('/api/basarimlar');
  const [kategori, setKategori] = useState('hepsi');
  if (hata && !veri) return <HataKutusu hata={hata} tekrar={() => yenile()} />;
  if (yukleniyor && !veri) return <Yukleniyor satir={2} />;

  const o = veri.ozet;
  const liste = veri.kategoriler.filter((k) => kategori === 'hepsi' || k.kimlik === kategori).flatMap((k) => k.basarimlar);
  const secenekler = [{ kimlik: 'hepsi', ad: 'Tümü', ikon: LayoutGrid, biten: o.adet, toplam: o.toplam },
    ...veri.kategoriler.map((k) => ({ ...k, ikon: KATEGORI_IKON[k.kimlik] ?? Trophy }))];

  return (
    <div className="flex flex-col gap-4">
      <Kart className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
        <div className="flex items-center gap-4">
          <div className="grid size-14 place-items-center rounded-2xl bg-gradient-to-b from-muz to-muz-koyu text-muz-metin"><Trophy className="size-7" /></div>
          <div>
            <p className="sayi text-2xl font-semibold">{o.adet}<span className="text-soluk">/{o.toplam}</span></p>
            <p className="text-sm text-soluk">başarım kazanıldı</p>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-soluk">Başarım puanı</span>
            <span className="sayi font-medium">{o.puan}<span className="text-soluk"> / {o.toplamPuan}</span></span>
          </div>
          <Ilerleme oran={o.toplamPuan > 0 ? o.puan / o.toplamPuan : 0} />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-soluk">
            {veri.kademeler.map((k) => (
              <span key={k.kimlik} className="flex items-center gap-1.5"><KademeIkonu kademe={k.kimlik} boyut={20} />{k.ad} {k.puan} puan</span>
            ))}
          </div>
        </div>
      </Kart>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        {secenekler.map((k) => {
          const Ikon = k.ikon;
          const aktif = kategori === k.kimlik;
          return (
            <button
              key={k.kimlik}
              type="button"
              onClick={() => setKategori(k.kimlik)}
              aria-pressed={aktif}
              className={cn('flex min-h-9 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors pointer-coarse:min-h-11', aktif ? 'border-muz/40 bg-muz/10 text-muz' : 'border-cizgi bg-yuzey text-soluk hover:text-metin')}
            >
              <Ikon className="size-4" />{k.ad}
              <span className="sayi text-xs opacity-70">{k.biten}/{k.toplam}</span>
            </button>
          );
        })}
      </div>

      {liste.length === 0
        ? <Bos ikon={Trophy} baslik="Bu kategoride başarım yok" />
        : <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{liste.map((b) => <Basarim key={b.kimlik} b={b} />)}</ul>}
    </div>
  );
}
