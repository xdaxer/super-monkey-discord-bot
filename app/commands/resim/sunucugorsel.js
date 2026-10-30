import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';

import { gomu, PINGSIZ } from '../../lib/bicim.js';

export const sistem = 'resim';

export const data = new SlashCommandBuilder()
  .setName('sunucugorsel')
  .setDescription('Sunucunun ikonunu, afişini veya davet arka planını gösterir.')
  .setContexts(InteractionContextType.Guild)
  .addStringOption((o) => o
    .setName('tur').setDescription('Hangi görsel').setRequired(true)
    .addChoices(
      { name: 'İkon', value: 'ikon' },
      { name: 'Afiş (banner)', value: 'banner' },
      { name: 'Davet arka planı', value: 'splash' },
    ));

/** Saf mantık: tür adını gerçek bağlantıya çevirir, yoksa null döner. */
export function gorselBaglantisi(guild, tur, boyut = 1024) {
  const secenekler = { size: boyut };
  switch (tur) {
    case 'ikon': return { etiket: 'İkon', url: guild.iconURL?.(secenekler) ?? null };
    case 'banner': return { etiket: 'Afiş', url: guild.bannerURL?.(secenekler) ?? null };
    case 'splash': return { etiket: 'Davet arka planı', url: guild.splashURL?.(secenekler) ?? null };
    default: return { etiket: tur, url: null };
  }
}

export async function execute(interaction) {
  const tur = interaction.options.getString('tur');
  const { etiket, url } = gorselBaglantisi(interaction.guild, tur);

  if (!url) {
    await interaction.reply({
      content: `Bu sunucunun **${etiket.toLocaleLowerCase('tr')}** görseli yok.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const embed = gomu('bilgi', `${interaction.guild.name} — ${etiket.toLocaleLowerCase('tr')}`)
    .setImage(url)
    .setDescription(`[Tam boy bağlantı](${url})`);

  await interaction.reply({ embeds: [embed], ...PINGSIZ });
}
