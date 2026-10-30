import {
  InteractionContextType, PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';

import { etiketsiz, gomu, PINGSIZ } from '../../lib/bicim.js';
import { moderasyonHazirlik, redYanit } from '../../lib/moderasyon.js';

export const sistem = 'moderasyon';

export const data = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('Bir kullanıcıyı sunucudan yasaklar.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption((o) => o
    .setName('uye').setDescription('Yasaklanacak kullanıcı').setRequired(true))
  .addStringOption((o) => o
    .setName('sebep').setDescription('Yasaklama gerekçesi').setMaxLength(400))
  .addIntegerOption((o) => o
    .setName('mesajgun').setDescription('Kaç günlük mesajı silinsin (0-7)')
    .setMinValue(0).setMaxValue(7));

export async function execute(interaction) {
  // uyeZorunlu: false — sunucuda olmayan kullanıcı da yasaklanabilir.
  const hazirlik = await moderasyonHazirlik(interaction, {
    yetkiler: [PermissionFlagsBits.BanMembers],
    uyeZorunlu: false,
  });

  if (!hazirlik.ok) {
    await redYanit(interaction, hazirlik.sebep);
    return;
  }

  const { hedefKullanici } = hazirlik;
  const sebep = interaction.options.getString('sebep') ?? 'Gerekçe belirtilmedi';
  const mesajGun = interaction.options.getInteger('mesajgun') ?? 0;

  try {
    await interaction.guild.members.ban(hedefKullanici.id, {
      reason: `${interaction.user.tag}: ${sebep}`,
      deleteMessageSeconds: mesajGun * 86_400,
    });
  } catch (error) {
    await redYanit(interaction, `Yasaklama başarısız: ${error.message}`);
    return;
  }

  const embed = gomu('hata', 'Kullanıcı yasaklandı')
    .addFields(
      { name: 'Kullanıcı', value: `${etiketsiz(hedefKullanici.tag ?? hedefKullanici.username)} (\`${hedefKullanici.id}\`)` },
      { name: 'Yetkili', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Gerekçe', value: etiketsiz(sebep) },
    );

  await interaction.reply({ embeds: [embed], ...PINGSIZ });
}
