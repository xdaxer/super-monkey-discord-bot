import { ChannelType, InteractionContextType, SlashCommandBuilder } from 'discord.js';

import { gomu, PINGSIZ, zaman } from '../../lib/bicim.js';

export const sistem = 'sunucu';

export const data = new SlashCommandBuilder()
  .setName('sunucu')
  .setDescription('Sunucu bilgilerini gösterir.')
  .setContexts(InteractionContextType.Guild);

const KANAL_ETIKETLERI = [
  [ChannelType.GuildText, 'Metin'],
  [ChannelType.GuildVoice, 'Ses'],
  [ChannelType.GuildCategory, 'Kategori'],
  [ChannelType.GuildAnnouncement, 'Duyuru'],
  [ChannelType.GuildForum, 'Forum'],
  [ChannelType.GuildStageVoice, 'Sahne'],
];

/** Saf mantık: kanal türlerini sayar. */
export function kanallariSay(kanallar) {
  const sayim = new Map();
  for (const kanal of kanallar) {
    sayim.set(kanal.type, (sayim.get(kanal.type) ?? 0) + 1);
  }

  return KANAL_ETIKETLERI
    .map(([tur, etiket]) => ({ etiket, adet: sayim.get(tur) ?? 0 }))
    .filter((satir) => satir.adet > 0);
}

/**
 * Üye sayısı GuildMembers intent'i kapalıyken de doğrudur: guild.memberCount
 * GUILD_CREATE yükünden gelir ve üye listesini önbelleğe almayı gerektirmez.
 */
export function bilgiAlanlari(guild) {
  const kanallar = kanallariSay([...guild.channels.cache.values()]);

  return [
    { name: 'Sunucu', value: `${guild.name} (\`${guild.id}\`)` },
    { name: 'Sahip', value: `<@${guild.ownerId}>`, inline: true },
    { name: 'Oluşturuldu', value: zaman(guild.createdTimestamp), inline: true },
    { name: 'Üye sayısı', value: String(guild.memberCount ?? 'bilinmiyor'), inline: true },
    { name: 'Rol sayısı', value: String(guild.roles.cache.size), inline: true },
    {
      name: 'Takviye',
      value: `Seviye ${guild.premiumTier ?? 0} · ${guild.premiumSubscriptionCount ?? 0} takviye`,
      inline: true,
    },
    {
      name: `Kanallar (${guild.channels.cache.size})`,
      value: kanallar.length > 0
        ? kanallar.map((k) => `${k.etiket}: ${k.adet}`).join(' · ')
        : 'Kanal yok',
    },
  ];
}

export async function execute(interaction) {
  const guild = interaction.guild;

  const embed = gomu('bilgi', guild.name).addFields(bilgiAlanlari(guild));
  const ikon = guild.iconURL({ size: 256 });
  if (ikon) embed.setThumbnail(ikon);

  await interaction.reply({ embeds: [embed], ...PINGSIZ });
}
