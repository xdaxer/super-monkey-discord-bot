import {
  InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';

import { etiketsiz, gomu, PINGSIZ, zaman } from '../../lib/bicim.js';
import { veritabani } from '../../lib/db.js';
import { hiyerarsiKontrol } from '../../lib/izin.js';
import { redYanit, uyariEkle, uyariSil, uyarilariGetir } from '../../lib/moderasyon.js';

export const sistem = 'moderasyon';

export const data = new SlashCommandBuilder()
  .setName('uyari')
  .setDescription('Uyarı ver, listele veya sil.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addSubcommand((s) => s
    .setName('ver').setDescription('Bir kullanıcıya uyarı verir.')
    .addUserOption((o) => o.setName('uye').setDescription('Uyarılacak kullanıcı').setRequired(true))
    .addStringOption((o) => o.setName('sebep').setDescription('Uyarı gerekçesi').setRequired(true).setMaxLength(400)))
  .addSubcommand((s) => s
    .setName('liste').setDescription('Bir kullanıcının uyarılarını listeler.')
    .addUserOption((o) => o.setName('uye').setDescription('Kimin uyarıları').setRequired(true)))
  .addSubcommand((s) => s
    .setName('sil').setDescription('Bir uyarıyı siler.')
    .addIntegerOption((o) => o.setName('id').setDescription('Uyarı numarası').setRequired(true).setMinValue(1)));

export async function execute(interaction) {
  const db = veritabani();
  const alt = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (alt === 'ver') {
    const hedefKullanici = interaction.options.getUser('uye');
    const sebep = interaction.options.getString('sebep');

    let hedefUye = null;
    try {
      hedefUye = await interaction.guild.members.fetch(hedefKullanici.id);
    } catch {
      hedefUye = null;
    }

    if (hedefUye) {
      const hiyerarsi = hiyerarsiKontrol({
        guild: interaction.guild,
        uygulayan: interaction.member,
        hedef: hedefUye,
        bot: interaction.guild.members.me,
      });
      if (!hiyerarsi.ok) {
        await redYanit(interaction, hiyerarsi.sebep);
        return;
      }
    }

    const id = uyariEkle(db, {
      guildId,
      kullaniciId: hedefKullanici.id,
      moderatorId: interaction.user.id,
      sebep,
    });

    const toplam = uyarilariGetir(db, guildId, hedefKullanici.id).length;

    const embed = gomu('uyari', 'Uyarı verildi')
      .addFields(
        { name: 'Kullanıcı', value: `<@${hedefKullanici.id}>`, inline: true },
        { name: 'Uyarı no', value: `#${id}`, inline: true },
        { name: 'Toplam uyarı', value: String(toplam), inline: true },
        { name: 'Gerekçe', value: etiketsiz(sebep) },
      );

    await interaction.reply({ embeds: [embed], ...PINGSIZ });
    return;
  }

  if (alt === 'liste') {
    const hedefKullanici = interaction.options.getUser('uye');
    const uyarilar = uyarilariGetir(db, guildId, hedefKullanici.id);

    if (uyarilar.length === 0) {
      await interaction.reply({
        content: `<@${hedefKullanici.id}> kullanıcısının hiç uyarısı yok.`,
        flags: MessageFlags.Ephemeral,
        ...PINGSIZ,
      });
      return;
    }

    const satirlar = uyarilar.slice(0, 15).map((u) => (
      `**#${u.id}** — ${etiketsiz(u.sebep)}\n`
      + `<@${u.moderator_id}> · ${zaman(u.zaman, 'R')}`
    ));

    const embed = gomu('uyari', `${hedefKullanici.tag ?? hedefKullanici.username} — ${uyarilar.length} uyarı`)
      .setDescription(satirlar.join('\n\n').slice(0, 4000));

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral, ...PINGSIZ });
    return;
  }

  if (alt === 'sil') {
    const id = interaction.options.getInteger('id');
    const silindi = uyariSil(db, guildId, id);

    await interaction.reply({
      content: silindi
        ? `Uyarı **#${id}** silindi.`
        : `**#${id}** numaralı uyarı bu sunucuda bulunamadı.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
