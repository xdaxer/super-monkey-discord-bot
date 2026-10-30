import { SlashCommandBuilder } from 'discord.js';

import { PINGSIZ } from '../../lib/bicim.js';

export const sistem = 'eglence';

export const data = new SlashCommandBuilder()
  .setName('zar')
  .setDescription('Zar atar.')
  .addIntegerOption((o) => o
    .setName('yuz').setDescription('Zarın yüz sayısı (varsayılan 6)')
    .setMinValue(2).setMaxValue(1000))
  .addIntegerOption((o) => o
    .setName('adet').setDescription('Kaç zar atılsın (varsayılan 1)')
    .setMinValue(1).setMaxValue(20));

/** Saf mantık: test edilebilsin diye rastgelelik dışarıdan verilebiliyor. */
export function zarAt(yuz = 6, adet = 1, rastgele = Math.random) {
  const sonuclar = Array.from({ length: adet }, () => Math.floor(rastgele() * yuz) + 1);
  return { sonuclar, toplam: sonuclar.reduce((a, b) => a + b, 0) };
}

export async function execute(interaction) {
  const yuz = interaction.options.getInteger('yuz') ?? 6;
  const adet = interaction.options.getInteger('adet') ?? 1;
  const { sonuclar, toplam } = zarAt(yuz, adet);

  const govde = adet === 1
    ? `🎲 **${toplam}** (1-${yuz})`
    : `🎲 ${sonuclar.join(' + ')} = **${toplam}** (${adet}d${yuz})`;

  await interaction.reply({ content: govde, ...PINGSIZ });
}
