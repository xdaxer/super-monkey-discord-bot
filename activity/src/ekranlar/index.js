/**
 * Ekran kaydı. Gezinme bu sırayı ve grupları kullanır. Her ekran kendi
 * dosyasında `export default function Ekran({ secenek })` olarak yazılır ve
 * tembel yüklenir (ilk açılış hızlı kalsın). `yeni`: menüde "YENİ" etiketi.
 */

import {
  Backpack, ChartCandlestick, Crown, Dices, Handshake, Landmark, PawPrint, ShieldCheck, Skull, Store, Swords, Target, Tractor, Trophy, Wallet,
} from 'lucide-react';
import { lazy } from 'react';

export const EKRANLAR = [
  { kimlik: 'ana', ad: 'Cüzdan', ikon: Wallet, grup: 'Genel', Bilesen: lazy(() => import('./Ana.jsx')) },
  { kimlik: 'gorevler', ad: 'Görevler', ikon: Target, grup: 'Genel', Bilesen: lazy(() => import('./Gorevler.jsx')) },
  { kimlik: 'siralama', ad: 'Sıralama', ikon: Trophy, grup: 'Genel', Bilesen: lazy(() => import('./Siralama.jsx')) },
  { kimlik: 'maymunlar', ad: 'Maymunlar', ikon: PawPrint, grup: 'Oyun', Bilesen: lazy(() => import('./Maymunlar.jsx')) },
  {
    kimlik: 'ciftlik', ad: 'Çiftlik', ikon: Tractor, grup: 'Oyun', yeni: true, Bilesen: lazy(() => import('./Ciftlik.jsx')),
  },
  { kimlik: 'kumar', ad: 'Kumarhane', ikon: Dices, grup: 'Oyun', Bilesen: lazy(() => import('./Kumar.jsx')) },
  { kimlik: 'sosyal', ad: 'Düello & Takas', ikon: Swords, grup: 'Oyun', Bilesen: lazy(() => import('./Sosyal.jsx')) },
  { kimlik: 'boss', ad: 'Boss', ikon: Skull, grup: 'Oyun', Bilesen: lazy(() => import('./Boss.jsx')) },
  { kimlik: 'magaza', ad: 'Mağaza', ikon: Store, grup: 'Eşyalar', Bilesen: lazy(() => import('./Magaza.jsx')) },
  { kimlik: 'envanter', ad: 'Envanter', ikon: Backpack, grup: 'Eşyalar', Bilesen: lazy(() => import('./Envanter.jsx')) },
  {
    kimlik: 'pazar', ad: 'Pazar', ikon: Handshake, grup: 'Eşyalar', yeni: true, Bilesen: lazy(() => import('./Pazar.jsx')),
  },
  { kimlik: 'borsa', ad: 'Borsa', ikon: ChartCandlestick, grup: 'Finans', Bilesen: lazy(() => import('./Borsa.jsx')) },
  { kimlik: 'finans', ad: 'Banka', ikon: Landmark, grup: 'Finans', Bilesen: lazy(() => import('./Finans.jsx')) },
  { kimlik: 'prestij', ad: 'Prestij', ikon: Crown, grup: 'Finans', Bilesen: lazy(() => import('./Prestij.jsx')) },
  // Yalnız Discord'da Yönetici izni olanlara görünür (sunucu da ayrıca denetler).
  { kimlik: 'yonetim', ad: 'Yönetim', ikon: ShieldCheck, grup: 'Yönetim', yonetici: true, Bilesen: lazy(() => import('./Yonetim.jsx')) },
];

/** Kullanıcının görebileceği ekranlar. */
export const gorunurEkranlar = (yonetici) => EKRANLAR.filter((e) => !e.yonetici || yonetici);

/** Dar ekranda alt çubukta görünenler; kalanlar "Menü" çekmecesinde. */
export const ALT_CUBUK = ['ana', 'kumar', 'envanter', 'magaza'];
