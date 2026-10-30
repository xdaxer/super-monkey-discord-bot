/**
 * Katıl (YouTube üyelik) kumar iadesi: kademesi olan üyeye, o Türkiye
 * gününün NET kumar zararının %CASHBACK_YUZDE'si geri ödenir.
 *
 * Tek tek kayıplara iade verilseydi kasa payı %10'dan küçük oyunlarda
 * (yazı-tura, rulet renk) beklenen geri ödeme 1'i geçer, çok oynayan muz
 * basardı. Bunun yerine her kayıpla biten oyunda günün net sonucu yeniden
 * hesaplanır ve hak edilen toplamdan bugün ödenmiş iade düşülür. Kazançla
 * biten oyunda zarar küçüldüyse fazla ödenen iade kazançtan geri alınır
 * (en çok kazancın %10'u, bakiye eksiye düşmez); böylece gün içindeki toplam
 * iade her an tam olarak günün net zararının %10'udur.
 *
 * Yalnız net zarara iade vermek de bir "bedava sigorta"dır: günde tek büyük,
 * yüksek varyanslı bahis (rulet sayı, çok mayınlı mines) oynayan çoğu gün
 * kaybedip iade alır, ara sıra büyük kazanır; kasa payı %5 iken bu strateji
 * kâr ederdi. Bu yüzden iade ayrıca günün toplam bahsinin %CASHBACK_BAHIS_TAVAN_YUZDE'iyle
 * sınırlı: kasa payının (≥ ~%2) altında kaldığından hiçbir strateji kâr etmez.
 *
 * Süren mines/blackjack oyunlarının bahsi defterde düşülmüş ama sonuçlanmamıştır;
 * zarara sayılmasın diye geri eklenir (yoksa açık büyük oyun + küçük kayıp
 * iadeyi şişirirdi). Bahis akışlarının (lib/kumar.js, blackjack.js, mines.js)
 * kendi işlemi içinde, oyun kaydı silindikten sonra çağrılır.
 */

import { dus, ekle, TURLER, trGunBaslangici } from './ekonomi.js';
import { uyelikKademesi } from './uyelik-carpan.js';

export const CASHBACK_YUZDE = 10;
/** Günün iadesi, o gün sonuçlanmış toplam bahsin bu yüzdesini geçmez. */
export const CASHBACK_BAHIS_TAVAN_YUZDE = 1;

/** Net zarar ve sonuçlanmış toplam bahis için hak edilen toplam iade (zarar yoksa 0). */
export function cashbackHesapla(net, yatirilan = Infinity) {
  if (net >= 0) return 0;
  return Math.min(
    Math.floor((-net * CASHBACK_YUZDE) / 100),
    Math.floor((yatirilan * CASHBACK_BAHIS_TAVAN_YUZDE) / 100),
  );
}

/** Günün net kumar sonucu, sonuçlanmış toplam bahsi (süren oyunlar hariç) ve ödenmiş iade. */
function gunDurumu(db, guildId, kullaniciId, simdi) {
  const g = String(guildId);
  const k = String(kullaniciId);
  const gun = trGunBaslangici(simdi);
  const { net, yatirilan, odenen } = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN tur IN ('bahis', 'kazanc', 'iade') AND karsi_id IS NULL THEN miktar END), 0) AS net,
              COALESCE(SUM(CASE WHEN tur = 'bahis' AND karsi_id IS NULL THEN -miktar END), 0) AS yatirilan,
              COALESCE(SUM(CASE WHEN tur = 'cashback' THEN miktar END), 0) AS odenen
       FROM ekonomi_hareketleri WHERE guild_id = ? AND kullanici_id = ? AND zaman >= ?`,
    )
    .get(g, k, gun);
  const acik = db
    .prepare(
      `SELECT COALESCE(SUM(bahis), 0) AS toplam FROM (
         SELECT bahis FROM mines_oyunlari WHERE guild_id = ? AND kullanici_id = ? AND baslangic >= ?
         UNION ALL
         SELECT bahis FROM blackjack_oyunlari WHERE guild_id = ? AND kullanici_id = ? AND baslangic >= ?)`,
    )
    .get(g, k, gun, g, k, gun).toplam;
  return { net: net + acik, yatirilan: yatirilan - acik, odenen };
}

/**
 * Oyun sonuçlanınca günün iadesini eşitler: kayıpla bittiyse ve üye Katıl
 * kademesindeyse eksik iadeyi öder; kazançla bittiyse fazla iadeyi geri alır.
 * @returns {{iade: number, bakiye: number} | null} iade < 0 geri alınan; değişmediyse null
 */
export function kumarCashback(db, { guildId, kullaniciId, net, simdi = Date.now() }) {
  if (net === 0) return null;
  if (net < 0 && !uyelikKademesi(db, guildId, kullaniciId)) return null;
  const gun = gunDurumu(db, guildId, kullaniciId, simdi);
  const fark = cashbackHesapla(gun.net, gun.yatirilan) - gun.odenen;
  if (net < 0 && fark > 0) {
    const bakiye = ekle(db, { guildId, kullaniciId, miktar: fark, tur: TURLER.cashback, simdi });
    return { iade: fark, bakiye };
  }
  if (net > 0 && fark < 0) {
    // Kazanç bu oyunda az önce ödendi; geri alınan zararın küçülmesinin %10'unu geçmez.
    const geri = Math.min(-fark, Math.floor((net * CASHBACK_YUZDE) / 100));
    if (geri <= 0) return null;
    const bakiye = dus(db, { guildId, kullaniciId, miktar: geri, tur: TURLER.cashback, simdi });
    return bakiye === null ? null : { iade: -geri, bakiye };
  }
  return null;
}
