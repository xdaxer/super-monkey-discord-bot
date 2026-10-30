/**
 * Maymunlar alanı: yükseltme yolları ve seferler (/maymun). Kurallar
 * lib/maymun.js ve lib/sefer.js'tedir; burada slash komutla aynı çağrılar
 * yapılır.
 */

import { bakiye as bakiyeOku } from '../../lib/ekonomi.js';
import { kilitliEsya, seferdekiler } from '../../lib/envanter.js';
import { esyaGetir } from '../../lib/esyalar.js';
import {
  KADEMELER, maymunlar, maymunYukselt, sonrakiYukseltme, YOLLAR, yolAciklamasi,
} from '../../lib/maymun.js';
import {
  SEFERLER, seferGeri, seferGonder, sefereHazirAdet, seferListesi, seferSlotu, seferTahmini, seferTopla,
  SLOT_ESIKLERI, sonrakiSlotSeviyesi,
} from '../../lib/sefer.js';
import { kullaniciGetir } from '../../lib/seviye.js';
import { basarili, metin, tamSayi } from '../yardimci.js';
import { maymunVerisi } from './cuzdan.js';

const kartVerisi = (b, k) => ({
  kimlik: k.kimlik, ad: k.ad, nadirlik: k.nadirlik, parlak: Boolean(k.parlak), gorsel: b.gorsel(k),
});

/** Bir yolun durumu: kademe, şu anki ve sonraki etki, engel. */
function yolVerisi(m, i) {
  const sonraki = sonrakiYukseltme(m.yollar, i, m.seviye);
  return {
    kademe: m.yollar[i],
    simdi: m.yollar[i] > 0 ? yolAciklamasi(i, m.yollar[i]) : null,
    sonraki: sonraki.kademe ? {
      kademe: sonraki.kademe, aciklama: yolAciklamasi(i, sonraki.kademe), bedel: sonraki.bedel, seviye: sonraki.seviye,
    } : null,
    engel: sonraki.engel,
  };
}

function seferVerisi(b, s) {
  return {
    id: s.id,
    kart: kartVerisi(b, s.kart),
    sure: s.sefer.kimlik,
    ad: s.sefer.ad,
    emoji: s.sefer.emoji,
    muz: s.muz,
    xp: s.xp,
    baslangic: s.baslangic,
    bitis: s.bitis,
    hazir: s.hazir,
  };
}

/** Maymunlar ekranının bütün verisi. */
function maymunlarVerisi(b) {
  const { db, guildId, kullaniciId } = b;
  const seviye = kullaniciGetir(db, guildId, kullaniciId).seviye;
  const calisan = kilitliEsya(db, guildId, kullaniciId);
  const seferde = seferdekiler(db, guildId, kullaniciId);
  const seferler = seferListesi(db, guildId, kullaniciId);
  return {
    maymunlar: maymunlar(db, guildId, kullaniciId).map((m) => ({
      ...maymunVerisi(b, m),
      kimlik: m.kimlik,
      calisiyor: m.kimlik === calisan,
      seferde: seferde[m.kimlik] ?? 0,
      serbest: sefereHazirAdet(db, guildId, kullaniciId, m.kimlik),
      yolDurumu: YOLLAR.map((_, i) => yolVerisi(m, i)),
      seferTahmini: Object.fromEntries(SEFERLER.map((s) => [s.kimlik, seferTahmini(m, s)])),
    })),
    yollar: YOLLAR.map((y) => ({ kimlik: y.kimlik, ad: y.ad, emoji: y.emoji })),
    kademeler: KADEMELER,
    seferler: seferler.map((s) => seferVerisi(b, s)),
    seferTurleri: SEFERLER.map((s) => ({
      kimlik: s.kimlik, ad: s.ad, emoji: s.emoji, saat: s.saat, ahsap: s.ahsap, demir: s.demir,
    })),
    slot: seferSlotu(seviye),
    slotEsikleri: SLOT_ESIKLERI,
    sonrakiSlot: sonrakiSlotSeviyesi(seviye),
    bakiye: bakiyeOku(db, guildId, kullaniciId),
  };
}

const kimlikleri = (b) => ({ guildId: b.guildId, kullaniciId: b.kullaniciId });

export const rotalar = [
  {
    yontem: 'GET',
    yol: '/api/maymunlar',
    calistir: (b) => maymunlarVerisi(b),
  },
  {
    // { kimlik: "kart-...", yol: 0 | 1 | 2 }
    yontem: 'POST',
    yol: '/api/maymun/yukselt',
    calistir(b) {
      const sonuc = basarili(maymunYukselt(b.db, {
        ...kimlikleri(b),
        kimlik: metin(b.govde, 'kimlik', { uzunluk: 60 }),
        yol: tamSayi(b.govde, 'yol', { min: 0, max: YOLLAR.length - 1 }),
      }));
      return {
        yol: sonuc.yol, kademe: sonuc.kademe, bedel: sonuc.bedel, aciklama: yolAciklamasi(sonuc.yol, sonuc.kademe), ...maymunlarVerisi(b),
      };
    },
  },
  {
    // { kimlik: "kart-...", sure: "kisa" | "orta" | "uzun" }
    yontem: 'POST',
    yol: '/api/maymun/sefer',
    calistir(b) {
      const sonuc = basarili(seferGonder(b.db, {
        ...kimlikleri(b),
        kimlik: metin(b.govde, 'kimlik', { uzunluk: 60 }),
        sure: metin(b.govde, 'sure', { uzunluk: 10 }),
      }));
      return {
        gonderilen: {
          id: sonuc.id, kart: kartVerisi(b, sonuc.maymun.kart), muz: sonuc.muz, xp: sonuc.xp, bitis: sonuc.bitis,
        },
        ...maymunlarVerisi(b),
      };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/maymun/topla',
    calistir(b) {
      const sonuc = basarili(seferTopla(b.db, kimlikleri(b)));
      b.basarimKontrol();
      return {
        toplanan: sonuc.toplanan.map((s) => ({
          id: s.id,
          kart: kartVerisi(b, s.kart),
          ad: s.sefer.ad,
          emoji: s.sefer.emoji,
          muz: s.muz,
          xp: s.xp,
          seviye: s.seviye,
          seviyeAtladi: s.seviyeAtladi,
          kasa: s.kasa ? { kimlik: s.kasa, ad: esyaGetir(s.kasa).ad, gorsel: b.gorsel(esyaGetir(s.kasa)) } : null,
        })),
        toplamMuz: sonuc.toplamMuz,
        ...maymunlarVerisi(b),
      };
    },
  },
  {
    // { id: 12 }
    yontem: 'POST',
    yol: '/api/maymun/geri',
    calistir(b) {
      basarili(seferGeri(b.db, { ...kimlikleri(b), id: tamSayi(b.govde, 'id', { min: 1 }) }));
      return maymunlarVerisi(b);
    },
  },
];
