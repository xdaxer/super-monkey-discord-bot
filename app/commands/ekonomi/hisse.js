import {
  AttachmentBuilder, InteractionContextType, MessageFlags, SlashCommandBuilder,
} from 'discord.js';

import { gomu } from '../../lib/bicim.js';
import { veritabani } from '../../lib/db.js';
import { bakiye, miktarAyristir, muz } from '../../lib/ekonomi.js';
import {
  al, fiyatGecmisi, guncelle, GRAFIK_SAATI, ISLEM_BEKLEME_MS, KISI_BASI_ADET, KOMISYON_YUZDE, liste, portfoy,
  pozisyon, sat, sirketBul, SIRKETLER,
} from '../../lib/hisse.js';
import { fiyatGrafigi, metinOzeti, piyasaPanosu } from '../../lib/hisse-grafik.js';
import { emojiCozucu } from '../../lib/kasa-bilesen.js';

export const sistem = 'ekonomi';
export const modul = 'ekonomi';

const secenekler = SIRKETLER.map((s) => ({ name: `${s.sembol} — ${s.ad}`, value: s.sembol }));
const sembolSecenegi = (o) => o.setName('sembol').setDescription('Şirket').setRequired(true).addChoices(...secenekler);

export const data = new SlashCommandBuilder()
  .setName('hisse')
  .setDescription('Hisse piyasası: fiyatlar 5 dakikada bir değişir, al-sat yap.')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) => s.setName('liste').setDescription('Şirketleri, güncel fiyatları ve 24 saatlik değişimi gösterir.'))
  .addSubcommand((s) => s
    .setName('al').setDescription(`Hisse al (%${KOMISYON_YUZDE} komisyon, şirket başına en çok ${KISI_BASI_ADET.toLocaleString('tr-TR')} adet).`)
    .addStringOption(sembolSecenegi)
    .addIntegerOption((o) => o.setName('adet').setDescription('Kaç hisse').setMinValue(1).setMaxValue(KISI_BASI_ADET))
    .addStringOption((o) => o
      .setName('tutar').setDescription('Ya da ne kadar muzla alınsın (komisyon dahil): 5000, 2k, yarı, hepsi').setMaxLength(20)))
  .addSubcommand((s) => s
    .setName('sat').setDescription(`Hisse sat (%${KOMISYON_YUZDE} komisyon).`)
    .addStringOption(sembolSecenegi)
    .addStringOption((o) => o
      .setName('adet').setDescription('Kaç hisse: 50, 1k, yarı, hepsi').setRequired(true).setMaxLength(20)))
  .addSubcommand((s) => s
    .setName('portfoy').setDescription('Hisselerini, ortalama maliyetini ve kâr/zararını gösterir.')
    .addUserOption((o) => o.setName('uye').setDescription('Kimin portföyü (boşsa kendin)')))
  .addSubcommand((s) => s
    .setName('grafik').setDescription(`Bir şirketin son ${GRAFIK_SAATI} saatlik fiyat grafiği.`)
    .addStringOption(sembolSecenegi));

const gizli = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
const yuzde = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')}%`;
const oklu = (v) => (v === null ? '—' : `${v >= 0 ? '↑' : '↓'} ${yuzde(v)}`);
const isaretli = (v) => `${v >= 0 ? '+' : '−'}${muz(Math.abs(v))}`;

/** Şirket ikonları (sunucu emojisi PNG'si) bellekte tutulur; inemeyen null. */
const ikonOnbellegi = new Map();

/** Şirketin sunucu emojisini PNG olarak döndüren fonksiyon (pano ve grafik için). */
function sirketIkonu(guild) {
  return async (sirket) => {
    const emoji = guild?.emojis?.cache?.find((e) => e.name === sirket.emojiAdi);
    if (!emoji) return null;
    const url = emoji.imageURL({ extension: 'png', size: 64 });
    if (ikonOnbellegi.has(url)) return ikonOnbellegi.get(url);
    try {
      const yanit = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (!yanit.ok) return null;
      const veri = Buffer.from(await yanit.arrayBuffer());
      ikonOnbellegi.set(url, veri);
      return veri;
    } catch {
      return null;
    }
  };
}

const saatMetni = (ms) => new Date(ms).toLocaleString('tr-TR', {
  timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short',
});

async function listeKomutu(interaction, db) {
  const guildId = interaction.guildId;
  guncelle(db, { guildId });
  // Resim üretimi ve ikon indirme 3 sn'yi geçebilir.
  await interaction.deferReply();
  const satirlar = liste(db, guildId).map((s) => ({ ...s, noktalar: fiyatGecmisi(db, guildId, s.sirket.sembol) }));
  const png = await piyasaPanosu({
    satirlar,
    ikon: sirketIkonu(interaction.guild),
    altYazi: `Fiyatlar 5 dakikada bir değişir · ${saatMetni(Date.now())}`,
  });
  if (png) {
    await interaction.editReply({
      content: `-# %${KOMISYON_YUZDE} komisyon · \`/hisse al\` · \`/hisse sat\` · \`/hisse grafik\``,
      files: [new AttachmentBuilder(png, { name: 'borsa.png' })],
    });
    return;
  }

  // Görsel üretilemezse yazılı liste.
  const emoji = emojiCozucu(interaction.guild);
  const yaziliSatirlar = satirlar.map(({ sirket, fiyat, degisimYuzde }) => (
    `${emoji(sirket)} **${sirket.sembol}** · ${sirket.ad}\n　${muz(fiyat)} · 24 sa ${oklu(degisimYuzde)}`));
  const embed = gomu('bilgi', '📊 Hisse piyasası')
    .setDescription(yaziliSatirlar.join('\n'))
    .setFooter({ text: `Fiyatlar 5 dakikada bir değişir · %${KOMISYON_YUZDE} komisyon · /hisse al, /hisse sat` });
  await interaction.editReply({ embeds: [embed] });
}

async function alKomutu(interaction, db) {
  const { guildId } = interaction;
  const kullaniciId = interaction.user.id;
  const adet = interaction.options.getInteger('adet');
  const tutarMetni = interaction.options.getString('tutar');
  if ((adet === null) === (tutarMetni === null)) {
    await gizli(interaction, 'Ya `adet` ya da `tutar` yaz (ikisi birden olmaz).');
    return;
  }
  let tutar = null;
  if (tutarMetni !== null) {
    const ayrisan = miktarAyristir(tutarMetni, bakiye(db, guildId, kullaniciId));
    if (!ayrisan.ok) {
      await gizli(interaction, ayrisan.sebep);
      return;
    }
    tutar = ayrisan.miktar;
  }

  const sonuc = al(db, {
    guildId, kullaniciId, sembol: interaction.options.getString('sembol', true), adet, tutar,
  });
  if (!sonuc.ok) {
    await gizli(interaction, sonuc.sebep);
    return;
  }
  const emoji = emojiCozucu(interaction.guild);
  await interaction.reply({
    embeds: [gomu('basari', `${emoji(sonuc.sirket)} ${sonuc.sirket.sembol} alındı`)
      .setDescription(
        `**${sonuc.adet.toLocaleString('tr-TR')}** hisse × ${muz(sonuc.fiyat)}\n`
        + `Komisyon: ${muz(sonuc.komisyon)} · Ödenen: **${muz(sonuc.toplam)}**`,
      )
      .setFooter({ text: `Yeni bakiye: ${sonuc.bakiye.toLocaleString('tr-TR')} muz · ${ISLEM_BEKLEME_MS / 1000} sn sonra yeniden işlem yapabilirsin` })],
  });
}

async function satKomutu(interaction, db) {
  const { guildId } = interaction;
  const kullaniciId = interaction.user.id;
  const sembol = interaction.options.getString('sembol', true);
  const sirket = sirketBul(sembol);
  const sahip = pozisyon(db, guildId, kullaniciId, sirket.sembol).adet;
  const ayrisan = miktarAyristir(interaction.options.getString('adet', true), sahip);
  if (!ayrisan.ok) {
    await gizli(interaction, ayrisan.sebep);
    return;
  }
  const sonuc = sat(db, { guildId, kullaniciId, sembol, adet: ayrisan.miktar });
  if (!sonuc.ok) {
    await gizli(interaction, sonuc.sebep);
    return;
  }
  const emoji = emojiCozucu(interaction.guild);
  await interaction.reply({
    embeds: [gomu(sonuc.kar >= 0 ? 'basari' : 'uyari', `${emoji(sirket)} ${sirket.sembol} satıldı`)
      .setDescription(
        `**${sonuc.adet.toLocaleString('tr-TR')}** hisse × ${muz(sonuc.fiyat)}\n`
        + `Komisyon: ${muz(sonuc.komisyon)} · Gelen: **${muz(sonuc.gelir)}**\n`
        + `Kâr/zarar: **${isaretli(sonuc.kar)}** (maliyetin ${muz(sonuc.maliyet)})`,
      )
      .setFooter({ text: `Yeni bakiye: ${sonuc.bakiye.toLocaleString('tr-TR')} muz` })],
  });
}

async function portfoyKomutu(interaction, db) {
  const { guildId } = interaction;
  const hedef = interaction.options.getUser('uye') ?? interaction.user;
  guncelle(db, { guildId });
  const p = portfoy(db, guildId, hedef.id);
  const kendi = hedef.id === interaction.user.id;
  if (p.pozisyonlar.length === 0) {
    await gizli(interaction, kendi ? 'Portföyün boş. `/hisse liste` ile şirketlere bak.' : `${hedef.displayName ?? hedef.username} hiç hisse tutmuyor.`);
    return;
  }
  const emoji = emojiCozucu(interaction.guild);
  const satirlar = p.pozisyonlar.map((x) => (
    `${emoji(x.sirket)} **${x.sirket.sembol}** · ${x.adet.toLocaleString('tr-TR')} adet\n`
    + `　ort. maliyet ${muz(Math.round(x.ortalama))} · fiyat ${muz(x.fiyat)} · değer ${muz(x.deger)}\n`
    + `　kâr/zarar **${isaretli(x.kar)}**`));
  const embed = gomu(p.toplamKar >= 0 ? 'basari' : 'uyari', `💼 ${hedef.displayName ?? hedef.username} — hisse portföyü`)
    .setDescription(satirlar.join('\n'))
    .addFields(
      { name: 'Toplam değer', value: muz(p.toplamDeger), inline: true },
      { name: 'Toplam maliyet', value: muz(p.toplamMaliyet), inline: true },
      { name: 'Kâr/zarar', value: `**${isaretli(p.toplamKar)}**`, inline: true },
    )
    .setFooter({ text: `Kâr/zarar, hepsi şimdi satılsaydı (%${KOMISYON_YUZDE} satış komisyonu düşülmüş) hesaplanır.` });
  await interaction.reply({ embeds: [embed], ...(kendi ? { flags: MessageFlags.Ephemeral } : {}), allowedMentions: { parse: [] } });
}

async function grafikKomutu(interaction, db) {
  const { guildId } = interaction;
  const sirket = sirketBul(interaction.options.getString('sembol', true));
  guncelle(db, { guildId });
  const noktalar = fiyatGecmisi(db, guildId, sirket.sembol);
  await interaction.deferReply();
  const ikon = await sirketIkonu(interaction.guild)(sirket);
  const png = await fiyatGrafigi({ sirket, noktalar, ikon });
  if (!png) {
    await interaction.editReply({ content: metinOzeti(sirket, noktalar) });
    return;
  }
  await interaction.editReply({ files: [new AttachmentBuilder(png, { name: `${sirket.sembol}.png` })] });
}

export async function execute(interaction) {
  const db = veritabani();
  const islemler = {
    liste: listeKomutu, al: alKomutu, sat: satKomutu, portfoy: portfoyKomutu, grafik: grafikKomutu,
  };
  await islemler[interaction.options.getSubcommand()](interaction, db);
}
