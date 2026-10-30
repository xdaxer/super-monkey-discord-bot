import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';

import { gomu, sureBicimle } from '../../lib/bicim.js';
import { veritabani } from '../../lib/db.js';
import { gunlukAl, HAFTA_GUNU, muz } from '../../lib/ekonomi.js';
import { esyaGetir } from '../../lib/esyalar.js';
import { gorevBildir } from '../../lib/gorev-bilesen.js';
import { acilmamisKasalar } from '../../lib/kasalar.js';
import { YONETICI_CARPAN, yoneticiCarpani } from '../../lib/yonetici-carpan.js';

export const sistem = 'ekonomi';
export const modul = 'ekonomi';

export const data = new SlashCommandBuilder()
  .setName('gunluk')
  .setDescription('Günlük muz ödülünü alır. Her gün alırsan serin büyür.')
  .setContexts(InteractionContextType.Guild);

export async function execute(interaction) {
  const db = veritabani();
  const sonuc = gunlukAl(db, { guildId: interaction.guildId, kullaniciId: interaction.user.id });

  if (!sonuc.verildi) {
    await interaction.reply({
      content: `Bugünkü ödülünü aldın. Yenisi **${sureBicimle(sonuc.kalanMs)}** sonra (Türkiye saatiyle gece yarısı).`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const satirlar = [`Taban: ${muz(sonuc.taban)}`];
  if (sonuc.ek > 0) satirlar.push(`Seri bonusu: +${muz(sonuc.ek)}`);
  if (sonuc.korunan > 0) satirlar.push(`🛡️ ${sonuc.korunan} Seri Koruyucu harcandı, serin sürdü`);
  if (sonuc.etkinlik) satirlar.push('🎉 2x muz etkinliği: muz ödülü **ikiye katlandı**');
  if (sonuc.prestij > 1) satirlar.push(`⭐ Prestij: muz ödülü **×${sonuc.prestij.toLocaleString('tr-TR')}**`);
  if (sonuc.uyelik > 1) satirlar.push(`💜 Katıl üyeliği: muz ödülü **×${sonuc.uyelik.toLocaleString('tr-TR')}**`);
  if (yoneticiCarpani(interaction.user.id) > 1) satirlar.push(`🛠️ Yönetici: muz ödülü **×${YONETICI_CARPAN}**`);
  if (sonuc.borcKesilen > 0) satirlar.push(`🏦 Kredi borcuna ${muz(sonuc.borcKesilen)} kesildi`);
  if (sonuc.haftalik) satirlar.push(`🎁 ${HAFTA_GUNU}. gün: ödül **ikiye katlandı**`);
  const kasalar = sonuc.kasalar.map((k) => `${esyaGetir(k).yedek} **${esyaGetir(k).ad}**`).join(' + ');
  satirlar.push(`${kasalar} envanterine eklendi → \`/kasa ac\``);
  // Unutulan kasalar: bugünküler dışında bekleyen varsa hatırlat.
  const bekleyen = acilmamisKasalar(db, interaction.guildId, interaction.user.id).reduce((t, k) => t + k.adet, 0);
  if (bekleyen > sonuc.kasalar.length) satirlar.push(`📦 Envanterinde toplam **${bekleyen}** açılmamış kasa bekliyor → \`/kasa ac\``);
  const kalanGun = HAFTA_GUNU - (sonuc.seri % HAFTA_GUNU);

  // Başlık özel emojiyi göstermez; tutar açıklamada.
  const embed = gomu('basari', 'Günlük ödül')
    .setDescription([`**+${muz(sonuc.toplam)}**`, '', ...satirlar].join('\n'))
    .addFields(
      { name: 'Seri', value: `${sonuc.seri} gün`, inline: true },
      { name: 'Bakiye', value: muz(sonuc.bakiye), inline: true },
    )
    .setFooter({
      text: sonuc.haftalik
        ? 'Yarın da gelirsen serin sürer.'
        : `Çift ödül + kasaya ${kalanGun} gün kaldı. Bir gün kaçırırsan seri sıfırlanır.`,
    });

  await interaction.reply({ embeds: [embed] });
  await gorevBildir(interaction, [{ tur: 'gunluk' }]);
}
