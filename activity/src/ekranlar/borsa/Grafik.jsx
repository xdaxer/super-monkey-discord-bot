import { useEffect, useId, useRef, useState } from 'react';

import { bicim, tarih } from '@/lib/utils.js';

/**
 * Çizginin rengi: yanında gösterilen değişim (`degisim`, %) verildiyse onun
 * yönü (rozet yeşilken çizgi kırmızı olmasın), yoksa çizginin baş-son yönü.
 */
export const yonRengi = (gecmis, degisim = null) => {
  const artti = degisim !== null && degisim !== undefined ? degisim >= 0 : gecmis.length < 2 || gecmis.at(-1).fiyat >= gecmis[0].fiyat;
  return artti ? 'var(--color-yesil)' : 'var(--color-kirmizi)';
};

function aralik(gecmis) {
  const f = gecmis.map((n) => n.fiyat);
  let en = Math.min(...f);
  let yuksek = Math.max(...f);
  if (yuksek - en < 1e-9) { en -= 1; yuksek += 1; }
  const pay = (yuksek - en) * 0.1;
  return { en: en - pay, yuksek: yuksek + pay };
}

const yol = (n) => n.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');

/** Kart içi küçük çizgi grafik. */
export function Sparkline({ gecmis, degisim = null, className }) {
  const id = useId();
  if (!gecmis || gecmis.length < 2) return <div className={className} />;
  const W = 120;
  const H = 36;
  const { en, yuksek } = aralik(gecmis);
  const n = gecmis.map((g, i) => [(i / (gecmis.length - 1)) * W, H - ((g.fiyat - en) / (yuksek - en)) * H]);
  const renk = yonRengi(gecmis, degisim);
  const cizgi = yol(n);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className} style={{ color: renk }} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${cizgi} L${W} ${H} L0 ${H} Z`} fill={`url(#${id})`} />
      <path d={cizgi} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const saatMetni = (ms) => new Date(ms).toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });

/** Eksenli, alan dolgulu büyük grafik; üzerine gelince imleç çizgisi ve değer balonu. */
export function BuyukGrafik({ gecmis, degisim = null }) {
  const id = useId();
  const kap = useRef(null);
  const [genislik, setGenislik] = useState(640);
  const [imlec, setImlec] = useState(null);

  useEffect(() => {
    const el = kap.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setGenislik(Math.max(260, el.clientWidth)));
    ro.observe(el);
    setGenislik(Math.max(260, el.clientWidth));
    return () => ro.disconnect();
  }, []);

  if (!gecmis || gecmis.length < 2) return <p className="py-10 text-center text-sm text-soluk">Henüz yeterli fiyat geçmişi yok.</p>;

  const W = genislik;
  const H = W < 480 ? 220 : 280;
  const sol = 46;
  const sag = 14;
  const ust = 12;
  const alt = 26;
  const { en, yuksek } = aralik(gecmis);
  const x = (i) => sol + (i / (gecmis.length - 1)) * (W - sol - sag);
  const y = (f) => ust + (1 - (f - en) / (yuksek - en)) * (H - ust - alt);
  const n = gecmis.map((g, i) => [x(i), y(g.fiyat)]);
  const renk = yonRengi(gecmis, degisim);
  const cizgi = yol(n);
  const yEtiket = Array.from({ length: 4 }, (_, i) => en + ((yuksek - en) * i) / 3);
  const xAdet = W < 480 ? 4 : 6;
  const xEtiket = Array.from({ length: xAdet }, (_, i) => Math.round((i / (xAdet - 1)) * (gecmis.length - 1)));
  const son = n.at(-1);

  const tasi = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = Math.round(((px - sol) / (W - sol - sag)) * (gecmis.length - 1));
    setImlec(Math.max(0, Math.min(gecmis.length - 1, i)));
  };

  const bal = imlec === null ? null : { g: gecmis[imlec], px: x(imlec), py: y(gecmis[imlec].fiyat) };

  return (
    <div ref={kap} className="relative w-full select-none" style={{ height: H, color: renk }}>
      <svg width={W} height={H} className="block touch-pan-y overflow-visible" onPointerMove={tasi} onPointerDown={tasi} onPointerLeave={() => setImlec(null)}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {yEtiket.map((f) => (
          <g key={f}>
            <line x1={sol} x2={W - sag} y1={y(f)} y2={y(f)} stroke="var(--color-cizgi)" strokeDasharray="3 4" />
            <text x={sol - 8} y={y(f) + 4} textAnchor="end" className="sayi" fontSize="11" fill="var(--color-silik)">{bicim(Math.round(f))}</text>
          </g>
        ))}
        {xEtiket.map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === gecmis.length - 1 ? 'end' : 'middle'} className="sayi" fontSize="11" fill="var(--color-silik)">{saatMetni(gecmis[i].saat)}</text>
        ))}
        <path d={`${cizgi} L${x(gecmis.length - 1)} ${H - alt} L${sol} ${H - alt} Z`} fill={`url(#${id})`} />
        <path d={cizgi} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={son[0]} cy={son[1]} r="9" fill="currentColor" opacity="0.18" className="animate-parla" />
        <circle cx={son[0]} cy={son[1]} r="4" fill="currentColor" stroke="var(--color-yuzey)" strokeWidth="2" />
        {bal && (
          <g>
            <line x1={bal.px} x2={bal.px} y1={ust} y2={H - alt} stroke="var(--color-soluk)" strokeDasharray="3 3" />
            <circle cx={bal.px} cy={bal.py} r="4.5" fill="currentColor" stroke="var(--color-yuzey)" strokeWidth="2" />
          </g>
        )}
        <rect x={sol} y={0} width={W - sol - sag} height={H - alt} fill="transparent" />
      </svg>
      {bal && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-cizgi-guclu bg-yuzey-3 px-2.5 py-1.5 text-center shadow-xl"
          style={{ left: Math.max(48, Math.min(W - 48, bal.px)), top: Math.max(0, bal.py - 54) }}
        >
          <div className="sayi text-sm font-semibold text-metin">{bicim(Math.round(bal.g.fiyat))}</div>
          <div className="sayi text-[11px] text-soluk">{tarih(bal.g.saat)}</div>
        </div>
      )}
    </div>
  );
}
