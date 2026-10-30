import {
  InteractionContextType, PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';

import { etiketsiz, gomu, PINGSIZ } from '../../lib/bicim.js';
import { moderasyonHazirlik, redYanit } from '../../lib/moderasyon.js';

export const sistem = 'moderasyon';

export const data = new SlashCommandBuilder()
  .setName('kick')
  .setDescription('Bir kullanıcıyı sunucudan atar.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
  .addUserOption((o) => o
    .setName('uye').setDescription('Atılacak kullanıcı').setRequired(true))
  .addStringOption((o) => o
    .setName('sebep').setDescription('Atma gerekçesi').setMaxLength(400));

export async function execute(interaction) {
  const hazirlik = await moderasyonHazirlik(interaction, {
    yetkiler: [PermissionFlagsBits.KickMembers],
  });

  if (!hazirlik.ok) {
    await redYanit(interaction, hazirlik.sebep);
    return;
  }

  const { hedefUye, hedefKullanici } = hazirlik;
  const sebep = interaction.options.getString('sebep') ?? 'Gerekçe belirtilmedi';

  try {
    await hedefUye.kick(`${interaction.user.tag}: ${sebep}`);
  } catch (error) {
    await redYanit(interaction, `Atma başarısız: ${error.message}`);
    return;
  }

  const embed = gomu('uyari', 'Kullanıcı sunucudan atıldı')
    .addFields(
      { name: 'Kullanıcı', value: `${etiketsiz(hedefKullanici.tag ?? hedefKullanici.username)} (\`${hedefKullanici.id}\`)` },
      { name: 'Yetkili', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Gerekçe', value: etiketsiz(sebep) },
    );

  await interaction.reply({ embeds: [embed], ...PINGSIZ });
}
