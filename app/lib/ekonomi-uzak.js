/**
 * Ekonomiden uzaklaştırma: yan hesapla ödül kasıp aktarma gibi kötüye
 * kullanımda yetkili üyeyi ekonomiden çıkarır.
 *
 * Uzaklaştırılan üye:
 *  - ekonomi komutlarını ve butonlarını kullanamaz (lib/interactions.js),
 *  - Activity'de ekonomi rotalarına giremez; ekran kapanmayan bir pencere
 *    gösterir (web/sunucu.js, `kod: 'ekonomi-uzak'`),
 *  - sohbet muzu ve XP (mesaj, ses) kazanamaz,
 *  - kimseden muz, takas, hediye ya da pazar yoluyla bir şey alamaz,
 *  - sıralamalarda görünmez.
 * Engel giriş noktalarındadır: arayüz kapansa da işlem yapılamaz.
 * Bakiye ve envanter dondurulur, silinmez; kaldırılınca olduğu gibi döner.
 * Yetkililer (sahip, geliştirici) uzaklaştırılamaz.
 */

import { yetkiliKimlikler } from './izin.js';

export const UZAK_AKTARIM_SEBEBI = 'Bu üye ekonomiden uzaklaştırıldı; onunla muz ya da eşya alışverişi yapılamaz.';
export const SEBEP_UZUNLUK = 500;

const satir = (r) => (r ? {
  kullaniciId: r.kullanici_id, sebep: r.sebep, yetkiliId: r.yetkili_id, zaman: r.zaman,
} : null);

/** Üyenin uzaklaştırma kaydı; yoksa null. */
export function uzaklastirma(db, guildId, kullaniciId) {
  return satir(db
    .prepare('SELECT * FROM ekonomi_uzaklastirmalari WHERE guild_id = ? AND kullanici_id = ?')
    .get(String(guildId), String(kullaniciId)));
}

export function uzakMi(db, guildId, kullaniciId) {
  return uzaklastirma(db, guildId, kullaniciId) !== null;
}

/** İki taraftan biri uzaklaştırılmışsa aktarım sebebi, değilse null. */
export function uzakAktarimSebebi(db, guildId, ...kimlikler) {
  return kimlikler.some((k) => k != null && uzakMi(db, guildId, k)) ? UZAK_AKTARIM_SEBEBI : null;
}

/** Uzaklaştırılmış bütün kimlikler (sıralama süzgeci). */
export function uzakKimlikler(db, guildId) {
  return db
    .prepare('SELECT kullanici_id FROM ekonomi_uzaklastirmalari WHERE guild_id = ?')
    .all(String(guildId))
    .map((r) => r.kullanici_id);
}

/** Yeniden eskiye bütün kayıtlar. */
export function uzaklastirmaListesi(db, guildId) {
  return db
    .prepare('SELECT * FROM ekonomi_uzaklastirmalari WHERE guild_id = ? ORDER BY zaman DESC')
    .all(String(guildId))
    .map(satir);
}

/**
 * Üyeyi uzaklaştırır; zaten uzaksa sebebi günceller.
 * @returns {{ok: false, sebep: string} | {ok: true, yeni: boolean}}
 */
export function uzaklastir(db, {
  guildId, kullaniciId, sebep, yetkiliId, simdi = Date.now(), yetkililer = yetkiliKimlikler(),
}) {
  const metin = String(sebep ?? '').trim();
  if (!metin) return { ok: false, sebep: 'Uzaklaştırma sebebi yazılmalı; üye bunu görecek.' };
  if (metin.length > SEBEP_UZUNLUK) return { ok: false, sebep: `Sebep en çok ${SEBEP_UZUNLUK} karakter olabilir.` };
  if (String(kullaniciId) === String(yetkiliId)) return { ok: false, sebep: 'Kendini uzaklaştıramazsın.' };
  if (yetkililer.includes(String(kullaniciId))) return { ok: false, sebep: 'Bot sahibi ve geliştiriciler uzaklaştırılamaz.' };
  const yeni = !uzakMi(db, guildId, kullaniciId);
  db.prepare(
    `INSERT INTO ekonomi_uzaklastirmalari (guild_id, kullanici_id, sebep, yetkili_id, zaman) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(guild_id, kullanici_id) DO UPDATE SET sebep = excluded.sebep, yetkili_id = excluded.yetkili_id`,
  ).run(String(guildId), String(kullaniciId), metin, String(yetkiliId), simdi);
  return { ok: true, yeni };
}

/** Uzaklaştırmayı kaldırır. */
export function uzaklastirmaKaldir(db, { guildId, kullaniciId }) {
  const silindi = db
    .prepare('DELETE FROM ekonomi_uzaklastirmalari WHERE guild_id = ? AND kullanici_id = ?')
    .run(String(guildId), String(kullaniciId)).changes > 0;
  return silindi ? { ok: true } : { ok: false, sebep: 'Bu üye ekonomiden uzaklaştırılmamış.' };
}

/** Üyeye gösterilecek metin (Discord yanıtı). */
export function uzakMetni(kayit) {
  return [
    '⛔ **Ekonomiden uzaklaştırıldın.**',
    '',
    `**Sebep:** ${kayit.sebep}`,
    `**Tarih:** <t:${Math.floor(kayit.zaman / 1000)}:f>`,
    '',
    'Muz, kasa, kart ve diğer ekonomi özelliklerini kullanamazsın; bakiyen ve envanterin donduruldu. '
    + 'Bunun bir hata olduğunu düşünüyorsan aşağıdaki butonla destek talebi aç.',
  ].join('\n');
}
