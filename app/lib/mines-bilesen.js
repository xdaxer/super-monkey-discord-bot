import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} from 'discord.js';

import { sistemAcikMi } from './ayarlar.js';
import { gomu, PINGSIZ } from './bicim.js';
import { veritabani } from './db.js';
import { bakiye, bicimle, muz } from './ekonomi.js';
import { cashbackSatiri } from './ekonomi-bilesen.js';
import { gorevBildir, kumarOlaylari } from './gorev-bilesen.js';
import { odemeHesapla } from './kumar.js';
import {
  MINES_HUCRE, MINES_SUTUN, minesAc, minesBaslat, minesButonAyristir, minesButonId, minesCarpani, minesCek,
  minesKareSiniri,
} from './mines.js';

/** Boş kare etiketi: Discord boş etiket kabul etmez. */
const BOS_ETIKET = '​';

export const carpanMetni = (c) => `${c.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}x`;

/** 3×3 tahta ve altta "Çek"; bitince hepsi kapanır, mayınlar görünür. */
export function minesTahtasi(oyun, bitti = null) {
  const satirlar = [];
  for (let r = 0; r < MINES_HUCRE / MINES_SUTUN; r += 1) {
    satirlar.push(new ActionRowBuilder().addComponents(
      Array.from({ length: MINES_SUTUN }, (_, c) => {
        const i = r * MINES_SUTUN + c;
        const dugme = new ButtonBuilder().setCustomId(minesButonId(oyun.id, i));
        if (oyun.acilan.includes(i)) return dugme.setEmoji('💎').setStyle(ButtonStyle.Success).setDisabled(true);
        if (bitti && oyun.mayinlar.includes(i)) {
          const patlayan = bitti.patlayan === i;
          return dugme.setEmoji(patlayan ? '💥' : '💣')
            .setStyle(patlayan ? ButtonStyle.Danger : ButtonStyle.Secondary).setDisabled(true);
        }
        return dugme.setLabel(BOS_ETIKET).setStyle(ButtonStyle.Secondary).setDisabled(Boolean(bitti));
      }),
    ));
  }
  if (!bitti) {
    const acilan = oyun.acilan.length;
    const carpan = minesCarpani(oyun.mayin, acilan);
    const cek = new ButtonBuilder().setCustomId(minesButonId(oyun.id, 'cek')).setEmoji('💰');
    satirlar.push(new ActionRowBuilder().addComponents(acilan === 0
      ? cek.setLabel('Çek (önce bir kare aç)').setStyle(ButtonStyle.Secondary).setDisabled(true)
      : cek.setLabel(`Çek · ${bicimle(odemeHesapla(oyun.bahis, carpan))} muz (${carpanMetni(carpan)})`)
        .setStyle(ButtonStyle.Success)));
  }
  return satirlar;
}

/** Süren ya da biten oyunun gömüsü. `not`: başa eklenecek ek satır. */
export function minesGomusu(oyun, { bitti = null, bakiyeSonra = null, kullanici = null, not = null } = {}) {
  const acilan = oyun.acilan.length;
  const sinir = minesKareSiniri(oyun.mayin); // tavana (9x) ya da son güvenli kareye varınca çekilir
  const satirlar = [
    ...(not ? [not, ''] : []),
    `Bahis: **${muz(oyun.bahis)}** · Mayın: **${oyun.mayin}** 💣 · Açılan: **${acilan}/${sinir}** 💎`,
  ];

  let tur = 'bilgi';
  if (!bitti) {
    const simdiki = minesCarpani(oyun.mayin, acilan);
    const sonraki = minesCarpani(oyun.mayin, acilan + 1);
    satirlar.push(acilan === 0
      ? `İlk kare: **${carpanMetni(sonraki)}**`
      : `Çarpan: **${carpanMetni(simdiki)}** → sonraki kare: **${carpanMetni(sonraki)}**`);
  } else if (bitti.tur === 'patladi') {
    tur = 'hata';
    satirlar.push('', `💥 **Mayına bastın!** **−${muz(oyun.bahis)}**`);
  } else {
    tur = 'basari';
    satirlar.push('', `💰 **Çektin: ${carpanMetni(bitti.carpan)}** · **+${muz(bitti.net)}** (${muz(bitti.odeme)} ödendi)`);
  }
  if (bitti?.cashback) satirlar.push(cashbackSatiri(bitti.cashback));
  if (bakiyeSonra !== null) satirlar.push(`Bakiye: ${muz(bakiyeSonra)}`);

  const embed = gomu(tur, '💣 Mines').setDescription(satirlar.join('\n'));
  if (kullanici) embed.setFooter({ text: kullanici.username });
  return embed;
}

/** Biten oyunun eski oyun notu (zaman aşımıyla kendiliğinden çekildiyse). */
function eskiNotu(eski) {
  if (!eski) return null;
  if (eski.bitti.tur === 'iade') return `ℹ️ Unutulan önceki oyunun bahsi iade edildi (${muz(eski.bitti.odeme)}).`;
  return `ℹ️ Unutulan önceki oyunun kendiliğinden çekildi: ${carpanMetni(eski.bitti.carpan)} · ${muz(eski.bitti.odeme)}.`;
}

/** `/kumar mines`: bahis ve bekleme kontrolleri çağıranda yapılmıştır. */
export async function minesOyunuBaslat(interaction, db, bahis, mayin) {
  const s = minesBaslat(db, {
    guildId: interaction.guildId, kullaniciId: interaction.user.id, bahis, mayin,
  });
  if (!s.ok) {
    await interaction.reply({ content: s.sebep, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.reply({
    embeds: [minesGomusu(s.oyun, { kullanici: interaction.user, not: eskiNotu(s.eski) })],
    components: minesTahtasi(s.oyun),
  });
  await gorevBildir(interaction, kumarOlaylari({
    bahis, biten: s.eski ? { bahis: s.eski.oyun.bahis, net: s.eski.bitti.net } : null,
  }));
}

async function butonBasildi(interaction) {
  const { id, hucre } = minesButonAyristir(interaction.customId);
  const db = veritabani();

  if (!sistemAcikMi(db, interaction.guildId, 'ekonomi')) {
    await interaction.reply({ content: 'Ekonomi sistemi bu sunucuda kapalı.', flags: MessageFlags.Ephemeral });
    return;
  }

  const s = hucre === 'cek'
    ? minesCek(db, { id, kullaniciId: interaction.user.id })
    : minesAc(db, { id, kullaniciId: interaction.user.id, hucre });
  if (!s.ok) {
    if (s.gecersiz) {
      // Bitmiş ya da açılışta iade edilmiş: eski düğmeleri kapat.
      await interaction.update({ components: [] }).catch(() => null);
      await interaction.followUp({ content: s.sebep, flags: MessageFlags.Ephemeral }).catch(() => null);
      return;
    }
    await interaction.reply({ content: s.sebep, flags: MessageFlags.Ephemeral });
    return;
  }

  const bakiyeSonra = s.bitti ? bakiye(db, interaction.guildId, interaction.user.id) : null;
  await interaction.update({
    embeds: [minesGomusu(s.oyun, { bitti: s.bitti, bakiyeSonra, kullanici: interaction.user })],
    components: minesTahtasi(s.oyun, s.bitti),
    ...PINGSIZ,
  });
  if (s.bitti) await gorevBildir(interaction, kumarOlaylari({ biten: { bahis: s.oyun.bahis, net: s.bitti.net } }));
}

export function minesBilesenleri() {
  return [
    {
      eslesir: (i) => i.isButton?.() && minesButonAyristir(i.customId) !== null,
      calistir: butonBasildi,
    },
  ];
}
