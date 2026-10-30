import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';

import {
  AKTIF_SINIRI, aktifMevduatlar, boz, ERKEN_CEZA_YUZDE, faizHesapla, kilitliToplam, MEVDUAT_MIN, mevduatTavani,
  TAVAN_MAKS, TAVAN_SEVIYE_BASINA, TAVAN_TABAN, VADELER, vadeGetir, vadesiGelenleriOde, yatir,
} from '../../lib/banka.js';
import { gomu, zaman } from '../../lib/bicim.js';
import { veritabani } from '../../lib/db.js';
import { bakiye, miktarAyristir, muz } from '../../lib/ekonomi.js';
import { kullaniciGetir } from '../../lib/seviye.js';

const sayi = (n) => n.toLocaleString('tr-TR');

export const sistem = 'ekonomi';
export const modul = 'ekonomi';

export const data = new SlashCommandBuilder()
  .setName('banka')
  .setDescription('Vadeli mevduat: muzunu kilitle, vade dolunca faiziyle geri al.')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) => s
    .setName('yatir').setDescription('Muzu seçtiğin süre boyunca kilitler; vade sonunda faiziyle döner.')
    .addStringOption((o) => o
      .setName('miktar').setDescription(`En az ${MEVDUAT_MIN.toLocaleString('tr-TR')}: 5000, 20k, yarı, hepsi`)
      .setRequired(true).setMaxLength(20))
    .addStringOption((o) => o
      .setName('vade').setDescription('Ne kadar süre').setRequired(true)
      .addChoices(...VADELER.map((v) => ({ name: `${v.ad} — %${v.yuzde} faiz`, value: v.kimlik })))))
  .addSubcommand((s) => s
    .setName('durum').setDescription('Mevduatlarını, vade tarihlerini ve kalan tavanını gösterir.'))
  .addSubcommand((s) => s
    .setName('boz').setDescription(`Mevduatı erken kapatır: faiz yok, anaparadan %${ERKEN_CEZA_YUZDE} ceza.`)
    .addIntegerOption((o) => o.setName('no').setDescription('Mevduat numarası (/banka durum)').setRequired(true).setMinValue(1)));

const gizli = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

async function yatirKomutu(interaction, db) {
  const guildId = interaction.guildId;
  const kullaniciId = interaction.user.id;
  const ayrisan = miktarAyristir(interaction.options.getString('miktar', true), bakiye(db, guildId, kullaniciId));
  if (!ayrisan.ok) {
    await gizli(interaction, ayrisan.sebep);
    return;
  }

  const vade = vadeGetir(interaction.options.getString('vade', true));
  const sonuc = yatir(db, {
    guildId, kullaniciId, miktar: ayrisan.miktar, vade: vade.kimlik, seviye: kullaniciGetir(db, guildId, kullaniciId).seviye,
  });
  if (!sonuc.ok) {
    await gizli(interaction, sonuc.sebep);
    return;
  }

  const m = sonuc.mevduat;
  const embed = gomu('basari', `🏦 Mevduat #${m.id} açıldı`)
    .setDescription(`**${muz(m.anapara)}** ${vade.ad} boyunca kilitlendi.`)
    .addFields(
      { name: 'Faiz', value: `%${vade.yuzde} → +${muz(sonuc.faiz)}`, inline: true },
      { name: 'Vade sonunda', value: `**${muz(m.anapara + sonuc.faiz)}**`, inline: true },
      { name: 'Vade', value: `${zaman(m.vade, 'R')} (${zaman(m.vade, 'f')})` },
    )
    .setFooter({ text: `Vade dolunca kendiliğinden hesabına geçer. Erken bozarsan faiz yok, %${ERKEN_CEZA_YUZDE} ceza.` });
  await interaction.reply({ embeds: [embed] });
}

async function durum(interaction, db) {
  const guildId = interaction.guildId;
  const kullaniciId = interaction.user.id;
  // Vadesi dolmuş ama servis turunu beklemiş olan varsa önce o ödenir.
  const odenen = vadesiGelenleriOde(db, { guildId, kullaniciId });

  const aktif = aktifMevduatlar(db, guildId, kullaniciId);
  const tavan = mevduatTavani(kullaniciGetir(db, guildId, kullaniciId).seviye);
  const kilitli = kilitliToplam(db, guildId, kullaniciId);

  const satirlar = aktif.map((m) => {
    const faiz = faizHesapla(m.anapara, m.faiz_yuzde);
    return `**#${m.id}** · ${muz(m.anapara)} → **${muz(m.anapara + faiz)}** (%${m.faiz_yuzde}) · ${zaman(m.vade, 'R')}`;
  });

  const embed = gomu('bilgi', '🏦 Banka')
    .setDescription(satirlar.length > 0 ? satirlar.join('\n') : '_Aktif mevduatın yok._ `/banka yatir` ile aç.')
    .addFields(
      { name: 'Kilitli', value: `${muz(kilitli)} / ${muz(tavan)}`, inline: true },
      { name: 'Mevduat', value: `${aktif.length} / ${AKTIF_SINIRI}`, inline: true },
      { name: 'Faiz oranları', value: VADELER.map((v) => `${v.ad}: **%${v.yuzde}**`).join(' · ') },
    )
    .setFooter({ text: `Kilitlenebilecek tavan seviyeyle artar: ${sayi(TAVAN_TABAN)} + ${sayi(TAVAN_SEVIYE_BASINA)} × seviye (en çok ${sayi(TAVAN_MAKS)}).` });
  if (odenen.length > 0) {
    embed.addFields({
      name: 'Az önce ödendi',
      value: odenen.map((o) => `#${o.id}: ${muz(o.anapara)} + ${muz(o.faiz)} faiz`).join('\n'),
    });
  }
  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function bozKomutu(interaction, db) {
  const sonuc = boz(db, { guildId: interaction.guildId, kullaniciId: interaction.user.id, id: interaction.options.getInteger('no', true) });
  if (!sonuc.ok) {
    await gizli(interaction, sonuc.sebep);
    return;
  }
  await gizli(interaction, `🏦 Mevduat bozuldu: ${muz(sonuc.iade)} hesabına geçti (${muz(sonuc.ceza)} erken bozma cezası, faiz yok).`);
}

export async function execute(interaction) {
  const db = veritabani();
  const islemler = { yatir: yatirKomutu, durum, boz: bozKomutu };
  await islemler[interaction.options.getSubcommand()](interaction, db);
}
