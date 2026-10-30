import NumberFlow from '@number-flow/react';
import {
  ChevronDown, Club, Diamond, Heart, Lightbulb, Lock, RotateCcw, Spade,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  useCallback, useEffect, useRef, useState,
} from 'react';

import { Gorsel } from '@/components/Gorsel.jsx';
import { Md } from '@/components/Md.jsx';
import { MiktarGirisi } from '@/components/MiktarGirisi.jsx';
import { Muz } from '@/components/Muz.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Kart } from '@/components/ui/kart.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { api } from '@/lib/api.js';
import { bildirimGoster, hataGoster } from '@/lib/bildirim.jsx';
import { bakiyeGuncelle, useUygulama } from '@/lib/store.js';
import { bicim, carpanMetni, cn } from '@/lib/utils.js';

export const bekle = (ms) => new Promise((coz) => { setTimeout(coz, ms); });

/** Bileşen sökülünce false olan ref: bekleyen animasyonlar sonrası durum yazmasın. */
export function useCanli() {
  const r = useRef(true);
  useEffect(() => {
    r.current = true;
    return () => { r.current = false; };
  }, []);
  return r;
}

/** Bahis metnini sayıya çevirir (sunucudaki miktarAyristir ile aynı biçimler); anlaşılmazsa null. */
export function miktarCoz(metin, bakiye, tavan) {
  const ham = String(metin ?? '').trim().toLocaleLowerCase('tr-TR');
  if (['hepsi', 'tümü', 'tumu', 'all'].includes(ham)) return Math.min(Math.floor(bakiye ?? 0), tavan);
  if (['yarı', 'yari', 'yarısı', 'yarisi', 'half'].includes(ham)) return Math.min(Math.floor((bakiye ?? 0) / 2), tavan);
  const k = /^(\d+(?:[.,]\d+)?)\s*(k|b|bin|m|mn|milyon)$/.exec(ham);
  if (k) return Math.floor(Number(k[1].replace(',', '.')) * (['m', 'mn', 'milyon'].includes(k[2]) ? 1e6 : 1e3));
  if (/^\d{1,3}([.,]\d{3})+$|^\d+$/.test(ham)) return Number(ham.replace(/[.,]/g, ''));
  return null;
}

/** Büyük kazançta (çarpan ≥ 5) tema renklerinde konfeti. */
export async function konfeti() {
  const { default: confetti } = await import('canvas-confetti');
  const css = getComputedStyle(document.documentElement);
  const colors = ['--color-muz', '--color-muz-acik', '--color-muz-koyu', '--color-yesil']
    .map((v) => css.getPropertyValue(v).trim()).filter(Boolean);
  confetti({
    particleCount: 110, spread: 75, startVelocity: 42, origin: { y: 0.65 }, colors, disableForReducedMotion: true, zIndex: 100,
  });
}

// ── Yüzeyler ───────────────────────────────────────────────────────────────

const DOKU = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/** Koyu yeşil keçe masa: yalnız masa oyunlarında, ince bir doku. */
export function Masa({ className, children }) {
  return (
    <div className={cn('relative overflow-hidden rounded-3xl border border-cizgi-guclu bg-[color-mix(in_oklab,var(--color-yesil-koyu)_26%,var(--color-zemin))] shadow-kart', className)}>
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.09] mix-blend-overlay" style={{ backgroundImage: DOKU }} />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,transparent_45%,rgb(0_0_0/0.5))]" />
      <div className="relative">{children}</div>
    </div>
  );
}

/** Makine/pist gibi koyu, oyuksu sahne yüzeyi. */
export function Sahne({ className, children }) {
  return (
    <div className={cn('relative overflow-hidden rounded-3xl border border-cizgi bg-gradient-to-b from-yuzey-2 to-yuzey shadow-kart', className)}>
      {children}
    </div>
  );
}

/**
 * Genişte sahne solda, bahis paneli sağda (yapışkan). Darda tek sütun:
 * sahne ve sonuç, sonra panel, en sonda katlanır bilgiler (`Bilgi`): ana
 * eylem kurallar ve tabloların altında kalmasın (HIG: önem sırası).
 */
export function OyunDuzeni({ sahne, panel }) {
  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4 [&>[data-bilgi]]:order-2">{sahne}</div>
      <div className="order-1 lg:sticky lg:top-0">{panel}</div>
    </div>
  );
}

// ── İskambil takımı ────────────────────────────────────────────────────────

/** Sunucunun kart kodundaki takım karakteri → ikon (dolu çizilir; yazı tipi emojisine düşmez). */
export const TAKIM = {
  '♠': { Ikon: Spade, ad: 'maça', kirmizi: false },
  '♣': { Ikon: Club, ad: 'sinek', kirmizi: false },
  '♥': { Ikon: Heart, ad: 'kupa', kirmizi: true },
  '♦': { Ikon: Diamond, ad: 'karo', kirmizi: true },
};

export function TakimIkonu({ takim, className }) {
  const t = TAKIM[takim.replace(/\uFE0F/g, '')] ?? TAKIM['♠'];
  return <t.Ikon aria-label={t.ad} className={cn('fill-current', className)} strokeWidth={1.5} />;
}

// ── At yarışı pulu ─────────────────────────────────────────────────────────

const AT_RENKLERI = ['kirmizi', 'mavi', 'muz', 'yesil', 'mor'];

/**
 * Atın yarış pulu (emoji yerine): jokey forması gibi numaralı, renkli daire.
 * Atlar numara ve renkle ayrılır (yalnız renge dayanmaz). `iz`: arkasında hız izi.
 */
export function AtPulu({
  no, boyut = 32, iz = false, className,
}) {
  const renk = `var(--color-${AT_RENKLERI[(no - 1) % AT_RENKLERI.length]})`;
  return (
    <span
      className={cn('sayi relative inline-grid shrink-0 place-items-center rounded-full font-display font-bold leading-none text-zemin shadow-[0_2px_6px_rgb(0_0_0/0.55)] ring-2 ring-zemin/60', className)}
      style={{
        width: boyut, height: boyut, fontSize: Math.round(boyut * 0.5), background: `radial-gradient(circle at 35% 30%, color-mix(in oklab, ${renk} 65%, white), ${renk} 62%)`,
      }}
    >
      {iz && <span aria-hidden className="absolute right-[calc(100%+2px)] top-1/2 h-1 w-7 -translate-y-1/2 rounded-full" style={{ background: `linear-gradient(to left, color-mix(in oklab, ${renk} 70%, transparent), transparent)` }} />}
      {no}
    </span>
  );
}

// ── Katlanır bilgi ─────────────────────────────────────────────────────────

export function Bilgi({
  baslik, ikon: Ikon = Lightbulb, children, acik: ilk = false,
}) {
  const [acik, setAcik] = useState(ilk);
  return (
    <div data-bilgi className="rounded-2xl border border-cizgi bg-yuzey/60">
      <button type="button" onClick={() => setAcik(!acik)} aria-expanded={acik} className="flex min-h-11 w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-soluk transition-colors hover:text-metin">
        <Ikon className="size-4 text-silik" />
        <span className="flex-1">{baslik}</span>
        <ChevronDown className={cn('size-4 transition-transform', acik && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {acik && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 text-sm leading-relaxed text-soluk">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** "Nasıl oynanır" satırları (markdown). */
export function Kurallar({ satirlar }) {
  return (
    <Bilgi baslik="Nasıl oynanır?">
      <ul className="flex list-disc flex-col gap-1.5 pl-4 marker:text-silik">
        {satirlar.map((s) => <li key={s}><Md metin={s} /></li>)}
      </ul>
    </Bilgi>
  );
}

// ── Bahis paneli ───────────────────────────────────────────────────────────

const HIZLI = 'min-h-7 rounded-lg border border-cizgi px-2.5 text-xs font-medium text-soluk transition-colors hover:border-cizgi-guclu hover:text-metin active:scale-95 disabled:opacity-40 pointer-coarse:min-h-9 pointer-coarse:px-3 pointer-coarse:text-[13px]';

/**
 * Ortak bahis paneli. `sabit`: süren oyunda bahis değişmez (yalnız gösterilir).
 * `ana`: ana düğmenin yerine geçen içerik (ör. Mines'ta "Çek").
 */
export function BahisPaneli({
  ctx, etiket, ikon: Ikon, onAna, bekliyor = false, kilit = false, sabit = null, ana = null, children,
}) {
  const { veri, bahis, setBahis } = ctx;
  const bakiye = useUygulama((s) => s.bakiye);
  const borclu = veri.borclu;
  const devre = kilit || borclu;
  const sayi = miktarCoz(bahis, bakiye, veri.tavan);
  const kes = (n) => Math.max(veri.min, Math.min(n, veri.tavan, Math.floor(bakiye ?? n)));
  const taban = sayi ?? veri.min;

  let uyari = null;
  if (!bahis.trim()) uyari = 'Bir bahis yaz.';
  else if (sayi === null) uyari = 'Tutarı anlayamadım: 500, 2.5k, yarı, hepsi.';
  else if (sayi < veri.min) uyari = `En az ${bicim(veri.min)} muz.`;
  else if (sayi > veri.tavan) uyari = `Seviyene göre en çok ${bicim(veri.tavan)} muz.`;
  else if (bakiye !== null && sayi > bakiye) uyari = 'Bakiyen yetmiyor.';

  return (
    <Kart className={cn('flex flex-col gap-4 transition-opacity', kilit && 'opacity-80')}>
      <div className="flex items-center justify-between">
        <h3 className="text-[17px] font-semibold">Bahis</h3>
        {kilit && <Rozet><Lock />Oyun sürüyor</Rozet>}
      </div>

      {borclu && (
        <div className="rounded-xl border border-kirmizi/30 bg-kirmizi/10 p-3 text-[13px] leading-relaxed text-metin/90">
          <Md metin="Vadesi geçmiş kredi borcun var; ödeyene kadar kumar oynayamazsın. **Banka → Kredi**" />
        </div>
      )}

      {sabit !== null ? (
        <div className="flex items-center justify-between rounded-xl border border-cizgi bg-zemin/50 px-4 py-3">
          <span className="text-sm text-soluk">Yatırılan</span>
          <Muz miktar={sabit} boyut={20} className="text-lg" />
        </div>
      ) : (
        <>
          <fieldset disabled={devre} className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
            <MiktarGirisi deger={bahis} degisti={setBahis} hizli={[]} yer="Bahis: 500, 2.5k, yarı" onEnter={onAna} />
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className={HIZLI} onClick={() => setBahis(String(kes(Math.floor(taban / 2))))}>½</button>
              <button type="button" className={HIZLI} onClick={() => setBahis(String(kes(taban * 2)))}>2×</button>
              <button type="button" className={HIZLI} onClick={() => setBahis(String(veri.min))}>En az</button>
              <button type="button" className={HIZLI} onClick={() => setBahis(String(kes(veri.tavan)))}>Tavan</button>
            </div>
          </fieldset>
          <div className="flex items-center justify-between text-xs text-silik">
            <span>Tavan <span className="sayi text-soluk">{bicim(veri.tavan)}</span></span>
            <span>En az <span className="sayi text-soluk">{bicim(veri.min)}</span></span>
          </div>
          {uyari && !devre && <p className="-mt-2 text-xs text-kirmizi">{uyari}</p>}
        </>
      )}

      {children}

      {ana ?? (
        <Button tur="ana" boyut="lg" tam onClick={onAna} bekliyor={bekliyor} disabled={devre} className="h-14 text-base font-semibold">
          {Ikon && <Ikon className="size-5" />}
          {etiket}
        </Button>
      )}
    </Kart>
  );
}

// ── Sonuç ──────────────────────────────────────────────────────────────────

/** Büyük net kazanç/kayıp, çarpan, cashback ve Tekrar düğmesi. Sayı sıfırdan sayılır. */
export function SonucKarti({
  net, carpan, cashback = 0, baslik, ayrinti, onTekrar, tekrarBekliyor = false,
}) {
  const para = useUygulama((s) => s.katalog?.para);
  const [sayilan, setSayilan] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setSayilan(Math.abs(net)), 120);
    return () => clearTimeout(t);
  }, [net]);
  const ton = net > 0 ? 'yesil' : net < 0 ? 'kirmizi' : 'notr';
  const isaret = net > 0 ? '+' : net < 0 ? '−' : '±';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      className={cn(
        'flex flex-col gap-4 rounded-2xl border p-5',
        ton === 'yesil' && 'border-yesil/35 bg-yesil/[0.07]',
        ton === 'kirmizi' && 'border-kirmizi/30 bg-kirmizi/[0.06]',
        ton === 'notr' && 'border-cizgi-guclu bg-yuzey-2',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-soluk">{baslik}</div>
          <div className={cn('sayi mt-1 flex items-center gap-2.5 text-4xl font-semibold sm:text-5xl', ton === 'yesil' && 'text-yesil', ton === 'kirmizi' && 'text-kirmizi')}>
            <Gorsel g={para} boyut={36} />
            <NumberFlow value={sayilan} locales="tr-TR" prefix={isaret} />
          </div>
          {ayrinti && <div className="mt-2 text-sm text-soluk"><Md metin={ayrinti} /></div>}
        </div>
        {carpan > 0 && <Rozet tur={carpan >= 5 ? 'muz' : 'notr'} className="px-3 py-1 text-sm"><span className="sayi">{carpanMetni(carpan)}</span></Rozet>}
      </div>
      {cashback !== 0 && (
        <div className="rounded-xl border border-mor/25 bg-mor/10 px-3 py-2 text-[13px] text-metin/90">
          {cashback > 0
            ? <>Katıl cashback (günlük zararın %10'u): <Muz miktar={cashback} isaretli boyut={14} /></>
            : <>Bugünkü cashback'in kazançla geri alındı: <Muz miktar={cashback} isaretli boyut={14} /></>}
        </div>
      )}
      {onTekrar && (
        <Button tur="ikincil" tam onClick={onTekrar} bekliyor={tekrarBekliyor} className="sm:w-fit">
          <RotateCcw />Tekrar
        </Button>
      )}
    </motion.div>
  );
}

// ── Tek atışlık oyun akışı ─────────────────────────────────────────────────

/**
 * POST /api/kumar/oyna. Akış: faz 'bekle' (istek sürüyor) → 'oyun' (sonuç geldi,
 * animasyon oynuyor) → 'bitti'. Bakiye animasyon bitince güncellenir.
 * `anim(veri)` animasyonu oynatıp biten bir söz döndürür.
 */
export function useTekAtis(ctx, oyun) {
  const [faz, setFaz] = useState('bosta');
  const [sonuc, setSonuc] = useState(null);
  const canli = useCanli();
  const kilitRef = useRef(false);
  const bahisRef = useRef(ctx.bahis);
  bahisRef.current = ctx.bahis;

  const oyna = useCallback(async (govde, anim) => {
    if (kilitRef.current) return;
    const bahis = bahisRef.current.trim();
    if (!bahis) {
      bildirimGoster('Önce bir bahis yaz: `500`, `2.5k`, `yarı`, `hepsi`.', 'hata');
      return;
    }
    kilitRef.current = true;
    setSonuc(null);
    setFaz('bekle');
    let veri;
    try {
      veri = await api('/api/kumar/oyna', { govde: { oyun, bahis, ...govde }, bakiyeErtele: true });
    } catch (e) {
      hataGoster(e);
      kilitRef.current = false;
      if (canli.current) setFaz('bosta');
      return;
    }
    if (canli.current) {
      setSonuc(veri);
      setFaz('oyun');
      await anim(veri);
    }
    bakiyeGuncelle(veri.bakiye);
    kilitRef.current = false;
    if (canli.current) {
      setFaz('bitti');
      if (veri.carpan >= 5) konfeti();
    }
  }, [oyun, canli]);

  return {
    faz, sonuc, oyna, kilit: faz === 'bekle' || faz === 'oyun',
  };
}
