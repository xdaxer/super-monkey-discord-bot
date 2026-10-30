import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} from 'discord.js';

import { sistemAcikMi } from './ayarlar.js';
import { gomu, PINGSIZ, zaman } from './bicim.js';
import { veritabani } from './db.js';
import { bakiye, muz } from './ekonomi.js';
import {
  siradakiId, XOX_HAMLE_SURE_MS, xoxButonAyristir, xoxButonId, xoxGetir, xoxHamle, xoxPes, xoxSuresiDolaniBitir,
} from './xox.js';

const ISARET = { X: '❌', O: '⭕' };
/** Boş kare etiketi: Discord boş etiket kabul etmez. */
const BOS_ETIKET = '​';

/** 3×3 tahta ve altta "Pes et"; bitince hepsi kapanır, kazanan çizgi yeşil. */
export function xoxTahtasi(oyun, bitti = null) {
  const satirlar = [0, 1, 2].map((r) => new ActionRowBuilder().addComponents(
    [0, 1, 2].map((c) => {
      const i = r * 3 + c;
      const isaret = oyun.tahta[i];
      const dugme = new ButtonBuilder().setCustomId(xoxButonId(oyun.id, i)).setDisabled(Boolean(bitti) || isaret !== '.');
      if (isaret === '.') return dugme.setLabel(BOS_ETIKET).setStyle(ButtonStyle.Secondary);
      const kazanan = bitti?.cizgi?.includes(i);
      return dugme.setEmoji(ISARET[isaret])
        .setStyle(kazanan ? ButtonStyle.Success : isaret === 'X' ? ButtonStyle.Danger : ButtonStyle.Primary);
    }),
  ));
  if (!bitti) {
    satirlar.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(xoxButonId(oyun.id, 'pes')).setLabel('Pes et').setEmoji('🏳️')
        .setStyle(ButtonStyle.Secondary),
    ));
  }
  return satirlar;
}

/** Süren ya da biten oyunun gömüsü. */
export function xoxGomusu(oyun, { bitti = null, bakiyeler = null } = {}) {
  const satirlar = [
    `${ISARET.X} <@${oyun.xId}> ⚔️ ${ISARET.O} <@${oyun.oId}>`,
    `Bahis: **${muz(oyun.bahis)}** × 2`,
    '',
  ];

  if (!bitti) {
    satirlar.push(
      `Sıra: ${ISARET[oyun.sira]} <@${siradakiId(oyun)}>`,
      `${zaman(oyun.sonHamle + XOX_HAMLE_SURE_MS, 'R')} oynamazsa hükmen kaybeder.`,
    );
    return gomu('bilgi', '⚔️ Düello: ❌⭕ XOX').setDescription(satirlar.join('\n'));
  }

  if (bitti.sebep === 'sure') satirlar.push(`⏰ <@${bitti.kaybedenId}> süresinde oynamadı.`);
  if (bitti.sebep === 'pes') satirlar.push(`🏳️ <@${bitti.kaybedenId}> pes etti.`);
  if (bitti.kazananId === null) {
    satirlar.push('🤝 **Berabere.** İki taraf da bahsini geri aldı.');
  } else {
    satirlar.push(
      `🏆 Kazanan: <@${bitti.kazananId}> **+${muz(bitti.kazanc)}** (${muz(bitti.havuz)} havuz, ${muz(bitti.kasa)} kasa payı)`,
      `💸 Kaybeden: <@${bitti.kaybedenId}> **−${muz(oyun.bahis)}**`,
    );
  }
  if (bakiyeler) {
    satirlar.push('', `Bakiye: <@${oyun.xId}> ${muz(bakiyeler.x)} · <@${oyun.oId}> ${muz(bakiyeler.o)}`);
  }
  return gomu(bitti.kazananId === null ? 'notr' : 'basari', '⚔️ Düello: ❌⭕ XOX').setDescription(satirlar.join('\n'));
}

function bitisMesaji(db, oyun, bitti) {
  const bakiyeler = { x: bakiye(db, oyun.guildId, oyun.xId), o: bakiye(db, oyun.guildId, oyun.oId) };
  return {
    content: '', embeds: [xoxGomusu(oyun, { bitti, bakiyeler })], components: xoxTahtasi(oyun, bitti), ...PINGSIZ,
  };
}

/**
 * Hamle süresi zamanlayıcısı. Her hamlede yenisi kurulur; eskisi çalıştığında
 * süre henüz dolmamış olur ve hiçbir şey yapmaz. Bot kapanırsa açılıştaki iade
 * devreye girer.
 */
function zamanlayiciKur(mesaj, id) {
  setTimeout(async () => {
    try {
      const db = veritabani();
      const sonuc = xoxSuresiDolaniBitir(db, id);
      if (!sonuc) return;
      await mesaj.edit(bitisMesaji(db, sonuc.oyun, sonuc.bitti));
    } catch (error) {
      console.error('XOX süre aşımı işlenemedi:', error.message);
    }
  }, XOX_HAMLE_SURE_MS + 500).unref();
}

function siraMetni(oyun) {
  return `<@${siradakiId(oyun)}>, sıra sende (${ISARET[oyun.sira]}).`;
}

/** Kabul edilmiş XOX düellosunun tahtasını açar (meydan okuma mesajının yerine). */
export async function xoxBaslat(interaction, oyun) {
  await interaction.update({
    content: siraMetni(oyun),
    embeds: [xoxGomusu(oyun)],
    components: xoxTahtasi(oyun),
    allowedMentions: { users: [siradakiId(oyun)] },
  });
  zamanlayiciKur(interaction.message, oyun.id);
}

function gizli(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

async function butonBasildi(interaction) {
  const { id, hucre } = xoxButonAyristir(interaction.customId);
  const db = veritabani();

  if (!sistemAcikMi(db, interaction.guildId, 'ekonomi')) {
    await gizli(interaction, 'Ekonomi sistemi bu sunucuda kapalı.');
    return;
  }
  if (!xoxGetir(db, id)) {
    // Bitmiş ya da açılışta iade edilmiş: eski düğmeleri de kapat.
    await interaction.update({ components: [] }).catch(() => null);
    await interaction.followUp({ content: 'Bu oyun bitmiş.', flags: MessageFlags.Ephemeral }).catch(() => null);
    return;
  }

  const s = hucre === 'pes'
    ? xoxPes(db, { id, kullaniciId: interaction.user.id })
    : xoxHamle(db, { id, kullaniciId: interaction.user.id, hucre });
  if (!s.ok) {
    await gizli(interaction, s.sebep);
    return;
  }

  if (s.bitti) {
    await interaction.update(bitisMesaji(db, s.oyun, s.bitti));
    return;
  }
  await interaction.update({
    content: siraMetni(s.oyun), embeds: [xoxGomusu(s.oyun)], components: xoxTahtasi(s.oyun), ...PINGSIZ,
  });
  zamanlayiciKur(interaction.message, id);
}

export function xoxBilesenleri() {
  return [
    {
      eslesir: (i) => i.isButton?.() && xoxButonAyristir(i.customId) !== null,
      calistir: butonBasildi,
    },
  ];
}
