import {
  Hand, Layers2, Play, Plus, Scissors, Spade,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useRef, useState } from 'react';

import {
  bekle, BahisPaneli, Kurallar, konfeti, Masa, OyunDuzeni, SonucKarti, TAKIM, TakimIkonu, useCanli,
} from './ortak.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { api } from '@/lib/api.js';
import { bildirimGoster, hataGoster } from '@/lib/bildirim.jsx';
import { bakiyeGuncelle } from '@/lib/store.js';
import { carpanMetni, cn } from '@/lib/utils.js';

function deger(kartlar) {
  let t = 0;
  let as = 0;
  for (const k of kartlar) {
    if (!k) continue;
    const r = k.slice(0, -1);
    if (r === 'A') { as += 1; t += 11; } else if ('JQK'.includes(r)) t += 10; else t += Number(r);
  }
  while (t > 21 && as > 0) { t -= 10; as -= 1; }
  return t;
}

const YUZ = 'absolute inset-0 rounded-xl [backface-visibility:hidden]';

/** İskambil kartı. `kapali`: arka yüz görünür; değişince çevrilir. */
function Kart({ k, kapali }) {
  const takim = k?.slice(-1);
  const sayi = k?.slice(0, -1);
  const renk = TAKIM[takim]?.kirmizi ? 'text-kirmizi-koyu' : 'text-zemin';
  return (
    <motion.div
      initial={{ x: 90, y: -70, rotate: 14, opacity: 0, scale: 0.8 }}
      animate={{ x: 0, y: 0, rotate: 0, opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      className="h-[5.5rem] w-16 shrink-0 [perspective:700px] sm:h-36 sm:w-[6.5rem]"
    >
      <motion.div className="relative size-full [transform-style:preserve-3d]" animate={{ rotateY: kapali ? 180 : 0 }} transition={{ duration: 0.5 }}>
        <div className={cn(YUZ, 'flex flex-col justify-between bg-gradient-to-br from-metin to-[color-mix(in_oklab,var(--color-metin)_82%,var(--color-soluk))] p-1.5 shadow-[0_8px_18px_-6px_rgb(0_0_0/0.7)]', renk)}>
          {k && (
            <>
              <div className="flex flex-col items-center gap-0.5 self-start leading-none">
                <span className="sayi text-base font-bold sm:text-lg">{sayi}</span>
                <TakimIkonu takim={takim} className="size-3.5 sm:size-4" />
              </div>
              <span className="absolute inset-0 grid place-items-center"><TakimIkonu takim={takim} className="size-7 sm:size-11" /></span>
              <div className="flex rotate-180 flex-col items-center gap-0.5 self-end leading-none">
                <span className="sayi text-base font-bold sm:text-lg">{sayi}</span>
                <TakimIkonu takim={takim} className="size-3.5 sm:size-4" />
              </div>
            </>
          )}
        </div>
        <div
          className={cn(YUZ, 'border-2 border-metin bg-yuzey-3 p-1.5 shadow-[0_8px_18px_-6px_rgb(0_0_0/0.7)]')}
          style={{ transform: 'rotateY(180deg)' }}
        >
          <div className="size-full rounded-md border border-muz/40 [background:repeating-linear-gradient(45deg,color-mix(in_oklab,var(--color-muz)_22%,transparent)_0_2px,transparent_2px_8px),repeating-linear-gradient(-45deg,color-mix(in_oklab,var(--color-muz)_22%,transparent)_0_2px,transparent_2px_8px)]" />
        </div>
      </motion.div>
    </motion.div>
  );
}

function El({
  ad, kartlar, puan, vurgu, oynaniyor = false, ek = null,
}) {
  return (
    <div className={cn('flex flex-col gap-3 rounded-2xl transition-colors', oynaniyor && '-m-2 bg-white/5 p-2 ring-2 ring-muz/60')}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-metin/60">{ad}</span>
        {puan !== null && (
          <Rozet tur={vurgu === 'kaybeden' ? 'kirmizi' : vurgu === 'kazanan' ? 'yesil' : 'notr'} className="sayi bg-black/30 px-2.5 text-sm">{puan}</Rozet>
        )}
        {ek}
      </div>
      <div className="flex min-h-[5.5rem] items-center pl-1 sm:min-h-36">
          {kartlar.map((c, i) => (
            <div key={c.id} className={cn(i > 0 && '-ml-5 sm:-ml-6')} style={{ zIndex: i }}>
              <Kart k={c.k} kapali={c.kapali} />
            </div>
          ))}
      </div>
    </div>
  );
}

const SONUC_BASLIK = {
  blackjack: 'Blackjack!', kazandi: 'Kazandın', kaybetti: 'Kurpiyer kazandı', berabere: 'Berabere', patladi: 'Geçtin, kaybettin',
};
const BOLUNMUS_BASLIK = { kazandi: 'Bölünmüş el: kazandın', kaybetti: 'Bölünmüş el: kaybettin', berabere: 'Bölünmüş el: başa baş' };
const EL_SONUC = {
  blackjack: 'Blackjack', kazandi: 'kazandı', kaybetti: 'kaybetti', berabere: 'berabere', patladi: 'patladı',
};
const elVurgusu = (sonuc) => (['kazandi', 'blackjack'].includes(sonuc) ? 'kazanan' : ['kaybetti', 'patladi'].includes(sonuc) ? 'kaybeden' : null);

let kimlikSayac = 0;
const yeniKart = (k, kapali = false) => { kimlikSayac += 1; return { id: kimlikSayac, k, kapali }; };

export default function Blackjack({ ctx }) {
  const BJ = ctx.veri.oyunlar.blackjack;
  const canli = useCanli();
  const [el, setEl] = useState(ctx.veri.blackjack);
  // Oyuncunun elleri: her biri kart listesi; bölünmeden tek el.
  const [oy, setOyDurum] = useState(() => (ctx.veri.blackjack?.eller ?? []).map((e) => e.kartlar.map((k) => yeniKart(k))));
  const oyRef = useRef(oy);
  const setOy = (f) => setOyDurum((o) => { const y = typeof f === 'function' ? f(o) : f; oyRef.current = y; return y; });
  const [ku, setKu] = useState(() => (ctx.veri.blackjack ? [yeniKart(ctx.veri.blackjack.kurpiyer[0]), yeniKart(null, true)] : []));
  const [istek, setIstek] = useState(false);
  const [bitti, setBitti] = useState(null);
  const kilitRef = useRef(false);

  const kurpiyerAcik = ku.filter((c) => !c.kapali).map((c) => c.k);
  const kapaliVar = ku.some((c) => c.kapali);

  const calis = async (fn) => {
    if (kilitRef.current) return;
    kilitRef.current = true;
    setIstek(true);
    try { await fn(); } catch (e) { hataGoster(e); } finally {
      kilitRef.current = false;
      if (canli.current) setIstek(false);
    }
  };

  /** Ekrandaki elleri sunucudakine getirir: bölündüyse kartlar ayrılır, yeni kartlar sırayla gelir. */
  const elleriEsitle = async (eller) => {
    if (eller.length > oyRef.current.length && oyRef.current.length === 1) {
      const [ilk, ikinci] = oyRef.current[0];
      setOy([[ilk], [ikinci]]);
      await bekle(450);
    }
    for (let i = 0; i < eller.length; i += 1) {
      for (const k of eller[i].kartlar.slice(oyRef.current[i]?.length ?? 0)) {
        setOy((o) => o.map((el2, j) => (j === i ? [...el2, yeniKart(k)] : el2)));
        // eslint-disable-next-line no-await-in-loop
        await bekle(420);
      }
    }
  };

  const sonuclandir = async (e, v) => {
    // Oyuncunun yeni kartları, sonra kurpiyerin kapalı kartı açılır, kalanlar çekilir.
    setEl(e);
    await elleriEsitle(e.eller);
    await bekle(300);
    setKu((liste) => liste.map((c) => (c.kapali ? { ...c, k: e.kurpiyer[1], kapali: false } : c)));
    await bekle(750);
    for (const k of e.kurpiyer.slice(2)) {
      setKu((liste) => [...liste, yeniKart(k)]);
      // eslint-disable-next-line no-await-in-loop
      await bekle(520);
    }
    await bekle(200);
    setEl(e);
    setBitti(e);
    bakiyeGuncelle(v.bakiye);
    if (e.odeme / e.bahis >= 5) konfeti();
  };

  const baslat = () => calis(async () => {
    const bahis = ctx.bahis.trim();
    if (!bahis) { bildirimGoster('Önce bir bahis yaz: `500`, `2.5k`, `yarı`, `hepsi`.', 'hata'); return; }
    const v = await api('/api/kumar/blackjack/baslat', { govde: { bahis }, bakiyeErtele: true });
    if (v.zatenAcik) {
      bildirimGoster(v.sebep, 'bilgi');
      setBitti(null);
      setEl(v.el);
      setOy(v.el.eller.map((x) => x.kartlar.map((k) => yeniKart(k))));
      setKu([yeniKart(v.el.kurpiyer[0]), yeniKart(null, true)]);
      return;
    }
    if (v.eski) {
      bildirimGoster(`Unutulan önceki el kendiliğinden durdu: **${v.eski.net >= 0 ? '+' : '−'}${Math.abs(v.eski.net).toLocaleString('tr-TR')}** muz.`, 'bilgi', 6000);
    }
    const e = v.el;
    setBitti(null);
    setEl(null);
    setOy([]);
    setKu([]);
    await bekle(150);
    // Dağıtım: sen, kurpiyer, sen, kurpiyer (kapalı).
    setOy([[yeniKart(e.oyuncu[0])]]);
    await bekle(380);
    setKu([yeniKart(e.kurpiyer[0])]);
    await bekle(380);
    setOy((o) => [[...o[0], yeniKart(e.oyuncu[1])]]);
    await bekle(380);
    if (e.bitti) {
      setEl({ ...e, bitti: false });
      setKu((l) => [...l, yeniKart(null, true)]);
      await bekle(380);
      await sonuclandir(e, v);
      return;
    }
    setKu((l) => [...l, yeniKart(null, true)]);
    await bekle(380);
    setEl(e);
    bakiyeGuncelle(v.bakiye);
  });

  const hamle = (tur) => calis(async () => {
    let v;
    try {
      v = await api('/api/kumar/blackjack/hamle', { govde: { tur }, bakiyeErtele: true });
    } catch (e) {
      hataGoster(e);
      const g = await api('/api/kumar').catch(() => null);
      if (g && !g.blackjack) { setEl(null); setOy([]); setKu([]); }
      return;
    }
    if (v.el.bitti) {
      await sonuclandir(v.el, v);
      return;
    }
    await elleriEsitle(v.el.eller);
    setEl(v.el);
    bakiyeGuncelle(v.bakiye);
  });

  const suren = el && !el.bitti && !bitti;
  const bolunmus = oy.length > 1;
  const kuDeger = ku.length ? deger(kurpiyerAcik) : null;
  const sonDurum = bitti ? (bitti.net > 0 ? 'kazanan' : bitti.net < 0 ? 'kaybeden' : null) : null;

  const sahne = (
    <>
      <Masa>
        <div className="flex flex-col gap-6 px-4 py-6 sm:px-8">
          <El
            ad="Kurpiyer"
            kartlar={ku}
            puan={kuDeger === null ? null : kapaliVar ? `${kuDeger} + ?` : kuDeger}
            vurgu={sonDurum === 'kazanan' ? 'kaybeden' : sonDurum === 'kaybeden' ? 'kazanan' : null}
          />
          <div className="h-px bg-white/10" />
          {bolunmus ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {oy.map((kartlar, i) => {
                const sunucu = (bitti ?? el)?.eller?.[i];
                return (
                  <El
                    key={i}
                    ad={`${i + 1}. el`}
                    kartlar={kartlar}
                    puan={deger(kartlar.map((c) => c.k))}
                    vurgu={bitti ? elVurgusu(sunucu?.sonuc) : null}
                    oynaniyor={Boolean(suren && sunucu?.oynaniyor)}
                    ek={sunucu && <span className="sayi text-xs text-metin/60">{sunucu.bahis.toLocaleString('tr-TR')} muz</span>}
                  />
                );
              })}
            </div>
          ) : (
            <El ad="Sen" kartlar={oy[0] ?? []} puan={oy[0]?.length ? deger(oy[0].map((c) => c.k)) : null} vurgu={sonDurum} />
          )}
          {ku.length === 0 && oy.length === 0 && (
            <p className="-mt-2 text-center text-sm text-metin/60">Bahsini yaz ve kartları dağıt.</p>
          )}
        </div>
      </Masa>

      {suren && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <Button tur="ikincil" boyut="lg" onClick={() => hamle('cek')} disabled={istek}><Plus />Kart çek</Button>
          <Button tur="basari" boyut="lg" onClick={() => hamle('dur')} disabled={istek}><Hand />Dur</Button>
          <Button tur="cizgili" boyut="lg" onClick={() => hamle('katla')} disabled={istek || !el.katlayabilir}><Layers2 />İkiye katla</Button>
          <Button tur="cizgili" boyut="lg" onClick={() => hamle('bol')} disabled={istek || !el.bolebilir}><Scissors />Böl</Button>
        </div>
      )}

      {bitti && (
        <SonucKarti
          net={bitti.net}
          carpan={bitti.bahis ? bitti.odeme / bitti.bahis : 0}
          cashback={bitti.cashback}
          baslik={(bitti.bolundu ? BOLUNMUS_BASLIK : SONUC_BASLIK)[bitti.sonuc] ?? 'El bitti'}
          ayrinti={bitti.bolundu
            ? `${bitti.eller.map((x, i) => `${i + 1}. el **${x.deger}** (${EL_SONUC[x.sonuc]})`).join(', ')}; kurpiyer **${bitti.kurpiyerDeger}**.`
            : `Sen **${bitti.oyuncuDeger}**, kurpiyer **${bitti.kurpiyerDeger}**.`}
          onTekrar={baslat}
          tekrarBekliyor={istek}
        />
      )}

      <Kurallar satirlar={[
        '21\'e en yakın eli yapmaya çalış; geçersen kaybedersin. Kurpiyer 17\'ye kadar çeker.',
        `Blackjack (ilk iki kart 21) ${carpanMetni(BJ.blackjack)}, kazanç ${carpanMetni(BJ.kazanc)}, beraberlikte bahis geri (${carpanMetni(BJ.berabere)}).`,
        '**İkiye katla:** yalnız ilk iki kartla; bahis iki katına çıkar, tek kart gelir ve el biter.',
        '**Böl:** ilk iki kart aynı değerdeyse (10, J, Q, K hepsi 10) bir kez bölünür; aynı bahis ikinci ele de konur, eller sırayla oynanır. Bölünen asa tek kart gelir; bölünmüş eldeki 21 blackjack sayılmaz.',
        `El ${Math.round(BJ.zamanAsimiMs / 60000)} dakikada bitmezse yeni elde kendiliğinden durulur.`,
      ]}
      />
    </>
  );

  return (
    <OyunDuzeni
      sahne={sahne}
      panel={(
        <BahisPaneli
          ctx={ctx}
          etiket="Dağıt"
          ikon={Spade}
          onAna={baslat}
          bekliyor={istek && !suren}
          kilit={istek}
          sabit={suren ? el.bahis : null}
          ana={suren ? <Button tur="ikincil" boyut="lg" tam disabled><Play />El sürüyor</Button> : null}
        />
      )}
    />
  );
}
