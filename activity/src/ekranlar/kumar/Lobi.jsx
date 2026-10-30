import { Bomb, Flag, Gem } from 'lucide-react';
import { motion } from 'motion/react';

import { AtPulu, TakimIkonu } from './ortak.jsx';
import { ZarYuzu } from './Zar.jsx';
import { EmojiIkon } from '@/lib/emoji.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { carpanMetni, cn } from '@/lib/utils.js';

/** Kartların üstündeki küçük, oyuna özgü görseller. */
const Kapak = {
  slot: ({ veri }) => {
    const s = veri.oyunlar.slot.semboller;
    return (
      <div className="flex gap-1.5">
        {[s.at(-1), s.at(-2), s.at(-3)].map((x) => (
          <div key={x.simge} className="grid size-11 place-items-center rounded-lg border border-cizgi-guclu bg-zemin shadow-[inset_0_2px_8px_rgb(0_0_0/0.6)]"><EmojiIkon emoji={x.simge} boyut={24} /></div>
        ))}
      </div>
    );
  },
  yazitura: () => (
    <div className="grid size-14 place-items-center rounded-full bg-[radial-gradient(circle_at_32%_26%,var(--color-muz-acik),var(--color-muz)_45%,var(--color-muz-koyu))] shadow-[0_0_0_3px_var(--color-muz-koyu),0_10px_20px_-6px_rgb(0_0_0/0.7)]">
      <div className="size-10 rounded-full border-2 border-dashed border-muz-metin/35" />
    </div>
  ),
  zar: () => (
    <div className="flex items-end gap-2">
      <ZarYuzu deger={5} className="w-11 -rotate-12" />
      <ZarYuzu deger={3} className="w-11 rotate-6" />
    </div>
  ),
  rulet: ({ veri }) => {
    const kirmizi = new Set(veri.oyunlar.rulet.kirmizilar);
    const n = veri.oyunlar.rulet.cark.length;
    const dilimler = veri.oyunlar.rulet.cark.map((x, i) => {
      const renk = x === 0 ? 'var(--color-yesil-koyu)' : kirmizi.has(x) ? 'var(--color-kirmizi-koyu)' : 'var(--color-zemin)';
      return `${renk} ${(i / n) * 360}deg ${((i + 1) / n) * 360}deg`;
    });
    return (
      <div className="relative size-16 rounded-full border-2 border-cizgi-guclu shadow-[0_10px_20px_-6px_rgb(0_0_0/0.7)]" style={{ background: `conic-gradient(from ${-180 / n}deg, ${dilimler.join(', ')})` }}>
        <div className="absolute inset-[30%] rounded-full bg-gradient-to-br from-muz to-muz-koyu" />
      </div>
    );
  },
  at: () => (
    <div className="flex w-28 flex-col gap-1">
      {[0.8, 0.55, 0.3].map((p, i) => (
        <div key={i} className="relative h-4 rounded bg-yuzey-3">
          <span className="absolute top-1/2 -translate-y-1/2 leading-none" style={{ left: `${p * 80}%` }}><AtPulu no={i + 1} boyut={14} /></span>
          <Flag className="absolute right-0.5 top-1/2 size-2.5 -translate-y-1/2 text-silik" />
        </div>
      ))}
    </div>
  ),
  mines: () => (
    <div className="grid grid-cols-3 gap-1">
      {['g', '', 'm', '', 'g', '', 'g', '', ''].map((t, i) => (
        <div key={i} className={cn('grid size-[18px] place-items-center rounded-[5px] border', t === 'g' ? 'border-yesil/40 bg-yesil/15' : t === 'm' ? 'border-kirmizi/40 bg-kirmizi/15' : 'border-cizgi-guclu bg-yuzey-3')}>
          {t === 'g' && <Gem className="size-2.5 text-yesil" />}
          {t === 'm' && <Bomb className="size-2.5 text-kirmizi" />}
        </div>
      ))}
    </div>
  ),
  blackjack: () => (
    <div className="relative h-14 w-16">
      {[['A', '♠', -10, 'text-zemin'], ['K', '♥', 10, 'text-kirmizi-koyu']].map(([s, t, r, c], i) => (
        <div key={s} className={cn('absolute top-0 flex h-14 w-10 flex-col items-center justify-center gap-0.5 rounded-md bg-metin text-base font-bold leading-none shadow-[0_6px_12px_-4px_rgb(0_0_0/0.7)]', c)} style={{ left: i * 22, transform: `rotate(${r}deg)` }}>
          {s}<TakimIkonu takim={t} className="size-3.5" />
        </div>
      ))}
    </div>
  ),
};

export function enYuksekCarpan(kimlik, veri) {
  const o = veri.oyunlar;
  switch (kimlik) {
    case 'slot': return Math.max(...o.slot.semboller.map((s) => s.uclu));
    case 'yazitura': return o.yazitura.carpan;
    case 'zar': return o.zar.kazanc;
    case 'rulet': return o.rulet.sayiCarpan;
    case 'at': return Math.max(...o.at.atlar.map((a) => a.carpan));
    case 'mines': return Math.max(...Object.values(o.mines.tablo).flat());
    default: return o.blackjack.blackjack;
  }
}

/**
 * Mines'ın en yüksek çarpanı yalnız belirli mayın sayısında ve bütün güvenli
 * kareler açılınca gelir (ör. 119,7x: 4–5 mayın); rozet bu koşulu yazar ki
 * varsayılan ayarda (2 mayın, en çok 34,2x) yanıltmasın.
 */
function minesEnYuksekKosulu(veri) {
  const tablo = veri.oyunlar.mines.tablo;
  const enYuksek = enYuksekCarpan('mines', veri);
  const sayilar = Object.entries(tablo).filter(([, c]) => c.at(-1) === enYuksek).map(([m]) => Number(m));
  const metin = sayilar.length > 1 ? `${sayilar[0]}–${sayilar.at(-1)}` : `${sayilar[0]}`;
  return `${metin} mayın`;
}

export function Lobi({ oyunlar, veri, ac }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {oyunlar.map((o, i) => {
        const Ikon = o.ikon;
        const Gorunum = Kapak[o.kimlik];
        const suren = (o.kimlik === 'mines' && veri.mines) || (o.kimlik === 'blackjack' && veri.blackjack);
        return (
          <motion.button
            key={o.kimlik}
            type="button"
            onClick={() => ac(o.kimlik)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.25 }}
            whileHover={{ y: -3 }}
            whileTap={{ scale: 0.98 }}
            className={cn('yuzey-kart group flex flex-col overflow-hidden text-left transition-colors hover:border-cizgi-guclu', suren && 'border-muz/40')}
          >
            <div className="relative grid h-24 place-items-center border-b border-cizgi bg-[radial-gradient(ellipse_at_50%_120%,color-mix(in_oklab,var(--color-muz)_9%,transparent),transparent_70%)] sm:h-28">
              <Gorunum veri={veri} />
              {suren && <Rozet tur="muz" className="absolute left-2 top-2 sm:left-3 sm:top-3">Devam ediyor</Rozet>}
            </div>
            <div className="flex flex-1 flex-col gap-1 p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <Ikon className="size-4 shrink-0 text-muz" />
                <h3 className="text-[17px] font-semibold">{o.ad}</h3>
              </div>
              <p className="text-[13px] leading-snug text-soluk">{o.aciklama}</p>
              <div className="mt-auto pt-2">
                <Rozet><span className="sayi">en çok {carpanMetni(enYuksekCarpan(o.kimlik, veri))}{o.kimlik === 'mines' && ` · ${minesEnYuksekKosulu(veri)}`}</span></Rozet>
              </div>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
