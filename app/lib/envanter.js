/**
 * Envanter ve süreli etkiler: mağaza eşyalarının kalıcı durumu.
 *
 * Bilerek ekonomi.js'e bağımlı değil; günlük ödül (seri koruyucu) ve olaylar
 * (XP iksiri, muz çiftliği) bu dosyayı döngüsel içe aktarma olmadan kullanır.
 */

export function adet(db, guildId, kullaniciId, esya) {
  const satir = db
    .prepare('SELECT adet FROM envanter WHERE guild_id = ? AND kullanici_id = ? AND esya = ?')
    .get(String(guildId), String(kullaniciId), esya);
  return satir?.adet ?? 0;
}

/** Kullanıcının bütün eşyaları: { esya: adet } (adet 0 olanlar hariç). */
export function envanter(db, guildId, kullaniciId) {
  const satirlar = db
    .prepare('SELECT esya, adet FROM envanter WHERE guild_id = ? AND kullanici_id = ? AND adet > 0')
    .all(String(guildId), String(kullaniciId));
  return Object.fromEntries(satirlar.map((s) => [s.esya, s.adet]));
}

export function esyaEkle(db, guildId, kullaniciId, esya, miktar = 1) {
  db.prepare(
    `INSERT INTO envanter (guild_id, kullanici_id, esya, adet) VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id, kullanici_id, esya) DO UPDATE SET adet = envanter.adet + excluded.adet`,
  ).run(String(guildId), String(kullaniciId), esya, miktar);
  return adet(db, guildId, kullaniciId, esya);
}

/**
 * /calis'e kilitli maymun kartı (calismalar.maymun) ve seferdeki her maymun
 * (maymun_seferleri) birer kopya tutar. Kilit eşya düşmenin tek noktasında
 * (esyaDus) uygulanır: satış, hediye, takas ve birleştirme kilitli kopyaya
 * dokunamaz.
 */
const KILITLI_ADET = `((SELECT COUNT(*) FROM calismalar c
    WHERE c.guild_id = envanter.guild_id AND c.kullanici_id = envanter.kullanici_id AND c.maymun = envanter.esya)
  + (SELECT COUNT(*) FROM maymun_seferleri s
    WHERE s.guild_id = envanter.guild_id AND s.kullanici_id = envanter.kullanici_id AND s.kart = envanter.esya))`;

/** Eşya düşer; yetmiyorsa (kilitli kopyalar sayılmaz) hiçbir şey yazmaz ve false döner. */
export function esyaDus(db, guildId, kullaniciId, esya, miktar = 1) {
  const { changes } = db
    .prepare(
      `UPDATE envanter SET adet = adet - ?
       WHERE guild_id = ? AND kullanici_id = ? AND esya = ? AND adet - ${KILITLI_ADET} >= ?`,
    )
    .run(miktar, String(guildId), String(kullaniciId), esya, miktar);
  return changes > 0;
}

/** Çalışmaya kilitli eşya (maymun kartı); yoksa null. */
export function kilitliEsya(db, guildId, kullaniciId) {
  return db
    .prepare('SELECT maymun FROM calismalar WHERE guild_id = ? AND kullanici_id = ?')
    .get(String(guildId), String(kullaniciId))?.maymun ?? null;
}

/** Seferdeki kopyalar: { kart: adet }. */
export function seferdekiler(db, guildId, kullaniciId) {
  const satirlar = db
    .prepare('SELECT kart, COUNT(*) AS adet FROM maymun_seferleri WHERE guild_id = ? AND kullanici_id = ? GROUP BY kart')
    .all(String(guildId), String(kullaniciId));
  return Object.fromEntries(satirlar.map((s) => [s.kart, s.adet]));
}

/** Kilitli kopyalar (çalışan + seferdekiler): { esya: adet }. */
export function kilitliAdetler(db, guildId, kullaniciId) {
  const kilitli = seferdekiler(db, guildId, kullaniciId);
  const calisan = kilitliEsya(db, guildId, kullaniciId);
  if (calisan) kilitli[calisan] = (kilitli[calisan] ?? 0) + 1;
  return kilitli;
}

/** Satılabilir/devredilebilir eşyalar: envanter eksi kilitli kopyalar. */
export function serbestEnvanter(db, guildId, kullaniciId) {
  const sahip = envanter(db, guildId, kullaniciId);
  for (const [esya, kac] of Object.entries(kilitliAdetler(db, guildId, kullaniciId))) {
    if (!(esya in sahip)) continue;
    sahip[esya] -= kac;
    if (sahip[esya] <= 0) delete sahip[esya];
  }
  return sahip;
}

/** Eşyanın serbest (kilitsiz) adedi. */
export function serbestAdet(db, guildId, kullaniciId, esya) {
  const kilitli = kilitliAdetler(db, guildId, kullaniciId)[esya] ?? 0;
  return Math.max(0, adet(db, guildId, kullaniciId, esya) - kilitli);
}

/** Etkinin bitiş zamanı; etkin değilse 0. */
export function etkiBitisi(db, guildId, kullaniciId, tur, simdi = Date.now()) {
  const satir = db
    .prepare('SELECT bitis FROM etkiler WHERE guild_id = ? AND kullanici_id = ? AND tur = ?')
    .get(String(guildId), String(kullaniciId), tur);
  return satir && satir.bitis > simdi ? satir.bitis : 0;
}

export function etkiAktifMi(db, guildId, kullaniciId, tur, simdi = Date.now()) {
  return etkiBitisi(db, guildId, kullaniciId, tur, simdi) > 0;
}

/**
 * Etkiyi uzatır: etkinse bitişine, değilse şimdiye `sureMs` eklenir.
 * @returns {number} yeni bitiş
 */
export function etkiUzat(db, guildId, kullaniciId, tur, sureMs, simdi = Date.now()) {
  const bitis = Math.max(etkiBitisi(db, guildId, kullaniciId, tur, simdi), simdi) + sureMs;
  db.prepare(
    `INSERT INTO etkiler (guild_id, kullanici_id, tur, bitis) VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id, kullanici_id, tur) DO UPDATE SET bitis = excluded.bitis`,
  ).run(String(guildId), String(kullaniciId), tur, bitis);
  return bitis;
}

/** Kullanıcının etkin bütün etkileri: { tur: bitis }. */
export function etkinEtkiler(db, guildId, kullaniciId, simdi = Date.now()) {
  const satirlar = db
    .prepare('SELECT tur, bitis FROM etkiler WHERE guild_id = ? AND kullanici_id = ? AND bitis > ?')
    .all(String(guildId), String(kullaniciId), simdi);
  return Object.fromEntries(satirlar.map((s) => [s.tur, s.bitis]));
}

/** Eşya defterine bir satır yazar (adet işaretli: + aldı, − verdi). */
export function esyaHareketi(db, {
  guildId, kullaniciId, esya, adet: miktar, tur, karsiId = null, simdi = Date.now(),
}) {
  db.prepare(
    `INSERT INTO esya_hareketleri (guild_id, kullanici_id, esya, adet, tur, karsi_id, zaman)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(String(guildId), String(kullaniciId), esya, miktar, tur, karsiId ? String(karsiId) : null, simdi);
}

/** `tur` türündeki hareketlerin `baslangic`tan beri mutlak adet toplamı. */
export function hareketToplami(db, guildId, kullaniciId, tur, baslangic) {
  const satir = db
    .prepare(
      `SELECT COALESCE(SUM(ABS(adet)), 0) AS toplam FROM esya_hareketleri
       WHERE guild_id = ? AND kullanici_id = ? AND tur = ? AND zaman >= ?`,
    )
    .get(String(guildId), String(kullaniciId), tur, baslangic);
  return satir?.toplam ?? 0;
}
