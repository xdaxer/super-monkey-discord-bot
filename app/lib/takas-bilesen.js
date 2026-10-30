import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} from 'discord.js';

import { ayarGetir, sistemAcikMi } from './ayarlar.js';
import { gomu, zaman } from './bicim.js';
import { veritabani } from './db.js';
import { muz } from './ekonomi.js';
import { emojiCozucu } from './kasa-bilesen.js';
import { kullaniciGetir } from './seviye.js';
import {
  esyaAdi, esyaNesnesi, geriCek, kabulEt, reddet, teklifGetir,
} from './takas.js';

const ONEK = 'takas';
const EYLEMLER = ['kabul', 'red', 'geri'];

export function takasButonId(eylem, id) {
  return `${ONEK}:${eylem}:${id}`;
}

/** @returns {{eylem: string, id: number} | null} */
export function takasButonAyristir(customId) {
  const [onek, eylem, id] = String(customId ?? '').split(':');
  if (onek !== ONEK || !EYLEMLER.includes(eylem) || !/^\d{1,15}$/.test(id ?? '')) return null;
  return { eylem, id: Number(id) };
}

export function takasButonlari(id, devreDisi = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(takasButonId('kabul', id)).setLabel('Kabul')
      .setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(devreDisi),
    new ButtonBuilder().setCustomId(takasButonId('red', id)).setLabel('Reddet')
      .setEmoji('✖️').setStyle(ButtonStyle.Danger).setDisabled(devreDisi),
    new ButtonBuilder().setCustomId(takasButonId('geri', id)).setLabel('Geri çek')
      .setEmoji('↩️').setStyle(ButtonStyle.Secondary).setDisabled(devreDisi),
  );
}

/** Bir tarafın verdikleri: "2 × Kart Adı + 500 🍌" ya da "—". */
function kalemMetni(esya, kac, muzMiktari, emoji) {
  const parcalar = [];
  if (esya) parcalar.push(`${kac} × ${emoji(esyaNesnesi(esya))} **${esyaAdi(esya)}**`);
  if (muzMiktari > 0) parcalar.push(`**${muz(muzMiktari)}**`);
  return parcalar.join(' + ') || '—';
}

const DURUM_METNI = {
  kabul: ['basari', '✅ Kabul edildi'],
  red: ['hata', '✖️ Reddedildi'],
  geri: ['notr', '↩️ Geri çekildi'],
  suresi: ['notr', '⌛ Süresi doldu'],
};

/** Teklif gömüsü; emoji açıklamada (embed başlığı özel emoji göstermez). */
export function takasGomusu(teklif, emoji, ek = null) {
  const [tur, durumMetni] = DURUM_METNI[teklif.durum] ?? ['bilgi', null];
  const satirlar = [
    `<@${teklif.tekliEdenId}> **verir:** ${kalemMetni(teklif.verEsya, teklif.verAdet, teklif.muzVer, emoji)}`,
    `<@${teklif.karsiId}> **verir:** ${kalemMetni(teklif.isteEsya, teklif.isteAdet, teklif.muzIste, emoji)}`,
  ];
  if (teklif.durum === 'acik') {
    satirlar.push('', `Geçerlilik: ${zaman(teklif.bitis, 'R')} · Muz kısmında vergi kesilir ve günlük gönderim limitine sayılır.`);
  } else if (durumMetni) {
    satirlar.push('', `**${durumMetni}**`);
  }
  if (ek) satirlar.push(ek);
  return gomu(tur, `🤝 Takas teklifi #${teklif.id}`, satirlar.join('\n'));
}

const gizli = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

async function butonBasildi(interaction) {
  const { eylem, id } = takasButonAyristir(interaction.customId);
  const db = veritabani();
  const guildId = interaction.guildId;

  if (!sistemAcikMi(db, guildId, 'ekonomi')) {
    await gizli(interaction, 'Ekonomi sistemi bu sunucuda kapalı.');
    return;
  }

  const teklif = teklifGetir(db, id);
  if (!teklif || teklif.guildId !== String(guildId)) {
    await gizli(interaction, 'Bu teklif bulunamadı.');
    return;
  }

  const kullaniciId = interaction.user.id;
  const emoji = emojiCozucu(interaction.guild);
  let sonuc;
  let ek = null;

  if (eylem === 'kabul') {
    const seviyeOku = (k) => kullaniciGetir(db, guildId, k).seviye;
    sonuc = kabulEt(db, {
      id,
      kullaniciId,
      seviyeler: { [teklif.tekliEdenId]: seviyeOku(teklif.tekliEdenId), [teklif.karsiId]: seviyeOku(teklif.karsiId) },
      vergiYuzde: ayarGetir(db, guildId, 'ekonomi.vergiYuzde'),
    });
    if (sonuc.ok) {
      const vergi = sonuc.vergiVer + sonuc.vergiIste;
      if (vergi > 0) ek = `-# Toplam ${muz(vergi)} vergi kesildi.`;
    }
  } else if (eylem === 'red') {
    sonuc = reddet(db, { id, kullaniciId });
  } else {
    sonuc = geriCek(db, { id, kullaniciId });
  }

  if (!sonuc.ok) {
    await gizli(interaction, sonuc.sebep);
    // Süre dolduysa mesajı da kapat.
    if (sonuc.durum === 'suresi') {
      await interaction.message.edit({
        embeds: [takasGomusu({ ...teklif, durum: 'suresi' }, emoji)], components: [],
      }).catch(() => null);
    }
    return;
  }

  await interaction.update({
    content: `<@${teklif.tekliEdenId}> <@${teklif.karsiId}>`,
    embeds: [takasGomusu(sonuc.teklif, emoji, ek)],
    components: [],
    allowedMentions: { parse: [] },
  });
}

export function takasBilesenleri() {
  return [
    {
      eslesir: (i) => i.isButton?.() && takasButonAyristir(i.customId) !== null,
      calistir: butonBasildi,
    },
  ];
}
