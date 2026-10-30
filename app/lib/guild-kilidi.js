import { requireEnv } from './env.js';

/**
 * Tek guild kapsamı (kapsam: "Tek guild") kod tarafında da zorlanır.
 *
 * Developer Portal'daki "Public Bot" anahtarı kapatılsa bile, daha önce
 * alınmış bir davet bağlantısıyla eklenmiş sunucular kendiliğinden düşmez.
 * Bu modül botu yalnız .env'deki guildID'de tutar: başka her sunucudan
 * kendiliğinden ayrılır.
 */

/** İzinli sunucu kimliği; .env okunamazsa hata fırlatır. */
export function izinliGuild() {
  const { guildID } = requireEnv('guildID');
  return guildID;
}

/** Bu sunucuda kalınmalı mı? */
export function izinliMi(guildId, izinliId) {
  return String(guildId) === String(izinliId);
}

/**
 * Verilen sunucu kimlikleri içinden ayrılınması gerekenleri döndürür.
 * Saf fonksiyon: girdi kimlik listesi, çıktı kimlik listesi.
 */
export function yetkisizSunucular(guildIds, izinliId) {
  return [...guildIds].filter((id) => !izinliMi(id, izinliId));
}

/**
 * Tek bir sunucudan ayrılır. Ayrılma başarısız olursa bot düşmez;
 * hata loglanır ve false döner.
 */
export async function sunucudanAyril(guild, logger = console) {
  try {
    await guild.leave();
    logger.warn(`İzinsiz sunucudan ayrılındı: ${guild.name} (${guild.id})`);
    return true;
  } catch (error) {
    logger.error(`İzinsiz sunucudan ayrılınamadı: ${guild.id} — ${error.message}`);
    return false;
  }
}

/**
 * Açılışta önbellekteki bütün sunucuları tarar ve izinli olmayanlardan ayrılır.
 * Eklenme anını kaçırmış (bot kapalıyken eklenmiş) sunucuları da temizler.
 *
 * @returns {Promise<string[]>} ayrılma denenen sunucu kimlikleri
 */
export async function yetkisizSunuculariTemizle(client, izinliId, logger = console) {
  const hedefler = yetkisizSunucular(client.guilds.cache.keys(), izinliId);

  for (const id of hedefler) {
    const guild = client.guilds.cache.get(id);
    if (guild) await sunucudanAyril(guild, logger);
  }

  return hedefler;
}
