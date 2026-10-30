import { ayarGetir, sistemAcikMi } from '../lib/ayarlar.js';
import { gomu } from '../lib/bicim.js';
import { veritabani } from '../lib/db.js';
import { muz } from '../lib/ekonomi.js';
import {
  duyurulacaklar, duyuruldu, vadesiGelenCekilisler,
} from '../lib/piyango.js';

/**
 * Çekilişler bu aralıkla kontrol edilir. Çekiliş DB üstünde olduğu için
 * bot kapalıyken geçen çekiliş açılıştaki ilk turda yapılır; ödeme ve
 * "bir kez" kilidi lib/piyango.js'te tek işlemde.
 */
export const VARSAYILAN_PERIYOT_MS = 60_000;

async function duyur(client, db, guildId, logger) {
  const bekleyen = duyurulacaklar(db, guildId);
  if (bekleyen.length === 0) return;

  const kanalId = ayarGetir(db, guildId, 'piyango.kanal');
  for (const c of bekleyen) {
    // Kanal ayarlı değilse duyuru yok; işaretleyip tekrar denemeyi bırakırız.
    if (!kanalId) {
      duyuruldu(db, guildId, c.cekilis);
      continue;
    }
    const kanal = await client.channels.fetch(kanalId).catch(() => null);
    if (!kanal?.isTextBased?.()) continue; // kanal geçici erişilemez: sonraki tur dener (24 saat)

    const embed = gomu('basari', '🎟️ Haftalık piyango sonuçlandı')
      .setDescription(`Kazanan: <@${c.kazanan_id}>\nİkramiye: **${muz(c.havuz)}**`)
      .addFields({ name: 'Satılan bilet', value: String(c.bilet_toplam), inline: true });
    // İşaret önce: gönderim sonrası çökerse çift duyuru yerine eksik duyuru tercih edilir.
    if (!duyuruldu(db, guildId, c.cekilis)) continue;
    await kanal.send({
      content: `🎉 <@${c.kazanan_id}> haftalık piyangoyu kazandı!`,
      embeds: [embed],
      allowedMentions: { users: [c.kazanan_id] },
    }).catch((error) => logger.error('Piyango duyurusu gönderilemedi:', error.message));
  }
}

export function piyangoDongusuBaslat(client, {
  db = veritabani(), guildId, periyotMs = VARSAYILAN_PERIYOT_MS, logger = console,
} = {}) {
  let calisiyor = false;
  const tur = async () => {
    if (!guildId || calisiyor) return;
    calisiyor = true;
    try {
      const yapilan = vadesiGelenCekilisler(db, { guildId, ekonomiAcik: sistemAcikMi(db, guildId, 'ekonomi') });
      if (yapilan.length > 0) logger.log(`Piyango: ${yapilan.length} çekiliş yapıldı.`);
      await duyur(client, db, guildId, logger);
    } catch (error) {
      logger.error('Piyango turu hata verdi:', error);
    } finally {
      calisiyor = false;
    }
  };

  tur();
  const zamanlayici = setInterval(tur, periyotMs);
  zamanlayici.unref?.();
  return () => clearInterval(zamanlayici);
}
