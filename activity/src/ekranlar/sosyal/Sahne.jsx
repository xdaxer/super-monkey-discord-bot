import {
  Crown, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6, Handshake, Trophy,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import { Avatar } from '@/components/Avatar.jsx';
import { Gorsel } from '@/components/Gorsel.jsx';
import { Muz } from '@/components/Muz.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Kart } from '@/components/ui/kart.jsx';
import { useUygulama } from '@/lib/store.js';
import { cn } from '@/lib/utils.js';
import { OYUNLAR, UyeEtiketi } from './ortak.jsx';

const ZARLAR = [Dice1, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];
const rastgele = () => 1 + Math.floor(Math.random() * 6);

function Zar({ deger, donuyor }) {
  const Ikon = ZARLAR[deger];
  return (
    <motion.div
      animate={donuyor ? { rotate: [0, 18, -18, 0], y: [0, -6, 0] } : { rotate: 0, y: 0, scale: [1.25, 1] }}
      transition={donuyor ? { duration: 0.35, repeat: Infinity } : { type: 'spring', stiffness: 300, damping: 14 }}
      className="grid size-16 place-items-center rounded-2xl border border-cizgi-guclu bg-yuzey-3 text-metin"
    >
      <Ikon className="size-11" strokeWidth={1.6} />
    </motion.div>
  );
}

function ZarSahnesi({ sonuc, bitir }) {
  const gercek = [...sonuc.zarlar.meydan, ...sonuc.zarlar.rakip];
  const [durdu, setDurdu] = useState(0);
  const [yuz, setYuz] = useState(() => gercek.map(rastgele));

  useEffect(() => {
    const dondur = setInterval(() => setYuz(gercek.map(rastgele)), 90);
    const zamanlar = [900, 1220, 1790, 2110].map((ms, i) => setTimeout(() => setDurdu(i + 1), ms));
    const son = setTimeout(() => { clearInterval(dondur); bitir(); }, 2700);
    return () => { clearInterval(dondur); [...zamanlar, son].forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const taraf = (anahtar, uye, ilk) => {
    const toplam = gercek[ilk] + gercek[ilk + 1];
    const hazir = durdu >= ilk + 2;
    const kazandi = durdu >= 4 && sonuc.kazanan === anahtar;
    return (
      <div className={cn('flex flex-1 flex-col items-center gap-3 rounded-2xl border p-4 transition-colors', kazandi ? 'border-muz/50 bg-muz/[0.07]' : 'border-cizgi bg-zemin/30', durdu >= 4 && !kazandi && !sonuc.berabere && 'opacity-60')}>
        <UyeEtiketi uye={uye} boyut={24} />
        <div className="flex gap-3">
          {[0, 1].map((i) => <Zar key={i} deger={durdu > ilk + i ? gercek[ilk + i] : yuz[ilk + i]} donuyor={durdu <= ilk + i} />)}
        </div>
        <p className="sayi h-6 text-lg font-semibold">{hazir ? `= ${toplam}` : ''}</p>
      </div>
    );
  };
  return (
    <div className="flex items-stretch gap-3">
      {taraf('meydan', sonuc.meydan, 0)}
      <div className="grid place-items-center text-xs font-semibold uppercase text-silik">vs</div>
      {taraf('rakip', sonuc.rakip, 2)}
    </div>
  );
}

function ParaSahnesi({ sonuc, bitir }) {
  const para = useUygulama((s) => s.katalog?.para);
  useEffect(() => {
    const t = setTimeout(bitir, 2100);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const hedef = sonuc.para === 'yazi' ? 1800 : 1980;
  const yuz = 'absolute inset-0 grid place-items-center rounded-full border-4 [backface-visibility:hidden]';
  return (
    <div className="flex flex-col items-center gap-5 pb-2 pt-16">
      <div style={{ perspective: 700 }}>
        <motion.div
          initial={{ rotateX: 0, y: 0 }}
          animate={{ rotateX: hedef, y: [0, -70, 0] }}
          transition={{ duration: 1.8, ease: 'easeOut', y: { duration: 1.8, times: [0, 0.4, 1] } }}
          className="relative size-28 [transform-style:preserve-3d]"
        >
          <div className={cn(yuz, 'border-muz-koyu bg-yuzey-3')}>
            <div className="flex flex-col items-center gap-1"><Gorsel g={para} boyut={44} /><span className="text-xs font-bold tracking-widest text-muz">YAZI</span></div>
          </div>
          <div className={cn(yuz, 'border-muz-koyu bg-yuzey-3 [transform:rotateX(180deg)]')}>
            <div className="flex flex-col items-center gap-1"><Crown className="size-10 text-muz" /><span className="text-xs font-bold tracking-widest text-muz">TURA</span></div>
          </div>
        </motion.div>
      </div>
      <p className="text-sm text-soluk"><strong className="text-metin">{sonuc.meydan.ad}</strong> {sonuc.secim === 'yazi' ? 'yazı' : 'tura'} dedi.</p>
    </div>
  );
}

function AtSahnesi({ sonuc, bitir }) {
  const kap = useRef(null);
  const [genislik, setGenislik] = useState(0);
  useEffect(() => {
    setGenislik(kap.current?.clientWidth ?? 0);
    const t = setTimeout(bitir, 3300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const kulvar = (anahtar, uye, no) => {
    const kazanan = sonuc.kazanan === anahtar;
    const x = Math.max(0, genislik - 44 - (kazanan ? 6 : 26) - 16);
    return (
      <div key={anahtar} className="flex items-center gap-3">
        <span className="sayi w-4 text-center text-xs text-silik">{no}</span>
        <div className="relative h-14 flex-1 overflow-hidden rounded-xl border border-cizgi bg-zemin/40">
          <div className="absolute inset-y-0 right-3 w-px bg-[repeating-linear-gradient(180deg,var(--color-soluk)_0_4px,transparent_4px_8px)]" />
          <motion.div
            initial={{ x: 8 }}
            animate={{ x: genislik ? x : 8 }}
            transition={{ duration: kazanan ? 2.4 : 2.9, ease: [0.45, 0.05, 0.4, 1] }}
            className="absolute left-0 top-1/2 -translate-y-1/2"
          >
            <Avatar uye={uye} boyut={40} className={kazanan ? 'ring-2 ring-muz' : ''} />
          </motion.div>
        </div>
        <span className="hidden w-24 truncate text-sm sm:block">{uye.ad}</span>
      </div>
    );
  };
  return (
    <div ref={kap} className="flex flex-col gap-3 py-2">
      {kulvar('meydan', sonuc.meydan, 1)}
      {kulvar('rakip', sonuc.rakip, 2)}
    </div>
  );
}

const SAHNELER = { zar: ZarSahnesi, yazitura: ParaSahnesi, at: AtSahnesi };

export function SonucBandi({ sonuc }) {
  if (sonuc.berabere) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-cizgi bg-yuzey-3/60 p-4">
        <Handshake className="size-6 text-soluk" />
        <div><p className="font-semibold">Berabere</p><p className="text-sm text-soluk">İkiniz de bahsinizi geri aldınız.</p></div>
      </div>
    );
  }
  const kazanan = sonuc.kazananId === sonuc.meydan.id ? sonuc.meydan : sonuc.rakip;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={cn('flex items-center gap-3 rounded-xl border p-4', sonuc.benKazandi ? 'border-yesil/40 bg-yesil/[0.08]' : 'border-kirmizi/35 bg-kirmizi/[0.07]')}
    >
      <Trophy className={cn('size-6 shrink-0', sonuc.benKazandi ? 'text-yesil' : 'text-kirmizi')} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{sonuc.benKazandi ? 'Kazandın!' : `${kazanan.ad} kazandı`}</p>
        <p className="text-xs text-soluk">Havuz {sonuc.havuz} muz, {sonuc.kasa} muz kasa payı.</p>
      </div>
      <Muz miktar={sonuc.benKazandi ? sonuc.kazanc : -sonuc.bahis} isaretli boyut={18} className="text-lg" />
    </motion.div>
  );
}

/** Kabul edilen düellonun sonuç sahnesi; animasyon bitince `onBitti` çağrılır. */
export function DuelloSonucu({ sonuc, onBitti, kapat }) {
  const [bitti, setBitti] = useState(false);
  const bittiRef = useRef(onBitti);
  bittiRef.current = onBitti;
  const bitir = useRef(() => { setBitti(true); bittiRef.current?.(); }).current;
  const Sahne = SAHNELER[sonuc.oyun];
  const bilgi = OYUNLAR[sonuc.oyun];
  const Ikon = bilgi?.ikon;
  return (
    <Kart vurgu className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {Ikon && <Ikon className="size-5 text-muz" />}
          <h3 className="text-[17px] font-semibold">{bilgi?.ad ?? 'Düello'}</h3>
          <span className="text-sm text-soluk">bahis <Muz miktar={sonuc.bahis} boyut={14} /></span>
        </div>
        {bitti && <Button tur="hayalet" boyut="sm" onClick={kapat}>Kapat</Button>}
      </div>
      {Sahne && <Sahne sonuc={sonuc} bitir={bitir} />}
      {bitti && <SonucBandi sonuc={sonuc} />}
    </Kart>
  );
}
