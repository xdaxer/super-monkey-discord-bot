import { Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Gorsel } from '@/components/Gorsel.jsx';
import { emojisiz } from '@/lib/emoji.jsx';
import { nadirlik as nadirlikBul, nesne } from '@/lib/store.js';
import { bicim, cn } from '@/lib/utils.js';
import { nadirlikRengi } from '../magaza/nadirlikRenk.js';

/** Katalogdaki kart (kimlikle): ad emojisiz, parlaklık ayrı alan. */
export function kartBilgisi(kimlik) {
  const k = nesne(kimlik);
  return {
    kimlik,
    ad: emojisiz(k?.ad ?? kimlik).trim(),
    nadirlik: k?.nadirlik ?? null,
    nadirlikAd: nadirlikBul(k?.nadirlik)?.ad ?? '',
    renk: nadirlikRengi(k?.nadirlik),
    // Küçük yazıda nadirlik rengi beyaza çekilir: destansı moru koyu yüzeyde 4,5:1'in altında kalıyor (HIG/WCAG AA).
    yaziRengi: `color-mix(in oklab, ${nadirlikRengi(k?.nadirlik)} 70%, white)`,
    parlak: Boolean(k?.parlak),
    deger: k?.deger ?? 0,
    gorsel: k?.gorsel ?? null,
  };
}

/** Nadirlik renginde çerçeveli kart resmi (Steam'deki eşya karesi). */
export function KartKaresi({ kimlik, boyut = 48, className }) {
  const k = kartBilgisi(kimlik);
  return (
    <span
      className={cn('relative grid shrink-0 place-items-center rounded-xl border', className)}
      style={{
        width: boyut + 12,
        height: boyut + 12,
        borderColor: `color-mix(in oklab, ${k.renk} 55%, transparent)`,
        background: `radial-gradient(circle at 50% 45%, color-mix(in srgb, ${k.renk} 20%, transparent), transparent 72%), var(--color-yuzey-2)`,
      }}
    >
      <Gorsel g={k.gorsel} boyut={boyut} parlak={k.parlak} />
      {k.parlak && <Sparkles aria-hidden className="absolute left-1 top-1 size-3.5 text-muz" />}
    </span>
  );
}

/** Kart adı + nadirlik satırı. */
export function KartAdi({ kimlik, alt, className }) {
  const k = kartBilgisi(kimlik);
  return (
    <span className={cn('flex min-w-0 flex-col', className)}>
      <span className="flex min-w-0 items-center gap-1.5 font-medium">
        <span className="truncate">{k.ad}</span>
        {k.parlak && <span className="shrink-0 rounded-md bg-muz/15 px-1.5 py-px text-[11px] font-semibold text-muz">Parlak</span>}
      </span>
      <span className="truncate text-xs" style={{ color: k.yaziRengi }}>
        {k.nadirlikAd}
        {alt && <span className="text-silik"> · {alt}</span>}
      </span>
    </span>
  );
}

/** Satıcının eline geçen (lib/pazar.js kesintiHesapla ile aynı). */
export const netHesapla = (toplam, yuzde) => toplam - Math.floor((toplam * yuzde) / 100);

/** Satıcının eline en az `net` geçmesi için gereken en düşük alıcı fiyatı. */
export function brutHesapla(net, yuzde) {
  let f = Math.ceil((net * 100) / (100 - yuzde));
  while (f > 1 && netHesapla(f - 1, yuzde) >= net) f -= 1;
  while (netHesapla(f, yuzde) < net) f += 1;
  return f;
}

/** "2026-10-25" → "25.10" */
const gunAdi = (g) => `${g.slice(8, 10)}.${g.slice(5, 7)}`;

/**
 * Fiyat geçmişi (Steam'deki satış grafiği): günlük ortalama birim fiyat
 * çizgisi, altında satılan adet çubukları. Dokununca/üzerine gelince gün ayrıntısı.
 */
export function FiyatGrafigi({ gecmis }) {
  const kap = useRef(null);
  const [W, setW] = useState(600);
  const [imlec, setImlec] = useState(null);
  useEffect(() => {
    const el = kap.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setW(Math.max(260, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!gecmis?.length) {
    return <p ref={kap} className="py-8 text-center text-sm text-silik">Son 30 günde bu kart pazarda satılmadı.</p>;
  }

  const H = 200;
  const sol = 52;
  const sag = 12;
  const ust = 10;
  const altCubuk = 36;
  const alt = 22;
  const fiyatlar = gecmis.map((g) => g.ortalama);
  let en = Math.min(...fiyatlar);
  let yuksek = Math.max(...fiyatlar);
  if (yuksek === en) { en *= 0.9; yuksek *= 1.1; }
  const pay = (yuksek - en) * 0.12;
  en -= pay;
  yuksek += pay;
  const enCokAdet = Math.max(...gecmis.map((g) => g.adet));
  const adim = gecmis.length > 1 ? (W - sol - sag) / (gecmis.length - 1) : 0;
  const x = (i) => (gecmis.length > 1 ? sol + i * adim : (sol + W - sag) / 2);
  const cizimAlt = H - alt - altCubuk - 6;
  const y = (f) => ust + (1 - (f - en) / (yuksek - en)) * (cizimAlt - ust);
  const cizgi = gecmis.map((g, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(g.ortalama).toFixed(1)}`).join(' ');
  const cubukG = Math.max(3, Math.min(18, adim * 0.6 || 18));
  const yEtiket = [0, 1, 2].map((i) => en + ((yuksek - en) * (i + 0.5)) / 3);
  const xAdim = Math.max(1, Math.ceil(gecmis.length / (W < 480 ? 4 : 7)));
  const sec = imlec === null ? null : gecmis[imlec];

  const tasi = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = gecmis.length > 1 ? Math.round((e.clientX - r.left - sol) / adim) : 0;
    setImlec(Math.max(0, Math.min(gecmis.length - 1, i)));
  };

  return (
    <div ref={kap} className="relative w-full select-none text-muz" style={{ height: H }}>
      <svg width={W} height={H} className="block touch-pan-y" onPointerMove={tasi} onPointerDown={tasi} onPointerLeave={() => setImlec(null)} role="img" aria-label="Son 30 günün satış fiyatı ve adedi">
        {yEtiket.map((f) => (
          <g key={f}>
            <line x1={sol} x2={W - sag} y1={y(f)} y2={y(f)} stroke="var(--color-cizgi)" strokeDasharray="3 4" />
            <text x={sol - 8} y={y(f) + 4} textAnchor="end" fontSize="11" fill="var(--color-silik)" style={{ fontVariantNumeric: 'tabular-nums' }}>{bicim(Math.round(f))}</text>
          </g>
        ))}
        {gecmis.map((g, i) => {
          const h = Math.max(2, (g.adet / enCokAdet) * altCubuk);
          return (
            <rect key={g.gun} x={x(i) - cubukG / 2} y={H - alt - h} width={cubukG} height={h} rx="2" fill={imlec === i ? 'var(--color-soluk)' : 'var(--color-cizgi-guclu)'} />
          );
        })}
        {gecmis.map((g, i) => (i % xAdim === 0 || i === gecmis.length - 1) && (
          <text key={g.gun} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--color-silik)" style={{ fontVariantNumeric: 'tabular-nums' }}>{gunAdi(g.gun)}</text>
        ))}
        {gecmis.length > 1 && <path d={cizgi} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
        {gecmis.map((g, i) => <circle key={g.gun} cx={x(i)} cy={y(g.ortalama)} r={imlec === i ? 5 : 3} fill="currentColor" stroke="var(--color-yuzey)" strokeWidth="1.5" />)}
        {sec && <line x1={x(imlec)} x2={x(imlec)} y1={ust} y2={H - alt} stroke="var(--color-soluk)" strokeDasharray="3 3" />}
      </svg>
      {sec && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-cizgi-guclu bg-yuzey-3 px-2.5 py-1.5 text-center text-metin shadow-xl"
          style={{ left: Math.max(70, Math.min(W - 70, x(imlec))) }}
        >
          <div className="sayi text-sm font-semibold">{bicim(sec.ortalama)} muz</div>
          <div className="sayi text-[11px] text-soluk">{gunAdi(sec.gun)} · {bicim(sec.adet)} adet satıldı</div>
        </div>
      )}
    </div>
  );
}
