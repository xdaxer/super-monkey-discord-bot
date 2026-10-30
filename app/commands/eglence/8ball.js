import { SlashCommandBuilder } from 'discord.js';

import { etiketsiz, PINGSIZ } from '../../lib/bicim.js';

export const sistem = 'eglence';

export const CEVAPLAR = [
  'Kesinlikle evet.', 'Bence evet.', 'Büyük ihtimalle.', 'Görünüşe göre öyle.',
  'Şu an belli değil, tekrar sor.', 'Cevabım şimdilik saklı.', 'Odaklan ve tekrar sor.',
  'Pek sanmıyorum.', 'Kaynaklarım hayır diyor.', 'Kesinlikle hayır.', 'Hiç iyi görünmüyor.',
];

export const data = new SlashCommandBuilder()
  .setName('8ball')
  .setDescription('Sorduğun soruya sihirli 8 topu cevap versin.')
  .addStringOption((o) => o
    .setName('soru').setDescription('Merak ettiğin şey')
    .setRequired(true).setMaxLength(300));

export function cevapla(rastgele = Math.random) {
  return CEVAPLAR[Math.floor(rastgele() * CEVAPLAR.length)];
}

export async function execute(interaction) {
  const soru = interaction.options.getString('soru');

  await interaction.reply({
    content: `🎱 **Soru:** ${etiketsiz(soru)}\n**Cevap:** ${cevapla()}`,
    ...PINGSIZ,
  });
}
