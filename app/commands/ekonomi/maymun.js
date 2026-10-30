import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';

import { gomu, sureBicimle, zaman } from '../../lib/bicim.js';
import { veritabani } from '../../lib/db.js';
import { muz } from '../../lib/ekonomi.js';
import { kilitliEsya, seferdekiler } from '../../lib/envanter.js';
import { esyaGetir } from '../../lib/esyalar.js';
import { emojiCozucu } from '../../lib/kasa-bilesen.js';
import {
  maymunBilgisi, maymunlar, maymunYukselt, sonrakiYukseltme, yolAciklamasi, YOLLAR,
} from '../../lib/maymun.js';
import {
  SEFERLER, seferGeri, seferGetir, seferGonder, sefereHazirAdet, seferListesi, seferSlotu, seferTahmini, seferTopla,
  sonrakiSlotSeviyesi,
} from '../../lib/sefer.js';
import { kullaniciGetir } from '../../lib/seviye.js';

export const sistem = 'ekonomi';
export const modul = 'ekonomi';

const SECENEK_SINIRI = 25;
const LISTE_SINIRI = 15;

export const data = new SlashCommandBuilder()
  .setName('maymun')
  .setDescription('Maymunlarını yükselt ve sefere gönder.')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) => s
    .setName('liste').setDescription('Maymunların, seviyeleri, yolları ve seferlerin.'))
  .addSubcommand((s) => s
    .setName('yukselt').setDescription('Maymunun yükseltme yollarını gör ya da bir yolu bir kademe yükselt (BTD6 gibi 5-2-0).')
    .addStringOption((o) => o.setName('maymun').setDescription('Yükseltilecek maymun').setRequired(true).setAutocomplete(true))
    .addStringOption((o) => o.setName('yol').setDescription('Boş bırakırsan yollar gösterilir')
      .addChoices(...YOLLAR.map((y, i) => ({ name: `${y.emoji} ${y.ad}`, value: String(i) })))))
  .addSubcommand((s) => s
    .setName('sefer').setDescription('Maymunu sefere gönder: dönünce muz, XP ve belki kasa getirir.')
    .addStringOption((o) => o.setName('maymun').setDescription('Gönderilecek maymun').setRequired(true).setAutocomplete(true))
    .addStringOption((o) => o.setName('sure').setDescription('Sefer süresi').setRequired(true)
      .addChoices(...SEFERLER.map((s) => ({ name: `${s.emoji} ${s.ad} (${s.saat} saat)`, value: s.kimlik })))))
  .addSubcommand((s) => s
    .setName('topla').setDescription('Dönen seferlerin ödüllerini topla.'))
  .addSubcommand((s) => s
    .setName('geri').setDescription('Seferdeki maymunu ödülsüz geri çağır.')
    .addStringOption((o) => o.setName('sefer').setDescription('Geri çağrılacak sefer').setRequired(true).setAutocomplete(true)));

const yuzde = (oran) => `%${(oran * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;
const gizli = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

function kimlikleri(interaction) {
  return { guildId: interaction.guildId, kullaniciId: interaction.user.id };
}

/** Bir yolun kademe çubuğu: "💰 Kazanç ■■□□□". */
function yolCubugu(yol, kademe) {
  return `${yol.emoji} ${yol.ad} ${'■'.repeat(kademe)}${'□'.repeat(5 - kademe)}`;
}

async function liste(interaction) {
  const db = veritabani();
  const { guildId, kullaniciId } = kimlikleri(interaction);
  const emoji = emojiCozucu(interaction.guild);
  const calisan = kilitliEsya(db, guildId, kullaniciId);
  const seferde = seferdekiler(db, guildId, kullaniciId);
  const hepsi = maymunlar(db, guildId, kullaniciId);
  const seviye = kullaniciGetir(db, guildId, kullaniciId).seviye;
  const seferler = seferListesi(db, guildId, kullaniciId);

  const satirlar = hepsi.slice(0, LISTE_SINIRI).map((m) => {
    const durum = [m.kimlik === calisan ? '🛠️ çalışıyor' : null, seferde[m.kimlik] ? '🧭 seferde' : null].filter(Boolean).join(', ');
    return `${emoji(m.kart)} **${m.kart.ad}** ×${m.adet} · Sv ${m.seviye} · direnç ${yuzde(m.direnc)} · yollar ${m.yollar.join('-')}${durum ? ` · ${durum}` : ''}`;
  });
  if (hepsi.length > LISTE_SINIRI) satirlar.push(`… ve ${hepsi.length - LISTE_SINIRI} maymun daha`);

  const slot = seferSlotu(seviye);
  const sonraki = sonrakiSlotSeviyesi(seviye);
  const seferSatirlari = seferler.map((s) => `${s.sefer.emoji} ${emoji(s.kart)} **${s.kart.ad}** · ${s.sefer.ad} · `
    + `${muz(s.muz)} + ${s.xp} XP · ${s.hazir ? '✅ döndü' : zaman(s.bitis, 'R')}`);

  const embed = gomu('bilgi', '🐒 Maymunların')
    .setDescription(satirlar.length > 0
      ? satirlar.join('\n')
      : 'Hiç maymunun yok. Kasalardan kule ve kahraman kartları çıkar (`/kasa ac`).')
    .addFields({
      name: `🧭 Seferler (${seferler.length}/${slot})`,
      value: [
        ...(seferSatirlari.length > 0 ? seferSatirlari : ['Seferde maymunun yok. `/maymun sefer` ile gönder.']),
        sonraki ? `Sv ${sonraki}'te bir sefer yeri daha açılır.` : null,
      ].filter(Boolean).join('\n'),
    })
    .setFooter({ text: '/maymun yukselt: yollar · /maymun sefer: sefere gönder · /maymun topla: dönenleri al' });
  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

/** Yükseltme paneli: üç yolun durumu ve sonraki kademeleri. */
function yukseltmeGomusu(emoji, m) {
  const alanlar = YOLLAR.map((yol, i) => {
    const sonraki = sonrakiYukseltme(m.yollar, i, m.seviye);
    const simdi = m.yollar[i] > 0 ? `Şu an: ${yolAciklamasi(i, m.yollar[i])}` : 'Henüz yükseltilmedi.';
    let ileri;
    if (sonraki.engel === 'tavan') ileri = '🌟 En üst kademede.';
    else if (sonraki.engel === 'capraz') ileri = '🔒 Kapalı (bir yol 5, ikincisi en çok 2, üçüncüsü 0).';
    else {
      ileri = `Sonraki (${sonraki.kademe}): ${yolAciklamasi(i, sonraki.kademe)} · ${muz(sonraki.bedel)}`
        + (sonraki.engel === 'seviye' ? ` · 🔒 Maymun Sv ${sonraki.seviye} olmalı` : '');
    }
    return { name: yolCubugu(yol, m.yollar[i]), value: `${simdi}\n${ileri}` };
  });
  return gomu('bilgi', `${emoji(m.kart)} ${m.kart.ad} · ${m.yollar.join('-')}`)
    .setDescription(`Sv ${m.seviye} (${m.mevcut}/${m.gereken} XP) · direnç ${yuzde(m.direnc)}\n`
      + 'BTD6 gibi: bir yol 5. kademeye, ikinci yol en çok 2. kademeye çıkar, üçüncü yol kapalı kalır.')
    .addFields(alanlar);
}

async function yukselt(interaction) {
  const db = veritabani();
  const kimlik = interaction.options.getString('maymun', true);
  const yol = interaction.options.getString('yol');
  const emoji = emojiCozucu(interaction.guild);
  const { guildId, kullaniciId } = kimlikleri(interaction);

  if (yol === null) {
    const m = maymunlar(db, guildId, kullaniciId).find((x) => x.kimlik === kimlik);
    if (!m) {
      await gizli(interaction, 'Envanterinde böyle bir maymun yok.');
      return;
    }
    await interaction.reply({ embeds: [yukseltmeGomusu(emoji, m)], flags: MessageFlags.Ephemeral });
    return;
  }

  const sonuc = maymunYukselt(db, {
    guildId, kullaniciId, kimlik, yol: Number(yol),
  });
  if (!sonuc.ok) {
    await gizli(interaction, sonuc.sebep);
    return;
  }
  const y = YOLLAR[sonuc.yol];
  await interaction.reply({
    content: `⬆️ ${emoji(sonuc.maymun.kart)} **${sonuc.maymun.kart.ad}** ${y.emoji} **${y.ad} ${sonuc.kademe}** oldu `
      + `(${sonuc.maymun.yollar.join('-')}): ${yolAciklamasi(sonuc.yol, sonuc.kademe)}. Ödenen ${muz(sonuc.bedel)} · kalan ${muz(sonuc.bakiye)}.`,
    allowedMentions: { parse: [] },
  });
}

async function sefer(interaction) {
  const db = veritabani();
  const sonuc = seferGonder(db, {
    ...kimlikleri(interaction),
    kimlik: interaction.options.getString('maymun', true),
    sure: interaction.options.getString('sure', true),
  });
  if (!sonuc.ok) {
    await gizli(interaction, sonuc.sebep);
    return;
  }
  const emoji = emojiCozucu(interaction.guild);
  await interaction.reply({
    content: `${sonuc.sefer.emoji} ${emoji(sonuc.maymun.kart)} **${sonuc.maymun.kart.ad}** ${sonuc.sefer.ad.toLocaleLowerCase('tr-TR')} için yola çıktı. `
      + `${zaman(sonuc.bitis, 'R')} döner ve **${muz(sonuc.muz)}** + **${sonuc.xp} XP** getirir (prestij ve üyelik çarpanların toplarken eklenir). `
      + 'Dönünce `/maymun topla`.',
    flags: MessageFlags.Ephemeral,
  });
}

async function topla(interaction) {
  const db = veritabani();
  const sonuc = seferTopla(db, kimlikleri(interaction));
  if (!sonuc.ok) {
    const sonraki = seferListesi(db, interaction.guildId, interaction.user.id)[0];
    await gizli(interaction, sonraki
      ? `${sonuc.sebep} İlk dönecek: **${sonraki.kart.ad}**, ${sureBicimle(sonraki.kalanMs)} sonra.`
      : `${sonuc.sebep} \`/maymun sefer\` ile bir maymun gönder.`);
    return;
  }
  const emoji = emojiCozucu(interaction.guild);
  const satirlar = sonuc.toplanan.map((s) => {
    const parca = [`${s.sefer.emoji} ${emoji(s.kart)} **${s.kart.ad}**: +${muz(s.muz)}, +${s.xp} XP`];
    if (s.seviyeAtladi) parca.push(`⬆️ Sv ${s.seviye}`);
    if (s.kasa) parca.push(`🎁 ${esyaGetir(s.kasa).ad}`);
    return parca.join(' · ');
  });
  const embed = gomu('basari', '🧭 Seferler döndü')
    .setDescription([...satirlar, '', `Toplam **+${muz(sonuc.toplamMuz)}** · bakiye ${muz(sonuc.bakiye)}`].join('\n'));
  await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
}

async function geri(interaction) {
  const sonuc = seferGeri(veritabani(), { ...kimlikleri(interaction), id: Number(interaction.options.getString('sefer', true)) });
  await gizli(interaction, sonuc.ok ? `**${sonuc.kart.ad}** seferden ödülsüz geri döndü; artık serbest.` : sonuc.sebep);
}

export async function autocomplete(interaction) {
  const db = veritabani();
  const { guildId, kullaniciId } = kimlikleri(interaction);
  const aranan = interaction.options.getFocused().toLocaleLowerCase('tr-TR');
  const alt = interaction.options.getSubcommand();
  let secenekler;

  if (alt === 'geri') {
    secenekler = seferListesi(db, guildId, kullaniciId).map((s) => ({
      name: `${s.kart.ad} · ${s.sefer.ad}${s.hazir ? ' (döndü)' : ` (${sureBicimle(s.kalanMs)} kaldı)`}`,
      value: String(s.id),
    }));
  } else {
    const sure = seferGetir(interaction.options.getString('sure')) ?? SEFERLER[0];
    secenekler = maymunlar(db, guildId, kullaniciId)
      .filter((m) => alt !== 'sefer' || sefereHazirAdet(db, guildId, kullaniciId, m.kimlik) > 0)
      .map((m) => {
        const ek = alt === 'sefer'
          ? `${seferTahmini(maymunBilgisi(db, guildId, kullaniciId, m.kimlik), sure).muz} muz (${sure.saat} sa)`
          : `yollar ${m.yollar.join('-')}`;
        return { name: `${m.kart.ad} · Sv ${m.seviye} · ${ek}`, value: m.kimlik };
      });
  }
  await interaction.respond(secenekler
    .filter((s) => !aranan || s.name.toLocaleLowerCase('tr-TR').includes(aranan))
    .slice(0, SECENEK_SINIRI));
}

const ALT_KOMUTLAR = {
  liste, yukselt, sefer, topla, geri,
};

export async function execute(interaction) {
  return ALT_KOMUTLAR[interaction.options.getSubcommand()](interaction);
}
