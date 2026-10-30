import { SlashCommandBuilder } from 'discord.js';

import { etiketsiz, PINGSIZ } from '../../lib/bicim.js';

export const sistem = 'eglence';

export const data = new SlashCommandBuilder()
  .setName('sec')
  .setDescription('Verdiğin seçenekler arasından birini seçer.')
  .addStringOption((o) => o
    .setName('secenekler')
    .setDescription('Virgülle ayır: pizza, lahmacun, döner')
    .setRequired(true)
    .setMaxLength(500));

/** Virgülle ayrılmış listeyi ayrıştırır; boşları atar, tekrarları korur. */
export function seceneklerAyristir(metin) {
  return String(metin)
    .split(',')
    .map((parca) => parca.trim())
    .filter((parca) => parca.length > 0);
}

export function sec(secenekler, rastgele = Math.random) {
  if (secenekler.length === 0) return null;
  return secenekler[Math.floor(rastgele() * secenekler.length)];
}

export async function execute(interaction) {
  const secenekler = seceneklerAyristir(interaction.options.getString('secenekler'));

  if (secenekler.length === 0) {
    await interaction.reply({
      content: 'Hiç seçenek bulamadım. Virgülle ayırarak yaz: `pizza, lahmacun, döner`',
      ...PINGSIZ,
    });
    return;
  }

  if (secenekler.length === 1) {
    await interaction.reply({
      content: `Tek seçenek verdin, o zaman: **${etiketsiz(secenekler[0])}** 🙂`,
      ...PINGSIZ,
    });
    return;
  }

  await interaction.reply({
    content: `${secenekler.length} seçenek arasından: **${etiketsiz(sec(secenekler))}**`,
    ...PINGSIZ,
  });
}
