import { MessageFlags } from 'discord.js';

import { veritabani } from './db.js';
import { muz } from './ekonomi.js';
import { gorevIlerlet, odulMetni } from './gorevler.js';
import { KUMAR_SAYIM_MIN } from './kumar.js';

/**
 * Kumar kancası için olay listesi. `bahis`: az önce açılan bahsin tutarı (yoksa
 * null); `biten`: sonuçlanan oyunun `{bahis, net}`'i (el sürüyorsa null).
 * KUMAR_SAYIM_MIN'den küçük bahis sayılmaz; "kâr" en az bahsin yarısı kadar
 * net kazançtır (1 mayınlı tek kareyle görev toplanmasın).
 */
export function kumarOlaylari({ bahis = null, biten = null } = {}) {
  const sayilir = (b) => b !== null && b >= KUMAR_SAYIM_MIN;
  return [
    ...(sayilir(bahis) ? [{ tur: 'kumar' }] : []),
    ...(biten && sayilir(biten.bahis) && biten.net * 2 >= biten.bahis ? [{ tur: 'kumar-kazan' }] : []),
  ];
}

/** Kasa açma kancası için olay listesi: her sonuç bir açma, yeni kart ayrıca sayılır. */
export function kasaOlaylari(sonuclar) {
  const yeniKart = sonuclar.filter((s) => s.yeniKart).length;
  return [
    { tur: 'kasa-ac', miktar: sonuclar.length },
    ...(yeniKart > 0 ? [{ tur: 'kart-yeni', miktar: yeniKart }] : []),
  ];
}

const BASLIK = { gunluk: 'Günlük görev', haftalik: 'Haftalık görev', bonus: 'Günlük bonus' };

/**
 * Etkileşimin sahibi için olayları görevlere yazar; görev bittiyse yalnız ona
 * görünen (gizli) bir takip mesajı gönderir. Kanala yazmaz: kumar/kasa gibi
 * herkese açık yanıtların yanında görev duyurusu kalabalık yapar, ödül zaten
 * kendiliğinden verilir. Hata atmaz; asıl yanıt çoktan gitmiştir.
 *
 * @param {Array<{tur: string, miktar?: number}>} olaylar
 */
export async function gorevBildir(interaction, olaylar) {
  try {
    const db = veritabani();
    const biten = olaylar.flatMap((o) => gorevIlerlet(db, {
      guildId: interaction.guildId, kullaniciId: interaction.user.id, tur: o.tur, miktar: o.miktar ?? 1,
    }));
    if (biten.length === 0) return;

    const satirlar = biten.map((b) => `✅ **${BASLIK[b.donem]}:** ${b.ad} → ${odulMetni(b.odul, muz)}`);
    await interaction.followUp({
      content: `${satirlar.join('\n')}\n-# Ödül verildi. Kalanlar için \`/gorev\`.`,
      flags: MessageFlags.Ephemeral,
    });
  } catch {
    // Bildirim gidemese de ilerleme ve ödül yazıldı.
  }
}
