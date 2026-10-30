import { ayarGetir } from '../lib/ayarlar.js';
import { gomu } from '../lib/bicim.js';
import { veritabani } from '../lib/db.js';
import {
  duyurulacakHaberler, guncelle, haberDuyuruldu, sirketBul,
} from '../lib/hisse.js';

/**
 * Fiyatlar 5 dakikada bir güncellenir. Fiyat geçmişi DB'de olduğu için bot
 * kapalıyken kaçırılan adımlar (en çok 48 saat) açılıştaki ilk turda telafi
 * edilir; tur dakikada bir döner ama aynı adım iki kez yazılamaz
 * (lib/hisse.js `guncelle`). Haberler `hisse.kanal` ayarlıysa duyurulur.
 */
export const VARSAYILAN_PERIYOT_MS = 60_000;

async function duyur(client, db, guildId, logger) {
  const bekleyen = duyurulacakHaberler(db, guildId);
  if (bekleyen.length === 0) return;

  const kanalId = ayarGetir(db, guildId, 'hisse.kanal');
  for (const h of bekleyen) {
    // Kanal ayarlı değilse duyuru yok; işaretleyip tekrar denemeyi bırakırız.
    if (!kanalId) {
      haberDuyuruldu(db, guildId, h.id);
      continue;
    }
    const kanal = await client.channels.fetch(kanalId).catch(() => null);
    if (!kanal?.isTextBased?.()) continue; // geçici erişilemez: sonraki tur dener

    const sirket = sirketBul(h.sembol);
    const artis = h.yuzde > 0;
    const embed = gomu(artis ? 'basari' : 'hata', `${artis ? '📈' : '📉'} Hisse haberi: ${h.sembol}`)
      .setDescription(`${h.metin}\n**${artis ? '+' : ''}${h.yuzde.toLocaleString('tr-TR')}%** · ${sirket?.ad ?? h.sembol}`);
    // İşaret önce: gönderim sonrası çökerse çift duyuru yerine eksik duyuru tercih edilir.
    if (!haberDuyuruldu(db, guildId, h.id)) continue;
    await kanal.send({ embeds: [embed], allowedMentions: { parse: [] } })
      .catch((error) => logger.error('Hisse haberi gönderilemedi:', error.message));
  }
}

export function hisseDongusuBaslat(client, {
  db = veritabani(), guildId, periyotMs = VARSAYILAN_PERIYOT_MS, logger = console,
} = {}) {
  let calisiyor = false;
  const tur = async () => {
    if (!guildId || calisiyor) return;
    calisiyor = true;
    try {
      const sonuc = guncelle(db, { guildId });
      if (sonuc.saat > 0) logger.log(`Hisse: ${sonuc.saat} adım fiyat yazıldı, ${sonuc.haberler.length} haber.`);
      await duyur(client, db, guildId, logger);
    } catch (error) {
      logger.error('Hisse turu hata verdi:', error);
    } finally {
      calisiyor = false;
    }
  };

  tur();
  const zamanlayici = setInterval(tur, periyotMs);
  zamanlayici.unref?.();
  return () => clearInterval(zamanlayici);
}
