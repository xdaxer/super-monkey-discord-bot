import {
  Banana, Clock, Coins, DoorOpen, Hammer, Megaphone, PartyPopper, PawPrint, Shield, Volume2, Wind, X,
} from 'lucide-react';
import { motion, useAnimate } from 'motion/react';
import {
  useCallback, useEffect, useReducer, useRef, useState,
} from 'react';

import { Gorsel } from '@/components/Gorsel.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Ilerleme } from '@/components/ui/ilerleme.jsx';
import { konfetiPatlat } from '@/ekranlar/prestij/konfeti.js';
import { api } from '@/lib/api.js';
import {
  bonkSesi, bossSesi, gucSesi, kapiSesi, sayimSesi, zaferSesi,
} from '@/lib/ses.js';
import { useUygulama } from '@/lib/store.js';
import { cn } from '@/lib/utils.js';

const SES_YOLU = '/ses/m7.mp3';

/** Vardiya: bu kadar dayanırsan grev bastırılır. */
const OYUN_MS = 20_000;
const SAYIM_ADIM_MS = 600;
const SAYIM_MS = SAYIM_ADIM_MS * 4;
const KALKAN = 5;
/** Kapı çizgisi (alanın soldan oranı): maymun buraya varırsa kaçar. */
const KAPI = 0.07;
const SERITLER = [0.26, 0.54, 0.82];
const KOMBO_MS = 1300;

const SLOGANLAR = ['ZAM!', 'GREV!', 'MUZ İSTİYORUZ', 'SENDİKA!', 'MOLA HAKKI', '8 SAAT!', 'YETER!', 'KÖLE DEĞİLİZ', 'MUZ = EMEK'];
const BONKLAR = ['BONK!', 'İŞE DÖN!', 'HADİ HADİ!', 'MESAİ!', 'PAT!', 'GERİ!'];

/** Maymun türleri: hız alanı geçme süresinin tersidir (oran/ms). */
const TURLER = {
  isci: { can: 1, hiz: 1 / 4200, boyut: 46, maliyet: 1 },
  kosucu: { can: 1, hiz: 1 / 2400, boyut: 38, maliyet: 1 },
  baskan: { can: 3, hiz: 1 / 6500, boyut: 60, maliyet: 2 },
};

const sec = (dizi) => dizi[Math.floor(Math.random() * dizi.length)];

/** Katalogdaki BTD maymunları; büyükler sendika başkanı olur. */
function maymunHavuzu() {
  const kartlar = (useUygulama.getState().katalog?.kartlar ?? []).filter((k) => !k.parlak);
  return {
    hepsi: kartlar,
    buyuk: kartlar.filter((k) => k.nadirlik === 'efsanevi' || k.nadirlik === 'mitik'),
  };
}

function yeniMaymun(s, ilerleme, havuz) {
  const r = Math.random();
  const tur = ilerleme > 0.25 && r < 0.13 ? 'baskan' : ilerleme > 0.08 && r < 0.4 ? 'kosucu' : 'isci';
  const t = TURLER[tur];
  const liste = tur === 'baskan' && havuz.buyuk.length > 0 ? havuz.buyuk : havuz.hepsi;
  s.sira += 1;
  s.maymunlar.push({
    id: s.sira,
    tur,
    x: 1.05,
    serit: sec(SERITLER) + (Math.random() - 0.5) * 0.05,
    hiz: t.hiz * (1 + ilerleme * 0.75) * (0.9 + Math.random() * 0.2),
    can: t.can,
    g: liste.length > 0 ? sec(liste).gorsel : null,
    slogan: tur === 'baskan' ? 'GENEL GREV!' : sec(SLOGANLAR),
    vurulma: 0,
    darbe: 0,
  });
}

function efekt(s, tur, x, y, metin = '') {
  s.sira += 1;
  s.efektler.push({
    id: s.sira, tur, x, y, metin, zaman: performance.now(),
  });
}

/** Pankartlı maymun. */
function Maymun({ m, darbe = false }) {
  const t = TURLER[m.tur];
  return (
    <div className={cn('relative flex flex-col items-center transition-[filter] duration-100', darbe && 'brightness-[2.2]')}>
      <span className={cn(
        'whitespace-nowrap rounded-md border-2 border-muz-koyu bg-muz-acik px-1.5 py-0.5 font-display font-extrabold leading-none text-muz-metin shadow-md',
        m.tur === 'baskan' ? 'text-[11px]' : 'text-[10px]',
      )}
      >
        {m.slogan}
      </span>
      <span className="h-2 w-0.5 bg-muz-koyu" />
      {m.g ? <Gorsel g={m.g} boyut={t.boyut} /> : <PawPrint className="text-muz" style={{ width: t.boyut, height: t.boyut }} />}
      {m.tur === 'baskan' && <Megaphone className="absolute -right-3 top-7 size-5 -rotate-12 text-muz" />}
      {m.tur === 'kosucu' && <Wind className="absolute -right-4 bottom-1 size-4 text-soluk" />}
      {t.can > 1 && (
        <span className="mt-1 flex gap-0.5">
          {Array.from({ length: t.can }, (_, i) => <span key={i} className={cn('size-1.5 rounded-full', i < m.can ? 'bg-muz' : 'bg-cizgi-guclu')} />)}
        </span>
      )}
    </div>
  );
}

/** Vurulan maymundan saçılan muzlar. */
function Sacilma() {
  return Array.from({ length: 6 }, (_, i) => {
    const aci = (i / 6) * Math.PI * 2 + 0.3;
    return (
      <motion.span
        key={i}
        className="absolute left-0 top-0 text-muz"
        initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
        animate={{
          x: Math.cos(aci) * 46, y: Math.sin(aci) * 46 - 12, opacity: 0, rotate: 200,
        }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <Banana className="size-4" />
      </motion.span>
    );
  });
}

function Efekt({ e }) {
  const konum = { left: `${e.x * 100}%`, top: `${e.y * 100}%` };
  if (e.tur === 'yazi') {
    return (
      <motion.div
        className="pointer-events-none absolute z-50 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-display text-2xl font-extrabold text-muz drop-shadow-[0_2px_8px_rgb(0_0_0/0.8)]"
        style={konum}
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: [0.4, 1.25, 1], opacity: [0, 1, 1, 0] }}
        transition={{ duration: 1.1, times: [0, 0.25, 0.4, 1] }}
      >
        {e.metin}
      </motion.div>
    );
  }
  const renk = { bonk: 'text-muz text-lg', darbe: 'text-metin text-base', kacti: 'text-kirmizi text-lg', iska: 'text-silik text-xs' }[e.tur];
  return (
    <div className="pointer-events-none absolute z-40" style={konum}>
      {e.tur === 'bonk' && <Sacilma />}
      <motion.span
        className={cn('absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-display font-extrabold drop-shadow-[0_2px_6px_rgb(0_0_0/0.8)]', renk)}
        initial={{ y: 0, scale: 0.6, opacity: 1, rotate: -8 }}
        animate={{ y: -38, scale: 1.15, opacity: 0, rotate: 6 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        {e.metin}
      </motion.span>
    </div>
  );
}

/**
 * Grev Kırıcı: pankartlı maymunlar sağdan çıkış kapısına yürür, dokunarak
 * işe döndürürsün. Koşucu hızlıdır, sendika başkanı üç darbe ister ve kaçarsa
 * iki kalkan götürür. Altın muz ekrandakilerin hepsini, zam herkesi yavaşlatır.
 * 10'luk kombo bir kalkan geri verir. Vardiya bitene kadar dayan.
 */
function Oyun({ bitti }) {
  const [, ciz] = useReducer((x) => x + 1, 0);
  const [kapsam, oynat] = useAnimate();
  const bittiRef = useRef(bitti);
  bittiRef.current = bitti;
  const d = useRef(null);
  d.current ??= {
    maymunlar: [], efektler: [], guc: null, kalkan: KALKAN, vurulan: 0, kombo: 0, sonVurus: 0,
    gecen: -SAYIM_MS, sonSayim: null, sonrakiCikis: 0, gucZaman: 4500, yavas: 0, flas: 0, sira: 0, bitti: false,
    havuz: maymunHavuzu(),
  };

  useEffect(() => {
    const s = d.current;
    let onceki = performance.now();
    let kare;
    const dongu = (t) => {
      const dt = Math.min(50, t - onceki);
      onceki = t;
      if (s.bitti) return;
      s.gecen += dt;

      if (s.gecen < 0) {
        const sayim = Math.ceil(-s.gecen / SAYIM_ADIM_MS);
        if (sayim !== s.sonSayim) {
          s.sonSayim = sayim;
          if (sayim > 1) sayimSesi();
        }
      } else {
        if (s.sonSayim !== 0) {
          s.sonSayim = 0;
          sayimSesi(true);
        }
        const ilerleme = s.gecen / OYUN_MS;
        s.sonrakiCikis -= dt;
        if (s.sonrakiCikis <= 0) {
          yeniMaymun(s, ilerleme, s.havuz);
          // Son üçte birde arada bir ikişer çıkarlar.
          if (ilerleme > 0.6 && Math.random() < 0.3) yeniMaymun(s, ilerleme, s.havuz);
          s.sonrakiCikis = 850 - 480 * ilerleme + Math.random() * 250;
        }

        s.gucZaman -= dt;
        if (s.guc && t > s.guc.bitis) s.guc = null;
        if (!s.guc && s.gucZaman <= 0) {
          s.guc = {
            tur: Math.random() < 0.55 ? 'altin' : 'zam', x: 0.3 + Math.random() * 0.5, y: sec(SERITLER), bitis: t + 2600,
          };
          s.gucZaman = 5000 + Math.random() * 2500;
        }

        s.yavas = Math.max(0, s.yavas - dt);
        const carpan = s.yavas > 0 ? 0.3 : 1;
        for (const m of s.maymunlar) {
          if (m.vurulma) continue;
          m.x -= m.hiz * carpan * dt;
          if (m.x <= KAPI) {
            m.vurulma = -1;
            s.kalkan -= TURLER[m.tur].maliyet;
            s.kombo = 0;
            s.flas = t;
            efekt(s, 'kacti', KAPI + 0.04, m.serit, 'KAÇTI!');
            kapiSesi();
            navigator.vibrate?.(90);
            if (kapsam.current) oynat(kapsam.current, { x: [0, -10, 10, -6, 6, 0] }, { duration: 0.35 });
          }
        }
        if (s.kalkan <= 0) {
          s.bitti = true;
          bittiRef.current({ kazandi: false, vurulan: s.vurulan });
          return;
        }
        if (s.gecen >= OYUN_MS) {
          s.bitti = true;
          bittiRef.current({ kazandi: true, vurulan: s.vurulan });
          return;
        }
      }

      s.maymunlar = s.maymunlar.filter((m) => m.vurulma === 0 || (m.vurulma > 0 && t - m.vurulma < 700));
      s.efektler = s.efektler.filter((e) => t - e.zaman < 1200);
      ciz();
      kare = requestAnimationFrame(dongu);
    };
    kare = requestAnimationFrame(dongu);
    return () => cancelAnimationFrame(kare);
  }, [kapsam, oynat]);

  const s = d.current;
  const simdi = performance.now();
  const oynuyor = !s.bitti && s.gecen >= 0;

  const vur = (m, olay) => {
    olay.stopPropagation();
    if (!oynuyor || m.vurulma) return;
    const t = performance.now();
    s.kombo = t - s.sonVurus < KOMBO_MS ? s.kombo + 1 : 1;
    s.sonVurus = t;
    m.can -= 1;
    m.darbe = t;
    bonkSesi(s.kombo);
    if (m.can > 0) {
      // Başkan sendeleyip geri gider.
      m.x = Math.min(1.02, m.x + 0.05);
      efekt(s, 'darbe', m.x, m.serit - 0.08, 'DIŞ!');
    } else {
      m.vurulma = t;
      s.vurulan += 1;
      efekt(s, 'bonk', m.x, m.serit - 0.08, sec(BONKLAR));
    }
    if (s.kombo % 10 === 0 && s.kalkan < KALKAN) {
      s.kalkan += 1;
      efekt(s, 'yazi', 0.5, 0.45, '+1 KALKAN');
      gucSesi();
    }
    ciz();
  };

  const gucAl = (olay) => {
    olay.stopPropagation();
    const g = s.guc;
    if (!oynuyor || !g) return;
    s.guc = null;
    gucSesi();
    const t = performance.now();
    if (g.tur === 'altin') {
      for (const m of s.maymunlar) {
        if (m.vurulma) continue;
        m.vurulma = t;
        s.vurulan += 1;
        efekt(s, 'bonk', m.x, m.serit - 0.08, sec(BONKLAR));
      }
      efekt(s, 'yazi', 0.5, 0.45, 'MUZ YAĞMURU!');
    } else {
      s.yavas = 3500;
      efekt(s, 'yazi', 0.5, 0.45, 'ZAM VERDİN!');
    }
    ciz();
  };

  const iska = (olay) => {
    if (!oynuyor) return;
    const kutu = olay.currentTarget.getBoundingClientRect();
    s.kombo = 0;
    efekt(s, 'iska', (olay.clientX - kutu.left) / kutu.width, (olay.clientY - kutu.top) / kutu.height, 'ıska');
    ciz();
  };

  const kombo = simdi - s.sonVurus < KOMBO_MS && s.kombo >= 3 ? s.kombo : 0;
  const sayim = s.gecen < 0 ? Math.ceil(-s.gecen / SAYIM_ADIM_MS) - 1 : null;

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1" aria-label={`${s.kalkan} kalkan`}>
          {Array.from({ length: KALKAN }, (_, i) => (
            <Shield key={i} className={cn('size-5 transition-colors', i < s.kalkan ? 'fill-muz/25 text-muz' : 'text-cizgi-guclu')} />
          ))}
        </div>
        {kombo > 0 && (
          <motion.span key={kombo} initial={{ scale: 1.7, rotate: -6 }} animate={{ scale: 1, rotate: 0 }} className="font-display text-lg font-extrabold text-muz">
            x{kombo} KOMBO
          </motion.span>
        )}
        <span className="sayi text-sm text-soluk"><b className="text-metin">{s.vurulan}</b> işe döndü</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-soluk">
        <Clock className="size-3.5" />
        <Ilerleme oran={Math.max(0, s.gecen) / OYUN_MS} yukseklik={6} className="flex-1" />
        <span className="sayi w-10 text-right">{Math.ceil((OYUN_MS - Math.max(0, s.gecen)) / 1000)} sn</span>
      </div>

      <div
        ref={kapsam}
        onPointerDown={iska}
        className={cn(
          'relative h-[300px] w-full touch-none select-none overflow-hidden rounded-2xl border bg-gradient-to-b from-yuzey-3 to-yuzey-2 transition-colors sm:h-[340px]',
          s.yavas > 0 ? 'border-mavi/60' : 'border-cizgi',
        )}
      >
        {SERITLER.map((y) => (
          <div key={y} className="absolute inset-x-0 border-b border-dashed border-cizgi-guclu/50" style={{ top: `${y * 100 + 8}%` }} />
        ))}
        <div className="absolute inset-y-0 left-0 flex flex-col items-center justify-center gap-2 border-r-2 border-dashed border-muz/40 bg-muz/[0.07] text-muz" style={{ width: `${KAPI * 100}%` }}>
          <DoorOpen className="size-5" />
          <span className="text-[9px] font-bold tracking-[0.3em] [writing-mode:vertical-rl]">ÇIKIŞ</span>
        </div>

        {s.maymunlar.map((m) => (
          <div
            key={m.id}
            className="absolute"
            style={{
              left: `${m.x * 100}%`, top: `${m.serit * 100}%`, transform: 'translate(-50%, -62%)', zIndex: Math.round(m.serit * 100),
            }}
          >
            {m.vurulma ? (
              <motion.div initial={{ x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 }} animate={{ x: 90, y: -90, rotate: 540, scale: 0.3, opacity: 0 }} transition={{ duration: 0.65, ease: 'easeOut' }}>
                <Maymun m={m} />
              </motion.div>
            ) : (
              <button type="button" aria-label="Maymunu işe döndür" onPointerDown={(e) => vur(m, e)} className="block cursor-pointer p-1.5">
                <motion.div
                  animate={{ y: [0, -5, 0], rotate: [-6, 6, -6] }}
                  transition={{ duration: (m.tur === 'kosucu' ? 0.28 : 0.5) / (s.yavas > 0 ? 0.4 : 1), repeat: Infinity, ease: 'easeInOut' }}
                >
                  <Maymun m={m} darbe={simdi - m.darbe < 130} />
                </motion.div>
              </button>
            )}
          </div>
        ))}

        {s.guc && (
          <button
            type="button"
            aria-label={s.guc.tur === 'altin' ? 'Altın muz' : 'Zam'}
            onPointerDown={gucAl}
            className="absolute z-[90] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
            style={{ left: `${s.guc.x * 100}%`, top: `${s.guc.y * 100}%` }}
          >
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: [1, 1.18, 1], rotate: [-10, 10, -10] }}
              transition={{ duration: 0.7, repeat: Infinity }}
              className="grid size-12 place-items-center rounded-full bg-muz text-muz-metin shadow-[0_0_28px_rgb(255_212_59/0.75)]"
            >
              {s.guc.tur === 'altin' ? <Banana className="size-6" /> : <Coins className="size-6" />}
            </motion.span>
            <span className="whitespace-nowrap text-[10px] font-extrabold tracking-wider text-muz">{s.guc.tur === 'altin' ? 'ALTIN MUZ' : 'ZAM'}</span>
          </button>
        )}

        {s.efektler.map((e) => <Efekt key={e.id} e={e} />)}

        {simdi - s.flas < 180 && <div className="pointer-events-none absolute inset-0 z-[95] bg-kirmizi/15" />}

        {sayim !== null && (
          <div className="pointer-events-none absolute inset-0 z-[100] grid place-items-center bg-zemin/50">
            <motion.span key={sayim} initial={{ scale: 2.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="font-display text-6xl font-extrabold text-muz drop-shadow-[0_4px_16px_rgb(0_0_0/0.8)]">
              {sayim > 0 ? sayim : 'BASTIR!'}
            </motion.span>
          </div>
        )}
      </div>
      <p className="text-center text-xs text-soluk">
        Maymunlara dokun, kapıdan kaçmasınlar. <b className="text-metin">Altın muz</b> hepsini işe döndürür, <b className="text-metin">zam</b> oyalar.
        Kalkanlar biterse enerjin gider.
      </p>
    </div>
  );
}

/** Uyarıda pankart sallayan üç maymun. */
function Yuruyus() {
  const [uclu] = useState(() => {
    const { hepsi } = maymunHavuzu();
    return ['GREV!', 'ZAM!', 'MUZ İSTİYORUZ'].map((slogan, i) => ({
      id: i, tur: 'isci', can: 1, slogan, g: hepsi.length > 0 ? sec(hepsi).gorsel : null,
    }));
  });
  return (
    <div className="flex items-end justify-center gap-4">
      {uclu.map((m, i) => (
        <motion.div key={m.id} animate={{ y: [0, -6, 0], rotate: [-6, 6, -6] }} transition={{ duration: 0.55, repeat: Infinity, delay: i * 0.15 }}>
          <Maymun m={m} />
        </motion.div>
      ))}
    </div>
  );
}

/**
 * Şarkı pencereden bağımsızdır: kayıptan sonra pencere kapansa da sonuna
 * kadar çalar. Dışarıdan duraklatılırsa (sistem sesi, arama) kaldığı yerden sürer.
 */
let sarki = null;

/** Yalnız tarayıcının otomatik çalma engeli dokunuş ister; dosya yoksa (NotSupportedError) grev sessiz oynanır. */
const tarayiciEngeli = (h) => h?.name === 'NotAllowedError';

function sarkiCal(engellendi) {
  if (!sarki) {
    const a = new Audio(SES_YOLU);
    a.preload = 'auto';
    a.volume = 1;
    a.onended = () => { if (sarki === a) sarki = null; };
    a.onpause = () => {
      if (!a.ended && sarki === a) a.play().catch((h) => engellendi(tarayiciEngeli(h)));
    };
    sarki = a;
  }
  sarki.play().then(() => engellendi(false)).catch((h) => engellendi(tarayiciEngeli(h)));
}

function sarkiSustur() {
  const a = sarki;
  sarki = null;
  a?.pause();
}

/** Kazanınca şarkı bir süre daha çalar, sonra kısılarak susar. */
const KAZANC_SARKI_MS = 18_000;
const KISMA_MS = 2_000;

function sarkiyiKis() {
  const a = sarki;
  if (!a) return;
  setTimeout(() => {
    const bas = Date.now();
    // Arka planda da işlesin diye requestAnimationFrame değil aralık.
    const t = setInterval(() => {
      if (sarki !== a) {
        clearInterval(t);
        return;
      }
      const oran = (Date.now() - bas) / KISMA_MS;
      if (oran >= 1) {
        clearInterval(t);
        sarkiSustur();
        return;
      }
      a.volume = 1 - oran;
    }, 100);
  }, KAZANC_SARKI_MS - KISMA_MS);
}

/**
 * Maymun grevi katmanı (bkz. app/lib/grev.js). Grev çıkar çıkmaz şarkı
 * başlar. Kazanılırsa 18 sn sonra kısılarak susar; kaybedilirse pencere kapatılabilir ama şarkı
 * sonuna kadar çalar.
 */
export function GrevKatmani() {
  const grev = useUygulama((s) => s.grev);
  const [asama, setAsama] = useState('uyari');
  const [sonuc, setSonuc] = useState(null);
  const [sesBekliyor, setSesBekliyor] = useState(false);

  const kapat = () => useUygulama.getState().grevBitir();
  const sesCal = useCallback(() => sarkiCal(setSesBekliyor), []);

  // Her yeni grevde baştan: uyarı sesi ve şarkı hemen başlar.
  useEffect(() => {
    if (!grev) return;
    setAsama('uyari');
    setSonuc(null);
    sarkiSustur();
    bossSesi();
    sesCal();
  }, [Boolean(grev)]); // eslint-disable-line react-hooks/exhaustive-deps

  const baslat = () => {
    // Tarayıcı ilk çalmayı engellediyse bu dokunuşla başlar.
    if (!sarki || sarki.paused) sesCal();
    setAsama('oyun');
  };

  const oyunBitti = useCallback(async ({ kazandi, vurulan }) => {
    setSonuc({ kazandi, vurulan });
    if (kazandi) {
      sarkiyiKis();
      setAsama('kazanc');
      zaferSesi();
      konfetiPatlat(true);
    } else {
      setAsama('kayip');
      if (!sarki || sarki.paused) sesCal();
    }
    // Kayıp sunucuya hemen yazılır: uygulama kapansa da enerji gider.
    await api('/api/calis/grev', { govde: { kazandi, vurulan } }).catch(() => null);
  }, [sesCal]);

  if (!grev) return null;

  return (
    <div role="alertdialog" aria-modal="true" aria-label="Maymun grevi" className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/75 p-4 backdrop-blur-[2px]">
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className={cn('yuzey-kart relative flex w-full flex-col items-center gap-5 p-5 text-center shadow-2xl sm:p-6', asama === 'oyun' ? 'max-w-lg' : 'max-w-sm')}
      >
        {asama === 'uyari' && (
          <>
            <div className="relative grid size-20 place-items-center">
              <motion.span className="absolute inset-0 rounded-full bg-muz/25" animate={{ scale: [1, 1.5], opacity: [0.6, 0] }} transition={{ duration: 1.2, repeat: Infinity }} />
              <motion.span
                className="relative grid size-20 place-items-center rounded-full bg-muz/15 text-muz"
                animate={{ rotate: [-12, 12, -12] }}
                transition={{ duration: 0.4, repeat: Infinity }}
              >
                <Megaphone className="size-10" />
              </motion.span>
            </div>
            <div className="flex flex-col gap-2">
              <h2 className="font-display text-2xl font-bold">Grev var!</h2>
              <p className="text-base text-metin/90">Maymunlar kötü çalışma şartlarına dayanamadı ve grev yapıyor.</p>
            </div>
            <Yuruyus />
            <Button tur="ana" boyut="lg" tam onClick={baslat}><Hammer />Bastır</Button>
          </>
        )}
        {asama === 'oyun' && <Oyun bitti={oyunBitti} />}
        {asama === 'kazanc' && (
          <>
            <motion.div initial={{ scale: 0.5, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 12 }} className="grid size-20 place-items-center rounded-full bg-muz/15 text-muz">
              <PartyPopper className="size-10" />
            </motion.div>
            <div className="flex flex-col gap-2">
              <h2 className="font-display text-2xl font-bold">Grev bastırıldı!</h2>
              <p className="text-base text-metin/90"><b className="sayi text-muz">{sonuc?.vurulan ?? 0}</b> maymun homurdanarak işbaşı yaptı.</p>
            </div>
            <Button tur="ana" boyut="lg" tam onClick={kapat}><Hammer />Çalışmaya dön</Button>
          </>
        )}
        {asama === 'kayip' && (
          <>
            <button
              type="button"
              onClick={kapat}
              aria-label="Kapat"
              className="absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-yuzey-3 text-soluk transition-colors hover:bg-cizgi hover:text-metin active:scale-95 pointer-coarse:size-9"
            >
              <X className="size-4" strokeWidth={2.5} />
            </button>
            <motion.div animate={{ rotate: [-12, 12, -12] }} transition={{ duration: 0.4, repeat: Infinity }} className="grid size-20 place-items-center rounded-full bg-muz/15 text-muz">
              <Megaphone className="size-10" />
            </motion.div>
            <div className="flex flex-col gap-2">
              <h2 className="font-display text-2xl font-bold">Grev kazandı</h2>
              <p className="text-base text-metin/90">Maymunlar iş bıraktı, bütün enerjin gitti. Şarkıları bitene kadar susmayacaklar.</p>
            </div>
            <Yuruyus />
            {sesBekliyor && <Button tur="ana" boyut="lg" tam onClick={sesCal}><Volume2 />Devam</Button>}
          </>
        )}
      </motion.div>
    </div>
  );
}
