import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} from 'discord.js';

import { sistemAcikMi } from './ayarlar.js';
import { olayCoz } from './calis-olay.js';
import { veritabani } from './db.js';
import { muz } from './ekonomi.js';

const ONEK = 'calisolay';

export function olayButonId(secim, kullaniciId) {
  return `${ONEK}:${secim}:${kullaniciId}`;
}

/** @returns {{secim: string, kullaniciId: string} | null} */
export function olayButonAyristir(customId) {
  const [onek, secim, kullaniciId] = String(customId ?? '').split(':');
  if (onek !== ONEK || !/^[a-z]+$/.test(secim ?? '') || !/^\d+$/.test(kullaniciId ?? '')) return null;
  return { secim, kullaniciId };
}

/** Seçimli olayın düğmeleri (calis-olay.js `secenekler`). */
export function olayButonlari(secenekler, kullaniciId, devreDisi = false) {
  return new ActionRowBuilder().addComponents(secenekler.map((s, i) => new ButtonBuilder()
    .setCustomId(olayButonId(s.kimlik, kullaniciId))
    .setLabel(s.etiket)
    .setEmoji(s.emoji)
    .setStyle(i === 0 ? ButtonStyle.Success : ButtonStyle.Secondary)
    .setDisabled(devreDisi)));
}

export async function butonBasildi(interaction, db = veritabani()) {
  const { secim, kullaniciId } = olayButonAyristir(interaction.customId);
  if (interaction.user.id !== kullaniciId) {
    await interaction.reply({ content: 'Bu olay başkasının çalışmasında çıktı. Kendin için `/calis`.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (!sistemAcikMi(db, interaction.guildId, 'ekonomi')) {
    await interaction.reply({ content: 'Ekonomi sistemi bu sunucuda kapalı.', flags: MessageFlags.Ephemeral });
    return;
  }

  const sonuc = olayCoz(db, { guildId: interaction.guildId, kullaniciId, secim });
  if (!sonuc.ok) {
    // Kaçan olayın düğmeleri kalkar; enerji yetmiyorsa düğmeler yerinde kalır.
    if (sonuc.kacti) {
      await interaction.update({ components: [] });
      await interaction.followUp({ content: sonuc.sebep, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content: sonuc.sebep, flags: MessageFlags.Ephemeral });
    }
    return;
  }

  const satir = sonuc.muz > 0 ? `${sonuc.metin} **+${muz(sonuc.muz)}**` : sonuc.metin;
  await interaction.update({ components: [] });
  await interaction.followUp({ content: `${sonuc.olay.emoji} **${sonuc.olay.ad}** · ${satir}`, allowedMentions: { parse: [] } });
}

export function calisBilesenleri() {
  return [
    {
      eslesir: (i) => i.isButton?.() && olayButonAyristir(i.customId) !== null,
      calistir: butonBasildi,
    },
  ];
}
