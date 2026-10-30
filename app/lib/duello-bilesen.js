import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} from 'discord.js';

import { sistemAcikMi } from './ayarlar.js';
import { gomu, PINGSIZ, zaman } from './bicim.js';
import { veritabani } from './db.js';
import {
  duelloButonAyristir, duelloButonId, duelloGetir, duelloIptal, duelloKabul, havuzHesapla, KASA_PAYI_YUZDE,
} from './duello.js';
import { bakiye, muz } from './ekonomi.js';
import { GIF_ZAMAN_ASIMI } from './kasa-bilesen.js';
import { BORC_YASAK, borcluMu } from './kredi.js';
import { duelloAtGifiUret } from './kumar-gif.js';
import { xoxKabul } from './xox.js';
import { xoxBaslat } from './xox-bilesen.js';

const OYUN_ADI = {
  zar: '🎲 Zar', yazitura: '🪙 Yazı-tura', at: '🏇 At yarışı', xox: '❌⭕ XOX',
};
const BEKLEME_MS = 1500;
/** GIF yüklenip görünene kadar tanınan pay (ms). */
const GIF_YUKLEME_PAYI = 800;

const bekle = (ms) => new Promise((coz) => { setTimeout(coz, ms); });

/** Kabul / Reddet (rakip) ve Geri çek (meydan okuyan) düğmeleri. */
export function duelloButonlari(id, devreDisi = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(duelloButonId('kabul', id)).setLabel('Kabul')
      .setEmoji('⚔️').setStyle(ButtonStyle.Success).setDisabled(devreDisi),
    new ButtonBuilder().setCustomId(duelloButonId('red', id)).setLabel('Reddet')
      .setEmoji('✖️').setStyle(ButtonStyle.Danger).setDisabled(devreDisi),
    new ButtonBuilder().setCustomId(duelloButonId('geri', id)).setLabel('Geri çek')
      .setStyle(ButtonStyle.Secondary).setDisabled(devreDisi),
  );
}

/** Bekleyen meydan okumanın gömüsü. */
export function meydanGomusu(duello) {
  const { kazanc } = havuzHesapla(duello.bahis);
  const satirlar = [
    `<@${duello.meydanId}> seni düelloya çağırıyor, <@${duello.rakipId}>!`,
    '',
    `Oyun: **${OYUN_ADI[duello.oyun]}**${duello.secim ? ` (meydan okuyan **${duello.secim === 'yazi' ? 'yazı' : 'tura'}** dedi)` : ''}`,
    `Bahis: **${muz(duello.bahis)}** (ikisi de yatırır)`,
    `Kazanan: **${muz(kazanc)}** (%${KASA_PAYI_YUZDE} kasa payı kesilir)`,
    `Süre: ${zaman(duello.bitis, 'R')}`,
  ];
  return gomu('bilgi', '⚔️ Düello meydan okuması').setDescription(satirlar.join('\n'));
}

/** Kapanmış (ret, geri çekme, süre aşımı) meydan okumanın gömüsü. */
export function kapaliGomu(duello, durum) {
  return gomu('notr', '⚔️ Düello iptal')
    .setDescription(`<@${duello.meydanId}> ile <@${duello.rakipId}> arasındaki ${muz(duello.bahis)} değerindeki düello: ${durum}\nBahis iade edildi.`);
}

/** Oynanırken gösterilen kısa "animasyon" gömüsü. */
function atilirkenGomu(duello) {
  const ne = { zar: '🎲 Zarlar atılıyor...', yazitura: '🪙 Para havada...', at: '🏇 Atlar koşuyor...' }[duello.oyun];
  return gomu('bilgi', `⚔️ Düello: ${OYUN_ADI[duello.oyun]}`)
    .setDescription(`<@${duello.meydanId}> ⚔️ <@${duello.rakipId}>\nBahis: **${muz(duello.bahis)}** × 2\n\n${ne}`);
}

/** Biten düellonun gömüsü: zarlar/para, kazanan ve kasa payı görünür. */
export function sonucGomusu(s, bakiyeler) {
  const { duello, sonuc } = s;
  const satirlar = [`<@${duello.meydanId}> ⚔️ <@${duello.rakipId}>`, ''];

  if (duello.oyun === 'zar') {
    satirlar.push(
      `<@${duello.meydanId}>: 🎲 ${sonuc.meydan.join(' + ')} = **${sonuc.meydan[0] + sonuc.meydan[1]}**`,
      `<@${duello.rakipId}>: 🎲 ${sonuc.rakip.join(' + ')} = **${sonuc.rakip[0] + sonuc.rakip[1]}**`,
    );
  } else if (duello.oyun === 'at') {
    satirlar.push(`1. kulvar: <@${duello.meydanId}> · 2. kulvar: <@${duello.rakipId}>`);
  } else {
    satirlar.push(
      `<@${duello.meydanId}> **${duello.secim === 'yazi' ? 'yazı' : 'tura'}** dedi.`,
      `Para **${sonuc.sonuc === 'yazi' ? 'yazı' : 'tura'}** geldi.`,
    );
  }
  satirlar.push('');

  if (s.kazananId === null) {
    satirlar.push('🤝 **Berabere.** İki taraf da bahsini geri aldı.');
  } else {
    satirlar.push(
      `🏆 Kazanan: <@${s.kazananId}> **+${muz(s.kazanc)}** (${muz(s.havuz)} havuz, ${muz(s.kasa)} kasa payı)`,
      `💸 Kaybeden: <@${s.kaybedenId}> **−${muz(duello.bahis)}**`,
    );
  }
  if (bakiyeler) {
    satirlar.push('', `Bakiye: <@${duello.meydanId}> ${muz(bakiyeler.meydan)} · <@${duello.rakipId}> ${muz(bakiyeler.rakip)}`);
  }

  const tur = s.kazananId === null ? 'notr' : 'basari';
  return gomu(tur, `⚔️ Düello: ${OYUN_ADI[duello.oyun]}`).setDescription(satirlar.join('\n'));
}

/** Sunucudaki görünen ad; bulunamazsa kullanıcı kimliği. */
async function gorunenAd(guild, id) {
  const uye = guild?.members?.cache?.get(id) ?? await guild?.members?.fetch?.(id).catch(() => null);
  return uye?.displayName ?? uye?.user?.username ?? id;
}

/** Düello at yarışı GIF'i; üretilemezse ya da gecikirse null. */
async function atGifiHazirla(interaction, duello, sonuc) {
  try {
    const adlar = await Promise.all([duello.meydanId, duello.rakipId].map((id) => gorunenAd(interaction.guild, id)));
    return await Promise.race([
      duelloAtGifiUret({ adlar, kazanan: sonuc.kazanan }),
      bekle(GIF_ZAMAN_ASIMI).then(() => null),
    ]);
  } catch {
    return null;
  }
}

function gizli(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

async function butonBasildi(interaction) {
  const { tur, id } = duelloButonAyristir(interaction.customId);
  const db = veritabani();

  if (!sistemAcikMi(db, interaction.guildId, 'ekonomi')) {
    await gizli(interaction, 'Ekonomi sistemi bu sunucuda kapalı.');
    return;
  }

  const duello = duelloGetir(db, id);
  if (!duello) {
    // Çözülmüş / iade edilmiş / açılışta temizlenmiş: eski düğmeleri de kapat.
    await interaction.update({ components: [] }).catch(() => null);
    await interaction.followUp({ content: 'Bu meydan okuma artık geçerli değil.', flags: MessageFlags.Ephemeral }).catch(() => null);
    return;
  }

  if (tur === 'kabul') {
    if (borcluMu(db, interaction.guildId, interaction.user.id)) return gizli(interaction, BORC_YASAK);
    const s = duello.oyun === 'xox'
      ? xoxKabul(db, { id, kullaniciId: interaction.user.id })
      : duelloKabul(db, { id, kullaniciId: interaction.user.id });
    if (!s.ok) {
      if (s.gecersiz) {
        await interaction.update({ embeds: [kapaliGomu(duello, 'süresi doldu')], components: [], ...PINGSIZ }).catch(() => null);
        return;
      }
      await gizli(interaction, s.sebep);
      return;
    }

    if (s.oyun) {
      await xoxBaslat(interaction, s.oyun);
      return;
    }

    // Sonuç kesinleşti; kısa bir bekleyişle mesajı iki adımda gösteriyoruz.
    await interaction.update({ embeds: [atilirkenGomu(duello)], components: [], ...PINGSIZ });
    const gif = duello.oyun === 'at' ? await atGifiHazirla(interaction, duello, s.sonuc) : null;
    if (gif) {
      await interaction.editReply({
        embeds: [atilirkenGomu(duello).setImage('attachment://duello.gif')],
        files: [new AttachmentBuilder(gif.gif, { name: 'duello.gif' })],
        attachments: [],
        ...PINGSIZ,
      });
      await bekle(gif.sureMs + GIF_YUKLEME_PAYI);
    } else {
      await bekle(BEKLEME_MS);
    }
    const bakiyeler = {
      meydan: bakiye(db, duello.guildId, duello.meydanId),
      rakip: bakiye(db, duello.guildId, duello.rakipId),
    };
    const embed = sonucGomusu(s, bakiyeler);
    // GIF döngüye girer; sonuçta yerine son kare (kazanan kulvar parlak) kalır.
    if (gif) embed.setImage('attachment://duello.png');
    await interaction.editReply({
      embeds: [embed],
      ...(gif ? { files: [new AttachmentBuilder(gif.png, { name: 'duello.png' })], attachments: [] } : {}),
      ...PINGSIZ,
    });
    return;
  }

  const s = duelloIptal(db, { id, kullaniciId: interaction.user.id, tur });
  if (!s.ok) {
    await gizli(interaction, s.sebep);
    return;
  }
  await interaction.update({
    embeds: [kapaliGomu(duello, tur === 'red' ? 'rakip reddetti' : 'meydan okuyan geri çekti')],
    components: [],
    ...PINGSIZ,
  });
}

export function duelloBilesenleri() {
  return [
    {
      eslesir: (i) => i.isButton?.() && duelloButonAyristir(i.customId) !== null,
      calistir: butonBasildi,
    },
  ];
}
