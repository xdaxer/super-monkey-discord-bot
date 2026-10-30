import { Cherry } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Bilgi, BahisPaneli, Kurallar, OyunDuzeni, Sahne, SonucKarti, useTekAtis } from './ortak.jsx';
import { EmojiIkon } from '@/lib/emoji.jsx';
import { carpanMetni, cn } from '@/lib/utils.js';

const rast = (liste) => liste[Math.floor(Math.random() * liste.length)];
const DONGU = 10;

/** Dikey kayan şerit. `durum`: bos | doner | dur. Yükseklikler yüzde: pencereye göre. */
function Makara({
  simgeler, durum, hedef, tur, sure, onBitti, vurgu,
}) {
  const bosSimge = useMemo(() => hedef ?? rast(simgeler), [hedef, simgeler]);
  const dongu = useMemo(() => {
    const y = Array.from({ length: DONGU }, () => rast(simgeler));
    return [...y, ...y];
  }, [simgeler, tur]);
  const durak = useMemo(() => {
    const n = 12 + Math.round(sure * 5);
    return [...Array.from({ length: n - 1 }, () => rast(simgeler)), hedef ?? rast(simgeler)];
  }, [hedef, simgeler, sure, tur]);

  const liste = durum === 'doner' ? dongu : durum === 'dur' ? durak : [bosSimge];
  const n = liste.length;
  const son = `${-((n - 1) / n) * 100}%`;

  let animate = { y: '0%' };
  let transition = { duration: 0 };
  if (durum === 'doner') {
    animate = { y: ['0%', '-50%'] };
    transition = { duration: 0.42, ease: 'linear', repeat: Infinity };
  } else if (durum === 'dur') {
    animate = { y: son };
    transition = { duration: sure, ease: [0.16, 0.7, 0.25, 1] };
  }

  return (
    <div className={cn('relative h-28 min-w-0 flex-1 overflow-hidden rounded-2xl border bg-zemin shadow-[inset_0_2px_14px_rgb(0_0_0/0.7)] transition-colors duration-300 sm:h-44', vurgu ? 'border-muz/60' : 'border-cizgi-guclu')}>
      <motion.div
        key={`${durum}-${tur}`}
        initial={{ y: '0%' }}
        animate={animate}
        transition={transition}
        onAnimationComplete={() => { if (durum === 'dur') onBitti?.(); }}
        className={cn('flex flex-col', durum === 'doner' && 'blur-[1.5px]')}
        style={{ height: `${n * 100}%` }}
      >
        {liste.map((s, i) => (
          <div key={i} className="grid place-items-center" style={{ height: `${100 / n}%` }}>
            <EmojiIkon emoji={s} boyut={null} strokeWidth={1.6} className="size-14 drop-shadow-[0_2px_8px_rgb(0_0_0/0.6)] sm:size-20" />
          </div>
        ))}
      </motion.div>
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/55" />
    </div>
  );
}

export default function Slot({ ctx }) {
  const semboller = ctx.veri.oyunlar.slot.semboller;
  const simgeler = useMemo(() => semboller.map((s) => s.simge), [semboller]);
  const { faz, sonuc, oyna, kilit } = useTekAtis(ctx, 'slot');
  const [durum, setDurum] = useState('bos');
  const [tur, setTur] = useState(0);
  const [hedef, setHedef] = useState(null);
  const bitenler = useRef(0);
  const coz = useRef(null);
  const [bitti, setBitti] = useState(false);

  useEffect(() => {
    if (faz === 'bekle') {
      setBitti(false);
      setHedef(null);
      setTur((t) => t + 1);
      setDurum('doner');
    }
  }, [faz]);

  const anim = (veri) => new Promise((tamam) => {
    bitenler.current = 0;
    coz.current = tamam;
    setHedef(veri.sonuc.makaralar);
    setDurum('dur');
  });
  const makaraBitti = () => {
    bitenler.current += 1;
    if (bitenler.current >= 3) {
      setBitti(true);
      coz.current?.();
    }
  };

  const m = sonuc?.sonuc.makaralar;
  const sayim = {};
  m?.forEach((s) => { sayim[s] = (sayim[s] ?? 0) + 1; });
  const kazandi = bitti && sonuc?.carpan > 0;
  const sembol = m ? semboller.find((s) => s.simge === (m[0] === m[1] ? m[0] : m[0] === m[2] ? m[0] : m[1])) : null;

  const sahne = (
    <>
      <Sahne className="flex flex-col items-center gap-5 px-3 py-8 sm:px-6">
        {/* Makaralar kabın genişliğine uyar (sabit genişlik dar sütunda taşıyordu). */}
        <div className="relative w-full max-w-md rounded-3xl border border-cizgi-guclu bg-gradient-to-b from-yuzey-3 to-yuzey-2 p-3 shadow-kart sm:p-4">
          <div className="relative flex gap-2 sm:gap-3">
            {[0, 1, 2].map((i) => (
              <Makara
                key={i}
                simgeler={simgeler}
                durum={durum}
                tur={tur}
                hedef={hedef?.[i]}
                sure={1.4 + i * 0.6}
                onBitti={makaraBitti}
                vurgu={kazandi && sayim[m[i]] >= 2}
              />
            ))}
            <motion.div
              aria-hidden
              animate={{ opacity: kazandi ? 1 : 0.18, scaleX: kazandi ? 1 : 0.96 }}
              className="pointer-events-none absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-muz shadow-[0_0_10px_var(--color-muz)]"
            />
          </div>
        </div>
        <div className="h-6 text-sm text-soluk">
          {kazandi && sembol
            ? <span>{sayim[sembol.simge] === 3 ? 'Üçlü' : 'İkili'} <EmojiIkon emoji={sembol.simge} boyut={18} className="align-[-0.2em]" /> · <span className="sayi font-medium text-muz">{carpanMetni(sonuc.carpan)}</span></span>
            : faz === 'bekle' || faz === 'oyun' ? 'Makaralar dönüyor…' : faz === 'bitti' ? 'Eşleşme yok' : 'Bahsini yaz ve makaraları döndür.'}
        </div>
      </Sahne>

      {faz === 'bitti' && sonuc && (
        <SonucKarti
          net={sonuc.net}
          carpan={sonuc.carpan}
          cashback={sonuc.cashback}
          baslik={sonuc.carpan > 0 ? 'Kazandın' : 'Olmadı'}
          onTekrar={() => oyna({}, anim)}
        />
      )}

      <Kurallar satirlar={[
        'Üç makara döner; **üç aynı** sembol büyük öder, **herhangi iki aynı** sembol de öder.',
        'Çarpanlar bahis dahil toplam geri ödemedir.',
      ]}
      />
      <Bilgi baslik="Çarpan tablosu" ikon={Cherry}>
        <table className="w-full text-left">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-silik">
              <th className="pb-2 font-medium">Sembol</th>
              <th className="pb-2 text-right font-medium">Üçlü</th>
              <th className="pb-2 text-right font-medium">İkili</th>
            </tr>
          </thead>
          <tbody>
            {[...semboller].reverse().map((s) => (
              <tr key={s.simge} className="border-t border-cizgi">
                <td className="py-1.5"><EmojiIkon emoji={s.simge} boyut={22} /></td>
                <td className="sayi py-1.5 text-right text-metin">{carpanMetni(s.uclu)}</td>
                <td className="sayi py-1.5 text-right">{carpanMetni(s.ikili)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Bilgi>
    </>
  );

  return (
    <OyunDuzeni
      sahne={sahne}
      panel={<BahisPaneli ctx={ctx} etiket="Çevir" ikon={Cherry} onAna={() => oyna({}, anim)} bekliyor={faz === 'bekle'} kilit={kilit} />}
    />
  );
}
