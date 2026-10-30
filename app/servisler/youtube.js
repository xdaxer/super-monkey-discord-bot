import { PermissionFlagsBits } from 'discord.js';

import { sistemAcikMi } from '../lib/ayarlar.js';
import { PINGSIZ } from '../lib/bicim.js';
import { veritabani } from '../lib/db.js';
import { abonelikler, akisCek, sonVideoYaz, yeniVideolar } from '../lib/youtube.js';
import { bildirimRolu } from '../lib/bildirim-rol.js';

export const VARSAYILAN_PERIYOT_MS = 300_000; // 5 dakika

/** Tekrar kontrolünde bakılan, botun hedef kanala attığı son gönderi sayısı. */
export const KONTROL_EDILEN_GONDERI = 3;

/**
 * Botun hedef kanala attığı son gönderilerde geçen video kimliklerini döndürür.
 *
 * Yayın açılırken RSS akışı bazen eski bir kopyayı döndürüyor; son işaretlenen
 * video akışta görünmeyince aynı video yeniden "yeni" sayılabiliyor. Kanalın
 * kendisine bakmak bu durumda son savunma. Başlık yerine kimliğe bakıyoruz:
 * canlı yayın başlığı sonradan değişebiliyor, tekrarlayan yayınlar ise aynı
 * başlığı taşıyabiliyor.
 *
 * Geçmiş okunamazsa (izin yok, ağ hatası) boş küme döner; bildirimi kaçırmak
 * tekrar göndermekten daha kötü.
 */
export async function sonGonderilenVideolar(kanal, botId, adet = KONTROL_EDILEN_GONDERI) {
  const kimlikler = new Set();
  if (!kanal.messages?.fetch) return kimlikler;

  // Kanalda sohbet de olabileceği için geniş çekip botun kendi mesajlarını süzüyoruz.
  const mesajlar = await kanal.messages.fetch({ limit: 50 }).catch(() => null);
  if (!mesajlar) return kimlikler;

  const botunkiler = [...mesajlar.values()]
    .filter((m) => !botId || m.author?.id === botId)
    .slice(0, adet);

  for (const mesaj of botunkiler) {
    for (const eslesme of String(mesaj.content ?? '').matchAll(/watch\?v=([\w-]{11})/g)) {
      kimlikler.add(eslesme[1]);
    }
  }
  return kimlikler;
}

/**
 * Bütün abonelikleri bir tur yoklar.
 *
 * Tek bir aboneliğin hatası turu düşürmez: akisCek ağ hatasında null döner ve
 * o abonelik atlanır, diğerleri işlenmeye devam eder.
 *
 * @returns {Promise<{islenen: number, gonderilen: number, atlanan: number, tekrarEngellenen: number}>}
 */
export async function birTur(client, { db = veritabani(), getir = fetch, logger = console } = {}) {
  const kayitlar = abonelikler(db);
  let gonderilen = 0;
  let atlanan = 0;
  let tekrarEngellenen = 0;

  for (const kayit of kayitlar) {
    if (!sistemAcikMi(db, kayit.guild_id, 'youtube')) {
      atlanan += 1;
      continue;
    }

    const videolar = await akisCek(kayit.kanal_id, getir);
    if (videolar === null) {
      atlanan += 1;
      continue;
    }

    // İlk yoklamada son video işaretlenmemişse yalnız işaretleyip geçiyoruz.
    if (!kayit.son_video_id) {
      if (videolar[0]) sonVideoYaz(db, kayit.guild_id, kayit.kanal_id, videolar[0].videoId);
      continue;
    }

    const yeniler = yeniVideolar(videolar, kayit.son_video_id);
    if (yeniler.length === 0) continue;

    const kanal = await client.channels.fetch(kayit.hedef_kanal_id).catch(() => null);
    if (!kanal?.isTextBased?.()) {
      atlanan += 1;
      continue;
    }

    const botUye = kanal.guild?.members?.me;
    if (botUye && !kanal.permissionsFor(botUye)?.has(PermissionFlagsBits.SendMessages)) {
      atlanan += 1;
      continue;
    }

    // Abonelikte etiket açıksa @everyone değil 🎬 Video Bildirimi rolü (lib/bildirim-rol.js):
    // yalnız rolü seçenler etiketlenir. Rol yoksa etiket atılmaz; başlıktaki etiketler hep engelli.
    const rol = kayit.herkesi_etiketle ? bildirimRolu(kanal.guild, 'video') : null;

    const zatenGonderilen = await sonGonderilenVideolar(kanal, client.user?.id);

    for (const video of yeniler) {
      if (zatenGonderilen.has(video.videoId)) {
        logger.warn?.(`YouTube: ${video.videoId} son gönderilerde zaten var, tekrar bildirilmedi.`);
        tekrarEngellenen += 1;
        sonVideoYaz(db, kayit.guild_id, kayit.kanal_id, video.videoId);
        continue;
      }

      const gitti = await kanal.send({
        content: `${rol ? `<@&${rol.id}> ` : ''}📺 **${video.kanalAdi ?? 'Kanal'}** yeni video yayınladı!\n`
          + `**${video.baslik}**\n${video.url}`,
        allowedMentions: rol ? { parse: [], roles: [rol.id] } : PINGSIZ.allowedMentions,
      }).then(() => true, (error) => {
        logger.error(`YouTube bildirimi gönderilemedi (${kayit.kanal_id}):`, error.message);
        return false;
      });

      if (gitti) {
        gonderilen += 1;
        zatenGonderilen.add(video.videoId);
      }
      // Gönderilemese bile işaretliyoruz ki aynı video sonsuza dek tekrar denenmesin.
      sonVideoYaz(db, kayit.guild_id, kayit.kanal_id, video.videoId);
    }
  }

  return {
    islenen: kayitlar.length, gonderilen, atlanan, tekrarEngellenen,
  };
}

/**
 * Periyodik yoklamayı başlatır.
 * @returns {() => void} durdurma fonksiyonu
 */
export function youtubeDongusuBaslat(client, secenekler = {}) {
  const { periyotMs = VARSAYILAN_PERIYOT_MS, logger = console } = secenekler;

  let calisiyor = false;
  const tur = async () => {
    // Bir tur uzun sürerse ikinci turu üst üste bindirmiyoruz.
    if (calisiyor) return;
    calisiyor = true;
    try {
      await birTur(client, { ...secenekler, logger });
    } catch (error) {
      logger.error('YouTube yoklama turu hata verdi:', error);
    } finally {
      calisiyor = false;
    }
  };

  const zamanlayici = setInterval(tur, periyotMs);
  zamanlayici.unref?.();

  return () => clearInterval(zamanlayici);
}
