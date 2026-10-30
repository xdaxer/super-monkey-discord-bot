/**
 * Seviye rolleri: belirli seviyelere ulaşan üyeye BTD temalı bir rol verilir.
 *
 * Üyede yalnız ulaştığı en yüksek kademenin rolü kalır; bir üst kademeye
 * geçince eskisi alınır. Bu yüzden kanal izinleri kümülatif yazılır (üst
 * kademe alt kademenin bütün haklarını da taşır). Tablo docs/ekonomi.md ile
 * birebir aynıdır. Karar mantığı saf; Discord işini olay ve kurulum betiği yapar.
 */

import { toplamXp } from './seviye.js';

/**
 * `genelSohbet`: genel-sohbet kanalında bu kademeyle açılan izinler (yalnız
 * yeni gelenler; kümülatif liste `genelSohbetIzinleri` ile çıkarılır).
 * `ayriGoster`: üye listesinde ayrı grup olarak görünür (hoist).
 */
export const KADEMELER = [
  { seviye: 3, ad: 'Bumerang Maymunu', renk: 0xa9cce3, ayriGoster: false, genelSohbet: ['UseExternalStickers'] },
  { seviye: 5, ad: 'Bomba Maymunu', renk: 0x5dade2, ayriGoster: false, genelSohbet: ['AttachFiles'] },
  {
    seviye: 10, ad: 'Ninja Maymun', renk: 0x48c9b0, ayriGoster: false,
    genelSohbet: ['CreatePublicThreads', 'SendMessagesInThreads', 'SendVoiceMessages'],
  },
  { seviye: 15, ad: 'Büyücü Maymun', renk: 0x6c5ce7, ayriGoster: true, genelSohbet: [] },
  { seviye: 25, ad: 'Medyum Maymun', renk: 0xc0e218, ayriGoster: true, genelSohbet: [] },
  { seviye: 40, ad: 'Simyacı Maymun', renk: 0xffd166, ayriGoster: true, genelSohbet: [] },
];

/** Bütün kademe rollerinin sunucu genelindeki izni: takma ad değiştirme. */
export const ROL_IZINLERI = ['ChangeNickname'];

/** Kademenin rol kimliğini tutan ayar anahtarı. */
export function rolAyarAnahtari(seviye) {
  return `seviye.rol.${seviye}`;
}

/** Kademeye ulaşmak için gereken toplam XP. */
export function toplamXpKademe(kademe) {
  return toplamXp(kademe.seviye);
}

/** Verilen seviyede ulaşılmış en yüksek kademe; hiçbirine ulaşılmadıysa null. */
export function kademeBul(seviye) {
  let bulunan = null;
  for (const kademe of KADEMELER) if (seviye >= kademe.seviye) bulunan = kademe;
  return bulunan;
}

/** Sıradaki kademe; en üsttekine ulaşıldıysa null. */
export function sonrakiKademe(seviye) {
  return KADEMELER.find((kademe) => seviye < kademe.seviye) ?? null;
}

/** Kademeye kadar (dahil) açılan bütün genel-sohbet izinleri. */
export function genelSohbetIzinleri(kademe) {
  return KADEMELER
    .filter((k) => k.seviye <= kademe.seviye)
    .flatMap((k) => k.genelSohbet);
}

/**
 * Üyenin seviye rollerini hedefe getirmek için yapılacakları çıkarır.
 * Kurulmamış (null) kademe rolleri yok sayılır: üye rolü kurulu olan en
 * yüksek alt kademede kalır.
 *
 * @param {Iterable<string>} uyeRolleri Üyenin şu anki rol kimlikleri
 * @param {number} seviye Üyenin seviyesi
 * @param {Record<number, string|null>} rolIdleri Kademe seviyesi → rol kimliği
 * @returns {{ekle: string[], cikar: string[], kademe: object|null}}
 */
export function rolDegisimi(uyeRolleri, seviye, rolIdleri) {
  const mevcut = new Set(uyeRolleri);
  // Rolü kurulu olan en yüksek kademe: arada eksik bir rol üyeyi rolsüz bırakmasın.
  const kademe = KADEMELER.filter((k) => seviye >= k.seviye && rolIdleri[k.seviye]).at(-1) ?? null;
  const hedef = kademe ? rolIdleri[kademe.seviye] : null;

  const ekle = hedef && !mevcut.has(hedef) ? [hedef] : [];
  const cikar = KADEMELER
    .map((k) => rolIdleri[k.seviye])
    .filter((id) => id && id !== hedef && mevcut.has(id));

  return { ekle, cikar, kademe };
}

/** Ayar okuyucudan kademe → rol kimliği tablosu: `oku(anahtar)` ayar değerini döndürür. */
export function kademeRolIdleri(oku) {
  return Object.fromEntries(KADEMELER.map((k) => [k.seviye, oku(rolAyarAnahtari(k.seviye)) ?? null]));
}

/**
 * Üyenin seviye rollerini eşitler. Önbellekteki rollere bakar; fark yoksa
 * Discord'a istek atmaz. Silinmiş veya botun üstünde kalan roller atlanır ki
 * her mesajda aynı hatayı tekrar denemesin.
 *
 * @returns {Promise<{ekle: string[], cikar: string[], kademe: object|null}>}
 */
export async function uyeyiEsitle(uye, seviye, rolIdleri, sebep = 'Seviye rolü') {
  const degisim = rolDegisimi(uye.roles.cache.keys(), seviye, rolIdleri);
  const yonetilir = (id) => Boolean(uye.guild.roles.cache.get(id)?.editable);
  const ekle = degisim.ekle.filter(yonetilir);
  const cikar = degisim.cikar.filter(yonetilir);

  if (cikar.length > 0) await uye.roles.remove(cikar, sebep);
  if (ekle.length > 0) await uye.roles.add(ekle, sebep);
  return { ekle, cikar, kademe: degisim.kademe };
}
