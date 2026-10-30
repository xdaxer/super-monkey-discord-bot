import { sistemAcikMi } from '../lib/ayarlar.js';
import { veritabani } from '../lib/db.js';
import { hatirlatmaIcerigi, teslimAl, zamaniGelenler } from '../lib/hatirlatici.js';

/**
 * Zamanı gelen hatırlatmalar bu aralıkla taranır. Çekilişle aynı gerekçe:
 * tek periyodik tarama hem normal teslimi hem bot kapalıyken geçen süreyi
 * halleder. Bedeli: hatırlatma en çok bu aralık kadar gecikir.
 */
export const VARSAYILAN_PERIYOT_MS = 15_000;

/**
 * Hatırlatmayı kurulduğu kanala gönderir; kanal silinmiş ya da bot artık
 * yazamıyorsa kurucuya DM ile dener ki hatırlatma sessizce kaybolmasın.
 * @returns {Promise<'kanal'|'dm'|null>}
 */
async function gonder(client, kayit, logger) {
  const icerik = hatirlatmaIcerigi(kayit);

  const kanal = await client.channels.fetch(kayit.kanal_id).catch(() => null);
  if (kanal?.isTextBased?.()) {
    const gitti = await kanal.send({
      ...icerik,
      reply: kayit.mesaj_id ? { messageReference: kayit.mesaj_id, failIfNotExists: false } : undefined,
    }).then(() => true, (error) => {
      logger.error(`Hatırlatma #${kayit.id} kanala gönderilemedi:`, error.message);
      return false;
    });
    if (gitti) return 'kanal';
  }

  const kullanici = await client.users.fetch(kayit.kullanici_id).catch(() => null);
  const dm = await kullanici?.send({
    content: `${icerik.content}\n-# Kurulduğu kanala (<#${kayit.kanal_id}>) gönderilemediği için DM ile geldi.`,
    allowedMentions: { parse: [] },
  }).then(() => true, () => false);

  return dm ? 'dm' : null;
}

/**
 * Zamanı gelmiş hatırlatmaları bir tur gönderir.
 * @returns {Promise<{bakilan: number, gonderilen: number, atlanan: number}>}
 */
export async function birTur(client, { db = veritabani(), simdi = Date.now(), logger = console } = {}) {
  const gelenler = zamaniGelenler(db, simdi);
  let gonderilen = 0;
  let atlanan = 0;

  for (const kayit of gelenler) {
    // Sistem kapalıyken bekletiyoruz: açılınca gecikmeli de olsa gelsin.
    if (!sistemAcikMi(db, kayit.guild_id, 'hatirlatici')) {
      atlanan += 1;
      continue;
    }

    // Önce teslim alınıyor: gönderim yarıda kalsa da aynı etiket iki kez gitmez.
    if (!teslimAl(db, kayit.id)) {
      atlanan += 1;
      continue;
    }

    try {
      const nereye = await gonder(client, kayit, logger);
      if (nereye) gonderilen += 1;
      else {
        atlanan += 1;
        logger.error(`Hatırlatma #${kayit.id} ne kanala ne DM'e gönderilebildi.`);
      }
    } catch (error) {
      logger.error(`Hatırlatma #${kayit.id} gönderilirken hata:`, error.message);
      atlanan += 1;
    }
  }

  return { bakilan: gelenler.length, gonderilen, atlanan };
}

/**
 * Periyodik hatırlatma taramasını başlatır.
 * @returns {() => void} durdurma fonksiyonu
 */
export function hatirlaticiDongusuBaslat(client, secenekler = {}) {
  const { periyotMs = VARSAYILAN_PERIYOT_MS, logger = console } = secenekler;

  let calisiyor = false;
  const tur = async () => {
    if (calisiyor) return;
    calisiyor = true;
    try {
      await birTur(client, { ...secenekler, simdi: Date.now(), logger });
    } catch (error) {
      logger.error('Hatırlatma turu hata verdi:', error);
    } finally {
      calisiyor = false;
    }
  };

  const zamanlayici = setInterval(tur, periyotMs);
  zamanlayici.unref?.();

  return () => clearInterval(zamanlayici);
}
