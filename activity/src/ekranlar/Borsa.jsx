import { ArrowDownRight, ArrowUpRight, ChartCandlestick, Minus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { EkranBaslik, Istatistik } from '@/components/Bolum.jsx';
import { HataKutusu } from '@/components/Durumlar.jsx';
import { Gorsel } from '@/components/Gorsel.jsx';
import { Muz } from '@/components/Muz.jsx';
import { Iskelet } from '@/components/ui/iskelet.jsx';
import { Kart } from '@/components/ui/kart.jsx';
import { Pencere } from '@/components/ui/pencere.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { useApi, useEslesme } from '@/lib/kancalar.js';
import { bicim, cn, yuzde } from '@/lib/utils.js';
import { BuyukGrafik, Sparkline } from './borsa/Grafik.jsx';
import IslemPaneli from './borsa/IslemPaneli.jsx';
import Portfoy from './borsa/Portfoy.jsx';

// Ekrana dönünce son bakılan şirket açık kalsın.
let sonSembol = null;

function Degisim({ v }) {
  if (v === null || v === undefined) return <Rozet>—</Rozet>;
  const Ikon = v > 0 ? ArrowUpRight : v < 0 ? ArrowDownRight : Minus;
  return <Rozet tur={v > 0 ? 'yesil' : v < 0 ? 'kirmizi' : 'notr'}><Ikon />{yuzde(v)}</Rozet>;
}

const degRenk = (v) => (v > 0 ? 'text-yesil' : v < 0 ? 'text-kirmizi' : '');

function SirketKarti({ s, secili, sec }) {
  return (
    <button
      type="button"
      onClick={() => sec(s.sembol)}
      aria-current={secili || undefined}
      className={cn(
        'yuzey-kart flex min-w-0 flex-col gap-3 p-4 text-left transition-[border-color,box-shadow,transform] active:scale-[0.99]',
        secili ? 'border-muz/60 shadow-parilti' : 'hover:border-cizgi-guclu',
      )}
    >
      <div className="flex items-center gap-3">
        <Gorsel g={s.gorsel} boyut={36} />
        <div className="min-w-0 flex-1">
          <p className="sayi font-semibold leading-tight">{s.sembol}</p>
          <p className="truncate text-xs text-soluk">{s.ad}</p>
        </div>
        {s.sahip > 0 && <Rozet tur="muz">{bicim(s.sahip)} adet</Rozet>}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <Muz miktar={s.fiyat ?? 0} className="text-lg font-semibold" />
          <Degisim v={s.degisimYuzde} />
        </div>
        <Sparkline gecmis={s.gecmis} degisim={s.degisimYuzde} className="h-10 w-28 shrink-0" />
      </div>
    </button>
  );
}

export default function Ekran({ secenek }) {
  const {
    veri, hata, yukleniyor, yenile,
  } = useApi('/api/hisse', { aralik: 30_000 });
  const [secilen, setSecilen] = useState(secenek?.sembol ?? sonSembol);
  // Genişte grafik ve işlem paneli kartların altında; darda seçince alttan sayfada açılır
  // (Hisse Senetleri uygulaması gibi), yoksa listenin altında görünmeden kalıyordu.
  const genis = useEslesme('(min-width: 1024px)');
  const [sayfa, setSayfa] = useState(false);
  const ayrinti = useRef(null);
  // Haber penceresinden gelindiyse o şirketi aç (ekran zaten açıkken de).
  useEffect(() => {
    if (!secenek?.sembol) return;
    sonSembol = secenek.sembol;
    setSecilen(secenek.sembol);
    setSayfa(true);
  }, [secenek]);

  if (yukleniyor && !veri) {
    return (
      <div className="flex flex-col gap-5">
        <EkranBaslik ikon={ChartCandlestick} baslik="Borsa" />
        <Iskelet className="h-24" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Iskelet key={i} className="h-32" />)}</div>
      </div>
    );
  }
  if (hata && !veri) return <HataKutusu hata={hata} tekrar={yenile} />;

  const sirketler = veri.sirketler;
  const secili = sirketler.find((s) => s.sembol === secilen) ?? sirketler[0];
  const sec = (sembol) => {
    sonSembol = sembol;
    setSecilen(sembol);
    if (!genis) setSayfa(true);
  };
  const olcu = sirketler.filter((s) => s.degisimYuzde !== null);
  const sirali = [...olcu].sort((a, b) => b.degisimYuzde - a.degisimYuzde);
  const ortalama = olcu.length ? olcu.reduce((t, s) => t + s.degisimYuzde, 0) / olcu.length : null;
  const yuksel = sirali[0];
  const dus = sirali.at(-1);
  const p = veri.portfoy;
  const gec = secili?.gecmis ?? [];
  const fiyatlar = gec.map((g) => g.fiyat);

  return (
    <div className="flex flex-col gap-5">
      <EkranBaslik ikon={ChartCandlestick} baslik="Borsa" aciklama="Fiyatlar 5 dakikada bir değişir; yüklü emir fiyatı oynatır." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Istatistik
          etiket={veri.endeks.ad}
          deger={<span className="sayi">{veri.endeks.deger === null ? '—' : bicim(Math.round(veri.endeks.deger))}</span>}
          alt={<span className={degRenk(veri.endeks.degisimYuzde ?? ortalama)}>{veri.endeks.degisimYuzde === null ? 'Piyasa endeksi' : `${yuzde(veri.endeks.degisimYuzde)} · 24 sa`}</span>}
        />
        <Istatistik etiket="En çok yükselen" deger={yuksel ? <span className="text-yesil">{yuksel.sembol}</span> : '—'} alt={yuksel ? yuzde(yuksel.degisimYuzde) : undefined} />
        <Istatistik etiket="En çok düşen" deger={dus ? <span className="text-kirmizi">{dus.sembol}</span> : '—'} alt={dus ? yuzde(dus.degisimYuzde) : undefined} />
        <Istatistik
          etiket="Portföyüm"
          deger={<Muz miktar={p.toplamDeger} boyut={18} />}
          alt={<span className={degRenk(p.toplamKar)}>{p.toplamKar >= 0 ? '+' : '−'}{bicim(Math.abs(p.toplamKar))} kâr/zarar</span>}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sirketler.map((s) => <SirketKarti key={s.sembol} s={s} secili={genis && s.sembol === secili?.sembol} sec={sec} />)}
      </div>

      {secili && genis && (
        <div ref={ayrinti} className="grid scroll-mt-4 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Kart className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Gorsel g={secili.gorsel} boyut={44} />
                <div>
                  <h3 className="text-lg font-semibold leading-tight"><span className="sayi">{secili.sembol}</span> <span className="font-normal text-soluk">· {secili.ad}</span></h3>
                  <p className="text-xs text-silik">Son {Math.round(gec.length / 12)} saat · saatlik oynaklık %{(secili.oynaklik * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <Muz miktar={secili.fiyat ?? 0} boyut={22} className="font-display text-2xl font-semibold" />
                <Degisim v={secili.degisimYuzde} />
              </div>
            </div>
            <BuyukGrafik gecmis={gec} degisim={secili.degisimYuzde} />
            {fiyatlar.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-cizgi pt-4 text-center text-xs text-silik">
                {[['En düşük', Math.min(...fiyatlar)], ['Ortalama', fiyatlar.reduce((a, b) => a + b, 0) / fiyatlar.length], ['En yüksek', Math.max(...fiyatlar)]].map(([e, d]) => (
                  <div key={e}><div>{e}</div><div className="sayi mt-0.5 text-sm text-metin">{bicim(Math.round(d))}</div></div>
                ))}
              </div>
            )}
          </Kart>
          <IslemPaneli key={secili.sembol} sirket={secili} veri={veri} yenile={yenile} />
        </div>
      )}
      {secili && !genis && (
        <Pencere acik={sayfa} degisti={setSayfa} genis baslik={secili.sembol} aciklama={secili.ad}>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <Muz miktar={secili.fiyat ?? 0} boyut={22} className="font-display text-2xl font-semibold" />
              <Degisim v={secili.degisimYuzde} />
            </div>
            <BuyukGrafik gecmis={gec} degisim={secili.degisimYuzde} />
            <p className="text-xs text-silik">Son {Math.round(gec.length / 12)} saat · saatlik oynaklık %{(secili.oynaklik * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</p>
            <IslemPaneli key={secili.sembol} sirket={secili} veri={veri} yenile={yenile} />
          </div>
        </Pencere>
      )}

      <Portfoy portfoy={p} komisyonYuzde={veri.komisyonYuzde} sec={(s) => { sec(s); if (genis) ayrinti.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} />
    </div>
  );
}
