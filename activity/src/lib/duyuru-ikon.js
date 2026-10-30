import {
  Banana, CalendarDays, Gift, Info, Megaphone, PartyPopper, Star, TriangleAlert,
} from 'lucide-react';

/** Bildirim ikonları (app/lib/duyuru.js IKONLAR ile aynı anahtarlar; arayüzde emoji yok). */
export const DUYURU_IKONLARI = {
  megafon: { Ikon: Megaphone, ad: 'Duyuru' },
  bilgi: { Ikon: Info, ad: 'Bilgi' },
  uyari: { Ikon: TriangleAlert, ad: 'Uyarı' },
  hediye: { Ikon: Gift, ad: 'Hediye' },
  kutlama: { Ikon: PartyPopper, ad: 'Kutlama' },
  muz: { Ikon: Banana, ad: 'Muz' },
  yildiz: { Ikon: Star, ad: 'Yıldız' },
  takvim: { Ikon: CalendarDays, ad: 'Takvim' },
};

export const duyuruIkonu = (anahtar) => DUYURU_IKONLARI[anahtar]?.Ikon ?? Megaphone;
