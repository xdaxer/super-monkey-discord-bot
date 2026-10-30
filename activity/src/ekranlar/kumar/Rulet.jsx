import { ChevronDown, Disc3 } from 'lucide-react';
import { animate, motion } from 'motion/react';
import { useMemo, useRef, useState } from 'react';

import {
  BahisPaneli, Kurallar, Masa, OyunDuzeni, SonucKarti, useTekAtis,
} from './ortak.jsx';
import { carpanMetni, cn } from '@/lib/utils.js';

const M = 100;
const nokta = (r, aciDeg) => {
  const a = (aciDeg * Math.PI) / 180;
  return [M + r * Math.sin(a), M - r * Math.cos(a)];
};
const dilim = (r1, r2, a0, a1) => {
  const [x1, y1] = nokta(r2, a0);
  const [x2, y2] = nokta(r2, a1);
  const [x3, y3] = nokta(r1, a1);
  const [x4, y4] = nokta(r1, a0);
  return `M${x1} ${y1} A${r2} ${r2} 0 0 1 ${x2} ${y2} L${x3} ${y3} A${r1} ${r1} 0 0 0 ${x4} ${y4}Z`;
};

const DOLGU = { kirmizi: 'fill-kirmizi-koyu', siyah: 'fill-zemin', yesil: 'fill-yesil-koyu' };
const HUCRE = {
  kirmizi: 'bg-kirmizi-koyu text-white', siyah: 'bg-zemin text-metin', yesil: 'bg-yesil-koyu text-white',
};
const ETIKET = { kirmizi: 'Kırmızı', siyah: 'Siyah', tek: 'Tek', cift: 'Çift' };
const R_TOP = 94;
const R_CEP = 82;

function Cark({ cark, renkli, wheelRef, topRef, topGRef }) {
  const adim = 360 / cark.length;
  return (
    <svg viewBox="0 0 200 200" className="size-full drop-shadow-[0_14px_24px_rgb(0_0_0/0.5)]">
      <defs>
        <radialGradient id="rulet-hub" cx="35%" cy="30%" r="80%">
          <stop offset="0%" style={{ stopColor: 'var(--color-muz-acik)' }} />
          <stop offset="55%" style={{ stopColor: 'var(--color-muz)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--color-muz-koyu)' }} />
        </radialGradient>
      </defs>
      <circle cx={M} cy={M} r="99" className="fill-yuzey-3 stroke-cizgi-guclu" strokeWidth="1" />
      <circle cx={M} cy={M} r="90.5" className="fill-zemin" />
      <g ref={wheelRef}>
        {cark.map((n, i) => (
          <g key={n}>
            <path d={dilim(56, 90, (i - 0.5) * adim, (i + 0.5) * adim)} className={cn(DOLGU[renkli(n)], 'stroke-cizgi-guclu')} strokeWidth="0.5" />
            <text
              x={M}
              y={M - 77}
              transform={`rotate(${i * adim} ${M} ${M})`}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-metin font-mono"
              fontSize="6.2"
              fontWeight="600"
            >
              {n}
            </text>
          </g>
        ))}
        <circle cx={M} cy={M} r="56" className="fill-yuzey-2 stroke-cizgi-guclu" strokeWidth="1" />
        <circle cx={M} cy={M} r="46" className="fill-none stroke-cizgi" strokeWidth="0.6" />
        {[0, 45, 90, 135].map((a) => (
          <line key={a} x1={M} y1={M - 46} x2={M} y2={M + 46} transform={`rotate(${a} ${M} ${M})`} className="stroke-cizgi-guclu" strokeWidth="1.2" />
        ))}
        <circle cx={M} cy={M} r="15" fill="url(#rulet-hub)" />
        <circle cx={M} cy={M} r="5" className="fill-muz-koyu" />
      </g>
      <g ref={topGRef}>
        <circle ref={topRef} cx={M} cy={M - R_TOP} r="3.4" className="fill-metin" style={{ filter: 'drop-shadow(0 1px 1.5px rgb(0 0 0 / 0.8))' }} />
      </g>
      <path d="M100 10 L94.5 0.5 L105.5 0.5Z" className="fill-muz" />
    </svg>
  );
}

export default function Rulet({ ctx }) {
  const R = ctx.veri.oyunlar.rulet;
  const kirmizilar = useMemo(() => new Set(R.kirmizilar), [R]);
  const renkli = (n) => (n === 0 ? 'yesil' : kirmizilar.has(n) ? 'kirmizi' : 'siyah');
  const adim = 360 / R.cark.length;
  const { faz, sonuc, oyna, kilit } = useTekAtis(ctx, 'rulet');
  const [secim, setSecim] = useState('kirmizi');
  const [sayilarAcik, setSayilarAcik] = useState(false);
  const wheelRef = useRef(null);
  const topRef = useRef(null);
  const topGRef = useRef(null);
  const durum = useRef({ w: 0, b: 0 });

  const yaz = (w, b, r) => {
    wheelRef.current?.setAttribute('transform', `rotate(${w} ${M} ${M})`);
    topGRef.current?.setAttribute('transform', `rotate(${b} ${M} ${M})`);
    topRef.current?.setAttribute('cy', String(M - r));
  };

  const anim = async (veri) => {
    const i = R.cark.indexOf(veri.sonuc.sayi);
    const { w: w0, b: b0 } = durum.current;
    const gerek = (((-i * adim - w0) % 360) + 360) % 360;
    const wf = w0 + 360 * 4 + gerek;
    const taban = wf + i * adim;
    const k = Math.ceil((taban - (b0 - 360 * 6)) / 360);
    const bf = taban - 360 * k;
    await animate(0, 1, {
      duration: 5.6,
      ease: 'linear',
      onUpdate: (p) => {
        const w = w0 + (wf - w0) * (1 - (1 - p) ** 3);
        const b = b0 + (bf - b0) * (1 - (1 - p) ** 2.4);
        const t = Math.min(1, Math.max(0, (p - 0.74) / 0.26));
        const yumusak = t * t * (3 - 2 * t);
        const sekme = Math.sin(t * Math.PI * 3) * (1 - t) * 2.2;
        yaz(w, b, R_TOP - (R_TOP - R_CEP) * yumusak - sekme);
      },
    });
    yaz(wf, bf, R_CEP);
    durum.current = { w: wf, b: bf };
  };

  const oynaSecim = () => oyna({ secim }, anim);
  const secili = (d) => String(d) === String(secim);
  const sayiMi = typeof secim === 'number';
  const bitti = faz === 'bitti' && sonuc;

  const hucre = (d, icerik, sinif) => (
    <button
      key={d}
      type="button"
      disabled={kilit}
      onClick={() => setSecim(d)}
      className={cn('relative grid h-10 place-items-center rounded-lg text-sm font-semibold transition-[box-shadow,transform] disabled:opacity-60', sinif, secili(d) ? 'z-10 ring-2 ring-muz ring-offset-2 ring-offset-black/30' : 'hover:brightness-125')}
    >
      {icerik}
    </button>
  );

  const sahne = (
    <>
      <Masa className="@container">
        <div className="flex flex-col items-center gap-6 px-3 py-6 @xl:flex-row @xl:items-center @xl:gap-8 @xl:px-6">
          <div className="flex shrink-0 flex-col items-center gap-3">
            <div className="size-60 sm:size-64">
              <Cark cark={R.cark} renkli={renkli} wheelRef={wheelRef} topRef={topRef} topGRef={topGRef} />
            </div>
            <div className="flex h-10 items-center gap-2 text-sm text-metin/70">
              {bitti ? (
                <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex items-center gap-2">
                  Çıkan
                  <span className={cn('sayi grid h-9 min-w-9 place-items-center rounded-lg px-2 text-lg font-semibold', HUCRE[sonuc.sonuc.renk])}>{sonuc.sonuc.sayi}</span>
                </motion.div>
              ) : faz === 'bosta' ? 'Seçimini yap, top atılsın.' : 'Top dönüyor…'}
            </div>
          </div>

          <div className="flex w-full min-w-0 flex-1 flex-col gap-3">
            <div className="grid grid-cols-4 gap-2">
              {['kirmizi', 'siyah', 'tek', 'cift'].map((d) => hucre(d, ETIKET[d], d === 'kirmizi' ? HUCRE.kirmizi : d === 'siyah' ? HUCRE.siyah : 'bg-black/30 text-metin'))}
            </div>
            {/* Darda 37 sayı ana düğmeyi çok aşağı itiyordu: tek sayı bahsi katlanır (genişte hep açık). */}
            <button
              type="button"
              onClick={() => setSayilarAcik(!sayilarAcik)}
              aria-expanded={sayilarAcik}
              className="flex min-h-11 items-center justify-between rounded-lg bg-black/30 px-3 text-sm font-medium text-metin/85 @md:hidden"
            >
              <span>Tek sayıya oyna <span className="sayi text-muz">{carpanMetni(R.sayiCarpan)}</span>{sayiMi && <span className="text-metin/60"> · seçili {secim}</span>}</span>
              <ChevronDown className={cn('size-4 transition-transform', sayilarAcik && 'rotate-180')} />
            </button>
            <div className={cn('grid-cols-6 gap-1.5 @md:grid @md:grid-cols-9', sayilarAcik ? 'grid' : 'hidden')}>
              {hucre(0, '0', cn(HUCRE.yesil, 'col-span-6 @md:col-span-9'))}
              {Array.from({ length: 36 }, (_, k) => hucre(k + 1, k + 1, cn('sayi', HUCRE[renkli(k + 1)])))}
            </div>
          </div>
        </div>
      </Masa>

      {bitti && (
        <SonucKarti
          net={sonuc.net}
          carpan={sonuc.carpan}
          cashback={sonuc.cashback}
          baslik={`Top ${sonuc.sonuc.sayi} (${{ kirmizi: 'kırmızı', siyah: 'siyah', yesil: 'yeşil' }[sonuc.sonuc.renk]}) üstünde durdu`}
          onTekrar={oynaSecim}
        />
      )}
      <Kurallar satirlar={[
        `Tek sıfırlı (Avrupa) rulet, 0–36. **Kırmızı/siyah** ve **tek/çift** ${carpanMetni(R.renkCarpan)}; **tek sayı** ${carpanMetni(R.sayiCarpan)}.`,
        '**0** renk ve tek/çift bahislerini kaybettirir.',
      ]}
      />
    </>
  );

  return (
    <OyunDuzeni
      sahne={sahne}
      panel={(
        <BahisPaneli ctx={ctx} etiket="Çarkı çevir" ikon={Disc3} onAna={oynaSecim} bekliyor={faz === 'bekle'} kilit={kilit}>
          <div className="flex items-center justify-between rounded-xl bg-yuzey-3/60 px-3 py-2 text-[13px] text-soluk">
            <span>Seçimin: <span className="font-medium text-metin">{sayiMi ? secim : ETIKET[secim]}</span></span>
            <span className="sayi font-medium text-muz">{carpanMetni(sayiMi ? R.sayiCarpan : R.renkCarpan)}</span>
          </div>
        </BahisPaneli>
      )}
    />
  );
}
