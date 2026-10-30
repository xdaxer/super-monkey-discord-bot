import {
  InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';

import { ayarGetir } from '../../lib/ayarlar.js';
import { gomu, PINGSIZ, zaman } from '../../lib/bicim.js';
import { veritabani } from '../../lib/db.js';
import { kanalYetkisiKontrol } from '../../lib/izin.js';
import { acikTalepler, kanaldanTalep, kapatabilirMi } from '../../lib/talep.js';
import { panelButonu, panelGomusu, talebiKapat } from '../../lib/talep-bilesen.js';

export const sistem = 'talep';
export const modul = 'talep';

export const data = new SlashCommandBuilder()
  .setName('talep')
  .setDescription('Destek talebi sistemini yönetir.')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) => s
    .setName('panel').setDescription('Talep açma panelini kurar (yönetici).')
    .addChannelOption((o) => o
      .setName('kanal').setDescription('Panel hangi kanala kurulsun (boşsa ayarlı panel kanalı)')))
  .addSubcommand((s) => s
    .setName('kapat').setDescription('Bulunduğun talep kanalını kapatır.'))
  .addSubcommand((s) => s
    .setName('liste').setDescription('Açık talepleri gösterir.'));

export async function execute(interaction) {
  const db = veritabani();
  const guildId = interaction.guildId;
  const alt = interaction.options.getSubcommand();

  if (alt === 'panel') {
    // Panel kurmak yapılandırma işidir; alt komut bazında yetki denetliyoruz
    // çünkü /talep kapat'ı normal üye de kullanabilmeli.
    if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content: '⛔ Paneli yalnız **Sunucuyu Yönet** yetkisi olanlar kurabilir.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const secilen = interaction.options.getChannel('kanal');
    const kanalId = secilen?.id ?? ayarGetir(db, guildId, 'talep.panelKanal');

    if (!kanalId) {
      await interaction.reply({
        content: 'Panel kanalı ayarlı değil: `/ayar ayarla anahtar:talep.panelKanal kanal:#kanal` '
          + 'ya da `kanal:` seçeneğiyle kanal ver.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const kanal = secilen ?? await interaction.guild.channels.fetch(kanalId).catch(() => null);
    if (!kanal?.isTextBased?.()) {
      await interaction.reply({
        content: `Panel kanalı (\`${kanalId}\`) bulunamadı veya metin kanalı değil.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const yetki = kanalYetkisiKontrol(
      kanal, interaction.guild.members.me,
      PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks,
    );
    if (!yetki.ok) {
      await interaction.reply({ content: yetki.sebep, flags: MessageFlags.Ephemeral });
      return;
    }

    const mesaj = await kanal.send({
      embeds: [panelGomusu()], components: [panelButonu()], ...PINGSIZ,
    }).catch(() => null);

    await interaction.reply({
      content: mesaj
        ? `🎫 Panel ${kanal} kanalına kuruldu. Buton kalıcı: bot yeniden başlasa da çalışır.`
        : 'Panel mesajı gönderilemedi.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (alt === 'kapat') {
    const talep = kanaldanTalep(db, interaction.channelId);

    if (!talep || talep.guild_id !== String(guildId)) {
      await interaction.reply({
        content: 'Burası bir talep kanalı değil.', flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (talep.durum !== 'acik') {
      await interaction.reply({
        content: `**#${talep.id}** zaten kapatılmış.`, flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const izin = kapatabilirMi(
      interaction.member, talep, ayarGetir(db, guildId, 'talep.rol'),
      interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) ?? false,
    );
    if (!izin.ok) {
      await interaction.reply({ content: izin.sebep, flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({ content: '🔒 Talep kapatılıyor, transkript alınıyor...' })
      .catch(() => null);

    const sonuc = await talebiKapat(interaction, talep, db);
    if (!sonuc.ok) {
      await interaction.followUp({ content: sonuc.sebep, flags: MessageFlags.Ephemeral })
        .catch(() => null);
    }
    return;
  }

  const acik = acikTalepler(db, guildId);
  if (acik.length === 0) {
    await interaction.reply({ content: 'Açık talep yok.', flags: MessageFlags.Ephemeral });
    return;
  }

  const embed = gomu('bilgi', `Açık talepler (${acik.length})`).setDescription(
    acik.map((t) => `**#${t.id}** — <@${t.kullanici_id}> · <#${t.kanal_id}> · ${zaman(t.acilis, 'R')}`)
      .join('\n'),
  );

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral, ...PINGSIZ });
}
