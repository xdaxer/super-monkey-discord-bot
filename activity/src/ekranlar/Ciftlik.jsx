import {
  ArrowUp, ChevronRight, Crown, Gauge, Hammer, Lock, Package, ShoppingCart, Star, Tractor, TreePalm, Warehouse,
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  useCallback, useEffect, useRef, useState,
} from 'react';

import { EkranBaslik, Istatistik } from '@/components/Bolum.jsx';
import { HataKutusu } from '@/components/Durumlar.jsx';
import { useSimdi } from '@/components/GeriSayim.jsx';
import { Muz } from '@/components/Muz.jsx';
import { onayIste } from '@/components/Onay.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Ilerleme } from '@/components/ui/ilerleme.jsx';
import { Iskelet } from '@/components/ui/iskelet.jsx';
import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { Pencere } from '@/components/ui/pencere.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { api } from '@/lib/api.js';
import { bildirimGoster } from '@/lib/bildirim.jsx';
import { useApi, useEslesme, useIslem } from '@/lib/kancalar.js';
import { useUygulama } from '@/lib/store.js';
import { bicim, cn, sure } from '@/lib/utils.js';

/** Kule portresi ve yükseltme simgeleri (Bloons wiki; public/ciftlik). */
const kuleGorseli = (kod) => `/ciftlik/kule/${kod}.webp`;
const simgeGorseli = (kod) => `/ciftlik/simge/${kod}.webp`;

/** Kesirli muz: "12,34". */
const kesirli = (n, basamak = 2) => Number(n ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: basamak, maximumFractionDigits: basamak });
/** Saniyelik hız: küçük değerlerde dört basamak ("0,0104"). */
const hizMetni = (h) => kesirli(h, h < 0.1 ? 4 : 2);
const saatMetni = (s) => `${kesirli(s, s % 1 ? 1 : 0)} sa`;

/** Yolların ikonu ve rengi: üretim, depo, pazar. */
const YOL_IKON = [[TreePalm, 'text-yesil'], [Package, 'text-turuncu'], [ShoppingCart, 'text-mavi']];
const ENGEL = { capraz: 'Yol kapalı', tavan: 'En üst kademe' };

/** Sayfa içinde (dar ekran) kartın çerçevesi kalkar; sayfanın kendisi yüzeydir. */
const SAYFADA = 'border-0 bg-none p-0 shadow-none';

/** `secili` null ise (dar ekran) satırlar ayrıntı sayfasını açar. */
function ArsaListesi({ arsalar, secili, sec, birikmis }) {
  return (
    <div className="flex flex-col gap-2">
      {arsalar.map((a) => {
        const c = a.ciftlik;
        const b = birikmis(a);
        return (
          <button
            key={a.no}
            type="button"
            onClick={() => sec(a.no)}
            aria-current={secili === a.no || undefined}
            className={cn('flex items-center gap-3 rounded-xl border p-2.5 text-left transition-[background,border-color,transform] active:scale-[0.99]', secili === a.no ? 'border-muz/50 bg-muz/10' : 'border-cizgi bg-yuzey-2 hover:border-cizgi-guclu')}
          >
            <span className={cn('grid size-11 shrink-0 place-items-center rounded-lg border border-cizgi bg-yuzey-3', !c && 'text-silik')}>
              {c ? <img src={kuleGorseli(c.gorsel)} alt="" className={cn('size-9 object-contain', c.durdu && 'grayscale')} /> : a.acik ? <Hammer className="size-4" /> : <Lock className="size-4" />}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                {a.uye && <Crown className="size-3.5 shrink-0 text-muz" />}
                {c ? c.ad : a.acik ? 'Boş arsa' : 'Kilitli arsa'}
              </p>
              {c ? (
                <Ilerleme oran={b / c.kapasite} yukseklik={3} renk={b >= c.kapasite - 0.005 ? 'var(--color-yesil)' : 'var(--color-muz)'} />
              ) : (
                <span className="text-xs text-silik">{a.acik ? <Muz miktar={a.bedel} boyut={12} /> : a.uye ? 'Katıl üyelerine' : `Sv ${a.seviye}'te açılır`}</span>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs">
              <span className="font-medium">{a.no + 1}. arsa</span>
              {c && <span className="sayi text-soluk">{c.durdu ? 'durdu' : c.yollar.join('-')}</span>}
            </div>
            {secili === null && <ChevronRight className="size-4 shrink-0 text-silik" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}

function Yol({
  durum, bakiye, yukselt, bekliyor, durdu, ikon: [Ikon, renk],
}) {
  const s = durum.sonraki;
  const yetmez = s && !durum.engel && bakiye < s.bedel;
  return (
    <div className={cn('flex flex-col gap-3 rounded-xl border p-3', durum.engel === 'capraz' ? 'border-cizgi bg-zemin/40 opacity-60' : 'border-cizgi bg-yuzey-2')}>
      <p className="flex items-center gap-2 font-medium"><Ikon className={cn('size-4', renk)} aria-hidden />{durum.ad}</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <motion.span
            key={n}
            initial={false}
            animate={{ scale: n === durum.kademe ? [1, 1.25, 1] : 1 }}
            className={cn('h-2.5 flex-1 rounded-full', n <= durum.kademe ? 'bg-muz' : 'bg-yuzey-3 ring-1 ring-cizgi')}
          />
        ))}
      </div>
      <p className="flex min-h-8 items-center gap-1.5 text-xs text-soluk">
        {durum.simdi ? <><img src={simgeGorseli(durum.simdi.simge)} alt="" className="size-6 object-contain" />Şu an: {durum.simdi.ad}</> : 'Henüz yükseltilmedi.'}
      </p>
      {s ? (
        <div className="mt-auto flex flex-col gap-2">
          <p className="flex items-start gap-1.5 text-xs">
            <img src={simgeGorseli(s.simge)} alt="" className="size-6 shrink-0 object-contain" />
            <span><b>{s.ad}:</b> {s.aciklama}</span>
          </p>
          <Button
            tur={durum.engel || durdu ? 'ikincil' : 'ana'}
            boyut="sm"
            tam
            disabled={Boolean(durum.engel) || durdu || yetmez}
            bekliyor={bekliyor}
            onClick={yukselt}
          >
            {durum.engel ? <><Lock />{ENGEL[durum.engel]}</> : durdu ? <><Lock />Çiftlik durdu</> : <><ArrowUp /><Muz miktar={s.bedel} boyut={14} /></>}
          </Button>
          {yetmez && <p className="text-xs text-kirmizi">Bakiyen yetmiyor</p>}
        </div>
      ) : <p className="mt-auto flex items-center gap-1.5 text-xs text-muz"><Star className="size-3.5 fill-current" />{ENGEL.tavan}</p>}
    </div>
  );
}

function CiftlikDetayi({
  a, birikmis, bakiye, bekliyor, topla, yukselt, sat, sayfada,
}) {
  const c = a.ciftlik;
  const dolu = birikmis >= c.kapasite - 0.005;
  const kalanMs = c.durdu || dolu ? 0 : ((c.kapasite - birikmis) / c.hiz) * 1000;
  return (
    <Kart className={cn('flex flex-col gap-4', sayfada && SAYFADA)}>
      <div className="flex items-center gap-4">
        <span className="grid size-20 shrink-0 place-items-center rounded-2xl border-2 border-cizgi bg-yuzey-3">
          <img src={kuleGorseli(c.gorsel)} alt="" className={cn('size-16 object-contain', c.durdu && 'grayscale')} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-display text-xl font-semibold">{c.ad}</p>
            <Rozet>{a.no + 1}. arsa</Rozet>
            <Rozet tur="muz">{c.yollar.join('-')}</Rozet>
            {a.uye && <Rozet tur="mor"><Crown />Üye arsası</Rozet>}
            {c.durdu && <Rozet tur="kirmizi">Durdu</Rozet>}
          </div>
          <Ilerleme oran={birikmis / c.kapasite} yukseklik={6} renk={dolu ? 'var(--color-yesil)' : 'var(--color-muz)'} />
          <p className="sayi flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-soluk">
            <span>Depo {kesirli(birikmis)} / {bicim(Math.floor(c.kapasite))}</span>
            <span>· {hizMetni(c.hiz)} muz/sn</span>
            <span>· {saatMetni(c.depoSaat)} depo</span>
            <span>· {c.durdu ? 'üyelik bitince durdu' : dolu ? 'depo dolu, üretim durdu' : `${sure(kalanMs)} sonra dolar`}</span>
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button tur="ana" onClick={topla} disabled={c.durdu || birikmis < 1} bekliyor={bekliyor}>
          <Warehouse />Topla · <Muz miktar={Math.floor(birikmis)} boyut={14} />
        </Button>
        <Button tur="cizgili" onClick={sat} bekliyor={bekliyor}>
          Sat · <Muz miktar={c.satisDegeri} boyut={14} />
        </Button>
      </div>
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-silik">Yükseltme yolları</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {c.yolDurumu.map((d, i) => (
            <Yol key={d.yol} durum={d} ikon={YOL_IKON[i]} bakiye={bakiye} durdu={c.durdu} bekliyor={bekliyor} yukselt={() => yukselt(i)} />
          ))}
        </div>
        <p className="mt-2 text-xs text-silik">
          BTD6 gibi: bir yol 5. kademeye, ikinci yol en çok 2. kademeye çıkar, üçüncü yol kapalı kalır.
          Satış harcadığının %{Math.round(c.satisOrani * 100)}'ını geri verir.
        </p>
      </div>
    </Kart>
  );
}

function ArsaDetayi({
  a, veri, bakiye, bekliyor, kur, sayfada,
}) {
  return (
    <Kart className={cn('flex flex-col gap-4', sayfada && SAYFADA)}>
      <div className="flex items-center gap-4">
        <span className="grid size-20 shrink-0 place-items-center rounded-2xl border-2 border-cizgi bg-yuzey-3">
          {a.acik ? <img src={kuleGorseli('000')} alt="" className="size-16 object-contain" /> : <Lock className="size-8 text-silik" />}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-xl font-semibold">{a.acik ? 'Boş arsa' : 'Kilitli arsa'}</p>
            <Rozet>{a.no + 1}. arsa</Rozet>
            {a.uye && <Rozet tur="mor"><Crown />Üye arsası</Rozet>}
          </div>
          <p className="text-sm text-soluk">
            {a.acik
              ? `Muz Çiftliği kur: saniyede ${hizMetni(veri.taban.hiz)} muz üretir, deposu ${veri.taban.depoSaat} saatlik üretimi tutar.`
              : a.uye
                ? 'Bu arsa YouTube Katıl üyelerine özel. Üye olunca buraya ek bir çiftlik kurabilirsin.'
                : `Sv ${a.seviye}'te açılır; sen Sv ${veri.oyuncuSeviyesi}'sin.`}
          </p>
        </div>
      </div>
      {a.acik && (
        <div className="flex flex-col gap-1.5">
          <Button tur="ana" onClick={kur} disabled={bakiye < a.bedel} bekliyor={bekliyor} className="self-start">
            <Hammer />Kur · <Muz miktar={a.bedel} boyut={14} />
          </Button>
          {bakiye < a.bedel && <p className="text-xs text-kirmizi">Bakiyen yetmiyor</p>}
        </div>
      )}
    </Kart>
  );
}

export default function Ciftlik() {
  const { veri, setVeri, hata, yenile } = useApi('/api/ciftlik', { aralik: 60_000 });
  const [calistir, bekliyor] = useIslem();
  const [secili, setSecili] = useState(null);
  // Genişte liste ve ayrıntı yan yana; darda ayrıntı listenin altında kaybolmasın diye sayfada açılır.
  const genis = useEslesme('(min-width: 1024px)');
  const [sayfa, setSayfa] = useState(false);
  const bakiye = useUygulama((s) => s.bakiye) ?? 0;
  // Saniye bazlı: depo her saniye sunucunun formülüyle artar.
  const simdi = useSimdi(1000);
  const fark = useRef(0);
  useEffect(() => {
    if (veri) fark.current = veri.simdi - Date.now();
  }, [veri]);

  const birikmis = useCallback((a) => {
    const c = a.ciftlik;
    if (!c) return 0;
    if (c.durdu) return c.birikmis;
    return Math.min(c.kapasite, Math.max(0, (c.hiz * (simdi + fark.current - c.sonToplama)) / 1000));
  }, [simdi]);

  if (hata && !veri) return <HataKutusu hata={hata} tekrar={yenile} />;
  if (!veri) return <div className="flex flex-col gap-5"><EkranBaslik ikon={Tractor} baslik="Çiftlik" /><Iskelet className="h-24" /><Iskelet className="h-72" /></div>;

  const islem = (fn) => calistir(async () => {
    const r = await fn();
    if (r?.durum) setVeri(r.durum);
  });
  const topla = (arsa = null) => islem(async () => {
    const r = await api('/api/ciftlik/topla', { govde: arsa === null ? {} : { arsa } });
    bildirimGoster(`**${bicim(r.sonuc.toplam)}** muz toplandı.`, 'basari');
    return r;
  });
  const kur = (a) => islem(async () => {
    const r = await api('/api/ciftlik/kur', { govde: { arsa: a.no } });
    bildirimGoster(`${a.no + 1}. arsaya Muz Çiftliği kuruldu.`, 'basari');
    return r;
  });
  const yukselt = (a, yol) => islem(async () => {
    const r = await api('/api/ciftlik/yukselt', { govde: { arsa: a.no, yol } });
    bildirimGoster(`${a.no + 1}. arsa: **${r.sonuc.ad}**${r.sonuc.toplanan ? ` (depodaki ${bicim(r.sonuc.toplanan)} muz toplandı)` : ''}`, 'basari');
    return r;
  });
  const sat = (a) => islem(async () => {
    const c = a.ciftlik;
    const evet = await onayIste({
      baslik: `${c.ad} satılsın mı?`,
      metin: `Çiftlik kaldırılır; harcadığın muzun **%${Math.round(c.satisOrani * 100)}'ı** (**${bicim(c.satisDegeri)}** muz) ve depodaki muz cüzdanına geçer.`,
      evet: 'Sat',
      tehlikeli: true,
    });
    if (!evet) return null;
    const r = await api('/api/ciftlik/sat', { govde: { arsa: a.no } });
    bildirimGoster(`Çiftlik satıldı: **+${bicim(r.sonuc.iade + r.sonuc.toplanan)}** muz.`, 'basari');
    return r;
  });

  const kurulu = veri.arsalar.filter((x) => x.ciftlik);
  const toplam = veri.arsalar.reduce((t, x) => t + (x.ciftlik && !x.ciftlik.durdu ? birikmis(x) : 0), 0);
  const seciliNo = secili ?? kurulu[0]?.no ?? veri.arsalar.find((x) => x.acik)?.no ?? 0;
  const a = veri.arsalar[seciliNo];
  const sec = (no) => {
    setSecili(no);
    if (!genis) setSayfa(true);
  };
  const ayrinti = (sayfada) => (a.ciftlik ? (
    <CiftlikDetayi
      a={a}
      birikmis={birikmis(a)}
      bakiye={bakiye}
      bekliyor={bekliyor}
      topla={() => topla(a.no)}
      yukselt={(yol) => yukselt(a, yol)}
      sat={() => sat(a)}
      sayfada={sayfada}
    />
  ) : (
    <ArsaDetayi a={a} veri={veri} bakiye={bakiye} bekliyor={bekliyor} kur={() => kur(a)} sayfada={sayfada} />
  ));

  return (
    <div className="flex flex-col gap-5">
      <EkranBaslik
        ikon={Tractor}
        baslik="Çiftlik"
        aciklama={`Muz Çiftliği kur; muzlar saniye saniye birikir, gelip topla${veri.prestij > 1 ? ` · ⭐ prestij üretimi ×${kesirli(veri.prestij, 1)}` : ''}`}
        sag={!veri.kilitli && (
          <Button tur="ana" onClick={() => topla()} disabled={toplam < 1} bekliyor={bekliyor}>
            <Warehouse />Hepsini topla
          </Button>
        )}
      />

      {veri.kilitli ? (
        <Kart className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-yuzey-3 text-silik"><Lock className="size-7" /></span>
          <p className="font-display text-xl font-semibold">Çiftlik Sv {veri.kilitSeviyesi}'te açılır</p>
          <p className="text-sm text-soluk">Sen şu an Sv {veri.oyuncuSeviyesi}'sin. Sohbet edip seviye atla; kilit kendiliğinden açılır.</p>
          <Ilerleme oran={veri.oyuncuSeviyesi / veri.kilitSeviyesi} className="max-w-xs" />
        </Kart>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Istatistik etiket="Çiftlik" ikon={Tractor} deger={`${kurulu.length} / ${veri.arsalar.length}`} />
            <Istatistik etiket="Üretim" ikon={Gauge} deger={`${hizMetni(veri.hiz)}/sn`} />
            <Istatistik etiket="Depoda" ikon={Warehouse} deger={<span className="sayi">{kesirli(toplam)}</span>} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
            <Kart className="lg:sticky lg:top-4 lg:self-start">
              <KartBaslik ikon={Tractor} baslik="Arsalar" aciklama={genis ? 'Seviye atladıkça yenileri açılır' : 'Yönetmek için bir arsaya dokun'} />
              <ArsaListesi arsalar={veri.arsalar} secili={genis ? seciliNo : null} sec={sec} birikmis={birikmis} />
            </Kart>
            {genis ? (
              <motion.div key={seciliNo} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>{ayrinti(false)}</motion.div>
            ) : (
              <Pencere acik={sayfa} degisti={setSayfa} baslik={`${a.no + 1}. arsa`} aciklama={a.ciftlik ? a.ciftlik.ad : a.acik ? 'Boş arsa' : 'Kilitli arsa'}>
                {ayrinti(true)}
              </Pencere>
            )}
          </div>
        </>
      )}
    </div>
  );
}
