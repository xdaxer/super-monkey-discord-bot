import {
  ActionRowBuilder, InteractionContextType, MessageFlags, ModalBuilder,
  SlashCommandBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';

import { ayarGetir, sistemAcikMi } from '../../lib/ayarlar.js';
import { bekleyenBasvuru, SORULAR } from '../../lib/basvuru.js';
import { veritabani } from '../../lib/db.js';

export const sistem = 'basvuru';

export const MODAL_ID = 'basvuru:form';

export const data = new SlashCommandBuilder()
  .setName('basvuru')
  .setDescription('Sunucuya başvuru formunu doldur.')
  .setContexts(InteractionContextType.Guild);

export function formOlustur() {
  const modal = new ModalBuilder().setCustomId(MODAL_ID).setTitle('Başvuru formu');

  for (const soru of SORULAR) {
    const girdi = new TextInputBuilder()
      .setCustomId(soru.id)
      .setLabel(soru.etiket)
      .setStyle(soru.uzun ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setMaxLength(soru.enFazla)
      .setRequired(soru.zorunlu !== false);

    modal.addComponents(new ActionRowBuilder().addComponents(girdi));
  }

  return modal;
}

export async function execute(interaction) {
  const db = veritabani();
  const guildId = interaction.guildId;

  if (!sistemAcikMi(db, guildId, 'basvuru')) {
    await interaction.reply({
      content: 'Başvuru sistemi bu sunucuda kapalı.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!ayarGetir(db, guildId, 'basvuru.kanal')) {
    await interaction.reply({
      content: 'Başvuru inceleme kanalı ayarlanmamış. Yönetici `/ayar ayarla basvuru.kanal` ile ayarlamalı.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const bekleyen = bekleyenBasvuru(db, guildId, interaction.user.id);
  if (bekleyen) {
    await interaction.reply({
      content: `Zaten incelenmeyi bekleyen bir başvurun var (**#${bekleyen.id}**). `
        + 'Sonuçlanmadan yenisini gönderemezsin.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.showModal(formOlustur());
}
