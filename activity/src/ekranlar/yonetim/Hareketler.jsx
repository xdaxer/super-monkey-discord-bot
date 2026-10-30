import {
  ArrowDownUp, ChevronLeft, ChevronRight, Filter, ScrollText, UserRound, X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Avatar } from '@/components/Avatar.jsx';
import { Bos, HataKutusu } from '@/components/Durumlar.jsx';
import { Muz } from '@/components/Muz.jsx';
import { UyeSecici } from '@/components/UyeSecici.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Giris, girisSinifi } from '@/components/ui/giris.jsx';
import { Iskelet } from '@/components/ui/iskelet.jsx';
import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { api } from '@/lib/api.js';
import { bicim, cn, tarih } from '@/lib/utils.js';

const SIRALAMALAR = [
  { kimlik: 'yeni', ad: 'En yeni' },
  { kimlik: 'eski', ad: 'En eski' },
  { kimlik: 'mutlak', ad: 'En büyük hareket' },
  { kimlik: 'buyuk', ad: 'En büyük giriş' },
  { kimlik: 'kucuk', ad: 'En büyük çıkış' },
];
const YONLER = [
  { kimlik: '', ad: 'Hepsi' },
  { kimlik: 'giris', ad: 'Giriş' },
  { kimlik: 'cikis', ad: 'Çıkış' },
];
/** Canlı akışta ilk sayfa bu aralıkla sessizce yenilenir (sekme görünürken). */
const CANLI_MS = 5_000;
/** Yeni gelen satırın vurgusu bu kadar sürer. */
const VURGU_MS = 4_000;

const BOS_SUZGEC = {
  turler: [], uye: null, yon: '', min: '', donem: '7g', siralama: 'yeni', yoneticiGizle: false,
};

/** Seçili olanı vurgulanan küçük düğme grubu. */
function Secmeli({ liste, deger, degisti }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-cizgi bg-zemin/40 p-1">
      {liste.map((x) => (
        <button
          key={x.kimlik}
          type="button"
          onClick={() => degisti(x.kimlik)}
          className={cn('rounded-lg px-2.5 py-1 text-[13px] transition-colors', deger === x.kimlik ? 'bg-muz/15 font-medium text-muz' : 'text-soluk hover:text-metin')}
        >
          {x.ad}
        </button>
      ))}
    </div>
  );
}

/** Tür süzgeci: grup adına basınca bütün türleri, türe basınca tek türü aç/kapa. */
function TurSuzgeci({ gruplar, secili, degisti }) {
  const varMi = (t) => secili.includes(t);
  const grupDegis = (g) => {
    const turler = g.turler.map((t) => t.kimlik);
    const hepsi = turler.every(varMi);
    degisti(hepsi ? secili.filter((t) => !turler.includes(t)) : [...new Set([...secili, ...turler])]);
  };
  const turDegis = (t) => degisti(varMi(t) ? secili.filter((x) => x !== t) : [...secili, t]);
  return (
    <div className="flex flex-col gap-2.5">
      {gruplar.map((g) => (
        <div key={g.kimlik} className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => grupDegis(g)}
            className={cn('w-32 shrink-0 text-left text-xs font-medium uppercase tracking-wide transition-colors', g.turler.every((t) => varMi(t.kimlik)) ? 'text-muz' : 'text-silik hover:text-metin')}
          >
            {g.ad}
          </button>
          {g.turler.map((t) => (
            <button
              key={t.kimlik}
              type="button"
              onClick={() => turDegis(t.kimlik)}
              className={cn('rounded-full border px-2.5 py-0.5 text-xs transition-colors', varMi(t.kimlik) ? 'border-muz/50 bg-muz/10 text-muz' : 'border-cizgi text-soluk hover:border-cizgi-guclu hover:text-metin')}
            >
              {t.ad}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function sorgu(s, sayfa) {
  const p = new URLSearchParams({ donem: s.donem, siralama: s.siralama, sayfa: String(sayfa) });
  if (s.turler.length) p.set('tur', s.turler.join(','));
  if (s.uye) p.set('uye', s.uye.id);
  if (s.yon) p.set('yon', s.yon);
  if (Number(s.min) > 0) p.set('min', String(Math.floor(Number(s.min))));
  if (s.yoneticiGizle) p.set('yoneticiGizle', '1');
  return `/api/yonetim/hareketler?${p}`;
}

function UyeHucre({ uye, onClick }) {
  return (
    <button type="button" onClick={onClick} className="flex min-w-0 items-center gap-2 text-left hover:text-muz" title="Bu üyeye süz">
      <Avatar uye={uye} boyut={22} />
      <span className="truncate">{uye.ad}</span>
    </button>
  );
}

function Liste({ satirlar, uyeSec, yeniler }) {
  const vurgu = (id) => cn('transition-colors duration-1000', yeniler.has(id) && 'bg-muz/10');
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cizgi text-left text-xs uppercase tracking-wide text-silik">
              <th className="py-2 pr-3 font-medium">Zaman</th>
              <th className="py-2 pr-3 font-medium">Üye</th>
              <th className="py-2 pr-3 font-medium">Tür</th>
              <th className="py-2 pr-3 text-right font-medium">Miktar</th>
              <th className="py-2 pr-3 text-right font-medium">Bakiye sonrası</th>
              <th className="py-2 font-medium">Karşı taraf</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cizgi">
            {satirlar.map((h) => (
              <tr key={h.id} className={vurgu(h.id)}>
                <td className="sayi whitespace-nowrap py-2 pr-3 text-soluk">{tarih(h.zaman)}</td>
                <td className="max-w-44 py-2 pr-3"><UyeHucre uye={h.uye} onClick={() => uyeSec(h.uye)} /></td>
                <td className="py-2 pr-3"><Rozet>{h.etiket}</Rozet></td>
                <td className="py-2 pr-3 text-right"><Muz miktar={h.miktar} isaretli /></td>
                <td className="py-2 pr-3 text-right"><Muz miktar={h.bakiyeSonra} /></td>
                <td className="max-w-44 py-2 text-soluk">
                  {!h.karsi ? '—' : h.karsi.tur === 'uye'
                    ? <UyeHucre uye={h.karsi} onClick={() => uyeSec(h.karsi)} />
                    : <span className="truncate">{h.karsi.ad}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-2 md:hidden">
        {satirlar.map((h) => (
          <li key={h.id} className={cn('flex flex-col gap-1.5 rounded-xl border border-cizgi bg-zemin/40 p-3 text-sm', vurgu(h.id))}>
            <div className="flex items-center justify-between gap-2">
              <UyeHucre uye={h.uye} onClick={() => uyeSec(h.uye)} />
              <span className="sayi shrink-0 text-xs text-silik">{tarih(h.zaman)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Rozet>{h.etiket}</Rozet>
              <Muz miktar={h.miktar} isaretli />
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-silik">
              <span className="truncate">{h.karsi ? `Karşı: ${h.karsi.ad}` : ''}</span>
              <span className="flex shrink-0 items-center gap-1">sonra <Muz miktar={h.bakiyeSonra} boyut={13} /></span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Canlı akışı açıp kapatan düğme; açıkken nabız atan yeşil nokta. */
function CanliDugme({ acik, degisti, durgun }) {
  return (
    <button
      type="button"
      onClick={() => degisti(!acik)}
      title={durgun ? 'Canlı akış yalnız ilk sayfada çalışır' : acik ? 'Canlı akışı durdur' : 'Canlı akışı başlat'}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        acik && !durgun ? 'border-yesil/40 bg-yesil/10 text-yesil' : 'border-cizgi text-soluk hover:text-metin',
      )}
    >
      <span className="relative flex size-2">
        {acik && !durgun && <span className="absolute inline-flex size-full animate-ping rounded-full bg-yesil opacity-75" />}
        <span className={cn('relative inline-flex size-2 rounded-full', acik && !durgun ? 'bg-yesil' : 'bg-silik')} />
      </span>
      {acik ? (durgun ? 'Canlı (1. sayfada)' : 'Canlı') : 'Duraklatıldı'}
    </button>
  );
}

/** Bütün ekonomi defteri: her üyenin her muz hareketi, süzgeç ve sıralamayla. */
export default function Hareketler() {
  const [suzgec, setSuzgec] = useState(BOS_SUZGEC);
  const [minYazi, setMinYazi] = useState('');
  const [sayfa, setSayfa] = useState(1);
  const [veri, setVeri] = useState(null);
  const [hata, setHata] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [secici, setSecici] = useState(false);
  const [canli, setCanli] = useState(true);
  const [yeniler, setYeniler] = useState(() => new Set());
  // Aynı süzgeç/sayfada önceki yanıtın satırları; yalnız yoklamada gelen yeni satırlar vurgulanır.
  const onceki = useRef({ anahtar: null, idler: new Set() });

  const degis = (alan, deger) => { setSuzgec((s) => ({ ...s, [alan]: deger })); setSayfa(1); };

  // En az miktar yazılırken her tuşta istek gitmesin.
  useEffect(() => {
    const z = setTimeout(() => {
      setSuzgec((s) => (s.min === minYazi ? s : { ...s, min: minYazi }));
      setSayfa(1);
    }, 400);
    return () => clearTimeout(z);
  }, [minYazi]);

  const adres = sorgu(suzgec, sayfa);

  useEffect(() => {
    let iptal = false;
    const getir = (sessiz) => {
      if (!sessiz) setYukleniyor(true);
      return api(adres)
        .then((v) => {
          if (iptal) return;
          const idler = new Set(v.satirlar.map((h) => h.id));
          if (onceki.current.anahtar === adres) {
            const yeni = v.satirlar.filter((h) => !onceki.current.idler.has(h.id)).map((h) => h.id);
            if (yeni.length) {
              setYeniler((y) => new Set([...y, ...yeni]));
              setTimeout(() => setYeniler((y) => {
                const k = new Set(y);
                for (const id of yeni) k.delete(id);
                return k;
              }), VURGU_MS);
            }
          }
          onceki.current = { anahtar: adres, idler };
          setVeri(v);
          setHata(null);
        })
        .catch((e) => { if (!iptal && !sessiz) setHata(e); })
        .finally(() => { if (!iptal && !sessiz) setYukleniyor(false); });
    };
    getir(false);
    // İlk sayfa dışında satırlar okurken kaymasın: canlı akış yalnız 1. sayfada.
    const t = canli && sayfa === 1
      ? setInterval(() => { if (document.visibilityState === 'visible') getir(true); }, CANLI_MS)
      : null;
    return () => { iptal = true; if (t) clearInterval(t); };
  }, [adres, canli, sayfa]);

  const temizle = () => { setSuzgec(BOS_SUZGEC); setMinYazi(''); setSayfa(1); };
  const suzgecVar = JSON.stringify({ ...suzgec, min: minYazi }) !== JSON.stringify({ ...BOS_SUZGEC, min: '' });

  return (
    <div className="flex flex-col gap-4">
      <Kart className="flex flex-col gap-4">
        <KartBaslik
          ikon={Filter}
          baslik="Süzgeç"
          aciklama="Her muz hareketi defterde: kumar, çalışma, gönderme, mağaza, banka…"
          sag={suzgecVar && <Button tur="hayalet" boyut="sm" onClick={temizle}><X />Temizle</Button>}
          className="mb-0"
        />
        <div className="flex flex-wrap items-center gap-2">
          {veri && <Secmeli liste={veri.secenekler.donemler} deger={suzgec.donem} degisti={(d) => degis('donem', d)} />}
          <Secmeli liste={YONLER} deger={suzgec.yon} degisti={(d) => degis('yon', d)} />
          <label className="flex items-center gap-1.5 text-sm text-soluk">
            <ArrowDownUp className="size-4" />
            <select value={suzgec.siralama} onChange={(e) => degis('siralama', e.target.value)} className={cn(girisSinifi, 'h-9 w-auto pr-8')}>
              {SIRALAMALAR.map((s) => <option key={s.kimlik} value={s.kimlik}>{s.ad}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {suzgec.uye ? (
            <span className="flex items-center gap-2 rounded-xl border border-muz/40 bg-muz/10 py-1 pl-1.5 pr-1 text-sm">
              <Avatar uye={suzgec.uye} boyut={22} />
              {suzgec.uye.ad}
              <button type="button" onClick={() => degis('uye', null)} className="rounded-md p-0.5 text-soluk hover:text-metin" aria-label="Üye süzgecini kaldır"><X className="size-4" /></button>
            </span>
          ) : (
            <Button boyut="sm" onClick={() => setSecici(true)}><UserRound />Üye seç</Button>
          )}
          <Giris value={minYazi} onChange={(e) => setMinYazi(e.target.value.replace(/[^\d]/g, ''))} placeholder="En az miktar" inputMode="numeric" className="h-9 w-36" />
          <label className="flex cursor-pointer items-center gap-2 text-sm text-soluk">
            <input type="checkbox" checked={suzgec.yoneticiGizle} onChange={(e) => degis('yoneticiGizle', e.target.checked)} className="size-4 accent-[var(--color-muz)]" />
            Yöneticileri gizle
          </label>
        </div>
        {veri && <TurSuzgeci gruplar={veri.secenekler.gruplar} secili={suzgec.turler} degisti={(t) => degis('turler', t)} />}
      </Kart>

      <Kart>
        <KartBaslik
          ikon={ScrollText}
          baslik="Ekonomi hareketleri"
          aciklama={veri ? `${bicim(veri.toplam)} kayıt` : 'Yükleniyor…'}
          sag={veri && (
            <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-soluk">
              <CanliDugme acik={canli} degisti={setCanli} durgun={sayfa !== 1} />
              <span className="flex items-center gap-1">Giriş <Muz miktar={veri.giris} boyut={13} className="text-yesil" /></span>
              <span className="flex items-center gap-1">Çıkış <Muz miktar={veri.cikis} boyut={13} className="text-kirmizi" /></span>
              <span className="flex items-center gap-1">Net <Muz miktar={veri.giris - veri.cikis} boyut={13} isaretli /></span>
            </span>
          )}
        />
        {hata && <HataKutusu hata={hata} />}
        {!veri && yukleniyor && <Iskelet className="h-64" />}
        {veri && veri.satirlar.length === 0 && <Bos ikon={ScrollText} baslik="Kayıt yok" aciklama="Bu süzgeçle eşleşen hareket bulunmadı." className="py-8" />}
        {veri && veri.satirlar.length > 0 && (
          <div className={cn('transition-opacity', yukleniyor && 'opacity-60')}>
            <Liste satirlar={veri.satirlar} uyeSec={(u) => degis('uye', u)} yeniler={yeniler} />
            <div className="mt-4 flex items-center justify-between gap-3">
              <Button boyut="sm" disabled={veri.sayfa <= 1 || yukleniyor} onClick={() => setSayfa(veri.sayfa - 1)}><ChevronLeft />Önceki</Button>
              <span className="sayi text-sm text-soluk">Sayfa {veri.sayfa} / {veri.sayfaSayisi}</span>
              <Button boyut="sm" disabled={veri.sayfa >= veri.sayfaSayisi || yukleniyor} onClick={() => setSayfa(veri.sayfa + 1)}>Sonraki<ChevronRight /></Button>
            </div>
          </div>
        )}
      </Kart>
      <UyeSecici acik={secici} degisti={setSecici} sec={(u) => degis('uye', u)} baslik="Hareketleri süzülecek üye" />
    </div>
  );
}
