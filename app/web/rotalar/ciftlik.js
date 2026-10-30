/**
 * Maymun çiftlikleri alanı. Kurallar lib/ciftlik.js'tedir; burada yalnız
 * istek okunur, sonuç ve ekranın güncel durumu döner. Kule ve yükseltme
 * görselleri Activity'nin kendi dosyalarıdır (public/ciftlik).
 */

import {
  ciftlikDurumu, ciftlikKur, ciftlikSat, ciftlikTopla, ciftlikYukselt, UYE_ARSA_NO, YOLLAR,
} from '../../lib/ciftlik.js';
import { basarili, tamSayi } from '../yardimci.js';

function durum(b) {
  const simdi = Date.now();
  return { ...ciftlikDurumu(b.db, b.guildId, b.kullaniciId, simdi), simdi };
}

const kim = (b) => ({ guildId: b.guildId, kullaniciId: b.kullaniciId });
const arsaAl = (b, zorunlu = true) => tamSayi(b.govde, 'arsa', { zorunlu, min: 0, max: UYE_ARSA_NO });
const yanit = (b, s) => ({ sonuc: s, bakiye: s.bakiye, durum: durum(b) });

export const rotalar = [
  { yontem: 'GET', yol: '/api/ciftlik', calistir: durum },
  {
    // { arsa: 0 }
    yontem: 'POST',
    yol: '/api/ciftlik/kur',
    calistir: (b) => yanit(b, basarili(ciftlikKur(b.db, { ...kim(b), arsa: arsaAl(b) }))),
  },
  {
    // { arsa: 0, yol: 0 } — yol: 0 Üretim, 1 Depo, 2 Pazar
    yontem: 'POST',
    yol: '/api/ciftlik/yukselt',
    calistir(b) {
      const yol = tamSayi(b.govde, 'yol', { min: 0, max: YOLLAR.length - 1 });
      return yanit(b, basarili(ciftlikYukselt(b.db, { ...kim(b), arsa: arsaAl(b), yol })));
    },
  },
  {
    // { arsa?: 0 } — arsa yoksa hepsi
    yontem: 'POST',
    yol: '/api/ciftlik/topla',
    calistir: (b) => yanit(b, basarili(ciftlikTopla(b.db, { ...kim(b), arsa: arsaAl(b, false) }))),
  },
  {
    // { arsa: 0 }
    yontem: 'POST',
    yol: '/api/ciftlik/sat',
    calistir: (b) => yanit(b, basarili(ciftlikSat(b.db, { ...kim(b), arsa: arsaAl(b) }))),
  },
];
