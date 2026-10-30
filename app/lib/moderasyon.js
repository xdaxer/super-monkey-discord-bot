import { MessageFlags } from 'discord.js';

import { botYetkisiKontrol, hiyerarsiKontrol } from './izin.js';

/**
 * Bir moderasyon komutunun ortak ön kontrolleri:
 * botun yetkisi, hedefin sunucuda olup olmadığı ve rol hiyerarşisi.
 *
 * @returns {Promise<{ok: true, hedefUye: object|null, hedefKullanici: object}
 *                  | {ok: false, sebep: string}>}
 */
export async function moderasyonHazirlik(interaction, { yetkiler = [], uyeZorunlu = true } = {}) {
  const hedefKullanici = interaction.options.getUser('uye');
  const botUye = interaction.guild.members.me;

  const botYetki = botYetkisiKontrol(botUye, ...yetkiler);
  if (!botYetki.ok) return { ok: false, sebep: botYetki.sebep };

  let hedefUye = null;
  try {
    hedefUye = await interaction.guild.members.fetch(hedefKullanici.id);
  } catch {
    hedefUye = null;
  }

  if (!hedefUye) {
    if (uyeZorunlu) {
      return { ok: false, sebep: 'Bu kullanıcı sunucuda değil.' };
    }
    // Ban gibi işlemler sunucuda olmayan kullanıcıya da uygulanabilir.
    return { ok: true, hedefUye: null, hedefKullanici };
  }

  const hiyerarsi = hiyerarsiKontrol({
    guild: interaction.guild,
    uygulayan: interaction.member,
    hedef: hedefUye,
    bot: botUye,
  });
  if (!hiyerarsi.ok) return { ok: false, sebep: hiyerarsi.sebep };

  return { ok: true, hedefUye, hedefKullanici };
}

export async function redYanit(interaction, sebep) {
  await interaction.reply({ content: `⛔ ${sebep}`, flags: MessageFlags.Ephemeral });
}

/* --- uyarilar tablosu --- */

export function uyariEkle(db, { guildId, kullaniciId, moderatorId, sebep }) {
  const sonuc = db
    .prepare(`INSERT INTO uyarilar (guild_id, kullanici_id, moderator_id, sebep, zaman)
              VALUES (?, ?, ?, ?, ?)`)
    .run(String(guildId), String(kullaniciId), String(moderatorId), sebep, Date.now());

  return Number(sonuc.lastInsertRowid);
}

export function uyarilariGetir(db, guildId, kullaniciId) {
  return db
    .prepare(`SELECT id, moderator_id, sebep, zaman FROM uyarilar
              WHERE guild_id = ? AND kullanici_id = ? ORDER BY zaman DESC`)
    .all(String(guildId), String(kullaniciId));
}

export function uyariSil(db, guildId, id) {
  const sonuc = db
    .prepare('DELETE FROM uyarilar WHERE guild_id = ? AND id = ?')
    .run(String(guildId), Number(id));
  return sonuc.changes > 0;
}

export function uyariSayisi(db, guildId, kullaniciId) {
  return db
    .prepare('SELECT COUNT(*) AS adet FROM uyarilar WHERE guild_id = ? AND kullanici_id = ?')
    .get(String(guildId), String(kullaniciId)).adet;
}
