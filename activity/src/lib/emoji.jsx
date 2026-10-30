/**
 * Emoji yerine ikon (HIG: SF Symbols gibi tek bir ikon dili). Sunucu
 * (lib/) metinlerinde ve görsel yedeklerinde emoji gelir; arayüz bunları hiç
 * emoji olarak çizmez. Emojinin Bloons TD karşılığı varsa (BTD) sunucunun
 * btd_ resmi, yoksa Lucide ikonu çizilir. Eşlemesi olmayan emoji metinden
 * düşer, görsel yerindeyse genel bir ikon alır.
 */

import {
  AlarmClock, Apple, ArrowDown, ArrowLeftRight, ArrowUp, Award, Balloon, Ban, Banana, Banknote, Bell, BookOpen,
  Bomb, Brain, Brush, Building2, Cherry, Circle, CircleCheck, CircleHelp, CircleX, Citrus, Clapperboard,
  Clover, Coins, Crosshair, Crown, Dices, Disc3, Eye, FlaskConical, FlaskRound, Flag, Flame, Footprints,
  Gem, Ghost, Gift, Grape, Hammer, Hand, Handshake, Heart, Hourglass, House, Info, Landmark, Layers, Lock,
  LockOpen, Mail, Medal, Mic, Package, Palette, Paperclip, PartyPopper, Pencil, Pointer, Rocket, Scissors,
  Shield, Skull, Sparkle, Sparkles, Star, Swords, Tag, Target, Ticket, Toolbox, Tornado, Trash2, TreePalm,
  TrendingDown, TrendingUp, TriangleAlert, Trophy, Undo2, Users, VenetianMask, Volume2, WandSparkles, Wind,
  Wrench, X, Zap,
} from 'lucide-react';

import { useUygulama } from '@/lib/store.js';
import { cn } from '@/lib/utils.js';

/** Bir emoji (birleşik ve varyasyon seçicili hâlleri dahil) ya da emoji gibi çizilen ok. */
export const EMOJI_DESENI = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*️?|[↔⬆⬇▪]️?/gu;

/** emoji → [ikon, renk belirteci]. Renk yoksa çevredeki metnin rengi. */
const ESLEME = {
  // Para ve servet
  '🍌': [Banana, 'muz'],
  '💰': [Coins, 'muz'],
  '🪙': [Coins, 'muz'],
  '💸': [Banknote, 'yesil'],
  '🏦': [Landmark, 'mavi'],
  '💎': [Gem, 'mavi'],
  '🏷️': [Tag, 'turuncu'],
  '📈': [TrendingUp, 'yesil'],
  '🔺': [TrendingUp, 'yesil'],
  '🔻': [TrendingDown, 'kirmizi'],
  // Ödül ve kutlama
  '🎁': [Gift, 'muz'],
  '📦': [Package, 'turuncu'],
  '👑': [Crown, 'muz'],
  '🏆': [Trophy, 'muz'],
  '🥇': [Medal, 'muz'],
  '🥈': [Medal, 'siradan'],
  '🥉': [Medal, 'turuncu'],
  '🏅': [Award, 'muz'],
  '⭐': [Star, 'muz'],
  '🌟': [Star, 'muz'],
  '✨': [Sparkles, 'muz'],
  '🆕': [Sparkle, 'muz'],
  '🎉': [PartyPopper, 'muz'],
  '🎈': [Balloon, 'kirmizi'],
  '🎫': [Ticket, 'muz'],
  '💜': [Heart, 'mor'],
  // Oyun
  '🎰': [Dices, 'muz'],
  '🎲': [Dices, 'muz'],
  '🃏': [Layers, 'mor'],
  '🎡': [Disc3, 'kirmizi'],
  '🏇': [Flag, 'yesil'],
  '🐎': [Flag, 'yesil'],
  '🍀': [Clover, 'yesil'],
  '🍒': [Cherry, 'kirmizi'],
  '🍋': [Citrus, 'muz'],
  '🍇': [Grape, 'mor'],
  '🍉': [Apple, 'yesil'],
  '🔔': [Bell, 'turuncu'],
  // Savaş ve maymunlar
  '⚔️': [Swords, 'kirmizi'],
  '🛡️': [Shield, 'mavi'],
  '🎯': [Target, 'kirmizi'],
  '🏹': [Crosshair, 'turuncu'],
  '🪖': [Swords, 'yesil'],
  '💥': [Zap, 'turuncu'],
  '💣': [Bomb, 'kirmizi'],
  '💀': [Skull, 'kirmizi'],
  '👹': [Ghost, 'kirmizi'],
  '👁️': [Eye, 'mor'],
  '🌀': [Tornado, 'mavi'],
  '🪃': [Undo2, 'turuncu'],
  '🥷': [VenetianMask, 'metin'],
  '🧙': [WandSparkles, 'mor'],
  '🔮': [Brain, 'mor'],
  '⚗️': [FlaskRound, 'yesil'],
  '🧪': [FlaskConical, 'yesil'],
  '🦸': [Rocket, 'mavi'],
  '🛠️': [Wrench, 'soluk'],
  '🧰': [Toolbox, 'soluk'],
  '🔨': [Hammer, 'soluk'],
  '⚡': [Zap, 'muz'],
  '🔥': [Flame, 'turuncu'],
  // Yer ve yolculuk
  '🌴': [TreePalm, 'yesil'],
  '🏘️': [House, 'turuncu'],
  '🏢': [Building2, 'mavi'],
  '🥾': [Footprints, 'turuncu'],
  '🏃': [Footprints, 'mavi'],
  '🚀': [Rocket, 'mavi'],
  '🏳️': [Flag, 'soluk'],
  '💨': [Wind, 'soluk'],
  '😮‍💨': [Wind, 'soluk'],
  // Eylem ve durum
  '📚': [BookOpen, 'mavi'],
  '👋': [Hand, 'soluk'],
  '✋': [Hand, 'soluk'],
  '👉': [Pointer, 'soluk'],
  '🤝': [Handshake, 'muz'],
  '👥': [Users, 'mavi'],
  '🎬': [Clapperboard, 'kirmizi'],
  '🎤': [Mic, 'mor'],
  '🔊': [Volume2, 'soluk'],
  '🎨': [Palette, 'mor'],
  '✂️': [Scissors, 'soluk'],
  '✏️': [Pencil, 'soluk'],
  '🧹': [Brush, 'soluk'],
  '🗑️': [Trash2, 'kirmizi'],
  '📎': [Paperclip, 'soluk'],
  '📨': [Mail, 'mavi'],
  '🔒': [Lock, 'soluk'],
  '🔓': [LockOpen, 'yesil'],
  '✅': [CircleCheck, 'yesil'],
  '❌': [CircleX, 'kirmizi'],
  '✖️': [X, 'kirmizi'],
  '⭕': [Circle, 'soluk'],
  '⛔': [Ban, 'kirmizi'],
  '⚠️': [TriangleAlert, 'turuncu'],
  'ℹ️': [Info, 'mavi'],
  '❔': [CircleHelp, 'silik'],
  '❓': [CircleHelp, 'silik'],
  '⬆️': [ArrowUp, 'yesil'],
  '⬆': [ArrowUp, 'yesil'],
  '⬇️': [ArrowDown, 'kirmizi'],
  '↔': [ArrowLeftRight, 'soluk'],
  '↩️': [Undo2, 'soluk'],
  '⏳': [Hourglass, 'soluk'],
  '⌛': [Hourglass, 'soluk'],
  '⏰': [AlarmClock, 'soluk'],
};

/**
 * Bloons TD karşılığı olan emojiler → sunucu emojisi adı (katalog.btd'de
 * varsa resim çizilir, yoksa yukarıdaki ikon). Bu bir BTD sunucusu.
 */
const BTD = {
  '🎈': 'btd_red',
  '🎯': 'btd_dart_monkey',
  '🏹': 'btd_dart_monkey',
  '🪃': 'btd_boomerang',
  '💣': 'btd_bomb_shooter',
  '🥷': 'btd_ninja',
  '🧙': 'btd_wizard',
  '🔮': 'btd_psi',
  '⚗️': 'btd_alchemist',
  '🧪': 'btd_alchemist',
  '🦸': 'btd_super_monkey',
  '🪖': 'btd_heli',
  '🛠️': 'btd_engineer',
  '🌴': 'btd_banana_farm',
  '🏘️': 'btd_village',
  '👹': 'btd_bloonarius',
  '🌀': 'btd_vortex',
  '👁️': 'btd_phayze',
};

/** Renkli daireler (kart nadirliği yedekleri): içi dolu daire. */
const DAIRE = {
  '🔴': 'kirmizi', '🟡': 'muz', '🟣': 'mor', '🔵': 'mavi', '⚪': 'soluk', '🟢': 'yesil', '🟠': 'turuncu',
};

/** Varyasyon seçicisiz ve seçicili yazımlar aynı anahtara düşsün. */
const anahtar = (e) => (ESLEME[e] || DAIRE[e] ? e : ESLEME[`${e}️`] ? `${e}️` : e.replace(/️/g, ''));

export const emojiMi = (metin) => typeof metin === 'string' && new RegExp(`^(?:${EMOJI_DESENI.source})+$`, 'u').test(metin.trim());

/** Metinden emojileri ve onların bıraktığı fazla boşluğu atar (bildirim gibi düz metinler için). */
export function emojisiz(metin) {
  return String(metin ?? '').replace(EMOJI_DESENI, '').replace(/[ \t]{2,}/g, ' ').replace(/^[ \t]+/gm, '');
}

/**
 * Emojinin görseli: BTD resmi ya da ikon. `boyut` piksel ya da '1em' (metin
 * içinde). `btd`: emojiden bağımsız seçilen BTD emojisi adı (ör. MOAB olayı).
 * Eşleme yoksa `yedek` ikonu (varsayılan: hiçbir şey çizilmez).
 */
export function EmojiIkon({
  emoji, boyut = '1em', className, renksiz = false, yedek = null, btd = null, ...props
}) {
  const e = anahtar(String(emoji ?? '').trim());
  const resim = useUygulama((s) => s.katalog?.btd?.[btd ?? BTD[e]]);
  if (resim) {
    return (
      <img
        src={resim}
        alt=""
        aria-hidden
        draggable={false}
        className={cn('inline-block shrink-0 object-contain', className)}
        style={{ width: boyut, height: boyut }}
      />
    );
  }
  const daire = DAIRE[e];
  const [Ikon, renk] = daire ? [Circle, daire] : ESLEME[e] ?? (yedek ? [yedek, 'soluk'] : [null]);
  if (!Ikon) return null;
  return (
    <Ikon
      aria-hidden
      className={cn('inline-block shrink-0', className)}
      style={{
        width: boyut, height: boyut, color: renksiz || !renk ? undefined : `var(--color-${renk})`, fill: daire ? 'currentColor' : undefined,
      }}
      strokeWidth={2}
      {...props}
    />
  );
}

/** Emoji içeren düz metni parçalar: emojiler ikona döner. `boyut` ikonların boyu. */
export function emojiliMetin(metin, anahtarOn = 'e', boyut = '1.1em') {
  const parcalar = [];
  let son = 0;
  for (const m of String(metin).matchAll(EMOJI_DESENI)) {
    if (m.index > son) parcalar.push(metin.slice(son, m.index));
    parcalar.push(<EmojiIkon key={`${anahtarOn}-${m.index}`} emoji={m[0]} boyut={boyut} className="mx-[0.08em] align-[-0.2em]" />);
    son = m.index + m[0].length;
  }
  if (son < metin.length) parcalar.push(metin.slice(son));
  return parcalar;
}
