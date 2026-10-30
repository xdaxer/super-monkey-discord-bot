import {
  Cherry, Coins, Dices, Disc3, Flag, Grid3x3, Spade,
} from 'lucide-react';
import { lazy } from 'react';

export const OYUNLAR = [
  { kimlik: 'slot', ad: 'Slot', ikon: Cherry, aciklama: 'Üç makara döner; eşleşen semboller öder.', Bilesen: lazy(() => import('./Slot.jsx')) },
  { kimlik: 'yazitura', ad: 'Yazı-tura', ikon: Coins, aciklama: 'Yazı mı tura mı? Bilirsen neredeyse iki katı.', Bilesen: lazy(() => import('./YaziTura.jsx')) },
  { kimlik: 'zar', ad: 'Zar', ikon: Dices, aciklama: 'İki zar sen, iki zar kasa; büyük toplam kazanır.', Bilesen: lazy(() => import('./Zar.jsx')) },
  { kimlik: 'rulet', ad: 'Rulet', ikon: Disc3, aciklama: 'Avrupa çarkı: renk, tek/çift ya da tek bir sayı.', Bilesen: lazy(() => import('./Rulet.jsx')) },
  { kimlik: 'at', ad: 'At yarışı', ikon: Flag, aciklama: 'Beş at yarışır; sürpriz çok öder.', Bilesen: lazy(() => import('./AtYarisi.jsx')) },
  { kimlik: 'mines', ad: 'Mines', ikon: Grid3x3, aciklama: 'Kare aç, çarpanı büyüt, mayına basmadan çek.', Bilesen: lazy(() => import('./Mines.jsx')) },
  { kimlik: 'blackjack', ad: 'Blackjack', ikon: Spade, aciklama: '21\'e yaklaş, kurpiyeri geç.', Bilesen: lazy(() => import('./Blackjack.jsx')) },
];
