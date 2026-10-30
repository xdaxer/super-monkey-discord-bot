/**
 * Prestij çarpanı: yaprak modül (hiçbir şey içe aktarmaz).
 *
 * Gelir yerleri (ekonomi.js, meslekler.js, gorevler.js, sefer.js, ciftlik.js)
 * çarpanı buradan alır; prestij.js ekonomi/kasalar/esyalar'a bağımlı
 * olduğundan gelir tarafına bağlanırsa döngüsel içe aktarma (ESYALAR'ın üst
 * düzey SERI_KORUYUCU kullanımı) bozulurdu. Sayılar docs/para.md ile aynıdır.
 */

/** En çok kaç prestij yapılabilir. */
export const MAKS_PRESTIJ = 10;
/** Prestij başına muz kazancı artışı (yüzde puanı): 10 prestij = +%200 (2026-10-26'ya kadar +%10). */
export const CARPAN_YUZDE = 20;

/** Üyenin prestij seviyesi (0 = hiç yapmamış). */
export function prestijSeviyesi(db, guildId, kullaniciId) {
  const satir = db
    .prepare('SELECT seviye FROM prestijler WHERE guild_id = ? AND kullanici_id = ?')
    .get(String(guildId), String(kullaniciId));
  return satir?.seviye ?? 0;
}

/** Seviyenin çarpanı: 0 → 1.0, 1 → 1.2, ..., 10 → 3.0. */
export function seviyeCarpani(seviye) {
  const s = Math.min(MAKS_PRESTIJ, Math.max(0, Math.floor(seviye)));
  return (100 + CARPAN_YUZDE * s) / 100;
}

/**
 * Üyenin muz kazanç çarpanı. Tek hesap noktası: günlük, sohbet, /calis, görev
 * ve sefer muzu bunu mevcut çarpanlarla (Muz Çiftliği, muz-2x) ÇARPARAK
 * birleştirir; maymun çiftliğinde üretim hızını çarpar.
 */
export function prestijCarpani(db, guildId, kullaniciId) {
  return seviyeCarpani(prestijSeviyesi(db, guildId, kullaniciId));
}

/** Tutarı çarpanla çarpıp aşağı yuvarlar (kayan nokta payıyla); muz hep tam sayıdır. */
export function carpanUygula(miktar, carpan) {
  return Math.floor(miktar * carpan + 1e-9);
}
