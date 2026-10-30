import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} from 'discord.js';

import { sistemAcikMi } from './ayarlar.js';
import { gomu } from './bicim.js';
import {
  bolunebilirMi, elDegeri, hamle, kartlarMetni,
} from './blackjack.js';
import { veritabani } from './db.js';
import { bakiye, muz } from './ekonomi.js';
import { gorevBildir, kumarOlaylari } from './gorev-bilesen.js';
import { CASHBACK_YUZDE } from './kumar-cashback.js';

const ONEK = 'bj';
const HAMLELER = ['cek', 'dur', 'katla', 'bol'];

export function bjButonId(tur, kullaniciId) {
  return `${ONEK}:${tur}:${kullaniciId}`;
}

/** @returns {{tur: string, kullaniciId: string} | null} */
export function bjButonAyristir(customId) {
  const [onek, tur, kullaniciId] = String(customId ?? '').split(':');
  if (onek !== ONEK || !HAMLELER.includes(tur) || !/^\d+$/.test(kullaniciId ?? '')) return null;
  return { tur, kullaniciId };
}

export function bjButonlari(el, devreDisi = false) {
  const oynanan = el.eller[el.aktif] ?? el.eller[0];
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(bjButonId('cek', el.kullaniciId)).setLabel('Kart çek')
      .setEmoji('🃏').setStyle(ButtonStyle.Primary).setDisabled(devreDisi),
    new ButtonBuilder().setCustomId(bjButonId('dur', el.kullaniciId)).setLabel('Dur')
      .setEmoji('✋').setStyle(ButtonStyle.Secondary).setDisabled(devreDisi),
    new ButtonBuilder().setCustomId(bjButonId('katla', el.kullaniciId)).setLabel('İkiye katla')
      .setEmoji('💰').setStyle(ButtonStyle.Success)
      .setDisabled(devreDisi || oynanan.kartlar.length !== 2),
    new ButtonBuilder().setCustomId(bjButonId('bol', el.kullaniciId)).setLabel('Böl')
      .setEmoji('✂️').setStyle(ButtonStyle.Success)
      .setDisabled(devreDisi || !bolunebilirMi(el)),
  );
}

const SONUC_METNI = {
  blackjack: '🂡 **Blackjack!**',
  kazandi: '🏆 **Kazandın!**',
  berabere: '🤝 **Berabere.** Bahsin iade edildi.',
  kaybetti: '💸 **Kaybettin.**',
  patladi: '💥 **Patladın** (21\'i geçtin).',
};

const EL_SONUC = {
  blackjack: '🂡 Blackjack', kazandi: '🏆 Kazandı', berabere: '🤝 Berabere', kaybetti: '💸 Kaybetti', patladi: '💥 Patladı',
};

const BOLUNMUS_SONUC = {
  kazandi: '✂️ **Bölünmüş el: toplamda kazandın!**',
  berabere: '✂️ **Bölünmüş el: başa baş.**',
  kaybetti: '✂️ **Bölünmüş el: toplamda kaybettin.**',
};

/** Katıl kumar iadesi satırı; negatifse gün içi kazançla geri alınan iade. */
export function cashbackSatiri(iade) {
  return iade > 0
    ? `💜 Katıl cashback (günlük zararın %${CASHBACK_YUZDE}'u): **+${muz(iade)}**`
    : `💜 Bugünkü cashback'in kazançla geri alındı: **−${muz(-iade)}**`;
}

/** Elin gömüsü: sürerken kurpiyerin ikinci kartı kapalı, bitince sonuç ve bakiye. */
export function bjGomusu(el, guncelBakiye = null) {
  const tur = !el.bitti ? 'bilgi' : el.net > 0 ? 'basari' : el.net === 0 ? 'notr' : 'hata';
  const kurpiyerDeger = el.bitti ? elDegeri(el.kurpiyer) : '?';

  const embed = gomu(tur, '🃏 Blackjack');
  if (el.bolundu) {
    // Bölünmüş: her el ayrı alan; oynanan el 👉, bitince elin sonucu.
    el.eller.forEach((e, i) => {
      const isaret = !el.bitti && i === el.aktif ? '👉 ' : '';
      const sonuc = el.bitti ? ` · ${EL_SONUC[e.sonuc]}` : '';
      embed.addFields({
        name: `${isaret}${i + 1}. el (${elDegeri(e.kartlar)})`,
        value: `${kartlarMetni(e.kartlar)}\n${muz(e.bahis)}${sonuc}`,
        inline: true,
      });
    });
    embed.addFields({ name: `Kurpiyer (${kurpiyerDeger})`, value: kartlarMetni(el.kurpiyer, !el.bitti), inline: true });
  } else {
    embed.addFields(
      { name: `Senin elin (${elDegeri(el.oyuncu)})`, value: kartlarMetni(el.oyuncu), inline: true },
      { name: `Kurpiyer (${kurpiyerDeger})`, value: kartlarMetni(el.kurpiyer, !el.bitti), inline: true },
      { name: 'Bahis', value: muz(el.bahis), inline: true },
    );
  }

  if (el.bitti) {
    const satirlar = [el.bolundu ? BOLUNMUS_SONUC[el.sonuc] : SONUC_METNI[el.sonuc]];
    if (el.net > 0) satirlar.push(`+${muz(el.net)}`);
    else if (el.net < 0) satirlar.push(`−${muz(-el.net)}`);
    if (el.cashback) satirlar.push(cashbackSatiri(el.cashback));
    if (guncelBakiye !== null) satirlar.push(`Bakiye: ${muz(guncelBakiye)}`);
    embed.setDescription(satirlar.join('\n'));
  } else {
    const ipucu = el.bolundu
      ? `${el.aktif + 1}. eli oynuyorsun: kart çek, dur ya da ikiye katla.`
      : 'Kart çek, dur, ikiye katla ya da (aynı değerde iki kartla) böl.';
    embed.setDescription(`${ipucu} El 5 dakika içinde bitmezse yeni elde kendiliğinden durulur.`);
  }

  return embed;
}

async function hamleBasildi(interaction) {
  const { tur, kullaniciId } = bjButonAyristir(interaction.customId);

  if (interaction.user.id !== kullaniciId) {
    await interaction.reply({ content: 'Bu el sana ait değil. Kendin oynamak için `/kumar blackjack`.', flags: MessageFlags.Ephemeral });
    return;
  }

  const db = veritabani();
  if (!sistemAcikMi(db, interaction.guildId, 'ekonomi')) {
    await interaction.reply({ content: 'Ekonomi sistemi bu sunucuda kapalı.', flags: MessageFlags.Ephemeral });
    return;
  }

  const sonuc = hamle(db, { guildId: interaction.guildId, kullaniciId, tur });
  if (!sonuc.ok) {
    // El bitmişse butonları da kapatalım ki tekrar basılmasın.
    if (sonuc.sebep.startsWith('Bu el bitmiş')) {
      await interaction.update({ components: [] }).catch(() => null);
      await interaction.followUp({ content: sonuc.sebep, flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ content: sonuc.sebep, flags: MessageFlags.Ephemeral });
    return;
  }

  const { el } = sonuc;
  await interaction.update({
    embeds: [bjGomusu(el, el.bitti ? bakiye(db, interaction.guildId, kullaniciId) : null)],
    components: el.bitti ? [] : [bjButonlari(el)],
  });
  await gorevBildir(interaction, kumarOlaylari({ biten: el.bitti ? el : null }));
}

export function ekonomiBilesenleri() {
  return [
    {
      eslesir: (i) => i.isButton?.() && bjButonAyristir(i.customId) !== null,
      calistir: hamleBasildi,
    },
  ];
}
