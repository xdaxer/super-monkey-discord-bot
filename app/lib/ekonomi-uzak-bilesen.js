import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

import { uzaklastirma, uzakMetni } from './ekonomi-uzak.js';
import { PANEL_BUTON } from './talep.js';

/** Uzaklaştırılmış üyeye ekonomi komutu/butonu yerine gidecek yanıt; değilse null. */
export function uzakYaniti(db, interaction) {
  if (!interaction.guildId) return null;
  const kayit = uzaklastirma(db, interaction.guildId, interaction.user.id);
  if (!kayit) return null;
  return {
    content: uzakMetni(kayit),
    // Talep panelindeki butonla aynı customId: talep akışı olduğu gibi çalışır.
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(PANEL_BUTON).setLabel('Destek talebi aç').setEmoji('🎫').setStyle(ButtonStyle.Primary),
    )],
    allowedMentions: { parse: [] },
  };
}
