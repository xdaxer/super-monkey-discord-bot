import { InteractionContextType, SlashCommandBuilder } from 'discord.js';

import { gomu, PINGSIZ } from '../../lib/bicim.js';
import { davetEdeni, davetSayisi, davetSiralamasi } from '../../lib/davet.js';
import { veritabani } from '../../lib/db.js';

export const sistem = 'davet';

/** Sıralamada gösterilen kişi sayısı. */
export const SIRALAMA_ADEDI = 10;

export const data = new SlashCommandBuilder()
  .setName('davet')
  .setDescription('Davet sayılarını gösterir.')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) => s
    .setName('bilgi').setDescription('Kendi veya bir üyenin davet sayısını ve onu kimin davet ettiğini gösterir.')
    .addUserOption((o) => o.setName('uye').setDescription('Kimin davetleri (boşsa kendin)')))
  .addSubcommand((s) => s
    .setName('siralama').setDescription(`En çok davet eden ${SIRALAMA_ADEDI} üyeyi gösterir.`));

/** "Kim davet etti" satırı: kayıt yoksa ya da davet eden bulunamadıysa açıkça söyler. */
export function davetEdenSatiri(kayit) {
  if (!kayit) return '_kayıt yok_';
  if (kayit.davet_eden_id) return `<@${kayit.davet_eden_id}>`;
  if (kayit.davet_eden_ad) return `**${kayit.davet_eden_ad}**`;
  return '_bulunamadı_';
}

export async function execute(interaction) {
  const db = veritabani();
  const guildId = interaction.guildId;

  if (interaction.options.getSubcommand() === 'bilgi') {
    const hedef = interaction.options.getUser('uye') ?? interaction.user;
    const sayi = davetSayisi(db, guildId, hedef.id);

    const embed = gomu('bilgi', `${hedef.username} — davetler`)
      .setThumbnail(hedef.displayAvatarURL?.() ?? null)
      .addFields(
        { name: 'Toplam davet', value: `**${sayi.toplam}**`, inline: true },
        { name: 'Ayrılan', value: String(sayi.ayrilan), inline: true },
        { name: 'Davet eden', value: davetEdenSatiri(davetEdeni(db, guildId, hedef.id)), inline: true },
      );
    if (sayi.devralinan > 0) {
      embed.setFooter({ text: `${sayi.devralinan} davet InviteManager'dan devralındı, ${sayi.yeni} yeni.` });
    }

    await interaction.reply({ embeds: [embed], ...PINGSIZ });
    return;
  }

  const liste = davetSiralamasi(db, guildId, SIRALAMA_ADEDI);
  if (liste.length === 0) {
    await interaction.reply({ content: 'Henüz kayıtlı davet yok.' });
    return;
  }

  const satirlar = liste.map((s, i) => `**${i + 1}.** <@${s.kullanici_id}> — ${s.toplam} davet`);
  await interaction.reply({ embeds: [gomu('bilgi', 'Davet sıralaması', satirlar.join('\n'))], ...PINGSIZ });
}
