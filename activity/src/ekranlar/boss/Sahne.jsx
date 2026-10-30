import { Clock, Skull, Star, Swords } from 'lucide-react';
import { AnimatePresence, motion, useAnimationControls } from 'motion/react';
import { useRef, useState } from 'react';

import { GeriSayim, useSimdi } from '@/components/GeriSayim.jsx';
import { Gorsel } from '@/components/Gorsel.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { api } from '@/lib/api.js';
import { useIslem } from '@/lib/kancalar.js';
import { bakiyeGuncelle } from '@/lib/store.js';
import { bicim, cn, sure } from '@/lib/utils.js';

/** Kırmızı can çubuğu: hasarda önce beyaz iz, sonra azalma. */
function CanCubugu({ can, maxCan }) {
  const oran = maxCan > 0 ? Math.max(0, Math.min(1, can / maxCan)) : 0;
  return (
    <div className="relative h-7 w-full overflow-hidden rounded-full border border-cizgi-guclu bg-zemin/70">
      <motion.div className="absolute inset-y-0 left-0 bg-white/80" initial={false} animate={{ width: `${oran * 100}%` }} transition={{ delay: 0.45, duration: 0.7, ease: 'easeOut' }} />
      <motion.div className="absolute inset-y-0 left-0 bg-gradient-to-b from-kirmizi to-kirmizi-koyu" initial={false} animate={{ width: `${oran * 100}%` }} transition={{ duration: 0.25 }} />
      <span className="sayi absolute inset-0 grid place-items-center text-[13px] font-semibold text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.8)]">
        {bicim(Math.max(0, can))} / {bicim(maxCan)}
      </span>
    </div>
  );
}

export default function Sahne({ veri, setVeri, yenile, bitti }) {
  const simdi = useSimdi();
  const [calistir, bekliyor] = useIslem();
  const [ucanlar, setUcanlar] = useState([]);
  const sayac = useRef(0);
  const sars = useAnimationControls();

  const kalanBekleme = veri.sonrakiSaldiri - simdi;
  const sureDoldu = veri.bitis <= simdi;
  const dinleniyor = kalanBekleme > 0;

  const saldir = () => calistir(async () => {
    const r = await api('/api/boss/saldir', { govde: {} });
    const id = (sayac.current += 1);
    setUcanlar((u) => [...u, { id, hasar: r.hasar, kritik: r.kritik, x: 28 + Math.random() * 44 }]);
    setTimeout(() => setUcanlar((u) => u.filter((x) => x.id !== id)), 1500);
    sars.start({ x: [0, -12, 10, -7, 5, 0], rotate: [0, -3, 2, -1, 0], transition: { duration: 0.4 } });
    setVeri((v) => ({
      ...v, can: r.can, sonrakiSaldiri: r.sonrakiSaldiri, ben: { ...v.ben, hasar: v.ben.hasar + r.hasar, saldiri: v.ben.saldiri + 1 },
    }));
    if (typeof r.bakiye === 'number') bakiyeGuncelle(r.bakiye);
    if (r.bitti) bitti(r);
    setTimeout(() => yenile({ sessiz: true }), 700);
  });

  return (
    <div className={cn('yuzey-kart relative flex flex-col items-center gap-5 overflow-hidden px-5 py-7 text-center', veri.elit && 'border-muz/50 shadow-parilti')}>
      {veri.elit && <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(500px_220px_at_50%_0%,rgb(255_212_59/0.12),transparent)]" />}
      <div className="relative flex flex-col items-center gap-2">
        {veri.elit && <Rozet tur="muz" className="px-3 py-1 text-[13px] font-semibold tracking-wider"><Star className="fill-current" />ELİT</Rozet>}
        <h2 className="text-3xl font-bold sm:text-4xl">{veri.ad}</h2>
      </div>

      <motion.div animate={sars} className={cn('relative grid size-52 place-items-center rounded-[2rem] border bg-zemin/50', veri.elit ? 'border-2 border-muz shadow-[0_0_40px_-8px_rgb(255_212_59/0.55)]' : 'border-cizgi-guclu')}>
        <Gorsel g={veri.gorsel} boyut={176} />
        <AnimatePresence>
          {ucanlar.map((u) => (
            <motion.span
              key={u.id}
              initial={{ opacity: 0, y: 20, scale: 0.7 }}
              animate={{ opacity: [0, 1, 1, 0], y: -130, scale: u.kritik ? 1.25 : 1 }}
              transition={{ duration: 1.4, ease: 'easeOut' }}
              className={cn('sayi pointer-events-none absolute z-10 whitespace-nowrap font-display font-extrabold [text-shadow:0_2px_8px_rgb(0_0_0/0.9)]', u.kritik ? 'text-4xl text-muz' : 'text-2xl text-white')}
              style={{ left: `${u.x}%`, top: '30%' }}
            >
              {u.kritik ? 'KRİTİK ' : ''}-{bicim(u.hasar)}
            </motion.span>
          ))}
        </AnimatePresence>
      </motion.div>

      <div className="relative flex w-full max-w-xl flex-col gap-2">
        <CanCubugu can={veri.can} maxCan={veri.maxCan} />
        <p className="flex items-center justify-center gap-1.5 text-sm text-soluk">
          <Clock className="size-4" />Kalan süre:
          {sureDoldu ? <b className="text-kirmizi">doldu</b> : <GeriSayim hedef={veri.bitis} onBitti={() => yenile({ sessiz: true })} className="sayi font-semibold text-metin" />}
        </p>
      </div>

      <Button tur="ana" boyut="lg" bekliyor={bekliyor} disabled={dinleniyor || sureDoldu} onClick={saldir} className="relative h-14 w-full max-w-xs text-lg">
        {sureDoldu ? <><Skull />Süre doldu</> : dinleniyor ? <>Dinleniyorsun <span className="sayi">{sure(kalanBekleme)}</span></> : <><Swords className="!size-5" />Saldır</>}
      </Button>
    </div>
  );
}
