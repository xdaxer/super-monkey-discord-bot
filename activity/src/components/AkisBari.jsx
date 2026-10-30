import { Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import { Avatar } from '@/components/Avatar.jsx';
import { Gorsel, nadirlikRengi } from '@/components/Gorsel.jsx';
import { OYUNLAR } from '@/ekranlar/kumar/oyunlar.js';
import { useApi } from '@/lib/kancalar.js';
import { useUygulama } from '@/lib/store.js';
import {
  bicim, carpanMetni, cn, sure,
} from '@/lib/utils.js';

const YOKLAMA_MS = 5000;
/** Yeni kayıtlar tek tek, bu aralıkla girer: bar yavaş yavaş aşağı kayar. */
const GIRIS_MS = 1200;
const SINIR = 24;
/** Birikme sınırı: uzun bir çoklu açılış barı dakikalarca meşgul etmesin. */
const BEKLEYEN_SINIRI = 12;

const OYUN_IKONU = Object.fromEntries(OYUNLAR.map((o) => [o.kimlik, o.ikon]));

/** Kaydın şerit rengi: kasada nadirlik, kumarda kazanç yeşil / kayıp kırmızı. */
function renk(o) {
  if (o.tur === 'kasa') return nadirlikRengi(o.oge.nadirlik);
  return o.tur === 'kazanc' ? 'var(--color-yesil)' : 'var(--color-kirmizi)';
}

/** Görsel + altındaki başlık: düşen eşya, kasadan muz ya da kumar sonucu. */
function useIcerik({ o, kucuk }) {
  const para = useUygulama((s) => s.katalog?.para);
  const boyut = kucuk ? 36 : 52;
  if (o.tur === 'kasa' && o.oge.tur === 'muz') {
    return { gorsel: <Gorsel g={para} boyut={boyut - 8} />, baslik: `${bicim(o.oge.miktar)} muz` };
  }
  if (o.tur === 'kasa') {
    return { gorsel: <Gorsel g={o.oge.gorsel} boyut={boyut} parlak={o.oge.parlak} />, baslik: o.oge.ad };
  }
  const Ikon = OYUN_IKONU[o.oyun];
  const kazanc = o.tur === 'kazanc';
  return {
    gorsel: (
      <div className="flex flex-col items-center gap-0.5">
        {Ikon && <Ikon className={cn(kucuk ? 'size-6' : 'size-7', kazanc ? 'text-yesil' : 'text-kirmizi')} />}
        <span className={cn('sayi font-display font-bold leading-none', kucuk ? 'text-sm' : 'text-base', kazanc ? 'text-yesil' : 'text-kirmizi')}>
          {kazanc ? '+' : '−'}{bicim(Math.abs(o.net))}
        </span>
      </div>
    ),
    baslik: kazanc ? `${o.oyunAd} · ${carpanMetni(o.carpan)}` : o.oyunAd,
  };
}

function Karo({ o, fark, yatay }) {
  const { gorsel, baslik } = useIcerik({ o, kucuk: yatay });
  const r = renk(o);
  const altBilgi = o.tur === 'kasa' ? o.kasa.ad : o.tur === 'kazanc' ? 'Büyük kazanç' : (o.acilan !== null ? `${o.acilan} kare sonra mayın` : 'Büyük kayıp');
  return (
    <motion.li
      initial={yatay ? { width: 0, opacity: 0 } : { height: 0, opacity: 0 }}
      animate={yatay ? { width: 'auto', opacity: 1 } : { height: 'auto', opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      className="shrink-0 overflow-hidden"
    >
      {/* Fareyle üzerine gelince, dokunmatikte dokununca (odak) ayrıntı kaplaması açılır. */}
      <div
        tabIndex={0}
        className={cn('group relative flex flex-col items-center gap-1.5 overflow-hidden border-cizgi px-2.5 outline-none', yatay ? 'h-full w-[108px] border-r py-1.5' : 'border-b py-3')}
        style={{ background: `radial-gradient(ellipse at 50% 115%, color-mix(in oklab, ${r} ${o.onemli ? 26 : 13}%, transparent), transparent 72%)` }}
      >
        <span className={cn('absolute', yatay ? 'inset-x-0 bottom-0 h-[3px]' : 'inset-y-0 left-0 w-[3px]')} style={{ background: r }} />
        {o.tur === 'kasa' && o.oge.parlak && <Sparkles className="absolute right-1.5 top-1.5 size-3.5 text-muz" />}
        <div className={cn('grid place-items-center', yatay ? 'h-10' : 'h-14')}>{gorsel}</div>
        <div className="w-full truncate text-center text-[12px] font-medium leading-tight" style={o.tur === 'kasa' && o.oge.tur !== 'muz' ? { color: r } : undefined}>{baslik}</div>
        <div className="flex w-full min-w-0 items-center justify-center gap-1 text-[11px] leading-tight text-soluk">
          <Avatar uye={o.kullanici} boyut={14} />
          <span className="truncate">{o.kullanici.ad}</span>
        </div>
        {/* Üzerine gelince: nereden düştüğü ve ne zaman (CSGOCases'teki gibi). */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-zemin/85 px-2 text-center opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus:opacity-100">
          <Avatar uye={o.kullanici} boyut={yatay ? 22 : 28} />
          <span className="w-full truncate text-[12px] font-semibold">{o.kullanici.ad}</span>
          <span className="w-full truncate text-[11px] text-soluk">{altBilgi}</span>
          <span className="text-[11px] text-silik">{sure(Math.max(Date.now() + fark - o.zaman, 1000))} önce</span>
        </div>
      </div>
    </motion.li>
  );
}

/**
 * Son düşenler barı: kasadan çıkan her şey, büyük kazanç ve kayıplar
 * (app/web/akis.js). Yeni kayıtlar sıraya girip tek tek, yavaşça üstten girer;
 * geniş ekranda sağda dikey bar, darda başlığın altında yatay şerit.
 */
export function AkisBari({ yatay = false }) {
  const { veri } = useApi('/api/akis', { aralik: YOKLAMA_MS });
  const [gorunen, setGorunen] = useState([]);
  const bekleyen = useRef([]);
  const gorulen = useRef(null);
  const [fark, setFark] = useState(0);

  useEffect(() => {
    if (!veri) return;
    setFark(veri.simdi - Date.now());
    if (gorulen.current === null) {
      gorulen.current = new Set(veri.olaylar.map((o) => o.id));
      setGorunen(veri.olaylar.slice(0, SINIR));
      return;
    }
    const yeni = veri.olaylar.filter((o) => !gorulen.current.has(o.id));
    for (const o of yeni) gorulen.current.add(o.id);
    // Liste en yenisi önce gelir; sıraya en eskisi önce girsin.
    bekleyen.current.push(...yeni.reverse());
    if (bekleyen.current.length > BEKLEYEN_SINIRI) bekleyen.current.splice(0, bekleyen.current.length - BEKLEYEN_SINIRI);
  }, [veri]);

  useEffect(() => {
    const t = setInterval(() => {
      const o = bekleyen.current.shift();
      if (o) setGorunen((g) => [o, ...g].slice(0, SINIR));
    }, GIRIS_MS);
    return () => clearInterval(t);
  }, []);

  const bos = veri && gorunen.length === 0;
  if (yatay) {
    // Boşken dar ekranda yer kaplamasın: tek satırlık ince şerit.
    if (bos) {
      return (
        <div className="flex h-9 shrink-0 items-center gap-3 border-b border-cizgi bg-yuzey/60 px-4 text-xs text-silik">
          <Baslik ince />
          Henüz düşen yok. Kasa aç, ilk burada sen görün.
        </div>
      );
    }
    return (
      <div className="flex h-[104px] shrink-0 border-b border-cizgi bg-yuzey/60">
        <Baslik yatay />
        <ul aria-label="Son düşenler" className="flex min-w-0 flex-1 overflow-hidden">
          <AnimatePresence initial={false}>
            {gorunen.map((o) => <Karo key={o.id} o={o} fark={fark} yatay />)}
          </AnimatePresence>
        </ul>
      </div>
    );
  }
  return (
    <aside className="flex w-[156px] shrink-0 flex-col border-l border-cizgi bg-yuzey/50">
      <Baslik />
      <ul aria-label="Son düşenler" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <AnimatePresence initial={false}>
          {gorunen.map((o) => <Karo key={o.id} o={o} fark={fark} />)}
        </AnimatePresence>
        {bos && <li className="px-4 py-6 text-center text-xs leading-relaxed text-silik">Henüz düşen yok. Kasa aç, ilk burada sen görün.</li>}
      </ul>
    </aside>
  );
}

function Baslik({ yatay = false, ince = false }) {
  return (
    <div className={cn('flex shrink-0 items-center justify-center gap-1.5 border-cizgi text-[11px] font-semibold uppercase tracking-[0.14em] text-soluk', ince ? '' : yatay ? 'w-9 border-r [writing-mode:vertical-rl] rotate-180' : 'h-14 border-b')}>
      <span className="size-2 animate-pulse rounded-full bg-yesil" />
      Canlı
    </div>
  );
}
