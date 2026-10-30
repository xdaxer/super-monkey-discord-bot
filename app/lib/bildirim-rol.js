/**
 * Bildirim rolleri: üyenin kendi seçtiği, yetkisiz ve renksiz rollerdir;
 * duyurularda etiketlenince yalnız isteyenlere bildirim gider. Onboarding
 * sorusu ve ・🔔・bildirimler kanalındaki düğmeler aynı rolleri verir.
 *
 * Roller adıyla bulunur (scripts/bildirim-panel-kur.js bu adlarla açar).
 * Düğme yalnız bu listedeki rolleri verip alabilir; customId'ye başka bir
 * anahtar yazılsa da hiçbir rol değişmez.
 */

import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} from 'discord.js';

import { gomu } from './bicim.js';

export const BILDIRIM_ROLLERI = Object.freeze([
  { anahtar: 'video', ad: '🎬 Video Bildirimi', emoji: '🎬', baslik: 'Yeni videolar', aciklama: 'Yeni video çıkınca etiketlenirsin' },
  { anahtar: 'cekilis', ad: '🎁 Çekiliş Bildirimi', emoji: '🎁', baslik: 'Çekilişler', aciklama: 'Yeni çekiliş başlayınca etiketlenirsin' },
  { anahtar: 'etkinlik', ad: '🎤 Etkinlik Bildirimi', emoji: '🎤', baslik: 'Etkinlikler', aciklama: 'Etkinlikler olunca etiketlenirsin' },
  { anahtar: 'boss', ad: '👹 Boss Bildirimi', emoji: '👹', baslik: 'Boss savaşları', aciklama: 'Haftalık boss çıkınca etiketlenirsin' },
  // Ekonomi güncelleme duyuruları (#duyuru) @everyone yerine bunu etiketler.
  { anahtar: 'ekonomi', ad: '🍌 Ekonomi Bildirimi', emoji: '🍌', baslik: 'Ekonomi güncellemeleri', aciklama: 'Muz ekonomisine yenilik gelince etiketlenirsin' },
]);

const ONEK = 'bildirim';

/** Bildirim rolünü sunucuda adıyla bulur (düğmeler de adla bulur); yoksa null. */
export function bildirimRolu(guild, anahtar) {
  const tanim = BILDIRIM_ROLLERI.find((r) => r.anahtar === anahtar);
  return tanim ? guild?.roles?.cache?.find((r) => r.name === tanim.ad) ?? null : null;
}

export function bildirimButonId(anahtar) {
  return `${ONEK}:${anahtar}`;
}

/** @returns {object | null} listedeki rol tanımı */
export function bildirimButonAyristir(customId) {
  const [onek, anahtar, fazla] = String(customId ?? '').split(':');
  if (onek !== ONEK || fazla !== undefined) return null;
  return BILDIRIM_ROLLERI.find((r) => r.anahtar === anahtar) ?? null;
}

/** Kanala konan panel mesajı: açıklama ve her rol için bir düğme. */
export function bildirimPaneli() {
  const embed = gomu('bilgi', '🔔 Bildirim rolleri')
    .setDescription([
      'Hangi duyurularda etiketlenmek istediğini seç. Düğmeye bir kez basınca rol verilir, tekrar basınca alınır.',
      '',
      ...BILDIRIM_ROLLERI.map((r) => `${r.emoji} **${r.baslik}** · ${r.aciklama}`),
    ].join('\n'))
    .setFooter({ text: 'Roller yetki vermez, adının rengini değiştirmez; yalnız bildirim içindir.' });
  const satir = new ActionRowBuilder().addComponents(BILDIRIM_ROLLERI.map((r) => new ButtonBuilder()
    .setCustomId(bildirimButonId(r.anahtar))
    .setLabel(r.baslik)
    .setEmoji(r.emoji)
    .setStyle(ButtonStyle.Secondary)));
  return { embeds: [embed], components: [satir] };
}

async function butonBasildi(interaction) {
  const tanim = bildirimButonAyristir(interaction.customId);
  const gizli = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
  const rol = interaction.guild?.roles.cache.find((r) => r.name === tanim.ad);
  const uye = interaction.member;
  if (!rol || !uye?.roles) {
    await gizli('Bu bildirim rolü sunucuda bulunamadı; bir yöneticiye haber ver.');
    return;
  }

  if (uye.roles.cache.has(rol.id)) {
    await uye.roles.remove(rol, 'Bildirim rolü: üye kendisi bıraktı');
    await gizli(`${tanim.emoji} **${tanim.baslik}** bildirimleri kapatıldı.`);
  } else {
    await uye.roles.add(rol, 'Bildirim rolü: üye kendisi seçti');
    await gizli(`${tanim.emoji} **${tanim.baslik}** bildirimleri açıldı. Kapatmak için düğmeye tekrar bas.`);
  }
}

export function bildirimBilesenleri() {
  return [
    {
      eslesir: (i) => i.isButton?.() && bildirimButonAyristir(i.customId) !== null,
      calistir: butonBasildi,
    },
  ];
}
