/**
 * Kumar oyunları: slot, yazı-tura, zar, rulet ve at yarışı (blackjack lib/blackjack.js).
 *
 * Oyunlar saf: rastgelelik dışarıdan verilir, Discord'a istek atmadan test
 * edilir. Çarpanlar "toplam geri ödeme"dir (bahis dahil): 2 = bahsin iki katı
 * geri gelir, 0 = bahis kaybedilir. Her oyunun beklenen geri ödemesi 1'in
 * biraz altında; kasa uzun vadede kazanır ki muz enflasyonu birikmesin.
 * Sayılar docs/para.md ile birebir aynıdır.
 */

import { dus, ekle, islem, muz, TURLER } from './ekonomi.js';
import { kumarCashback } from './kumar-cashback.js';

export const BAHIS_MIN = 10;
/** Aynı kişinin iki bahsi arasındaki en kısa süre. */
export const BAHIS_BEKLEME_MS = 3000;

// ── Slot ───────────────────────────────────────────────────────────────────

/** Her makarada sembolün ağırlığı (toplam 100) ve üçlü/ikili çarpanları. */
export const SLOT_SEMBOLLERI = [
  { simge: '🍒', agirlik: 30, uclu: 5, ikili: 0.5 },
  { simge: '🍋', agirlik: 25, uclu: 8, ikili: 1 },
  { simge: '🍇', agirlik: 20, uclu: 12, ikili: 1.4 },
  { simge: '🍉', agirlik: 13, uclu: 20, ikili: 2 },
  { simge: '🔔', agirlik: 8, uclu: 40, ikili: 3 },
  { simge: '💎', agirlik: 3, uclu: 150, ikili: 5 },
  { simge: '🍌', agirlik: 1, uclu: 777, ikili: 10 },
];

const SLOT_TOPLAM = SLOT_SEMBOLLERI.reduce((t, s) => t + s.agirlik, 0);

function slotSembolSec(rastgele) {
  let kalan = rastgele() * SLOT_TOPLAM;
  for (const sembol of SLOT_SEMBOLLERI) {
    kalan -= sembol.agirlik;
    if (kalan < 0) return sembol;
  }
  return SLOT_SEMBOLLERI[SLOT_SEMBOLLERI.length - 1];
}

/** Üç makaranın çarpanı: üçlü > ikili (herhangi iki makara) > hiçbiri. */
export function slotCarpani(makaralar) {
  const [a, b, c] = makaralar;
  if (a === b && b === c) return a.uclu;
  if (a === b || a === c) return a.ikili;
  if (b === c) return b.ikili;
  return 0;
}

export function slotCevir(rastgele = Math.random) {
  const makaralar = [slotSembolSec(rastgele), slotSembolSec(rastgele), slotSembolSec(rastgele)];
  return { makaralar: makaralar.map((s) => s.simge), carpan: slotCarpani(makaralar) };
}

/** Slotun tam beklenen geri ödemesi (bütün 7³ sonucun olasılık ağırlıklı toplamı). */
export function slotBeklenen() {
  let toplam = 0;
  for (const a of SLOT_SEMBOLLERI) {
    for (const b of SLOT_SEMBOLLERI) {
      for (const c of SLOT_SEMBOLLERI) {
        const olasilik = (a.agirlik * b.agirlik * c.agirlik) / SLOT_TOPLAM ** 3;
        toplam += olasilik * slotCarpani([a, b, c]);
      }
    }
  }
  return toplam;
}

// ── Yazı-tura ──────────────────────────────────────────────────────────────

/** Bilen bahsin 1,9 katını alır; %5 kasa payı. */
export const YAZITURA_CARPAN = 1.9;

export function yaziTura(secim, rastgele = Math.random) {
  const sonuc = rastgele() < 0.5 ? 'yazi' : 'tura';
  return { sonuc, carpan: sonuc === secim ? YAZITURA_CARPAN : 0 };
}

export function yaziTuraBeklenen() {
  return YAZITURA_CARPAN / 2;
}

// ── Zar ────────────────────────────────────────────────────────────────────

/**
 * Oyuncu ve kasa ikişer zar atar; büyük toplam kazanır (2x). Beraberlikte
 * bahsin yarısı geri verilir.
 */
export const ZAR_KAZANC = 2;
export const ZAR_BERABERE = 0.5;

const zar = (rastgele) => 1 + Math.floor(rastgele() * 6);

export function zarOyna(rastgele = Math.random) {
  const oyuncu = [zar(rastgele), zar(rastgele)];
  const kasa = [zar(rastgele), zar(rastgele)];
  const fark = (oyuncu[0] + oyuncu[1]) - (kasa[0] + kasa[1]);
  const carpan = fark > 0 ? ZAR_KAZANC : fark === 0 ? ZAR_BERABERE : 0;
  return { oyuncu, kasa, carpan };
}

export function zarBeklenen() {
  // İki zar toplamının dağılımı; oyuncu ve kasa bağımsız.
  const dagilim = new Map();
  for (let a = 1; a <= 6; a += 1) {
    for (let b = 1; b <= 6; b += 1) dagilim.set(a + b, (dagilim.get(a + b) ?? 0) + 1 / 36);
  }
  let toplam = 0;
  for (const [o, po] of dagilim) {
    for (const [k, pk] of dagilim) {
      toplam += po * pk * (o > k ? ZAR_KAZANC : o === k ? ZAR_BERABERE : 0);
    }
  }
  return toplam;
}

// ── Rulet ──────────────────────────────────────────────────────────────────

/** Tek sıfırlı (Avrupa) rulet: 0–36. */
export const KIRMIZILAR = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const RULET_RENK_CARPAN = 1.95;
export const RULET_SAYI_CARPAN = 35;

export function ruletRengi(sayi) {
  if (sayi === 0) return 'yesil';
  return KIRMIZILAR.has(sayi) ? 'kirmizi' : 'siyah';
}

/**
 * Kullanıcının seçimini ayrıştırır: kırmızı/siyah, tek/çift ya da 0–36.
 * @returns {{tur: 'renk'|'parite'|'sayi', deger: string|number} | null}
 */
export function ruletSecimi(metin) {
  const ham = String(metin ?? '').trim().toLocaleLowerCase('tr-TR');
  if (['kırmızı', 'kirmizi', 'k'].includes(ham)) return { tur: 'renk', deger: 'kirmizi' };
  if (['siyah', 's'].includes(ham)) return { tur: 'renk', deger: 'siyah' };
  if (ham === 'tek') return { tur: 'parite', deger: 'tek' };
  if (['çift', 'cift'].includes(ham)) return { tur: 'parite', deger: 'cift' };
  if (/^\d{1,2}$/.test(ham) && Number(ham) <= 36) return { tur: 'sayi', deger: Number(ham) };
  return null;
}

/** Çıkan sayıya göre seçimin çarpanı. 0, renk ve tek/çift bahislerini kaybettirir. */
export function ruletCarpani(secim, sayi) {
  if (secim.tur === 'sayi') return secim.deger === sayi ? RULET_SAYI_CARPAN : 0;
  if (sayi === 0) return 0;
  if (secim.tur === 'renk') return ruletRengi(sayi) === secim.deger ? RULET_RENK_CARPAN : 0;
  return (sayi % 2 === 1 ? 'tek' : 'cift') === secim.deger ? RULET_RENK_CARPAN : 0;
}

export function ruletCevir(secim, rastgele = Math.random) {
  const sayi = Math.floor(rastgele() * 37);
  return { sayi, renk: ruletRengi(sayi), carpan: ruletCarpani(secim, sayi) };
}

export function ruletBeklenen(secim) {
  let toplam = 0;
  for (let sayi = 0; sayi <= 36; sayi += 1) toplam += ruletCarpani(secim, sayi) / 37;
  return toplam;
}

// ── At yarışı ──────────────────────────────────────────────────────────────

/**
 * Beş at: kazanma şansı (toplam 100) ve kazanırsa çarpan. Favori az, sürpriz
 * çok öder; her atın beklenen geri ödemesi %94,5–95,2.
 */
export const ATLAR = [
  { no: 1, ad: 'Karayel', sans: 35, carpan: 2.7 },
  { no: 2, ad: 'Şimşek', sans: 25, carpan: 3.8 },
  { no: 3, ad: 'Fırtına', sans: 20, carpan: 4.75 },
  { no: 4, ad: 'Tayfun', sans: 12, carpan: 7.9 },
  { no: 5, ad: 'Yıldız', sans: 8, carpan: 11.9 },
];

const AT_TOPLAM = ATLAR.reduce((t, a) => t + a.sans, 0);

/** `secim` at numarası (1–5). */
export function atYarisi(secim, rastgele = Math.random) {
  let kalan = rastgele() * AT_TOPLAM;
  let kazanan = ATLAR[ATLAR.length - 1];
  for (const at of ATLAR) {
    kalan -= at.sans;
    if (kalan < 0) {
      kazanan = at;
      break;
    }
  }
  return { secim, kazanan: kazanan.no, carpan: kazanan.no === secim ? kazanan.carpan : 0 };
}

export function atBeklenen(secim) {
  const at = ATLAR.find((a) => a.no === secim);
  return (at.sans / AT_TOPLAM) * at.carpan;
}

// ── Ortak bahis akışı ──────────────────────────────────────────────────────

/**
 * Seviyeye bağlı bahis tavanı: 1.000 + 500 × seviye, `ekonomi.maksBahis`
 * ayarıyla üstten sınırlı (Sv 0: 1.000, Sv 10: 6.000, Sv 48+: 25.000).
 * Tek bahis birkaç günlük emek gelirini aşmasın; kumar yeni üyeye servet
 * kestirmesi olmasın.
 */
export const BAHIS_TAVAN_TABAN = 1_000;
export const BAHIS_TAVAN_SEVIYE_BASINA = 500;

export function bahisTavani(seviye, maksAyar) {
  const s = Math.max(0, Math.floor(seviye ?? 0));
  return Math.min(maksAyar, BAHIS_TAVAN_TABAN + BAHIS_TAVAN_SEVIYE_BASINA * s);
}

/**
 * Görev ve başarımların "kumar oyna" sayımına giren en küçük bahis. 10 muzluk
 * bahislerle görev/başarım ödülü toplanmasın diye.
 */
export const KUMAR_SAYIM_MIN = 100;

/** Bahsin geçerli olup olmadığını söyler. */
export function bahisKontrol(miktar, mevcutBakiye, maks) {
  if (!Number.isSafeInteger(miktar) || miktar < BAHIS_MIN) {
    return { ok: false, sebep: `En az ${muz(BAHIS_MIN)} yatırabilirsin.` };
  }
  if (miktar > maks) return { ok: false, sebep: `En çok ${muz(maks)} yatırabilirsin.` };
  if (miktar > mevcutBakiye) return { ok: false, sebep: `Bakiyen yetmiyor: ${muz(mevcutBakiye)} var.` };
  return { ok: true };
}

/**
 * Bahis × çarpan, aşağı yuvarlanmış. Küçük pay kayan nokta hatası için:
 * 100 × 4,85 = 484,999… çıkar, 485 olmalı.
 */
export function odemeHesapla(bahis, carpan) {
  return Math.floor(bahis * carpan + 1e-9);
}

/**
 * Bahsi düşer, oyunu oynar, kazancı öder; hepsi tek işlemde.
 * `oyun` rastgeleliği kendi içinde kullanır ve `{carpan, ...}` döner;
 * `oyunAdi` (slot, yazitura, …) deftere yazılır ki oyun başına geri ödeme ölçülsün.
 * Kayıpta Katıl üyesine iade (`cashback`) aynı işlemde ödenir.
 *
 * @returns {{ok: false, sebep: string}
 *   | {ok: true, sonuc: object, odeme: number, net: number, cashback: number, bakiye: number}}
 */
export function bahisOyna(db, {
  guildId, kullaniciId, bahis, oyun, oyunAdi = null, simdi = Date.now(),
}) {
  return islem(db, () => {
    const kalan = dus(db, {
      guildId, kullaniciId, miktar: bahis, tur: TURLER.bahis, oyun: oyunAdi, simdi,
    });
    if (kalan === null) return { ok: false, sebep: 'Bakiyen bu bahse yetmiyor.' };

    const sonuc = oyun();
    const odeme = odemeHesapla(bahis, sonuc.carpan);
    const son = odeme > 0
      ? ekle(db, {
        guildId, kullaniciId, miktar: odeme, tur: TURLER.kazanc, oyun: oyunAdi, simdi,
      })
      : kalan;

    const net = odeme - bahis;
    const cb = kumarCashback(db, { guildId, kullaniciId, net, simdi });
    return { ok: true, sonuc, odeme, net, cashback: cb?.iade ?? 0, bakiye: cb?.bakiye ?? son };
  });
}

const sonBahis = new Map();

/**
 * Bahis bekleme süresi: bellekte tutulur, yeniden başlatmada sıfırlanması sorun değil.
 * @returns {number} kalan ms (0 = bahis yapılabilir; yapılabiliyorsa zamanı işaretler)
 */
export function bahisBeklemesi(guildId, kullaniciId, simdi = Date.now()) {
  const anahtar = `${guildId}:${kullaniciId}`;
  const son = sonBahis.get(anahtar) ?? 0;
  const kalan = son + BAHIS_BEKLEME_MS - simdi;
  if (kalan > 0) return kalan;
  sonBahis.set(anahtar, simdi);
  return 0;
}
