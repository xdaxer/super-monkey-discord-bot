import { veritabani } from '../lib/db.js';
import { vadesiGelenleriIsle } from '../lib/kredi.js';

/**
 * Vadesi gelen krediler bu aralıkla işlenir: cüzdandan tahsil, kalan borç
 * olarak durur, gecikme cezası işler. İşlem veritabanı üstünde olduğu için
 * bot kapalıyken dolan vadeler açılıştaki ilk turda işlenir; koşullu UPDATE
 * yüzünden aynı kredi iki kez "gecikmeye düşmez".
 */
export const VARSAYILAN_PERIYOT_MS = 60_000;

export function krediDongusuBaslat({ db = veritabani(), periyotMs = VARSAYILAN_PERIYOT_MS, logger = console } = {}) {
  const tur = () => {
    try {
      const islenen = vadesiGelenleriIsle(db);
      const yeni = islenen.filter((i) => i.yeni).length;
      if (yeni > 0) logger.log(`Kredi: ${yeni} kredinin vadesi geldi, tahsil edildi.`);
    } catch (error) {
      logger.error('Kredi turu hata verdi:', error);
    }
  };

  tur();
  const zamanlayici = setInterval(tur, periyotMs);
  zamanlayici.unref?.();
  return () => clearInterval(zamanlayici);
}
