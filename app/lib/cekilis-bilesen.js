import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} from 'discord.js';

import { sistemAcikMi } from './ayarlar.js';
import {
  butonAyristir, DURUMLAR, katilimDegistir, katilimSayisi, katilButonId,
  cekilisGetir, kazananMetni,
} from './cekilis.js';
import { gomu, PINGSIZ, zaman } from './bicim.js';
import { veritabani } from './db.js';

export function katilButonu(id, adet = 0, devreDisi = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(katilButonId(id))
      .setLabel(devreDisi ? `Bitti (${adet} katılım)` : `Katıl (${adet})`)
      .setEmoji('🎉')
      .setStyle(devreDisi ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(devreDisi),
  );
}

/**
 * Çekiliş mesajının gömüsü. Açıkken bitiş zamanını, bittiğinde kazananları
 * gösterir; ikisi aynı mesajda güncellendiği için kanal kirlenmiyor.
 */
export function cekilisGomusu(cekilis, katilim = 0) {
  const bitti = cekilis.durum !== DURUMLAR.acik;

  const embed = gomu(bitti ? 'notr' : 'basari', `🎁 ${cekilis.odul}`)
    .setFooter({ text: `Çekiliş #${cekilis.id}` });

  if (bitti) {
    embed.addFields(
      {
        name: cekilis.durum === DURUMLAR.iptal ? 'Durum' : 'Kazanan',
        value: cekilis.durum === DURUMLAR.iptal ? '_iptal edildi_' : kazananMetni(cekilis.kazananlar),
      },
      { name: 'Katılım', value: `${katilim} kişi`, inline: true },
      { name: 'Bitiş', value: zaman(cekilis.bitis, 'F'), inline: true },
    );
    return embed;
  }

  embed.addFields(
    { name: 'Bitiş', value: `${zaman(cekilis.bitis, 'R')} — ${zaman(cekilis.bitis, 'F')}` },
    { name: 'Kazanan sayısı', value: String(cekilis.kazanan_sayisi), inline: true },
    { name: 'Katılım', value: `${katilim} kişi`, inline: true },
  ).setDescription('Katılmak için aşağıdaki butona bas. Tekrar basarsan katılımdan çıkarsın.');

  return embed;
}

async function katilBasildi(interaction) {
  const db = veritabani();
  const id = butonAyristir(interaction.customId);
  const cekilis = cekilisGetir(db, id);

  if (!cekilis) {
    await interaction.reply({
      content: 'Bu çekiliş kayıtta bulunamadı.', flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (cekilis.durum !== DURUMLAR.acik || cekilis.bitis <= Date.now()) {
    await interaction.reply({
      content: 'Bu çekiliş kapandı, katılım alınmıyor.', flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!sistemAcikMi(db, interaction.guildId, 'cekilis')) {
    await interaction.reply({
      content: 'Çekiliş sistemi bu sunucuda kapalı.', flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const { katildi, adet } = katilimDegistir(db, id, interaction.user.id);

  // Katılım sayısı butonun üstünde duruyor; mesajı güncellemezsek sayı donar.
  await interaction.update({
    embeds: [cekilisGomusu(cekilis, adet)],
    components: [katilButonu(id, adet)],
    ...PINGSIZ,
  }).catch(() => null);

  await interaction.followUp({
    content: katildi
      ? `🎉 **${cekilis.odul}** çekilişine katıldın. Tekrar basarsan çıkarsın.`
      : `Katılımdan çıktın: **${cekilis.odul}**.`,
    flags: MessageFlags.Ephemeral,
  }).catch(() => null);
}

/** interactions.js'e verilecek bileşen yönlendiricisi. */
export function cekilisBilesenleri() {
  return [
    {
      eslesir: (i) => i.isButton?.() && butonAyristir(i.customId) !== null,
      calistir: katilBasildi,
    },
  ];
}

export { katilimSayisi };
