import {
  ChannelType, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';

import { gomu, PINGSIZ, zaman } from '../../lib/bicim.js';
import { veritabani } from '../../lib/db.js';
import {
  abonelikCikar, abonelikEkle, abonelikler, akisCek, kanalIdAyikla,
} from '../../lib/youtube.js';

export const sistem = 'youtube';

export const data = new SlashCommandBuilder()
  .setName('youtube')
  .setDescription('YouTube kanal bildirimlerini yönetir.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((s) => s
    .setName('ekle').setDescription('Bir YouTube kanalına abone olur.')
    .addStringOption((o) => o
      .setName('kanal')
      .setDescription('Kanal kimliği (UC...) veya youtube.com/channel/UC... bağlantısı')
      .setRequired(true))
    .addChannelOption((o) => o
      .setName('hedef').setDescription('Bildirimlerin gideceği Discord kanalı')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true))
    .addBooleanOption((o) => o
      .setName('herkesi_etiketle')
      .setDescription('Yeni videoda 🎬 Video Bildirimi rolü etiketlensin mi? (varsayılan: hayır)')))
  .addSubcommand((s) => s
    .setName('cikar').setDescription('Bir aboneliği kaldırır.')
    .addStringOption((o) => o
      .setName('kanal').setDescription('Kanal kimliği veya bağlantısı').setRequired(true)))
  .addSubcommand((s) => s
    .setName('liste').setDescription('Bu sunucudaki abonelikleri listeler.'));

export async function execute(interaction) {
  const db = veritabani();
  const alt = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (alt === 'liste') {
    const kayitlar = abonelikler(db, guildId);

    if (kayitlar.length === 0) {
      await interaction.reply({
        content: 'Bu sunucuda hiç YouTube aboneliği yok. `/youtube ekle` ile ekleyebilirsin.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const satirlar = kayitlar.map((k) => (
      `• \`${k.kanal_id}\` → <#${k.hedef_kanal_id}>${k.herkesi_etiketle ? ' · 🎬 rol etiketi' : ''}`
      + ` · eklendi ${zaman(k.eklenme, 'R')}`
    ));

    const embed = gomu('bilgi', `YouTube abonelikleri (${kayitlar.length})`)
      .setDescription(satirlar.join('\n').slice(0, 4000));

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral, ...PINGSIZ });
    return;
  }

  const kanalId = kanalIdAyikla(interaction.options.getString('kanal'));
  if (!kanalId) {
    await interaction.reply({
      content: 'Kanal kimliğini anlayamadım. `UC` ile başlayan 24 karakterlik kimliği ya da '
        + '`youtube.com/channel/UC...` bağlantısını ver.\n'
        + 'Kimliği bulmak için: kanal sayfasında sağ tık → sayfa kaynağını görüntüle → `channel_id` ara.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (alt === 'cikar') {
    const silindi = abonelikCikar(db, guildId, kanalId);
    await interaction.reply({
      content: silindi
        ? `\`${kanalId}\` aboneliği kaldırıldı.`
        : `\`${kanalId}\` için abonelik bulunamadı.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // ekle
  const hedef = interaction.options.getChannel('hedef');
  const herkesiEtiketle = interaction.options.getBoolean('herkesi_etiketle') ?? false;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const videolar = await akisCek(kanalId);
  if (videolar === null) {
    await interaction.editReply(
      `\`${kanalId}\` için RSS akışı alınamadı. Kanal kimliği yanlış olabilir ya da `
      + 'YouTube şu an yanıt vermiyor olabilir.',
    );
    return;
  }

  // Son videoyu baştan işaretliyoruz: abonelik eklenince eski videolar toplu düşmesin.
  const sonVideoId = videolar[0]?.videoId ?? null;
  abonelikEkle(db, {
    guildId, kanalId, hedefKanalId: hedef.id, sonVideoId, herkesiEtiketle,
  });

  const kanalAdi = videolar[0]?.kanalAdi ?? kanalId;
  await interaction.editReply(
    `✅ **${kanalAdi}** kanalına abone olundu. Yeni videolar <#${hedef.id}> kanalına düşecek.\n`
    + (sonVideoId
      ? 'Mevcut videolar bildirilmeyecek; yalnız bundan sonrakiler gönderilir.'
      : 'Kanalda hiç video görünmüyor; ilk video yayınlandığında bildirilecek.'),
  );
}
