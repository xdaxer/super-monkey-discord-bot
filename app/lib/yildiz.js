import { EmbedBuilder } from 'discord.js';

import { ayarGetir, sistemAcikMi } from './ayarlar.js';

/**
 * Yıldız panosu (Carl-bot starboard yerine): ⭐ sayısı eşiğe ulaşan mesaj
 * `yildiz.kanal`a kopyalanır, sayı değiştikçe kopya güncellenir, eşiğin altına
 * düşünce silinir.
 */

export const YILDIZ = '⭐';

/** Carl-bot'un kullandığı sarı; pano görünümü değişmesin. */
const RENK = 0xfff7e4;

/**
 * Geçerli yıldızları sayar: botlar ve mesaj sahibinin kendine verdiği yıldız
 * sayılmaz (Carl-bot'ta da self-star varsayılan kapalı).
 */
export function yildizSayisi(kullanicilar, yazarId) {
  let sayi = 0;
  for (const k of kullanicilar) if (!k.bot && k.id !== yazarId) sayi += 1;
  return sayi;
}

/**
 * Panoda ne yapılacağına karar verir.
 * @returns {'olustur'|'guncelle'|'sil'|'yok'}
 */
export function panoKarari(sayi, esik, kayitVar) {
  if (sayi >= esik) return kayitVar ? 'guncelle' : 'olustur';
  return kayitVar ? 'sil' : 'yok';
}

/**
 * Mesajın panoya girip giremeyeceğini söyler; olmazsa sebebiyle döner.
 * Pano kanalının kendisi yıldızlanamaz.
 */
export function panoAyari(db, guildId, kanalId = null) {
  if (!sistemAcikMi(db, guildId, 'yildiz')) return { ok: false, sebep: 'yildiz kapalı' };

  const panoId = ayarGetir(db, guildId, 'yildiz.kanal');
  if (!panoId) return { ok: false, sebep: 'yildiz.kanal ayarlanmamış' };
  if (kanalId === panoId) return { ok: false, sebep: 'pano kanalı' };

  return { ok: true, panoId, esik: ayarGetir(db, guildId, 'yildiz.esik') };
}

/** NSFW kanaldaki mesaj NSFW olmayan panoya taşınmaz. */
export function nsfwEngeli(kaynakNsfw, panoNsfw) {
  return Boolean(kaynakNsfw) && !panoNsfw;
}

export function kayitGetir(db, mesajId) {
  return db.prepare('SELECT * FROM yildiz_mesajlari WHERE mesaj_id = ?').get(mesajId) ?? null;
}

export function kayitYaz(db, { guildId, mesajId, kanalId, panoMesajId, sayi }) {
  db.prepare(`
    INSERT INTO yildiz_mesajlari (guild_id, mesaj_id, kanal_id, pano_mesaj_id, sayi)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (mesaj_id) DO UPDATE SET pano_mesaj_id = excluded.pano_mesaj_id, sayi = excluded.sayi
  `).run(guildId, mesajId, kanalId, panoMesajId, sayi);
}

export function kayitSil(db, mesajId) {
  db.prepare('DELETE FROM yildiz_mesajlari WHERE mesaj_id = ?').run(mesajId);
}

/** Pano mesajının metni: "⭐ **3** #kanal". */
export function panoMetni(sayi, kanalId) {
  return `${YILDIZ} **${sayi}** <#${kanalId}>`;
}

/** İlk resim eki ya da resim gömmesi; yoksa null. */
export function ilkResim(mesaj) {
  for (const ek of mesaj.attachments?.values?.() ?? []) {
    if (ek.contentType?.startsWith('image/')) return ek.url;
  }
  for (const gomme of mesaj.embeds ?? []) {
    const url = gomme.image?.url ?? gomme.thumbnail?.url;
    if (url) return url;
  }
  return null;
}

/** Pano mesajı: yazar, içerik, ilk resim ve özgün mesaja bağlantı. */
export function panoMesaji(mesaj, sayi) {
  const gomme = new EmbedBuilder()
    .setColor(RENK)
    .setAuthor({
      name: mesaj.member?.displayName ?? mesaj.author.username,
      iconURL: mesaj.author.displayAvatarURL(),
    })
    .addFields({ name: 'Kaynak', value: `[Mesaja git](${mesaj.url})` })
    .setFooter({ text: mesaj.id })
    .setTimestamp(mesaj.createdAt);

  if (mesaj.content) gomme.setDescription(mesaj.content.slice(0, 4096));
  const resim = ilkResim(mesaj);
  if (resim) gomme.setImage(resim);

  return { content: panoMetni(sayi, mesaj.channelId), embeds: [gomme], allowedMentions: { parse: [] } };
}
