import { GarantiYazisi } from '../envanter/GarantiYazisi.jsx';
import { nadirlikRengi } from './nadirlikRenk.js';
import { Sparkles } from 'lucide-react';

import { HataKutusu } from '@/components/Durumlar.jsx';
import { Gorsel } from '@/components/Gorsel.jsx';
import { Md } from '@/components/Md.jsx';
import { Muz } from '@/components/Muz.jsx';
import { Ilerleme } from '@/components/ui/ilerleme.jsx';
import { Iskelet } from '@/components/ui/iskelet.jsx';
import { Pencere } from '@/components/ui/pencere.jsx';
import { useApi } from '@/lib/kancalar.js';
import { useUygulama } from '@/lib/store.js';
import { bicim } from '@/lib/utils.js';

const yuzdeMetni = (y) => `%${y.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;

function Satir({ o, enBuyuk }) {
  const para = useUygulama((s) => s.katalog?.para);
  const renk = o.tur === 'kart' ? nadirlikRengi(o.nadirlik) : o.tur === 'muz' ? 'var(--color-muz)' : 'var(--color-soluk)';
  let ne;
  if (o.tur === 'muz') {
    ne = <span className="sayi inline-flex items-center gap-1.5"><Gorsel g={para} boyut={18} />{bicim(o.min)} – {bicim(o.max)}</span>;
  } else if (o.tur === 'kart') {
    ne = (
      <span style={{ color: renk }} className="font-medium">
        {o.nadirlikAd} kart
        <span className="ml-2 text-xs font-normal text-silik">satış <Muz miktar={o.deger} boyut={13} className="text-xs text-soluk" /></span>
      </span>
    );
  } else {
    ne = <span className="inline-flex items-center gap-2"><Gorsel g={o.gorsel} boyut={22} />{o.ad}</span>;
  }
  return (
    <div
      className="flex flex-col gap-2 rounded-xl border-l-[3px] px-3 py-2.5"
      style={{ borderLeftColor: renk, background: `color-mix(in srgb, ${renk} 7%, transparent)` }}
    >
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0">{ne}</span>
        <span className="sayi shrink-0 font-medium">{yuzdeMetni(o.yuzde)}</span>
      </div>
      <Ilerleme oran={o.yuzde / enBuyuk} renk={renk} yukseklik={4} />
    </div>
  );
}

function Govde({ kimlik }) {
  const { veri: v, hata, yenile } = useApi(`/api/kasa/${encodeURIComponent(kimlik)}`);
  if (hata) return <HataKutusu hata={hata} tekrar={yenile} />;
  if (!v) return <div className="flex flex-col gap-2"><Iskelet className="h-12" /><Iskelet className="h-12" /><Iskelet className="h-12" /></div>;
  const enBuyuk = Math.max(...v.icerik.map((o) => o.yuzde), 1);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Gorsel g={v.gorsel} boyut={44} />
        <p className="text-sm text-soluk"><Md metin={v.aciklama} /></p>
      </div>
      <div className="flex flex-col gap-2">
        {v.icerik.map((o, i) => <Satir key={i} o={o} enBuyuk={enBuyuk} />)}
      </div>
      <p className="flex items-start gap-2 text-xs text-silik">
        <Sparkles className="mt-0.5 size-3.5 shrink-0 text-muz" />
        Kartlar %{(v.parlakSans * 100).toLocaleString('tr-TR')} ihtimalle parlak gelir; satış değeri {v.parlakCarpani} katıdır.
      </p>
      {v.garanti && (
        <div className="flex flex-col gap-1 rounded-xl border border-cizgi bg-yuzey-2 p-3 text-xs">
          <span className="text-silik">Üst üste {v.garanti.esik} açılışta {v.garanti.nadirlikAd} ya da üstü çıkmazsa sonuncusu {v.garanti.nadirlikAd} kart olur.</span>
          <GarantiYazisi g={v.garanti} />
        </div>
      )}
    </div>
  );
}

/** Kasa içeriği (olasılık) penceresi. `kasa` = {kimlik, ad} ya da null. */
export function KasaIcerikPenceresi({ kasa, degisti }) {
  return (
    <Pencere acik={Boolean(kasa)} degisti={(a) => { if (!a) degisti(null); }} baslik={kasa ? `${kasa.ad} içeriği` : ''} aciklama="Çıkabilecek ödüller ve olasılıkları">
      {kasa && <Govde kimlik={kasa.kimlik} />}
    </Pencere>
  );
}
