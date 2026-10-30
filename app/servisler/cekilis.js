import { sistemAcikMi } from '../lib/ayarlar.js';
import { PINGSIZ } from '../lib/bicim.js';
import {
  acikCekilisler, cekilisGetir, katilimSayisi, kazananMetni, sonuclandir,
} from '../lib/cekilis.js';
import { cekilisGomusu, katilButonu } from '../lib/cekilis-bilesen.js';
import { veritabani } from '../lib/db.js';

/**
 * Süresi dolan çekilişler bu aralıkla taranır.
 *
 * Çekiliş başına setTimeout kurmak yerine tek periyodik tarama kullanıyoruz:
 * aynı kod hem normal süre dolumunu hem de bot kapalıyken geçen süreyi
 * (yeniden başlatma kurtarması) halleder, ikinci bir yol test edilmek zorunda
 * kalmaz. Bedeli: bitiş en çok bu aralık kadar gecikir.
 */
export const VARSAYILAN_PERIYOT_MS = 15_000;

/**
 * Çekiliş mesajını sonuçla günceller ve kazananları duyurur.
 * @returns {Promise<boolean>} duyuru gönderildi mi
 */
async function sonucuYayinla(client, db, cekilis, kazananlar, logger) {
  const kanal = await client.channels.fetch(cekilis.kanal_id).catch(() => null);
  if (!kanal?.isTextBased?.()) return false;

  const adet = katilimSayisi(db, cekilis.id);
  const guncel = { ...cekilis, durum: 'bitti', kazananlar };

  if (cekilis.mesaj_id) {
    const mesaj = await kanal.messages.fetch(cekilis.mesaj_id).catch(() => null);
    await mesaj?.edit({
      embeds: [cekilisGomusu(guncel, adet)],
      components: [katilButonu(cekilis.id, adet, true)],
      ...PINGSIZ,
    }).catch((error) => logger.error(`Çekiliş #${cekilis.id} mesajı güncellenemedi:`, error.message));
  }

  const metin = kazananlar.length > 0
    ? `🎉 **${cekilis.odul}** çekilişinin kazananı: ${kazananMetni(kazananlar)}\nTebrikler!`
    : `🎁 **${cekilis.odul}** çekilişine kimse katılmadı, kazanan çıkmadı.`;

  const gitti = await kanal.send({
    content: metin,
    // Yalnız kazananlar etiketlenir; ödül metnine yazılmış @everyone geçmez.
    allowedMentions: { users: kazananlar },
    reply: cekilis.mesaj_id ? { messageReference: cekilis.mesaj_id, failIfNotExists: false } : undefined,
  }).then(() => true, (error) => {
    logger.error(`Çekiliş #${cekilis.id} sonucu gönderilemedi:`, error.message);
    return false;
  });

  return gitti;
}

/**
 * Süresi dolmuş açık çekilişleri bir tur sonuçlandırır.
 *
 * Tek bir çekilişin hatası turu düşürmez; kayıt zaten sonuçlanmış olduğu için
 * bir sonraki tur aynı çekilişi tekrar çekmeye kalkmaz.
 *
 * @returns {Promise<{bakilan: number, sonuclanan: number, atlanan: number}>}
 */
export async function birTur(client, { db = veritabani(), simdi = Date.now(), logger = console,
  rastgele = Math.random } = {}) {
  const acik = acikCekilisler(db);
  let sonuclanan = 0;
  let atlanan = 0;

  for (const cekilis of acik) {
    if (cekilis.bitis > simdi) continue;

    // Sistem kapatılmışsa çekilişi sonuçlandırmıyoruz: yönetici açtığında
    // kaldığı yerden devam etsin, kapalıyken sessizce çekilmesin.
    if (!sistemAcikMi(db, cekilis.guild_id, 'cekilis')) {
      atlanan += 1;
      continue;
    }

    const sonuc = sonuclandir(db, cekilis.id, { rastgele, simdi });
    if (!sonuc.ok) {
      atlanan += 1;
      continue;
    }

    try {
      await sonucuYayinla(client, db, cekilis, sonuc.kazananlar, logger);
      sonuclanan += 1;
    } catch (error) {
      logger.error(`Çekiliş #${cekilis.id} sonuçlandırılırken hata:`, error.message);
      atlanan += 1;
    }
  }

  return { bakilan: acik.length, sonuclanan, atlanan };
}

/**
 * Periyodik çekiliş taramasını başlatır.
 * @returns {() => void} durdurma fonksiyonu
 */
export function cekilisDongusuBaslat(client, secenekler = {}) {
  const { periyotMs = VARSAYILAN_PERIYOT_MS, logger = console } = secenekler;

  let calisiyor = false;
  const tur = async () => {
    if (calisiyor) return;
    calisiyor = true;
    try {
      await birTur(client, { ...secenekler, simdi: Date.now(), logger });
    } catch (error) {
      logger.error('Çekiliş turu hata verdi:', error);
    } finally {
      calisiyor = false;
    }
  };

  const zamanlayici = setInterval(tur, periyotMs);
  zamanlayici.unref?.();

  return () => clearInterval(zamanlayici);
}

export { cekilisGetir };
