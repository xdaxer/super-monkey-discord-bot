import { ayarGetir, sistemAcikMi } from '../lib/ayarlar.js';
import { gomu } from '../lib/bicim.js';
import { veritabani } from '../lib/db.js';
import { muz, trGunBaslangici } from '../lib/ekonomi.js';
import {
  DEGER_ESIGI, MESAJ_SINIRI, supheliUzaklastir, YENI_HESAP_GUN,
} from '../lib/supheli.js';

/**
 * Her gece 00:00'da (Türkiye) bir önceki günün aktarımlarını tarar
 * (lib/supheli.js) ve şüpheli çiftleri ekonomiden uzaklaştırır. Taranan gün
 * `supheli_taramalari`na yazılır: dakikalık kontrol aynı günü iki kez taramaz,
 * bot gece kapalıysa açılışta taranır. Sonuç talep rapor kanalına düşer.
 */
export const VARSAYILAN_PERIYOT_MS = 60_000;
const GUN_MS = 86_400_000;

async function raporla(client, db, guildId, gun, ciftler, logger) {
  const kanalId = ayarGetir(db, guildId, 'talep.raporKanal');
  if (!kanalId || ciftler.length === 0) return;
  const kanal = await client.channels.fetch(kanalId).catch(() => null);
  if (!kanal?.isTextBased?.()) return;
  const tarih = new Date(gun + 3 * 3_600_000).toISOString().slice(0, 10);
  const embed = gomu('uyari', '🛡️ Otomatik denetim: ekonomiden uzaklaştırma')
    .setDescription([
      `**${tarih}** günü tarandı; yeni hesaptan tek bir hesaba kısa sürede değer akışı bulundu.`,
      '',
      ...ciftler.map((c) => `• <@${c.veren}> → <@${c.alan}> · ~${muz(c.deger)} · veren ${c.mesaj} mesajlı`),
      '',
      `Kural: ≥ ${muz(DEGER_ESIGI)} net akış, veren ekonomide en çok ${YENI_HESAP_GUN} günlük ve ${MESAJ_SINIRI} mesajdan az. `
      + 'İki taraf da uzaklaştırıldı; yanlışsa **Activity → Yönetim → Uzaklaştırma**\'dan kaldır.',
    ].join('\n'));
  await kanal.send({ embeds: [embed], allowedMentions: { parse: [] } })
    .catch((error) => logger.error('Şüpheli taraması raporu gönderilemedi:', error.message));
}

/** Bugün taranmadıysa dünü tarar; taranan günü ve bulunanları döner (taranmadıysa null). */
export function gunuTara(db, { guildId, yetkiliId, simdi = Date.now() }) {
  const gun = trGunBaslangici(simdi) - GUN_MS;
  const var_ = db.prepare('SELECT 1 FROM supheli_taramalari WHERE guild_id = ? AND gun = ?').get(String(guildId), gun);
  if (var_) return null;
  const ciftler = supheliUzaklastir(db, guildId, {
    baslangic: gun, bitis: gun + GUN_MS, yetkiliId, simdi,
  });
  db.prepare('INSERT INTO supheli_taramalari (guild_id, gun, zaman, bulunan) VALUES (?, ?, ?, ?)')
    .run(String(guildId), gun, simdi, ciftler.length);
  return { gun, ciftler };
}

export function supheliDongusuBaslat(client, {
  db = veritabani(), guildId, periyotMs = VARSAYILAN_PERIYOT_MS, logger = console,
} = {}) {
  let calisiyor = false;
  const tur = async () => {
    if (!guildId || calisiyor || !client.user) return;
    if (!sistemAcikMi(db, guildId, 'ekonomi')) return;
    calisiyor = true;
    try {
      const sonuc = gunuTara(db, { guildId, yetkiliId: client.user.id });
      if (sonuc) {
        logger.log(`Şüpheli taraması: ${sonuc.ciftler.length} çift uzaklaştırıldı.`);
        await raporla(client, db, guildId, sonuc.gun, sonuc.ciftler, logger);
      }
    } catch (error) {
      logger.error('Şüpheli taraması hata verdi:', error);
    } finally {
      calisiyor = false;
    }
  };
  const zamanlayici = setInterval(tur, periyotMs);
  zamanlayici.unref?.();
  return () => clearInterval(zamanlayici);
}
