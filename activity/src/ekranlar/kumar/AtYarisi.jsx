import { animate } from 'motion/react';
import { Crown, Flag } from 'lucide-react';
import { useRef, useState } from 'react';

import {
  AtPulu, BahisPaneli, Bilgi, Kurallar, OyunDuzeni, Sahne, SonucKarti, useTekAtis,
} from './ortak.jsx';
import { carpanMetni, cn } from '@/lib/utils.js';

const SURE = 5.6;

/** Atın zamana göre ilerlemesi (0–1): hız dalgalanır, `son`a varır. */
function profil(son, tohum) {
  const f1 = 2 + (tohum % 3);
  const f2 = 5 + (tohum % 4);
  return (o) => {
    const dalga = Math.sin(o * Math.PI * f1 + tohum) * 0.05 + Math.sin(o * Math.PI * f2 + tohum * 2) * 0.025;
    return Math.max(0, Math.min(1, (o + dalga * Math.sin(o * Math.PI)) * son));
  };
}

export default function AtYarisi({ ctx }) {
  const atlar = ctx.veri.oyunlar.at.atlar;
  const { faz, sonuc, oyna, kilit } = useTekAtis(ctx, 'at');
  const [secim, setSecim] = useState(3);
  const [kazanan, setKazanan] = useState(null);
  const atRef = useRef(new Map());

  const yerlestir = (no, oran) => {
    const el = atRef.current.get(no);
    if (el) el.style.left = `calc((100% - 3.25rem) * ${oran})`;
  };

  const anim = async (veri) => {
    setKazanan(null);
    const k = veri.sonuc.kazanan;
    const sonlar = new Map();
    atlar.filter((a) => a.no !== k).forEach((a, i) => sonlar.set(a.no, 0.68 + (((i * 7) + Math.floor(Math.random() * 5)) % 19) / 100));
    sonlar.set(k, 1);
    const pr = new Map(atlar.map((a) => [a.no, profil(sonlar.get(a.no), (a.no * 3) + Math.floor(Math.random() * 7))]));
    let once = new Map(atlar.map((a) => [a.no, 0]));
    await animate(0, 1, {
      duration: SURE,
      ease: 'linear',
      onUpdate: (o) => {
        const yeni = new Map();
        atlar.forEach((a) => {
          const oran = Math.max(once.get(a.no), pr.get(a.no)(o));
          yeni.set(a.no, oran);
          yerlestir(a.no, oran);
        });
        once = yeni;
      },
    });
    atlar.forEach((a) => yerlestir(a.no, sonlar.get(a.no)));
    setKazanan(k);
  };

  const basla = () => {
    atlar.forEach((a) => yerlestir(a.no, 0));
    return oyna({ at: secim }, anim);
  };

  const bitti = faz === 'bitti' && sonuc;
  const kazanAt = atlar.find((a) => a.no === kazanan);

  const sahne = (
    <>
      <Sahne className="p-3 sm:p-5">
        <div className="relative flex flex-col gap-1.5 rounded-2xl bg-zemin/70 p-2 pr-3">
          {atlar.map((a) => (
            <div
              key={a.no}
              className={cn('relative h-12 rounded-lg border bg-yuzey-2 transition-colors sm:h-14', kazanan === a.no ? 'border-muz/70 bg-muz/10' : a.no === secim ? 'border-muz/30' : 'border-cizgi')}
            >
              <span className={cn('sayi absolute left-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-xs font-semibold', a.no === secim || kazanan === a.no ? 'bg-muz text-muz-metin' : 'bg-yuzey-3 text-soluk')}>{kazanan === a.no ? <Crown className="size-3.5" /> : a.no}</span>
              <div className="absolute inset-y-0 left-10 right-2">
                <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-cizgi" />
                <span
                  ref={(el) => { if (el) atRef.current.set(a.no, el); }}
                  className="absolute top-1/2 grid w-[3.25rem] -translate-y-1/2 place-items-center"
                  style={{ left: 0 }}
                >
                  <AtPulu no={a.no} boyut={30} iz={faz === 'oyun'} />
                </span>
              </div>
            </div>
          ))}
          <div aria-hidden className="pointer-events-none absolute inset-y-2 right-3 w-3 rounded-sm opacity-90 [background:repeating-conic-gradient(var(--color-metin)_0_25%,var(--color-zemin)_0_50%)_0_0/6px_6px]" />
        </div>
        <div className="mt-3 flex items-center gap-2 px-1 text-xs text-silik">
          <Flag className="size-3.5" />
          {kazanAt ? <span className="text-sm text-metin">Birinci: <strong>{kazanAt.no} · {kazanAt.ad}</strong></span> : faz === 'oyun' ? 'Yarış sürüyor…' : 'Atını seç, start ver.'}
        </div>
      </Sahne>

      <div className="grid grid-cols-5 gap-2 sm:gap-3">
        {atlar.map((a) => (
          <button
            key={a.no}
            type="button"
            disabled={kilit}
            onClick={() => setSecim(a.no)}
            role="radio"
            aria-checked={a.no === secim}
            className={cn('secim flex flex-col items-center gap-1 rounded-2xl border px-1 py-3 text-center transition-colors disabled:opacity-60', a.no === secim ? 'border-muz/60 bg-muz/10' : 'border-cizgi bg-yuzey-2 hover:border-cizgi-guclu')}
          >
            <AtPulu no={a.no} boyut={26} />
            <span className="w-full truncate text-[11px] font-medium sm:text-[13px]">{a.ad}</span>
            <span className="sayi text-sm font-semibold text-muz sm:text-base">{carpanMetni(a.carpan)}</span>
            <span className="sayi text-[11px] text-silik">%{a.sans}</span>
          </button>
        ))}
      </div>

      {bitti && (
        <SonucKarti
          net={sonuc.net}
          carpan={sonuc.carpan}
          cashback={sonuc.cashback}
          baslik={kazanAt ? `Kazanan: ${kazanAt.no} · ${kazanAt.ad}` : 'Yarış bitti'}
          ayrinti={`Senin atın: **${secim} · ${atlar.find((a) => a.no === secim)?.ad}**`}
          onTekrar={basla}
        />
      )}
      <Kurallar satirlar={[
        'Beş at yarışır; seçtiğin at birinci olursa bahsin atın çarpanıyla ödenir.',
        'Favori az, sürpriz çok öder: şansı düşük atın çarpanı yüksektir.',
      ]}
      />
      <Bilgi baslik="Atlar ve çarpanlar" ikon={Flag}>
        <ul className="flex flex-col gap-1">
          {atlar.map((a) => (
            <li key={a.no} className="flex items-center justify-between border-t border-cizgi py-1.5 first:border-0">
              <span className="flex items-center gap-2"><AtPulu no={a.no} boyut={20} />{a.ad}</span>
              <span className="sayi text-metin">%{a.sans} · {carpanMetni(a.carpan)}</span>
            </li>
          ))}
        </ul>
      </Bilgi>
    </>
  );

  return (
    <OyunDuzeni
      sahne={sahne}
      panel={<BahisPaneli ctx={ctx} etiket="Yarışı başlat" ikon={Flag} onAna={basla} bekliyor={faz === 'bekle'} kilit={kilit} />}
    />
  );
}
