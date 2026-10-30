import { SlashCommandBuilder } from 'discord.js';

import { PINGSIZ } from '../../lib/bicim.js';

export const sistem = 'eglence';

export const data = new SlashCommandBuilder()
  .setName('yazitura')
  .setDescription('Yazı tura atar.');

export function at(rastgele = Math.random) {
  return rastgele() < 0.5 ? 'Yazı' : 'Tura';
}

export async function execute(interaction) {
  await interaction.reply({ content: `🪙 **${at()}**`, ...PINGSIZ });
}
