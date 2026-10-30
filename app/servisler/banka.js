import { vadesiGelenleriOde } from '../lib/banka.js';
import { veritabani } from '../lib/db.js';

/**
 * Vadesi dolan mevduatlar bu aralıkla ödenir. Ödeme veritabanı üstünde
 * olduğu için bot kapalıyken dolan vadeler açılıştaki ilk turda ödenir.
 * Kullanıcı `/banka` ya da `/cuzdan` açınca kendi vadesi de hemen ödenir.
 */
export const VARSAYILAN_PERIYOT_MS = 60_000;

export function bankaDongusuBaslat({ db = veritabani(), periyotMs = VARSAYILAN_PERIYOT_MS, logger = console } = {}) {
  const tur = () => {
    try {
      const odenen = vadesiGelenleriOde(db);
      if (odenen.length > 0) logger.log(`Banka: ${odenen.length} mevduatın vadesi doldu, ödendi.`);
    } catch (error) {
      logger.error('Banka turu hata verdi:', error);
    }
  };

  tur();
  const zamanlayici = setInterval(tur, periyotMs);
  zamanlayici.unref?.();
  return () => clearInterval(zamanlayici);
}
