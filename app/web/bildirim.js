/**
 * Görev ve başarım kancalarının web karşılığı. Slash komutlarda bunlar gizli
 * takip mesajıyla bildiriliyor (lib/gorev-bilesen.js, lib/basarim-bilesen.js);
 * Activity'de yanıtın `bildirimler` alanına girer ve ekranda kısa bildirim olur.
 */

import { basarimlariKontrolEt, KADEMELER, odulMetni as basarimOdulMetni } from '../lib/basarimlar.js';
import { muz } from '../lib/ekonomi.js';
import { gorevIlerlet, odulMetni as gorevOdulMetni } from '../lib/gorevler.js';

const BASLIK = { gunluk: 'Günlük görev', haftalik: 'Haftalık görev', bonus: 'Günlük bonus' };

/** @param {Array<{tur: string, miktar?: number}>} olaylar lib/gorev-bilesen.js'teki gibi */
export function gorevBildirimleri(db, guildId, kullaniciId, olaylar) {
  const biten = olaylar.flatMap((o) => gorevIlerlet(db, {
    guildId, kullaniciId, tur: o.tur, miktar: o.miktar ?? 1,
  }));
  return biten.map((b) => ({ tur: 'gorev', metin: `✅ **${BASLIK[b.donem]}:** ${b.ad} → ${gorevOdulMetni(b.odul, muz)}` }));
}

export function basarimBildirimleri(db, guildId, kullaniciId) {
  return basarimlariKontrolEt(db, guildId, kullaniciId).map(({ tanim }) => ({
    tur: 'basarim',
    metin: `🏆 **Başarım:** ${KADEMELER[tanim.kademe].simge} ${tanim.ad} → ${basarimOdulMetni(tanim.odul, muz)}`,
  }));
}
