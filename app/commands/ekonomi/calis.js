import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';

import { gomu, sureBicimle } from '../../lib/bicim.js';
import { olayButonlari } from '../../lib/calis-bilesen.js';
import { veritabani } from '../../lib/db.js';
import { muz } from '../../lib/ekonomi.js';
import { esyaGetir } from '../../lib/esyalar.js';
import { emojiCozucu } from '../../lib/kasa-bilesen.js';
import { maymunBirak, maymunKilitle, maymunlar } from '../../lib/maymun.js';
import { hazirSeferSayisi } from '../../lib/sefer.js';
import {
  acikMeslekler, BEKLEME_MS, BONUS_AHSAP, BONUS_DEMIR, calis, calismaDurumu, calismaGetir, ENERJI_DOLUM_MS,
  gecerliMeslek, MESLEKLER, meslekSec, OTOMATIK, sonrakiMeslek,
} from '../../lib/meslekler.js';
import { kullaniciGetir } from '../../lib/seviye.js';
import { YONETICI_CARPAN, yoneticiCarpani } from '../../lib/yonetici-carpan.js';

export const sistem = 'ekonomi';
export const modul = 'ekonomi';

/** Autocomplete'te kilidi kaldıran seçenek. */
const BIRAK = 'birak';
const SECENEK_SINIRI = 25;

export const data = new SlashCommandBuilder()
  .setName('calis')
  .setDescription('Mesleğinde çalışıp muz kazan (15 sn bekleme, enerjiyle). Meslekler seviyeyle açılır.')
  .setContexts(InteractionContextType.Guild)
  .addStringOption((o) => o
    .setName('meslek').setDescription('Çalışmak yerine mesleğini seç (yalnız açık olanlar)')
    .addChoices(
      { name: 'Otomatik (en yüksek açık meslek)', value: OTOMATIK },
      ...MESLEKLER.map((m) => ({ name: `${m.ad} (Sv ${m.seviye})`, value: m.kimlik })),
    ))
  .addStringOption((o) => o
    .setName('maymun').setDescription('Çalışmak yerine envanterindeki bir maymunu çalışmaya kilitle (ya da bırak)')
    .setAutocomplete(true))
  .addBooleanOption((o) => o
    .setName('bilgi').setDescription('Çalışmak yerine enerjini, maymununu, meslekleri ve kazançları göster'));

const yuzde = (oran) => `%${(oran * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;

/** "▰▰▰▱▱ 63/100" gibi enerji çubuğu. */
function enerjiCubugu(enerji, maks) {
  const dolu = Math.round((enerji / maks) * 10);
  return `${'▰'.repeat(dolu)}${'▱'.repeat(10 - dolu)} **${Math.floor(enerji)}**/${maks}`;
}

function maymunSatiri(emoji, m) {
  if (!m?.kart) return '🙈 Maymunsuz çalışıyorsun (direnç %16). `/calis maymun` ile bir kule ya da kahraman kilitle.';
  const yollar = m.yollar?.some((n) => n > 0) ? ` · yollar **${m.yollar.join('-')}**` : '';
  return `${emoji(m.kart)} **${m.kart.ad}** · Sv ${m.seviye} (${m.mevcut}/${m.gereken} XP) · direnç **${yuzde(m.direnc)}**${yollar}`;
}

/** Çıkan olayın satırları (anlık olayın sonucu ya da seçimli olayın sorusu). */
function olaySatirlari(emoji, o) {
  const satirlar = ['', `${o.emoji} **${o.ad}!** ${o.metin}`];
  if (o.muz) satirlar.push(`→ **+${muz(o.muz)}**`);
  if (o.xp) satirlar.push(`→ maymunun Sv ${o.xp.seviye} (${o.xp.mevcut}/${o.xp.gereken} XP)`);
  if (o.kasa) satirlar.push(`→ ${emoji(esyaGetir(o.kasa))} envanterine eklendi → \`/kasa ac\``);
  if (o.secenekler) satirlar.push(`⏳ Karar ver: <t:${Math.ceil(o.bitis / 1000)}:R> kaçacak.`);
  return satirlar;
}

async function yap(interaction) {
  const db = veritabani();
  const sonuc = calis(db, { guildId: interaction.guildId, kullaniciId: interaction.user.id });

  if (!sonuc.ok) {
    await interaction.reply({
      content: sonuc.yorgun
        ? `😮‍💨 Enerjin bitti (${Math.floor(sonuc.durum.enerji)}/${sonuc.durum.enerjiMaks}). Bir çalışma için **${sureBicimle(sonuc.kalanMs)}** dinlenmelisin. `
          + 'Hemen devam etmek için mağazadan ⚡ **Enerji Totemi** al; beklerken maymunlarını `/maymun sefer` ile sefere gönder.'
        : `Biraz soluklan: yeniden çalışabilmen için **${sureBicimle(sonuc.kalanMs)}** var.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const emoji = emojiCozucu(interaction.guild);
  const satirlar = [`${emoji(sonuc.meslek)} ${sonuc.olay}`, '', `**+${muz(sonuc.kazanc)}**`];
  if (sonuc.etkinlik) satirlar.push('🎉 2x muz etkinliği: kazanç **ikiye katlandı**');
  if (sonuc.prestij > 1) satirlar.push(`⭐ Prestij: kazanç **×${sonuc.prestij.toLocaleString('tr-TR')}**`);
  if (sonuc.uyelik > 1) satirlar.push(`💜 Katıl üyeliği: kazanç **×${sonuc.uyelik.toLocaleString('tr-TR')}**`);
  if (sonuc.rozet > 0) satirlar.push(`🎈 Rozetler: kazanç **+%${sonuc.rozet}**`);
  if (yoneticiCarpani(interaction.user.id) > 1) satirlar.push(`🛠️ Yönetici: kazanç **×${YONETICI_CARPAN}**`);
  if (sonuc.borcKesilen > 0) satirlar.push(`🏦 Kredi borcuna ${muz(sonuc.borcKesilen)} kesildi`);
  if (sonuc.kasa) {
    const kasa = esyaGetir(sonuc.kasa);
    satirlar.push(`🎁 Bonus: ${emoji(kasa)} **${kasa.ad}** envanterine eklendi → \`/kasa ac\``);
  }
  if (sonuc.olayEtkisi) satirlar.push(...olaySatirlari(emoji, sonuc.olayEtkisi));
  satirlar.push('', maymunSatiri(emoji, sonuc.maymun));
  if (sonuc.maymun?.seviyeAtladi) satirlar.push(`⬆️ **${sonuc.maymun.kart.ad}** Sv ${sonuc.maymun.seviye} oldu, artık daha az yoruluyor!`);
  const donen = hazirSeferSayisi(veritabani(), interaction.guildId, interaction.user.id);
  if (donen > 0) satirlar.push(`🧭 **${donen}** seferin döndü → \`/maymun topla\``);

  const embed = gomu('basari', sonuc.meslek.ad)
    .setDescription(satirlar.join('\n'))
    .addFields(
      { name: 'Bakiye', value: muz(sonuc.bakiye), inline: true },
      { name: 'Enerji', value: enerjiCubugu(sonuc.enerji, sonuc.enerjiMaks), inline: true },
    )
    .setFooter({ text: `Bu çalışma ${sonuc.bedel.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} enerji harcadı · bir sonraki ${sureBicimle(BEKLEME_MS)} sonra.` });

  const secimli = sonuc.olayEtkisi?.secenekler;
  await interaction.reply({ embeds: [embed], components: secimli ? [olayButonlari(secimli, interaction.user.id)] : [] });
}

async function meslek(interaction) {
  const sonuc = meslekSec(veritabani(), {
    guildId: interaction.guildId,
    kullaniciId: interaction.user.id,
    kimlik: interaction.options.getString('meslek', true),
  });
  if (!sonuc.ok) {
    await interaction.reply({ content: sonuc.sebep, flags: MessageFlags.Ephemeral });
    return;
  }

  const emoji = emojiCozucu(interaction.guild);
  await interaction.reply({
    content: sonuc.otomatik
      ? `Otomatik seçime döndün: şu an en yüksek açık mesleğin ${emoji(sonuc.meslek)} **${sonuc.meslek.ad}**, seviye atladıkça kendiliğinden yükselir.`
      : `Artık ${emoji(sonuc.meslek)} **${sonuc.meslek.ad}** olarak çalışacaksın (${muz(sonuc.meslek.min)} – ${muz(sonuc.meslek.max)}).`,
    flags: MessageFlags.Ephemeral,
  });
}

async function maymun(interaction) {
  const db = veritabani();
  const secim = interaction.options.getString('maymun', true);
  const emoji = emojiCozucu(interaction.guild);
  const kimlik = { guildId: interaction.guildId, kullaniciId: interaction.user.id };

  if (secim === BIRAK) {
    await interaction.reply({
      content: maymunBirak(db, kimlik) ? 'Maymunun kilidi kalktı; artık maymunsuz çalışıyorsun (direnç %16).' : 'Zaten kilitli bir maymunun yok.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const sonuc = maymunKilitle(db, { ...kimlik, kimlik: secim });
  await interaction.reply({
    content: sonuc.ok
      ? `${maymunSatiri(emoji, sonuc.maymun)}\nArtık seninle çalışıyor. Bir kopyası çalıştığı sürece satılamaz, takas ve hediye edilemez.`
      : sonuc.sebep,
    flags: MessageFlags.Ephemeral,
  });
}

async function bilgi(interaction) {
  const db = veritabani();
  const { guildId } = interaction;
  const kullaniciId = interaction.user.id;
  const seviye = kullaniciGetir(db, guildId, kullaniciId).seviye;
  const secim = calismaGetir(db, guildId, kullaniciId).meslek;
  const aktif = gecerliMeslek(seviye, secim);
  const durum = calismaDurumu(db, guildId, kullaniciId);
  const emoji = emojiCozucu(interaction.guild);

  const satirlar = MESLEKLER.map((m) => {
    const acik = m.seviye <= seviye;
    const isaret = m.kimlik === aktif.kimlik ? '▶️' : acik ? '✅' : '🔒';
    return `${isaret} ${emoji(m)} **${m.ad}** · Sv ${m.seviye} · ${muz(m.min)} – ${muz(m.max)}`;
  });
  const sonraki = sonrakiMeslek(seviye);
  const bekleme = Math.max(durum.beklemeMs, durum.enerjiMs);

  const embed = gomu('bilgi', 'Çalışma')
    .setDescription([
      maymunSatiri(emoji, durum.maymun),
      `Her çalışma **${durum.bedel.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}** enerji harcar `
        + `(10 × (1 − direnç) × (1 − Dayanıklılık)); enerji ${sureBicimle(ENERJI_DOLUM_MS)}de 1 dolar, boştan `
        + `${sureBicimle(ENERJI_DOLUM_MS * durum.enerjiMaks)}te dolu. Hemen doldurmak için ⚡ Enerji Totemi (mağaza).`,
      `🎲 Her çalışmada **${yuzde(durum.olaySansi)}** ihtimalle olay çıkar (usta yardımı, muz molası, kaçak MOAB, Altın Balon…).`,
      durum.rozetBonus > 0 ? `🎈 Rozetlerin kazancına **+%${durum.rozetBonus}** ekliyor.` : '🎈 Rozetler çalışma kazancına kalıcı bonus verir (`/magaza liste rozet`).',
      '',
      ...satirlar,
      '',
      `Bonus: her çalışmada **%${BONUS_AHSAP.toLocaleString('tr-TR')}** Ahşap Kasa, **%${BONUS_DEMIR.toLocaleString('tr-TR')}** Demir Kasa.`,
      `Seçim: ${secim && gecerliMeslek(seviye, secim).kimlik === secim ? '**manuel**' : '**otomatik** (en yüksek açık meslek)'} · \`/calis meslek\` ile değiştir.`,
    ].join('\n'))
    .addFields(
      { name: 'Enerji', value: enerjiCubugu(durum.enerji, durum.enerjiMaks), inline: true },
      { name: 'Durum', value: bekleme > 0 ? `${sureBicimle(bekleme)} sonra` : 'Çalışmaya hazırsın', inline: true },
      { name: 'Seviyen', value: `Sv ${seviye} (${acikMeslekler(seviye).length}/${MESLEKLER.length} meslek açık)`, inline: true },
    )
    .setFooter({ text: sonraki ? `Sıradaki meslek: ${sonraki.ad} (Sv ${sonraki.seviye})` : 'Bütün meslekler açık.' });

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

export async function autocomplete(interaction) {
  const db = veritabani();
  const aranan = interaction.options.getFocused().toLocaleLowerCase('tr-TR');
  const durum = calismaDurumu(db, interaction.guildId, interaction.user.id);
  const secenekler = maymunlar(db, interaction.guildId, interaction.user.id)
    .map((m) => ({
      name: `${m.kart.ad} · Sv ${m.seviye} · direnç ${yuzde(m.direnc)}${durum.maymun.kart?.kimlik === m.kimlik ? ' (çalışıyor)' : ''}`,
      value: m.kimlik,
    }))
    .filter((s) => !aranan || s.name.toLocaleLowerCase('tr-TR').includes(aranan));
  if (durum.maymun.kart) secenekler.unshift({ name: '🚫 Maymunu bırak (maymunsuz çalış)', value: BIRAK });
  await interaction.respond(secenekler.slice(0, SECENEK_SINIRI));
}

export async function execute(interaction) {
  if (interaction.options.getString('meslek')) return meslek(interaction);
  if (interaction.options.getString('maymun')) return maymun(interaction);
  if (interaction.options.getBoolean('bilgi')) return bilgi(interaction);
  return yap(interaction);
}
