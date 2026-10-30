import { ayarGetir, sistemAcikMi } from '../lib/ayarlar.js';
import { veritabani } from '../lib/db.js';
import { SES_GUNLUK_AYAR, SES_PERIYOT_MS, sesXpAlanlar, sesXpVer } from '../lib/seviye.js';
import { xpBonusu, xpSonrasi } from '../lib/seviye-odul.js';

/**
 * Seste duranlara bir tur XP verir. Ses durumları GuildVoiceStates intent'iyle
 * gelen önbellekten okunur; Discord'a istek yalnız rol eşitleme ve seviye
 * duyurusunda gider.
 * @returns {Promise<{verilen: number}>}
 */
export async function birTur(client, { db = veritabani(), guildId, simdi = Date.now(), logger = console } = {}) {
  const guild = client.guilds.cache.get(String(guildId));
  if (!guild || !sistemAcikMi(db, guild.id, 'seviye')) return { verilen: 0 };
  const tavan = ayarGetir(db, guild.id, SES_GUNLUK_AYAR);
  if (!(tavan > 0)) return { verilen: 0 };

  const durumlar = [...guild.voiceStates.cache.values()].map((d) => ({
    kanalId: d.channelId,
    kullaniciId: d.id,
    bot: d.member?.user?.bot ?? false,
    sagir: Boolean(d.selfDeaf || d.serverDeaf),
    susturulmus: Boolean(d.selfMute || d.serverMute),
  }));

  let verilen = 0;
  for (const kullaniciId of sesXpAlanlar(durumlar, { afkKanalId: guild.afkChannelId })) {
    try {
      const member = guild.members.cache.get(kullaniciId) ?? null;
      const sonuc = sesXpVer(db, {
        guildId: guild.id, kullaniciId, simdi, tavan,
        bonus: xpBonusu(db, guild.id, member ?? { id: kullaniciId }),
      });
      if (!sonuc.verildi) continue;
      verilen += 1;
      await xpSonrasi(db, { guild, member, kullaniciId, sonuc, client });
    } catch (error) {
      logger.error(`Ses XP'si verilemedi (${kullaniciId}):`, error.message);
    }
  }

  return { verilen };
}

/**
 * Dakikalık ses XP taramasını başlatır.
 * @returns {() => void} durdurma fonksiyonu
 */
export function sesXpDongusuBaslat(client, secenekler = {}) {
  const { periyotMs = SES_PERIYOT_MS, logger = console } = secenekler;

  let calisiyor = false;
  const tur = async () => {
    if (calisiyor) return;
    calisiyor = true;
    try {
      await birTur(client, { ...secenekler, simdi: Date.now(), logger });
    } catch (error) {
      logger.error('Ses XP turu hata verdi:', error);
    } finally {
      calisiyor = false;
    }
  };

  const zamanlayici = setInterval(tur, periyotMs);
  zamanlayici.unref?.();

  return () => clearInterval(zamanlayici);
}
