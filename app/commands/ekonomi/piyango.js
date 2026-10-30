import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';

import { gomu, zaman } from '../../lib/bicim.js';
import { veritabani } from '../../lib/db.js';
import { muz } from '../../lib/ekonomi.js';
import {
  BILET_FIYATI, biletAl, biletSayim, havuzDurumu, HAVUZ_YUZDE, kazanmaOlasiligi, KISI_BASI_BILET, sonKazanan, sonrakiCekilis, TABAN_IKRAMIYE,
} from '../../lib/piyango.js';

export const sistem = 'ekonomi';
export const modul = 'ekonomi';

export const data = new SlashCommandBuilder()
  .setName('piyango')
  .setDescription('Haftalık muz piyangosu: bilet al, Pazar 21:00 çekilişine gir.')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) => s
    .setName('bilet').setDescription(`Bilet al (tanesi ${BILET_FIYATI} muz, kişi başı haftada en çok ${KISI_BASI_BILET}).`)
    .addIntegerOption((o) => o
      .setName('adet').setDescription('Kaç bilet (varsayılan 1)').setMinValue(1).setMaxValue(KISI_BASI_BILET)))
  .addSubcommand((s) => s
    .setName('durum').setDescription('Havuzu, biletlerini, kazanma olasılığını ve çekiliş zamanını gösterir.'));

const gizli = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

async function bilet(interaction, db) {
  const adet = interaction.options.getInteger('adet') ?? 1;
  const sonuc = biletAl(db, { guildId: interaction.guildId, kullaniciId: interaction.user.id, adet });
  if (!sonuc.ok) {
    await gizli(interaction, sonuc.sebep);
    return;
  }
  const d = havuzDurumu(db, interaction.guildId, sonuc.cekilis);
  await gizli(
    interaction,
    `🎟️ ${sonuc.adet} bilet aldın (${muz(sonuc.tutar)}). Bu hafta toplam **${sonuc.sahip}** biletin var; `
    + `havuz şimdi **${muz(d.havuz)}**. Çekiliş ${zaman(sonuc.cekilis, 'R')}.`,
  );
}

async function durum(interaction, db) {
  const guildId = interaction.guildId;
  const cekilis = sonrakiCekilis();
  const d = havuzDurumu(db, guildId, cekilis);
  const benim = biletSayim(db, guildId, interaction.user.id, cekilis);
  const olasilik = kazanmaOlasiligi(db, guildId, interaction.user.id, cekilis)
    .toLocaleString('tr-TR', { maximumFractionDigits: 1 });

  const son = sonKazanan(db, guildId);
  const embed = gomu('bilgi', '🎟️ Haftalık piyango')
    .addFields(
      { name: 'Havuz', value: `**${muz(d.havuz)}**`, inline: true },
      { name: 'Toplam bilet', value: String(d.toplam), inline: true },
      { name: 'Senin biletin', value: `${benim} / ${KISI_BASI_BILET}`, inline: true },
      { name: 'Kazanma olasılığın', value: `%${olasilik}`, inline: true },
      { name: 'Çekiliş', value: `${zaman(cekilis, 'R')} (${zaman(cekilis, 'f')})`, inline: true },
      {
        name: 'Geçen haftanın kazananı',
        value: son ? `<@${son.kazanan_id}> — ${muz(son.havuz)}` : '_Henüz kazanan yok._',
      },
    )
    .setFooter({
      text: `Bilet ${BILET_FIYATI} muz. Havuz: gelirin %${HAVUZ_YUZDE}'ı + ${TABAN_IKRAMIYE.toLocaleString('tr-TR')} taban. Her Pazar 21:00.`,
    });
  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
}

export async function execute(interaction) {
  const db = veritabani();
  const islemler = { bilet, durum };
  await islemler[interaction.options.getSubcommand()](interaction, db);
}
