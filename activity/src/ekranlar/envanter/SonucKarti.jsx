import { nadirlikRengi } from '../magaza/nadirlikRenk.js';
import { Check, Sparkles, Target } from 'lucide-react';
import { motion } from 'motion/react';

import { Gorsel } from '@/components/Gorsel.jsx';
import { Muz } from '@/components/Muz.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { nadirlik as nadirlikBul, useUygulama } from '@/lib/store.js';
import { cn, tarih } from '@/lib/utils.js';

function ayrinti(s) {
  if (s.tur === 'muz') return s.yerine ? `${s.yerine.ad} zaten sendeydi, yerine muz verildi.` : null;
  if (s.tur === 'kart') return s.yeniKart ? null : `${s.adet}. kopya`;
  if (s.tur === 'kasa') return `Envanterinde ${s.adet} tane`;
  if (s.rozet) return `Rozet koleksiyonuna eklendi${s.rozetRolu ? `, rol: ${s.rozetRolu.ad ?? 'rozet rolü'}` : ''}`;
  if (s.bitis) return `Etkin, ${tarih(s.bitis)} tarihine kadar`;
  if (s.adet) return `Artık ${s.adet} tane`;
  return null;
}

/** Kasa sonucu kartı. `buyuk`: tek açılış sahnesi; değilse ızgara hücresi. */
export function SonucKarti({ s, buyuk = false, gecikme = 0 }) {
  const para = useUygulama((x) => x.katalog?.para);
  const renk = nadirlikRengi(s.nadirlik);
  const nad = nadirlikBul(s.nadirlik);
  const g = s.tur === 'muz' ? para : s.gorsel;
  const yuksek = s.nadirlik === 'mitik' || s.nadirlik === 'efsanevi';
  const metin = ayrinti(s);
  return (
    <motion.div
      initial={{ opacity: 0, scale: buyuk ? 0.6 : 0.85, y: buyuk ? 24 : 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: buyuk ? 180 : 260, damping: buyuk ? 16 : 22, delay: gecikme }}
      className="relative"
    >
      {yuksek && (
        <motion.div
          aria-hidden
          className="absolute -inset-3 -z-10 rounded-[28px] blur-2xl"
          style={{ background: `color-mix(in srgb, ${renk} 45%, transparent)` }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2.4, repeat: Infinity }}
        />
      )}
      <div
        className={cn('flex flex-col items-center gap-3 rounded-2xl border bg-yuzey-2 text-center', buyuk ? 'w-[min(320px,calc(100vw-48px))] px-6 py-7' : 'p-4')}
        style={{
          borderColor: renk,
          boxShadow: `0 0 0 1px color-mix(in srgb, ${renk} 40%, transparent), 0 0 ${buyuk ? 48 : 20}px -8px ${renk}`,
          background: `linear-gradient(180deg, color-mix(in srgb, ${renk} 14%, var(--color-yuzey-2)), var(--color-yuzey-2) 70%)`,
        }}
      >
        <div className="flex min-h-6 flex-wrap items-center justify-center gap-1.5">
          <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ color: renk, background: `color-mix(in srgb, ${renk} 16%, transparent)` }}>{nad?.ad}</span>
          {s.parlak && <Rozet tur="muz"><Sparkles />PARLAK</Rozet>}
          {s.yeniKart && <Rozet tur="yesil"><Check />YENİ</Rozet>}
          {s.garanti && <Rozet tur="mor"><Target />GARANTİ</Rozet>}
        </div>
        <Gorsel g={g} boyut={buyuk ? 112 : 56} parlak={s.parlak} />
        <div className={cn('font-display font-semibold leading-tight', buyuk ? 'text-xl' : 'text-sm')}>
          {s.tur === 'muz' ? <Muz miktar={s.miktar} boyut={buyuk ? 22 : 16} className={buyuk ? 'text-xl' : 'text-sm'} /> : s.ad}
        </div>
        {metin && <p className="text-xs text-soluk">{metin}</p>}
      </div>
    </motion.div>
  );
}
