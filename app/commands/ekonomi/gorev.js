import { InteractionContextType, SlashCommandBuilder } from 'discord.js';

import { gomu, zaman } from '../../lib/bicim.js';
import { veritabani } from '../../lib/db.js';
import { muz } from '../../lib/ekonomi.js';
import {
  GUNLUK_BONUS, gorevleriGetir, ilerlemeCubugu, odulMetni,
} from '../../lib/gorevler.js';

export const sistem = 'ekonomi';
export const modul = 'ekonomi';

export const data = new SlashCommandBuilder()
  .setName('gorev')
  .setDescription('Günlük ve haftalık görevlerini ve ilerlemeni gösterir. Ödüller bitince kendiliğinden verilir.')
  .setContexts(InteractionContextType.Guild);

/** Görev satırı: tamamlandıysa ✅ ve üstü çizili ad, değilse ilerleme çubuğu. */
function gorevSatiri({ tanim, ilerleme, bitti }) {
  const odul = odulMetni(tanim.odul, muz);
  if (bitti > 0) return `✅ ~~${tanim.ad}~~ · ${odul}`;
  return `▫️ **${tanim.ad}**\n${ilerlemeCubugu(ilerleme, tanim.hedef)} · ${odul}`;
}

export async function execute(interaction) {
  const { gunluk, haftalik } = gorevleriGetir(veritabani(), {
    guildId: interaction.guildId, kullaniciId: interaction.user.id,
  });

  const biten = gunluk.gorevler.filter((g) => g.bitti > 0).length;
  const bonus = odulMetni(GUNLUK_BONUS, muz);
  const bonusSatiri = gunluk.bonus > 0
    ? `✅ Hepsini bitirdin, bonus verildi: ${bonus}`
    : `Üçünü de bitirirsen bonus: ${bonus} (${biten}/${gunluk.gorevler.length})`;

  // Alan adı özel emoji göstermez; muz simgesi yalnız değerlerde.
  const embed = gomu('bilgi', 'Görevler')
    .addFields(
      {
        name: 'Günlük görevler',
        value: `${gunluk.gorevler.map(gorevSatiri).join('\n')}\n${bonusSatiri}\n-# Yenilenme: ${zaman(gunluk.bitis, 'R')} (gece yarısı)`,
      },
      {
        name: 'Haftalık görevler',
        value: `${haftalik.gorevler.map(gorevSatiri).join('\n')}\n-# Yenilenme: ${zaman(haftalik.bitis, 'R')} (Pazartesi 00:00)`,
      },
    )
    .setFooter({ text: 'Ödüller görev bitince kendiliğinden verilir. Saatler Türkiye saatidir.' });

  await interaction.reply({ embeds: [embed] });
}
