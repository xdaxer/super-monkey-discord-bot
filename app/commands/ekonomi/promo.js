import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';

import { gomu } from '../../lib/bicim.js';
import { veritabani } from '../../lib/db.js';
import { muz } from '../../lib/ekonomi.js';
import { promoKullan } from '../../lib/promo.js';

export const sistem = 'ekonomi';
export const modul = 'ekonomi';

export const data = new SlashCommandBuilder()
  .setName('promo')
  .setDescription('Yayında ya da duyuruda dağıtılan promosyon kodunu kullanır.')
  .setContexts(InteractionContextType.Guild)
  .addStringOption((o) => o.setName('kod').setDescription('Promosyon kodu').setRequired(true).setMaxLength(40));

export async function execute(interaction) {
  const sonuc = promoKullan(veritabani(), {
    guildId: interaction.guildId, kullaniciId: interaction.user.id, kod: interaction.options.getString('kod'),
  });
  if (!sonuc.ok) {
    await interaction.reply({ content: sonuc.sebep, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.reply({
    embeds: [gomu('basari', 'Promosyon kodu kullanıldı').setDescription(
      `**${sonuc.kod}** kodu sana **${muz(sonuc.odul)}** kazandırdı.\nYeni bakiyen: ${muz(sonuc.bakiye)}`,
    )],
    flags: MessageFlags.Ephemeral,
  });
}
