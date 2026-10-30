/**
 * Bota gelen DM'leri yetkili kanalına aktarır: kimden geldiği, içerik, ekler.
 *
 * Gömü saf üretilir (Discord'a bağlanmadan test edilir); gönderme olay
 * dosyasında (events/dm-log.js) ve geçmiş aktarım betiğinde
 * (scripts/dm-gecmis.js) yapılır.
 */

import { EmbedBuilder } from 'discord.js';

export const RENK = 0x5865f2;
/** Discord gömü açıklama sınırı. */
const ACIKLAMA_SINIRI = 4096;

/** DM aktarılmalı mı: botların ve sistem mesajlarının DM'leri atlanır. */
export function aktarilirMi(mesaj) {
  if (mesaj?.guild || mesaj?.guildId) return false;
  if (mesaj?.author?.bot) return false;
  if (mesaj?.system) return false;
  return true;
}

/**
 * Bir DM'in gömüsü. Ekler bağlantı olarak listelenir (resim varsa ilki
 * gömüde görünür); çıkartmalar adıyla yazılır.
 *
 * @param {object} mesaj discord.js Message ya da aynı şekle sahip nesne
 * @param {{gecmis?: boolean}} [secenekler] geçmiş aktarımında başlıkta işaret
 */
export function dmGomusu(mesaj, { gecmis = false } = {}) {
  const yazar = mesaj.author;
  const icerik = String(mesaj.content ?? '').trim();
  const ekler = [...(mesaj.attachments?.values?.() ?? mesaj.attachments ?? [])];
  const cikartmalar = [...(mesaj.stickers?.values?.() ?? mesaj.stickers ?? [])];

  const satirlar = [];
  if (icerik) satirlar.push(icerik);
  if (ekler.length > 0) satirlar.push(`📎 ${ekler.map((e) => `[${e.name ?? 'ek'}](${e.url})`).join(' · ')}`);
  if (cikartmalar.length > 0) satirlar.push(`🏷️ Çıkartma: ${cikartmalar.map((c) => c.name).join(', ')}`);
  if (satirlar.length === 0) satirlar.push('_(boş mesaj)_');

  let aciklama = satirlar.join('\n\n');
  if (aciklama.length > ACIKLAMA_SINIRI) aciklama = `${aciklama.slice(0, ACIKLAMA_SINIRI - 1)}…`;

  const embed = new EmbedBuilder()
    .setColor(RENK)
    .setAuthor({
      name: `${yazar.globalName ?? yazar.username} (@${yazar.username})`,
      iconURL: yazar.displayAvatarURL?.() ?? undefined,
    })
    .setDescription(aciklama)
    .setFooter({ text: `${gecmis ? 'Geçmiş DM · ' : ''}Kullanıcı kimliği: ${yazar.id}` })
    .setTimestamp(mesaj.createdTimestamp ?? Date.now());

  const resim = ekler.find((e) => String(e.contentType ?? '').startsWith('image/'));
  if (resim) embed.setImage(resim.url);
  return embed;
}

/** Aktarım mesajının metni: kişiyi etiket olarak verir (bildirimsiz) ki profili tıklanabilsin. */
export function dmIcerigi(mesaj) {
  return `📨 <@${mesaj.author.id}> bota DM attı`;
}

/** Bu önekle başlayan yanıt kullanıcıya gitmez: yetkililer kendi aralarında not düşebilsin. */
export const NOT_ONEKI = '//';

/**
 * Yetkili kanalındaki bir yanıtın DM olarak iletileceği kullanıcıyı bulur.
 * Yanıtlanan mesaj botun aktarım mesajı olmalı; kimlik gömünün altlığından
 * ("Kullanıcı kimliği: …"), o yoksa "📨 <@id> bota DM attı" metninden okunur.
 *
 * @param {object} yanitlanan yanıtlanan mesaj
 * @param {string} botId botun kendi kimliği
 * @returns {string|null}
 */
export function yanitHedefi(yanitlanan, botId) {
  if (!yanitlanan || yanitlanan.author?.id !== botId) return null;

  for (const gomu of yanitlanan.embeds ?? []) {
    const altlik = /Kullanıcı kimliği: (\d+)/.exec(gomu.footer?.text ?? '');
    if (altlik) return altlik[1];
  }
  return /^📨 <@!?(\d+)> bota DM attı/.exec(yanitlanan.content ?? '')?.[1] ?? null;
}

/** Yanıt iletilmeli mi: boş değil ve not önekiyle başlamıyor. */
export function yanitIletilirMi(icerik, ekSayisi = 0) {
  const metin = String(icerik ?? '').trim();
  if (metin.startsWith(NOT_ONEKI)) return false;
  return metin.length > 0 || ekSayisi > 0;
}
