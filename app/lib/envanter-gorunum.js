/**
 * /envanter goster görünümü: OwO'nun `zoo` düzeninden esinlenildi — her
 * nadirlik bir satır grubu, kartlar emoji + küçük üst simge sayı, sahip
 * olunmayanlar ❔⁰⁰; altta koleksiyon puanı ve nadirlik başına sayım.
 * Saf fonksiyonlar: emoji çözücü dışarıdan verilir.
 */

import {
  kartDegeri, kartGetir, KARTLAR, NADIRLIK_SIRASI, NADIRLIKLER, parlakKimlik,
} from './kasalar.js';

const KUCUK = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
/** Bir satırdaki kart sayısı; sonraki satırlar girintiyle hizalanır. */
export const SATIR_BASINA = 7;
/** Girinti: nadirlik simgesi + boşluk genişliğinde görünmez karakterler. */
const GIRINTI = '⠀⠀⠀ ';
export const BOS = '❔';
/** Parlak kart sahibi olunan hücrenin sayısının yanındaki işaret. */
export const PARLAK_ISARETI = '✨';

/** 12 → "¹²"; `basamak` kadar sıfırla doldurur (OwO'daki gibi hizalı sütunlar). */
export function kucukSayi(sayi, basamak = String(sayi).length) {
  return String(Math.max(0, Math.trunc(sayi))).padStart(basamak, '0').split('').map((r) => KUCUK[r]).join('');
}

/** Nadirlik baş harfi (OwO'nun C-/U-/R- sayımı gibi). */
export const KISALTMA = {
  mitik: 'M', efsanevi: 'E', destansi: 'D', nadir: 'N', siradan: 'S',
};

/**
 * Kart ızgarası: her nadirlik için `simge   kart¹ kart⁰ …` satırları.
 * @param {Record<string, number>} sahip envanter (kimlik → adet)
 * @param {(kart: object) => string} emoji
 */
export function kartIzgarasi(sahip, emoji) {
  const enBuyuk = Math.max(0, ...KARTLAR.map((k) => sahip[k.kimlik] ?? 0));
  const basamak = Math.max(2, String(enBuyuk).length);

  return NADIRLIK_SIRASI.map((nadirlik) => {
    const hucreler = KARTLAR.filter((k) => k.nadirlik === nadirlik).map((k) => {
      const n = sahip[k.kimlik] ?? 0;
      const parlak = sahip[parlakKimlik(k.kimlik)] ?? 0;
      // Sayı normal kopyaları gösterir (birleştirmeye girenler); ✨ parlak sürümü olduğunu belirtir.
      return `${n + parlak > 0 ? emoji(k) : BOS}${kucukSayi(n, basamak)}${parlak > 0 ? PARLAK_ISARETI : ''}`;
    });
    const satirlar = [];
    for (let i = 0; i < hucreler.length; i += SATIR_BASINA) satirlar.push(hucreler.slice(i, i + SATIR_BASINA).join(' '));
    return `${NADIRLIKLER[nadirlik].simge}   ${satirlar.join(`\n${GIRINTI}`)}`;
  }).join('\n');
}

/** Koleksiyon puanı (kartların toplam satış değeri; parlak kartlar 5 katıyla) ve "M-0, E-1, …" sayımı. */
export function puanSatiri(sahip) {
  let puan = 0;
  const sayim = Object.fromEntries(NADIRLIK_SIRASI.map((n) => [n, 0]));
  for (const [kimlik, n] of Object.entries(sahip)) {
    const k = kartGetir(kimlik);
    if (!k) continue;
    puan += n * kartDegeri(k);
    sayim[k.nadirlik] += n;
  }
  const dizi = [...NADIRLIK_SIRASI].reverse().map((n) => `${KISALTMA[n]}-${sayim[n]}`).join(', ');
  return { puan, sayim, metin: dizi };
}
