import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} from 'discord.js';
import { setTimeout as bekle } from 'node:timers/promises';

import { ayarGetir, sistemAcikMi } from './ayarlar.js';
import { gomu } from './bicim.js';
import { veritabani } from './db.js';
import { muz, paraSimgesi } from './ekonomi.js';
import { esyaEmoji, esyaGetir } from './esyalar.js';
import { gorevBildir, kasaOlaylari } from './gorev-bilesen.js';
import { kasaGifiUret } from './kasa-gif.js';
import {
  garantiMetni, KARTLAR, KASA_ICERIKLERI, kasaAc, kartGetir, koleksiyon, NADIRLIKLER, sonucMetni, sonucNadirligi, toptanSat,
} from './kasalar.js';
import { rozetRoluVer } from './rozet-rol.js';

const ONEK = 'kasa';
const SERIT_UZUNLUGU = 7;
const ORTA = 3;
/** Kare aralıkları (ms): yavaşlayan bir çark hissi. Discord düzenleme sınırına (5/5 sn) takılmaz. */
export const KARE_ARALIKLARI = [700, 800, 1000, 1300];
/** GIF üretimi bu süreyi aşarsa yazılı şeride düşülür. */
export const GIF_ZAMAN_ASIMI = 8000;
/** GIF yüklenip görünene kadar tanınan pay (ms): sonuç düzenlemesi GIF bitmeden gelmesin. */
const GIF_YUKLEME_PAYI = 800;

/** Sunucu emojisini adıyla bulan, eşya/kart nesnesini emojiye çeviren fonksiyon. */
export function emojiCozucu(guild) {
  const bul = (ad) => guild?.emojis?.cache?.find((e) => e.name === ad)?.toString() ?? null;
  return (nesne) => esyaEmoji(nesne, bul);
}

export function acButonId(kasa, kullaniciId) {
  return `${ONEK}:ac:${kasa.replace(/^kasa-/, '')}:${kullaniciId}`;
}

/** @returns {{kasa: string, kullaniciId: string} | null} */
export function acButonAyristir(customId) {
  const [onek, eylem, tur, kullaniciId] = String(customId ?? '').split(':');
  const kasa = `kasa-${tur}`;
  if (onek !== ONEK || eylem !== 'ac' || !KASA_ICERIKLERI[kasa] || !/^\d+$/.test(kullaniciId ?? '')) return null;
  return { kasa, kullaniciId };
}

export function tekrarButonu(kasa, kullaniciId, kalan) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(acButonId(kasa, kullaniciId))
      .setLabel(kalan > 0 ? `Bir tane daha aç (${kalan})` : 'Kasa kalmadı')
      .setEmoji(esyaGetir(kasa).yedek)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(kalan <= 0),
  );
}

/**
 * Kasadan rozet çıktıysa rozetin rolünü verir (hata atmaz).
 * @returns {Promise<string|null>} verilen rolün kimliği
 */
export async function odulRoluVer(interaction, sonuc) {
  if (sonuc?.tur !== 'esya' || !String(sonuc.kimlik).startsWith('rozet-')) return null;
  const db = veritabani();
  return rozetRoluVer(interaction.member, sonuc.kimlik, (a) => ayarGetir(db, interaction.guildId, a), 'Kasadan rozet');
}

/** Kasanın içeriğinden rastgele bir görsel öğe (şeritte dönen şeyler). */
function seritOgesi(kasa, emoji, rastgele) {
  const icerik = KASA_ICERIKLERI[kasa];
  const toplam = icerik.reduce((t, o) => t + o.agirlik, 0);
  let kalan = rastgele() * toplam;
  let secilen = icerik[0];
  for (const o of icerik) {
    kalan -= o.agirlik;
    if (kalan < 0) {
      secilen = o;
      break;
    }
  }
  if (secilen.tur === 'muz') return paraSimgesi();
  if (secilen.tur === 'kart') {
    const havuz = KARTLAR.filter((k) => k.nadirlik === secilen.nadirlik);
    return emoji(havuz[Math.floor(rastgele() * havuz.length)]);
  }
  return emoji(esyaGetir(secilen.kimlik));
}

/** Sonucun şeridin ortasında duracak emojisi. */
function sonucEmojisi(sonuc, emoji) {
  if (sonuc.tur === 'muz') return paraSimgesi();
  if (sonuc.tur === 'kart') return emoji(kartGetir(sonuc.kimlik));
  return emoji(esyaGetir(sonuc.kimlik ?? sonuc.yerine));
}

/** Bir animasyon karesi: üstte ve altta ortayı gösteren ok, arada şerit. */
export function kareMetni(serit) {
  const ust = Array.from({ length: SERIT_UZUNLUGU }, (_, i) => (i === ORTA ? '🔻' : '▪️')).join('');
  const alt = Array.from({ length: SERIT_UZUNLUGU }, (_, i) => (i === ORTA ? '🔺' : '▪️')).join('');
  return `${ust}\n${serit.join('')}\n${alt}`;
}

function kareGomusu(kasa, serit, kullanici) {
  const esya = esyaGetir(kasa);
  return gomu('notr', `${esya.yedek} ${esya.ad} açılıyor...`)
    .setDescription(kareMetni(serit))
    .setFooter({ text: kullanici.username });
}

function sonucGomusu(db, {
  kasa, sonuc, kullanici, guildId, emoji, rozetRolu = null, garanti = null,
}) {
  const nadirlik = NADIRLIKLER[sonucNadirligi(sonuc)];
  const esya = esyaGetir(kasa);
  const tepki = emoji({ emojiAdi: nadirlik.tepki, yedek: nadirlik.simge });
  const satirlar = [`${tepki} **${nadirlik.ad}!** ${sonucMetni(sonuc, emoji)}`];
  if (rozetRolu) satirlar.push(`🏷️ Rozet rolün verildi: <@&${rozetRolu}>`);
  if (sonuc.tur === 'kart') {
    const kol = koleksiyon(db, guildId, kullanici.id);
    satirlar.push(`Koleksiyon: **${kol.farkli}/${kol.toplam}** · \`/envanter kartlar\``);
  }
  const garantiSatiri = garantiMetni(garanti);
  if (garantiSatiri) satirlar.push(garantiSatiri);
  return gomu('notr', `${esya.yedek} ${esya.ad}`)
    .setColor(nadirlik.renk)
    .setDescription(satirlar.join('\n'))
    .setFooter({ text: `${kullanici.username} açtı` });
}

/**
 * GIF'i üretir; üretilemezse (canvas yok, hata, zaman aşımı) null döner ve
 * çağıran yazılı şeride düşer. Ödül bu noktada zaten yazılmıştır.
 */
async function gifHazirla(interaction, kasa, sonuc, rastgele) {
  const guild = interaction.guild;
  const emojiBul = (ad) => guild?.emojis?.cache?.find((e) => e.name === ad) ?? null;
  try {
    return await Promise.race([
      kasaGifiUret({ kasa, sonuc, emojiBul, rastgele }),
      bekle(GIF_ZAMAN_ASIMI).then(() => null),
    ]);
  } catch {
    return null;
  }
}

/** GIF'li gömüyü gönderir ve GIF'in süresi kadar bekler. */
async function gifOynat(interaction, { kasa, kullanici, gif }) {
  const esya = esyaGetir(kasa);
  await interaction.editReply({
    embeds: [gomu('notr', `${esya.yedek} ${esya.ad} açılıyor...`)
      .setImage('attachment://kasa.gif').setFooter({ text: kullanici.username })],
    files: [new AttachmentBuilder(gif.gif, { name: 'kasa.gif' })],
    attachments: [],
  });
  await bekle(gif.sureMs + GIF_YUKLEME_PAYI);
}

/** Eski yazılı emoji şeridi (GIF yoksa yedek). */
async function yaziliSerit({ interaction, kasa, sonuc, kullanici, emoji, serit, aralik }) {
  for (const [i, ms] of aralik.entries()) {
    await bekle(ms);
    const kare = serit();
    // Son karede ortada çıkan ödül durur.
    if (i === aralik.length - 1) kare[ORTA] = sonucEmojisi(sonuc.sonuc, emoji);
    await interaction.editReply({ embeds: [kareGomusu(kasa, kare, kullanici)] });
  }
  await bekle(600);
}

/**
 * Kasayı açar ve sonucu dönen bir şeritle gösterir. Ödül, animasyondan ÖNCE
 * yazılır; mesaj silinse ya da bot kapansa da kaybolmaz.
 *
 * @param {object} interaction slash komutu ya da buton
 * @param {'reply'|'update'} ilk ilk karenin nasıl gönderileceği
 */
export async function animasyonluAc(interaction, kasa, ilk = 'reply', { rastgele = Math.random, aralik = KARE_ARALIKLARI, gif: gifIstendi = true } = {}) {
  const db = veritabani();
  const kullanici = interaction.user;
  const guildId = interaction.guildId;
  const sonuc = kasaAc(db, { guildId, kullaniciId: kullanici.id, kasa });

  if (!sonuc.ok) {
    await interaction.reply({ content: sonuc.sebep, flags: MessageFlags.Ephemeral });
    return sonuc;
  }

  const emoji = emojiCozucu(interaction.guild);
  const serit = () => Array.from({ length: SERIT_UZUNLUGU }, () => seritOgesi(kasa, emoji, rastgele));

  const ilkKare = { embeds: [kareGomusu(kasa, serit(), kullanici)], components: [] };
  if (ilk === 'update') await interaction.update(ilkKare);
  else await interaction.reply(ilkKare);
  // Rol, ilk yanıttan sonra: Discord'un 3 sn'lik yanıt süresini yemesin.
  const rozetRolu = await odulRoluVer(interaction, sonuc.sonuc);

  try {
    const gif = gifIstendi ? await gifHazirla(interaction, kasa, sonuc.sonuc, rastgele) : null;
    if (gif) await gifOynat(interaction, { kasa, kullanici, gif });
    else await yaziliSerit({ interaction, kasa, sonuc, kullanici, emoji, serit, aralik });

    const embed = sonucGomusu(db, {
      kasa, sonuc: sonuc.sonuc, kullanici, guildId, emoji, rozetRolu, garanti: sonuc.garanti,
    });
    // GIF döngüye girer; sonuç mesajında "hâlâ dönüyor" görünmesin diye GIF
    // kaldırılır, yerine son kareyi (ödül ortada, çerçeveli) gösteren PNG konur.
    if (gif) embed.setImage('attachment://kasa.png');
    await interaction.editReply({
      embeds: [embed],
      ...(gif ? { files: [new AttachmentBuilder(gif.png, { name: 'kasa.png' })], attachments: [] } : {}),
      allowedMentions: { parse: [] },
      components: [tekrarButonu(kasa, kullanici.id, sonuc.kalan)],
    });
  } catch {
    // Mesaj silindi ya da etkileşim süresi doldu: ödül zaten yazıldı.
  }
  await gorevBildir(interaction, kasaOlaylari([sonuc.sonuc]));
  return sonuc;
}

async function tekrarBasildi(interaction) {
  const { kasa, kullaniciId } = acButonAyristir(interaction.customId);

  if (interaction.user.id !== kullaniciId) {
    await interaction.reply({ content: 'Bu kasalar senin değil. Kendi kasanı `/kasa ac` ile aç.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (!sistemAcikMi(veritabani(), interaction.guildId, 'ekonomi')) {
    await interaction.reply({ content: 'Ekonomi sistemi bu sunucuda kapalı.', flags: MessageFlags.Ephemeral });
    return;
  }

  await animasyonluAc(interaction, kasa, 'update');
}

// ── Toptan kart satışı onayı ───────────────────────────────────────────────

const SATIS_ONEK = 'envsat';

/** `kapsam`: nadirlik ya da 'tum'. */
export function satisButonId(eylem, kapsam, kullaniciId) {
  return `${SATIS_ONEK}:${eylem}:${kapsam}:${kullaniciId}`;
}

/** @returns {{eylem: 'onay'|'iptal', nadirlik: string|null, kullaniciId: string} | null} */
export function satisButonAyristir(customId) {
  const [onek, eylem, kapsam, kullaniciId] = String(customId ?? '').split(':');
  if (onek !== SATIS_ONEK || !['onay', 'iptal'].includes(eylem) || !/^\d+$/.test(kullaniciId ?? '')) return null;
  if (kapsam !== 'tum' && !NADIRLIKLER[kapsam]) return null;
  return { eylem, nadirlik: kapsam === 'tum' ? null : kapsam, kullaniciId };
}

export function satisOnayButonlari(nadirlik, kullaniciId) {
  const kapsam = nadirlik ?? 'tum';
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(satisButonId('onay', kapsam, kullaniciId))
      .setLabel('Evet, hepsini sat').setEmoji('🧹').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(satisButonId('iptal', kapsam, kullaniciId))
      .setLabel('Vazgeç').setStyle(ButtonStyle.Secondary),
  );
}

async function satisBasildi(interaction) {
  const { eylem, nadirlik, kullaniciId } = satisButonAyristir(interaction.customId);
  if (interaction.user.id !== kullaniciId) {
    await interaction.reply({ content: 'Bu onay sana ait değil.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (eylem === 'iptal') {
    await interaction.update({ content: 'Vazgeçildi, hiçbir kart satılmadı.', components: [] });
    return;
  }
  const db = veritabani();
  if (!sistemAcikMi(db, interaction.guildId, 'ekonomi')) {
    await interaction.update({ content: 'Ekonomi sistemi bu sunucuda kapalı.', components: [] });
    return;
  }

  // Onay anındaki envanter satılır (önizlemeden sonra kart gelmiş/gitmiş olabilir).
  const sonuc = toptanSat(db, { guildId: interaction.guildId, kullaniciId, nadirlik });
  await interaction.update({
    content: sonuc.adet > 0
      ? `🧹 ${sonuc.adet} kart satıldı: **+${muz(sonuc.tutar)}**`
      : 'Satılacak kart kalmamış.',
    components: [],
  });
  await gorevBildir(interaction, [{ tur: 'kart-sat', miktar: sonuc.adet }]);
}

export function kasaBilesenleri() {
  return [
    {
      eslesir: (i) => i.isButton?.() && acButonAyristir(i.customId) !== null,
      calistir: tekrarBasildi,
    },
    {
      eslesir: (i) => i.isButton?.() && satisButonAyristir(i.customId) !== null,
      calistir: satisBasildi,
    },
  ];
}
