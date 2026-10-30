import { Dices } from 'lucide-react';
import { motion } from 'motion/react';
import {
  useEffect, useRef, useState,
} from 'react';

import {
  bekle, BahisPaneli, Kurallar, Masa, OyunDuzeni, SonucKarti, useTekAtis,
} from './ortak.jsx';
import { cn } from '@/lib/utils.js';

/** Zar yüzündeki nokta konumları (3×3 ızgara, 1–9). */
const NOKTALAR = {
  1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9],
};

export function ZarYuzu({ deger, className }) {
  return (
    <div className={cn('grid aspect-square grid-cols-3 grid-rows-3 gap-[7%] rounded-[22%] bg-gradient-to-br from-metin to-soluk p-[13%] shadow-[0_6px_14px_-4px_rgb(0_0_0/0.7),inset_0_-3px_0_rgb(0_0_0/0.18)]', className)}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={cn('place-self-center rounded-full', NOKTALAR[deger]?.includes(i + 1) ? 'size-[78%] bg-zemin' : 'size-0')} />
      ))}
    </div>
  );
}

const rastgele = () => 1 + Math.floor(Math.random() * 6);

function Zar({ deger, donuyor, indi }) {
  return (
    <motion.div
      animate={donuyor
        ? { rotate: [0, 90, 180, 270, 360], y: [0, -8, 0, -8, 0] }
        : { rotate: 0, y: 0, scale: indi ? [1.18, 1] : 1 }}
      transition={donuyor ? { duration: 0.5, repeat: Infinity, ease: 'linear' } : { type: 'spring', stiffness: 400, damping: 14 }}
      className="w-16 sm:w-20"
    >
      <ZarYuzu deger={deger} />
    </motion.div>
  );
}

export default function ZarOyunu({ ctx }) {
  const ZAR = ctx.veri.oyunlar.zar;
  const { faz, sonuc, oyna, kilit } = useTekAtis(ctx, 'zar');
  const [yuzler, setYuzler] = useState([3, 5, 2, 6]);
  const [durmus, setDurmus] = useState([true, true, true, true]);
  const [indi, setIndi] = useState(-1);
  const durmusRef = useRef(durmus);
  durmusRef.current = durmus;

  useEffect(() => {
    if (faz === 'bekle') setDurmus([false, false, false, false]);
    if (faz === 'bosta') setDurmus([true, true, true, true]);
  }, [faz]);

  // Dönen zarların yüzleri hızlıca değişir.
  useEffect(() => {
    if (durmus.every(Boolean)) return undefined;
    const t = setInterval(() => setYuzler((y) => y.map((v, i) => (durmusRef.current[i] ? v : rastgele()))), 90);
    return () => clearInterval(t);
  }, [durmus]);

  const anim = async (veri) => {
    const deg = [...veri.sonuc.oyuncu, ...veri.sonuc.kasa];
    await bekle(700);
    for (let i = 0; i < 4; i += 1) {
      setYuzler((y) => y.map((v, k) => (k === i ? deg[i] : v)));
      setDurmus((d) => d.map((v, k) => (k === i ? true : v)));
      setIndi(i);
      // eslint-disable-next-line no-await-in-loop
      await bekle(i === 1 ? 450 : 300);
    }
    await bekle(200);
  };

  const bitti = faz === 'bitti' && sonuc;
  const toplam = (a) => a[0] + a[1];
  const sen = bitti ? toplam(sonuc.sonuc.oyuncu) : null;
  const kasa = bitti ? toplam(sonuc.sonuc.kasa) : null;

  const taraf = (ad, ofset, toplamDeger, kazanan) => (
    <div className={cn('flex flex-1 flex-col items-center gap-4 rounded-2xl border px-3 py-5 transition-colors', kazanan ? 'border-muz/50 bg-muz/[0.07]' : 'border-white/10 bg-black/15')}>
      <span className="text-xs font-medium uppercase tracking-wider text-metin/60">{ad}</span>
      <div className="flex gap-3">
        {[0, 1].map((k) => <Zar key={k} deger={yuzler[ofset + k]} donuyor={!durmus[ofset + k]} indi={indi === ofset + k} />)}
      </div>
      <span className="sayi h-8 font-display text-3xl font-semibold">{toplamDeger ?? '–'}</span>
    </div>
  );

  const sahne = (
    <>
      <Masa>
        <div className="flex items-stretch gap-3 p-4 sm:gap-5 sm:p-6">
          {taraf('Sen', 0, sen, bitti && sen > kasa)}
          <div className="grid place-items-center text-xs font-medium uppercase tracking-wider text-metin/40">vs</div>
          {taraf('Kasa', 2, kasa, bitti && kasa > sen)}
        </div>
      </Masa>
      {bitti && (
        <SonucKarti
          net={sonuc.net}
          carpan={sonuc.carpan}
          cashback={sonuc.cashback}
          baslik={sonuc.carpan === ZAR.berabere ? 'Berabere: bahsin yarısı geri' : sonuc.carpan > 0 ? 'Zarlar senden yana' : 'Kasa kazandı'}
          ayrinti={`Sen **${sen}**, kasa **${kasa}**.`}
          onTekrar={() => oyna({}, anim)}
        />
      )}
      <Kurallar satirlar={[
        `İki zar sen atarsın, iki zar kasa. **Büyük toplam kazanır** (${ZAR.kazanc}x).`,
        `Beraberlikte bahsinin yarısı geri gelir (${String(ZAR.berabere).replace('.', ',')}x).`,
      ]}
      />
    </>
  );

  return (
    <OyunDuzeni
      sahne={sahne}
      panel={<BahisPaneli ctx={ctx} etiket="Zar at" ikon={Dices} onAna={() => oyna({}, anim)} bekliyor={faz === 'bekle'} kilit={kilit} />}
    />
  );
}
