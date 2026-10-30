import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} from 'discord.js';

import { sistemAcikMi } from './ayarlar.js';
import { gomu } from './bicim.js';
import { veritabani } from './db.js';
import { muz } from './ekonomi.js';
import { odulMetni, setDurumlari, setGetir, setOduluAl } from './setler.js';

const ONEK = 'setodul';
/** Discord bir mesajda en çok 5 satır × 5 düğme taşır. */
const DUGME_SINIRI = 25;

export function setButonId(setKimligi, kullaniciId) {
  return `${ONEK}:${setKimligi}:${kullaniciId}`;
}

/** @returns {{set: object, kullaniciId: string} | null} */
export function setButonAyristir(customId) {
  const [onek, setKimligi, kullaniciId] = String(customId ?? '').split(':');
  const set = setGetir(setKimligi);
  if (onek !== ONEK || !set || !/^\d+$/.test(kullaniciId ?? '')) return null;
  return { set, kullaniciId };
}

/** Bir set satırı: `🛠️ **Destek Maymunları** 6/8 ▰▰▰▰▱ · 3.000 🍌 + …`. */
function setSatiri(d) {
  const son = d.alindi ? '✅ ödül alındı' : d.alinabilir ? '🎁 **ödül hazır**' : odulMetni(d.set.odul);
  return `${d.set.simge} **${d.set.ad}** ${d.sahip}/${d.toplam} ${d.cubuk}\n⠀⠀-# ${son}`;
}

/**
 * `/envanter setler` görünümü: ilerleme embed'i + tamamlanmış ama alınmamış
 * setler için "Ödülü al" düğmeleri.
 */
export function setGorunumu(db, { guildId, kullanici, ad }) {
  const durumlar = setDurumlari(db, guildId, kullanici.id);
  const tamam = durumlar.filter((d) => d.alindi).length;
  const embed = gomu('bilgi')
    .setAuthor({ name: `${ad} · koleksiyon setleri`, iconURL: kullanici.displayAvatarURL?.() ?? undefined })
    .setDescription(`Bir sete ait her karttan en az birine sahip olunca ödülünü **bir kez** alırsın. Alınan ödül, kart sonradan satılsa da geri alınmaz.\n**${tamam}/${durumlar.length}** set ödülü alındı.`)
    .addFields(
      { name: 'Temalı setler', value: durumlar.filter((d) => d.set.tur === 'tema').map(setSatiri).join('\n') },
      { name: 'Nadirlik setleri', value: durumlar.filter((d) => d.set.tur === 'nadirlik').map(setSatiri).join('\n') },
    )
    .setFooter({ text: '/envanter set-odul · /envanter kartlar' });

  const dugmeler = durumlar.filter((d) => d.alinabilir).slice(0, DUGME_SINIRI).map((d) => new ButtonBuilder()
    .setCustomId(setButonId(d.set.kimlik, kullanici.id))
    .setLabel(`${d.set.ad}: ödülü al`)
    .setEmoji(d.set.simge)
    .setStyle(ButtonStyle.Success));
  const satirlar = [];
  for (let i = 0; i < dugmeler.length; i += 5) {
    satirlar.push(new ActionRowBuilder().addComponents(dugmeler.slice(i, i + 5)));
  }
  return { embeds: [embed], components: satirlar };
}

/** Ödül alındı mesajı (komut ve düğme ortak kullanır). */
export function odulAlindiMetni(sonuc) {
  return `🎉 **${sonuc.set.ad}** seti tamamlandı! Ödül: ${odulMetni(sonuc.odul)} · Bakiye: ${muz(sonuc.bakiye)}`;
}

async function odulBasildi(interaction) {
  const { set, kullaniciId } = setButonAyristir(interaction.customId);
  if (interaction.user.id !== kullaniciId) {
    await interaction.reply({ content: 'Bu düğme sana ait değil. Kendi setlerin için `/envanter setler` yaz.', flags: MessageFlags.Ephemeral });
    return;
  }
  const db = veritabani();
  if (!sistemAcikMi(db, interaction.guildId, 'ekonomi')) {
    await interaction.reply({ content: 'Ekonomi sistemi bu sunucuda kapalı.', flags: MessageFlags.Ephemeral });
    return;
  }

  const sonuc = setOduluAl(db, { guildId: interaction.guildId, kullaniciId, setKimligi: set.kimlik });
  if (!sonuc.ok) {
    await interaction.reply({ content: sonuc.sebep, flags: MessageFlags.Ephemeral });
    return;
  }
  const ad = interaction.member?.displayName ?? interaction.user.globalName ?? interaction.user.username;
  await interaction.update({
    content: odulAlindiMetni(sonuc),
    ...setGorunumu(db, { guildId: interaction.guildId, kullanici: interaction.user, ad }),
    allowedMentions: { parse: [] },
  });
}

export function setBilesenleri() {
  return [
    {
      eslesir: (i) => i.isButton?.() && setButonAyristir(i.customId) !== null,
      calistir: odulBasildi,
    },
  ];
}
