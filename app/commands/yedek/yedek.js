import {
  InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';

import { ayarGetir } from '../../lib/ayarlar.js';
import { gomu, zaman } from '../../lib/bicim.js';
import { veritabani } from '../../lib/db.js';
import { sahipKontrol } from '../../lib/izin.js';
import { boyutBicimle, yedekAl, yedekleriListele } from '../../servisler/yedek.js';

export const sistem = 'yedek';
export const modul = 'yedek';

/** Listede gösterilen en fazla yedek. */
export const LISTE_SINIRI = 15;

/**
 * Yedek komutları yalnız bot sahibine ve yetkili geliştiricilere açıktır
 * (.env → authorUserID ve developerUserIDs).
 *
 * Yönetici yetkisi yetmiyor: yedek dosyası bütün sunucu verisini taşır
 * (talepler, uyarılar, başvurular, XP), yönetici sayısı ise zamanla artar.
 *
 * Discord tarafındaki Administrator kısıtı bırakıldı ama tek başına yeterli
 * değil: sunucu ayarlarından komut izni kişiye/role açılabiliyor. Asıl kapı
 * aşağıdaki çalışma anı kontrolü.
 */
export const data = new SlashCommandBuilder()
  .setName('yedek')
  .setDescription('Veritabanı yedeklerini yönetir (sahip ve yetkili geliştiriciler).')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((s) => s.setName('al').setDescription('Hemen bir yedek alır.'))
  .addSubcommand((s) => s.setName('liste').setDescription('Mevcut yedekleri listeler.'));

export { sahipKontrol };

export async function execute(interaction) {
  const sahip = sahipKontrol(interaction.user.id);
  if (!sahip.ok) {
    await interaction.reply({ content: sahip.sebep, flags: MessageFlags.Ephemeral });
    return;
  }

  const db = veritabani();
  const alt = interaction.options.getSubcommand();

  if (alt === 'al') {
    // VACUUM INTO büyük veritabanında saniyeler sürebilir; 3 sn'lik
    // etkileşim penceresine sığmayabileceği için erteliyoruz.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const saklanan = ayarGetir(db, interaction.guildId, 'yedek.saklanan');
    const sonuc = yedekAl({ db, saklanan });

    if (!sonuc.ok) {
      await interaction.editReply(`❌ ${sonuc.sebep}`);
      return;
    }

    const not = sonuc.silinen.length > 0
      ? `\nRotasyon: ${sonuc.silinen.length} eski yedek silindi (sınır ${saklanan}).`
      : '';

    // Yedeği sahip dışında biri aldıysa sunucu günlüğünde iz kalsın.
    if (sahip.rol !== 'sahip') {
      console.log(`Yedek ${sonuc.ad} geliştirici ${interaction.user.id} tarafından alındı.`);
    }

    await interaction.editReply(
      `💾 Yedek alındı: \`${sonuc.ad}\` — ${boyutBicimle(sonuc.boyut)}, ${sonuc.sureMs} ms.${not}`,
    );
    return;
  }

  const yedekler = yedekleriListele();

  if (yedekler.length === 0) {
    await interaction.reply({
      content: 'Henüz yedek yok. `/yedek al` ile ilk yedeği alabilirsin.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const toplam = yedekler.reduce((t, y) => t + y.boyut, 0);
  const satirlar = yedekler.slice(0, LISTE_SINIRI).map(
    (y) => `• \`${y.ad}\` — ${boyutBicimle(y.boyut)} · ${zaman(y.zaman, 'R')}`,
  );

  if (yedekler.length > LISTE_SINIRI) {
    satirlar.push(`_...ve ${yedekler.length - LISTE_SINIRI} yedek daha_`);
  }

  const embed = gomu('bilgi', `Yedekler (${yedekler.length})`)
    .setDescription(satirlar.join('\n'))
    .addFields(
      { name: 'Toplam boyut', value: boyutBicimle(toplam), inline: true },
      { name: 'Saklama sınırı', value: String(ayarGetir(db, interaction.guildId, 'yedek.saklanan')), inline: true },
      { name: 'Aralık', value: `${ayarGetir(db, interaction.guildId, 'yedek.periyotSaat')} saat`, inline: true },
    );

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
