import { ayarGetir, sistemAcikMi } from '../lib/ayarlar.js';
import {
  bossBul, bossSil, duyurulacaklar, duyuruldu, mesajKaydet, suresiDolanlar, vadesiGelenBoss,
} from '../lib/boss.js';
import {
  bossGomusu, bossMesajiniGuncelle, saldirButonu, sonucDuyurusu,
} from '../lib/boss-bilesen.js';
import { veritabani } from '../lib/db.js';

/**
 * Boss çıkışı ve sonuçları bu aralıkla kontrol edilir. Her şey DB üstünde
 * olduğu için bot kapalıyken geçen çıkış (telafi penceresinde) ve dolan süre
 * açılıştaki ilk turda işlenir; ödeme ve "bir kez" kilidi lib/boss.js'te.
 */
export const VARSAYILAN_PERIYOT_MS = 60_000;

/** Boss mesajını kanala gönderir; gönderilemezse savaşı geri alır. */
export async function bossMesajiGonder(client, db, guildId, savas, kanalId, logger = console) {
  try {
    const kanal = await client.channels.fetch(kanalId);
    if (!kanal?.isTextBased?.()) throw new Error('kanal metin kanalı değil');
    const mesaj = await kanal.send({
      embeds: [bossGomusu(db, kanal.guild, savas)],
      components: [saldirButonu()],
      allowedMentions: { parse: [] },
    });
    mesajKaydet(db, savas.id, kanalId, mesaj.id);
    return mesaj;
  } catch (error) {
    logger.error('Boss mesajı gönderilemedi:', error.message);
    bossSil(db, savas.id);
    return null;
  }
}

/** Haftalık çıkış vadesi geldiyse boss çıkarıp mesajı gönderir. */
async function cikisKontrol(client, db, guildId, logger) {
  const kanalId = ayarGetir(db, guildId, 'boss.kanal');
  if (!kanalId || !sistemAcikMi(db, guildId, 'ekonomi')) return; // kanal yoksa boss çıkmaz
  const savas = vadesiGelenBoss(db, { guildId });
  if (!savas) return;
  logger.log(`Boss çıktı: ${savas.boss}${savas.elit ? ' (elit)' : ''}, can ${savas.max_can}.`);
  await bossMesajiGonder(client, db, guildId, savas, kanalId, logger);
}

async function duyur(client, db, guildId, logger) {
  for (const savas of duyurulacaklar(db, guildId)) {
    const kanalId = savas.kanal_id;
    // Mesajı olmayan (kanalsız) savaş duyurulmaz; işaretleyip bırakırız.
    if (!kanalId) {
      duyuruldu(db, savas.id);
      continue;
    }
    const kanal = await client.channels.fetch(kanalId).catch(() => null);
    if (!kanal?.isTextBased?.()) continue; // geçici erişilemez: sonraki tur dener (24 saat)

    // Boss mesajını kapat (buton pasif), sonra duyur.
    await bossMesajiniGuncelle(client, db, savas.id);
    const guncel = bossBul(db, savas.id);
    // İşaret önce: gönderim sonrası çökerse çift duyuru yerine eksik duyuru tercih edilir.
    if (!duyuruldu(db, savas.id)) continue;
    await kanal.send(sonucDuyurusu(db, kanal.guild, guncel))
      .catch((error) => logger.error('Boss duyurusu gönderilemedi:', error.message));
  }
}

export function bossDongusuBaslat(client, {
  db = veritabani(), guildId, periyotMs = VARSAYILAN_PERIYOT_MS, logger = console,
} = {}) {
  let calisiyor = false;
  const tur = async () => {
    if (!guildId || calisiyor) return;
    calisiyor = true;
    try {
      const biten = suresiDolanlar(db, guildId);
      if (biten.length > 0) logger.log(`Boss: ${biten.length} savaş sonuçlandı.`);
      await duyur(client, db, guildId, logger);
      await cikisKontrol(client, db, guildId, logger);
    } catch (error) {
      logger.error('Boss turu hata verdi:', error);
    } finally {
      calisiyor = false;
    }
  };

  tur();
  const zamanlayici = setInterval(tur, periyotMs);
  zamanlayici.unref?.();
  return () => clearInterval(zamanlayici);
}
