/**
 * Kumar bahis metninin ayrıştırılması: slash komut ve web API aynı kuralı
 * kullanır (bakiye, seviye tavanı, `hepsi`/`yarı` kırpma, alt-üst sınır).
 */

import { ayarGetir } from './ayarlar.js';
import { bakiye, miktarAyristir } from './ekonomi.js';
import { bahisKontrol, bahisTavani } from './kumar.js';
import { kullaniciGetir } from './seviye.js';

/**
 * Üyenin şu anki bahis tavanı (seviyeye bağlı, `ekonomi.maksBahis` ile sınırlı).
 * @returns {number}
 */
export function kullaniciBahisTavani(db, guildId, kullaniciId) {
  return bahisTavani(kullaniciGetir(db, guildId, kullaniciId).seviye, ayarGetir(db, guildId, 'ekonomi.maksBahis'));
}

/**
 * Bahis metnini ayrıştırıp sınırlara göre doğrular.
 * @returns {{ok: true, miktar: number} | {ok: false, sebep: string}}
 */
export function bahisCoz(db, { guildId, kullaniciId, ham }) {
  const mevcut = bakiye(db, guildId, kullaniciId);
  const maks = kullaniciBahisTavani(db, guildId, kullaniciId);

  const ayrisan = miktarAyristir(ham, mevcut);
  if (!ayrisan.ok) return ayrisan;

  // "hepsi" / "yarı" sınırı aşıyorsa sınırdan oynamak kullanıcının niyetine en yakın davranış.
  const goreli = !/\d/.test(ham);
  const miktar = goreli ? Math.min(ayrisan.miktar, maks) : ayrisan.miktar;

  const kontrol = bahisKontrol(miktar, mevcut, maks);
  return kontrol.ok ? { ok: true, miktar } : kontrol;
}
