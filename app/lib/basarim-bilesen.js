import { MessageFlags } from 'discord.js';

import { basarimlariKontrolEt, KADEMELER, odulMetni } from './basarimlar.js';
import { veritabani } from './db.js';
import { muz } from './ekonomi.js';

/**
 * Etkileşimin sahibi için başarımları kontrol eder; yeni kazanılan varsa yalnız
 * ona görünen (gizli) bir takip mesajı gönderir. Hata atmaz: asıl yanıt gitmiştir.
 */
export async function basarimBildir(interaction) {
  try {
    const yeniler = basarimlariKontrolEt(veritabani(), interaction.guildId, interaction.user.id);
    if (yeniler.length === 0) return;

    const satirlar = yeniler.map(({ tanim }) => (
      `🏆 **Başarım:** ${KADEMELER[tanim.kademe].simge} ${tanim.ad} → ${odulMetni(tanim.odul, muz)}`
    ));
    await interaction.followUp({
      content: `${satirlar.join('\n')}\n-# Ödül verildi. Hepsi için \`/basarim\`.`,
      flags: MessageFlags.Ephemeral,
    });
  } catch {
    // Bildirim gidemese de başarım ve ödül yazıldı.
  }
}
