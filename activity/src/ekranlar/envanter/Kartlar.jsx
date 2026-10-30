import { nadirlikRengi } from '../magaza/nadirlikRenk.js';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';

import { Gorsel } from '@/components/Gorsel.jsx';
import { Muz } from '@/components/Muz.jsx';
import { Pencere } from '@/components/ui/pencere.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { useUygulama } from '@/lib/store.js';
import { cn } from '@/lib/utils.js';
import { KartDetay } from './KartDetay.jsx';
import { SonucKarti } from './SonucKarti.jsx';
import { TopluEylemler } from './TopluEylemler.jsx';

function Hucre({ kart, veri, ac }) {
  const n = veri.kartlar[kart.kimlik] ?? 0;
  const p = veri.kartlar[`parlak:${kart.kimlik}`] ?? 0;
  const renk = nadirlikRengi(kart.nadirlik);
  if (n + p === 0) {
    return (
      <div className="relative grid aspect-[4/5] place-items-center overflow-hidden rounded-xl border border-dashed border-cizgi bg-zemin/40" title="Henüz yok">
        <Gorsel g={kart.gorsel} boyut={44} className="opacity-30 brightness-0" />
        <span className="absolute font-display text-xl font-bold text-silik">?</span>
      </div>
    );
  }
  const goster = n === 0 ? useUygulama.getState().katalog.kartlarHarita.get(`parlak:${kart.kimlik}`) ?? kart : kart;
  return (
    <button
      type="button"
      onClick={() => ac(kart)}
      title={kart.ad}
      className="group relative flex aspect-[4/5] flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border bg-yuzey-2 p-1.5 transition-transform hover:-translate-y-0.5"
      style={{ borderColor: renk, background: `linear-gradient(0deg, color-mix(in srgb, ${renk} 16%, transparent), transparent 70%), var(--color-yuzey-2)` }}
    >
      <Gorsel g={goster.gorsel} boyut={44} parlak={p > 0 && n === 0} />
      <span className="w-full truncate px-0.5 text-center text-[11px] leading-tight text-soluk group-hover:text-metin">{kart.ad}</span>
      {n + p > 1 && <span className="sayi absolute right-1 top-1 rounded-md bg-zemin/80 px-1.5 py-px text-[11px] font-medium text-metin">×{n + p}</span>}
      {p > 0 && <Sparkles className="absolute left-1.5 top-1.5 size-3.5 text-muz" />}
    </button>
  );
}

/** Kartlar sekmesi: toplu eylemler, nadirlik grupları, kart ızgarası. */
export function Kartlar({ veri, yenile }) {
  const katalog = useUygulama((s) => s.katalog);
  const [detay, setDetay] = useState(null);
  const [sonuc, setSonuc] = useState(null);
  const kademeler = veri.koleksiyon.kademeler;

  return (
    <div className="flex flex-col gap-5">
      <TopluEylemler veri={veri} yenile={yenile} birlestirSonucu={setSonuc} />
      {[...katalog.nadirlikler].reverse().map((n) => {
        const kartlar = katalog.kartlar.filter((k) => k.nadirlik === n.kimlik && !k.parlak);
        const kd = kademeler.find((x) => x.nadirlik === n.kimlik);
        const renk = nadirlikRengi(n.kimlik);
        return (
          <section key={n.kimlik} className="yuzey-kart flex flex-col gap-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2.5 text-[17px] font-semibold" style={{ color: renk }}>
                <span className="size-2.5 rounded-full" style={{ background: renk }} />
                {n.ad}
              </h3>
              <span className="flex items-center gap-3 text-xs text-soluk">
                <span className="hidden items-center gap-1.5 sm:flex">Değer <Muz miktar={n.deger} boyut={14} className="text-xs" /></span>
                <span className={cn('sayi rounded-full px-2 py-0.5 text-xs font-medium ring-1', kd?.sahip === kd?.toplam ? 'text-yesil ring-yesil/30' : 'text-soluk ring-cizgi')}>{kd?.sahip ?? 0}/{kd?.toplam ?? kartlar.length}</span>
              </span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-3">
              {kartlar.map((k) => <Hucre key={k.kimlik} kart={k} veri={veri} ac={setDetay} />)}
            </div>
          </section>
        );
      })}
      {detay && <KartDetay kart={detay} veri={veri} yenile={yenile} kapat={() => setDetay(null)} birlestirSonucu={(r) => { setDetay(null); setSonuc(r); }} />}
      <Pencere acik={Boolean(sonuc)} degisti={(a) => { if (!a) setSonuc(null); }} genis baslik="Birleştirme" aciklama={sonuc ? `${sonuc.harcanan} kopya birleştirildi` : ''}>
        {sonuc && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {sonuc.sonuclar.map((g, i) => (
              <SonucKarti key={g.kimlik} gecikme={i * 0.08} s={{ tur: 'kart', nadirlik: g.nadirlik, gorsel: g.gorsel, ad: g.adet > 1 ? `${g.ad} ×${g.adet}` : g.ad, yeniKart: g.yeni, adet: 1 }} />
            ))}
          </div>
        )}
      </Pencere>
    </div>
  );
}
