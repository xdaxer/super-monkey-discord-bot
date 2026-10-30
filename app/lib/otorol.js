import { ayarGetir, sistemAcikMi } from './ayarlar.js';

/**
 * Girene otorolün verilip verilmeyeceğine karar verir (Carl-bot AutoRoles yerine).
 * Botlara verilmez: entegrasyon rolleri zaten kendi rollerini getirir.
 */
export function otorolKarari(db, guildId, { bot = false } = {}) {
  if (bot) return { ok: false, sebep: 'bot' };
  if (!sistemAcikMi(db, guildId, 'otorol')) return { ok: false, sebep: 'otorol kapalı' };

  const rolId = ayarGetir(db, guildId, 'otorol.rol');
  if (!rolId) return { ok: false, sebep: 'otorol.rol ayarlanmamış' };

  return { ok: true, rolId };
}
