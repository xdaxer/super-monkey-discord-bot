import { Sparkles } from 'lucide-react';

import { EmojiIkon, emojiMi } from '@/lib/emoji.jsx';
import { useUygulama } from '@/lib/store.js';
import { cn } from '@/lib/utils.js';

/**
 * Sunucu emojisi (resim) ya da yedek: `g` = {url, metin} (API'den gelir).
 * Yedek bir emojiyse emoji değil karşılığı olan ikon çizilir (lib/emoji.jsx).
 * `boyut` piksel.
 */
export function Gorsel({ g, boyut = 24, className, parlak = false }) {
  if (g?.url) {
    return (
      <img
        src={g.url}
        alt=""
        width={boyut}
        height={boyut}
        loading="lazy"
        draggable={false}
        className={cn('inline-block shrink-0 object-contain', parlak && 'parlak', className)}
        style={{ width: boyut, height: boyut }}
      />
    );
  }
  const metin = g?.metin ?? '';
  return (
    <span
      data-yedek={metin || undefined}
      className={cn('inline-grid shrink-0 place-items-center leading-none', parlak && 'parlak', className)}
      style={{ width: boyut, height: boyut, fontSize: Math.round(boyut * 0.82) }}
    >
      {!metin || emojiMi(metin)
        ? <EmojiIkon emoji={metin} boyut={Math.round(boyut * 0.78)} yedek={Sparkles} />
        : metin}
    </span>
  );
}

/** Katalogdaki kart/eşyanın görseli (kimlikle). Parlak kartta parıltı. */
export function NesneGorseli({ kimlik, boyut = 32, className }) {
  const n = useUygulama((s) => s.katalog?.kartlarHarita.get(kimlik) ?? s.katalog?.esyalarHarita.get(kimlik));
  return <Gorsel g={n?.gorsel} boyut={boyut} parlak={Boolean(n?.parlak)} className={className} />;
}

/** Nadirlik rengi CSS değişkeni: var(--color-destansi) gibi. */
export const nadirlikRengi = (kimlik) => (kimlik ? `var(--color-${kimlik})` : 'var(--color-cizgi)');
