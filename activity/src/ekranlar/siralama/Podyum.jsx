import { Crown, Medal } from 'lucide-react';
import { motion } from 'motion/react';

import { Avatar } from '@/components/Avatar.jsx';
import { Md } from '@/components/Md.jsx';
import { cn } from '@/lib/utils.js';

const MADALYA = {
  1: { renk: 'var(--color-muz)', avatar: 84, yukseklik: 96, ikon: Crown },
  2: { renk: 'var(--color-siradan)', avatar: 64, yukseklik: 68, ikon: Medal },
  3: { renk: 'var(--color-turuncu)', avatar: 64, yukseklik: 52, ikon: Medal },
};

function Basamak({ s, gecikme }) {
  const m = MADALYA[s.sira];
  const Ikon = m.ikon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: gecikme, type: 'spring', stiffness: 140, damping: 18 }}
      className="flex min-w-0 flex-1 flex-col items-center"
    >
      <Ikon className="mb-2 size-6" style={{ color: m.renk }} />
      <div className="rounded-full p-1" style={{ boxShadow: `0 0 0 2px ${m.renk}`, }}>
        <Avatar uye={s.uye} boyut={m.avatar} />
      </div>
      <p className={cn('mt-2 w-full truncate text-center text-sm font-semibold', s.ben && 'text-muz')}>{s.uye.ad}{s.ben ? ' (sen)' : ''}</p>
      <p className="sayi line-clamp-2 w-full text-balance text-center text-xs text-soluk"><Md metin={s.degerMetni.replaceAll('**', '')} /></p>
      <div
        className="mt-3 grid w-full place-items-start justify-items-center rounded-t-xl border border-b-0 pt-2"
        style={{ height: m.yukseklik, borderColor: `color-mix(in oklab, ${m.renk} 45%, transparent)`, background: `linear-gradient(180deg, color-mix(in oklab, ${m.renk} 18%, transparent), transparent)` }}
      >
        <span className="font-display text-2xl font-bold" style={{ color: m.renk }}>{s.sira}</span>
      </div>
    </motion.div>
  );
}

/** İlk 3: ortada birinci, yanlarda ikinci ve üçüncü. */
export function Podyum({ satirlar }) {
  const sira = [2, 1, 3].map((n) => satirlar.find((s) => s.sira === n)).filter(Boolean);
  return (
    <div className="yuzey-kart flex items-end gap-3 px-4 pb-0 pt-6 sm:px-8">
      {sira.map((s, i) => <Basamak key={s.sira} s={s} gecikme={i * 0.08} />)}
    </div>
  );
}
