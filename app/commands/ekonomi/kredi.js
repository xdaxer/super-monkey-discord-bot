import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';

import { gomu, zaman } from '../../lib/bicim.js';
import { veritabani } from '../../lib/db.js';
import { bakiye, miktarAyristir, muz } from '../../lib/ekonomi.js';
import {
  aktifKredi, BORC_KESINTI_YUZDE, borcOzeti, CEZA_GUNLUK_YUZDE, CEZA_TAVAN_YUZDE, KREDI_MIN, KREDI_MIN_SEVIYE, krediAl, krediLimiti,
  krediOde, VADELER, vadeGetir, vadesiGelenleriIsle,
} from '../../lib/kredi.js';
import { kullaniciGetir } from '../../lib/seviye.js';

export const sistem = 'ekonomi';
export const modul = 'ekonomi';

export const data = new SlashCommandBuilder()
  .setName('kredi')
  .setDescription('Muz borcu al: vade sonunda faiziyle ödersin, geciktirirsen gelirinden kesilir.')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) => s
    .setName('al').setDescription('Kredi çeker (aynı anda tek kredi). Faiz vade sonunda bir kez eklenir.')
    .addStringOption((o) => o
      .setName('miktar').setDescription(`En az ${KREDI_MIN.toLocaleString('tr-TR')}: 5000, 20k (limitin /kredi durum'da)`)
      .setRequired(true).setMaxLength(20))
    .addStringOption((o) => o
      .setName('vade').setDescription('Ne kadar süre').setRequired(true)
      .addChoices(...VADELER.map((v) => ({ name: `${v.ad} — %${v.yuzde} faiz`, value: v.kimlik })))))
  .addSubcommand((s) => s
    .setName('ode').setDescription('Borcunu öder; vadeden önce ödersen yalnız geçen güne kadar faiz ödersin.')
    .addStringOption((o) => o
      .setName('miktar').setDescription('Ne kadar: 500, 2.5k, hepsi (boşsa hepsi)').setMaxLength(20)))
  .addSubcommand((s) => s
    .setName('durum').setDescription('Kredini, borcunu, vadeni ve limitini gösterir.'));

const gizli = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

async function al(interaction, db) {
  const { guildId } = interaction;
  const kullaniciId = interaction.user.id;
  const ayrisan = miktarAyristir(interaction.options.getString('miktar', true), bakiye(db, guildId, kullaniciId));
  if (!ayrisan.ok) {
    await gizli(interaction, ayrisan.sebep);
    return;
  }

  const vade = vadeGetir(interaction.options.getString('vade', true));
  const sonuc = krediAl(db, {
    guildId, kullaniciId, miktar: ayrisan.miktar, vade: vade.kimlik, seviye: kullaniciGetir(db, guildId, kullaniciId).seviye,
  });
  if (!sonuc.ok) {
    await gizli(interaction, sonuc.sebep);
    return;
  }

  const k = sonuc.kredi;
  const embed = gomu('basari', `🏦 Kredi #${k.id} verildi`)
    .setDescription(`**${muz(k.anapara)}** hesabına geçti.`)
    .addFields(
      { name: 'Faiz', value: `%${vade.yuzde} → +${muz(sonuc.faiz)}`, inline: true },
      { name: 'Vade sonunda ödenecek', value: `**${muz(k.anapara + sonuc.faiz)}**`, inline: true },
      { name: 'Vade', value: `${zaman(k.vade, 'R')} (${zaman(k.vade, 'f')})` },
    )
    .setFooter({
      text: `Vadesi geçerse cüzdanından tahsil edilir, kalanı borç olur: gelirinin %${BORC_KESINTI_YUZDE}'i borca gider, `
        + 'kumar ve muz gönderme kapanır.',
    });
  await interaction.reply({ embeds: [embed] });
}

async function ode(interaction, db) {
  const { guildId } = interaction;
  const kullaniciId = interaction.user.id;
  const metin = interaction.options.getString('miktar');
  let miktar = null;
  if (metin) {
    const ayrisan = miktarAyristir(metin, bakiye(db, guildId, kullaniciId));
    if (!ayrisan.ok) {
      await gizli(interaction, ayrisan.sebep);
      return;
    }
    // "hepsi" bakiyenin tamamıdır; borçtan fazlası krediOde'de kırpılır.
    miktar = ayrisan.miktar;
  }

  const sonuc = krediOde(db, { guildId, kullaniciId, miktar });
  if (!sonuc.ok) {
    await gizli(interaction, sonuc.sebep);
    return;
  }
  await gizli(
    interaction,
    sonuc.kapandi
      ? `🏦 ${muz(sonuc.odenen)} ödedin, borcun **kapandı**.`
      : `🏦 ${muz(sonuc.odenen)} ödedin. Kalan borç: **${muz(sonuc.kalan)}**.`,
  );
}

async function durum(interaction, db) {
  const { guildId } = interaction;
  const kullaniciId = interaction.user.id;
  // Vadesi gelmiş ama servis turunu beklemiş olan varsa önce o işlenir.
  vadesiGelenleriIsle(db, { guildId, kullaniciId });

  const limit = krediLimiti(kullaniciGetir(db, guildId, kullaniciId).seviye);
  const k = aktifKredi(db, guildId, kullaniciId);
  const oranlar = VADELER.map((v) => `${v.ad}: **%${v.yuzde}**`).join(' · ');

  const embed = gomu(k && k.vade <= Date.now() ? 'hata' : 'bilgi', '🏦 Kredi');
  if (k) {
    const o = borcOzeti(k);
    embed.setDescription(
      o.gecikmis
        ? `**Vadesi geçti.** Kalan borç: **${muz(o.kalan)}**`
        : `Kredi #${k.id} · ${muz(k.anapara)} · vade ${zaman(k.vade, 'R')}`,
    ).addFields(
      { name: 'Anapara', value: muz(o.anapara), inline: true },
      { name: o.gecikmis ? 'Faiz' : 'İşleyen faiz', value: muz(o.faiz), inline: true },
      ...(o.ceza > 0 ? [{ name: 'Gecikme cezası', value: muz(o.ceza), inline: true }] : []),
      { name: 'Ödenen', value: muz(o.odenen), inline: true },
      { name: o.gecikmis ? 'Kalan borç' : 'Şimdi ödersen', value: `**${muz(o.kalan)}**`, inline: true },
    );
  } else {
    embed.setDescription('_Açık kredin yok._ `/kredi al` ile çek.');
  }
  embed
    .addFields(
      { name: 'Limit', value: muz(limit), inline: true },
      { name: 'Faiz oranları', value: oranlar },
    )
    .setFooter({
      text: `Sv ${KREDI_MIN_SEVIYE}'ten itibaren. Limit: 5.000 + 2.000 × seviye (en çok 200.000). Gecikmede günde %${CEZA_GUNLUK_YUZDE} ceza `
        + `(en çok %${CEZA_TAVAN_YUZDE}); gelirinin %${BORC_KESINTI_YUZDE}'i borca gider.`,
    });
  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

export async function execute(interaction) {
  const db = veritabani();
  const islemler = { al, ode, durum };
  await islemler[interaction.options.getSubcommand()](interaction, db);
}
