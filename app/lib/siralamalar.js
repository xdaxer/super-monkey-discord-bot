/**
 * Sıralama çeşitleri (/zenginler tur:): muz, toplam servet, seviye (XP),
 * koleksiyon puanı, günlük seri, prestij seviyesi ve haftalık net kumar kazancı.
 *
 * Her tür tek bir SQL alt sorgusu tanımlar: (kullanici_id, deger, ek). Üstüne
 * ortak sıralama ve "kendi sıran" sorguları bindirilir; sıralama sırası her
 * yerde `deger DESC, kullanici_id ASC` olduğundan ilk 10 ve kendi sıran tutarlıdır.
 *
 * Kumar ayrımı: defterde kumar kazancı `kazanc` türünde ve `karsi_id` BOŞ yazılır
 * (kumar.js, blackjack.js). Kasa ve eşya kaynaklı `kazanc` kayıtları ise
 * `karsi_id` olarak kasa/eşya kimliğini taşır. Bu yüzden defter yazımına dokunmadan
 * `kazanc AND karsi_id IS NULL` yalnız kumarı yakalar. Aynı mantıkla yarım kalan
 * blackjack elinin açılışta yapılan iadesi (`iade`, karsi_id boş) bahsi geri
 * kapatır; mağaza iadeleri karsi_id taşıdığından sayılmaz. `bahis` için de aynı
 * koşul aranır: düello bahsi, kazancı ve iadesi karsi_id olarak rakibi taşır;
 * koşulsuz sayılsa düelloda kaybedilen bahis girip kazanç girmezdi. Düello
 * üyeler arası olduğu için kumar sıralamasına hiç girmez.
 *
 * Bot sahibi ve geliştiriciler (yetkiliKimlikler) hiçbir sıralamada yer almaz:
 * yönetici çarpanı ve /ekonomi-yonet ile kazandıkları muz üyelerle yarışmaz.
 * Ekonomiden uzaklaştırılan üyeler de (ekonomi-uzak.js) görünmez.
 */

import { trGunBaslangici } from './ekonomi.js';
import { DURUMLAR } from './banka.js';
import { uzakKimlikler } from './ekonomi-uzak.js';
import { yetkiliKimlikler } from './izin.js';
import {
  kartDegeri, kartGetir, KARTLAR, parlakKimlik,
} from './kasalar.js';
import { seviyeCarpani } from './prestij-carpan.js';
import { seviyeHesapla } from './seviye.js';

const GUN_MS = 86_400_000;
const TR_OFFSET_MS = 3 * 3_600_000;

/** İçinde bulunulan haftanın Pazartesi 00:00 (Türkiye) anı, UTC ms. */
export function haftaBaslangici(simdi = Date.now()) {
  const pazartesidenBeri = (new Date(simdi + TR_OFFSET_MS).getUTCDay() + 6) % 7;
  return trGunBaslangici(simdi) - pazartesidenBeri * GUN_MS;
}

/** Gösterim bilgisi: başlık, simge, değerin yazılışı. */
export const SIRALAMA_TURLERI = Object.freeze({
  muz: { ad: 'Muz', baslik: 'en zenginler', simge: '🍌', bos: 'Henüz kimsenin muzu yok. **Cüzdan** ekranındaki günlük ödülle başlayabilirsin.' },
  toplam: { ad: 'Toplam servet', baslik: 'toplam servet (bakiye + bankadaki mevduat + hisse değeri)', simge: '🏦', bos: 'Henüz kimsenin serveti yok.' },
  seviye: { ad: 'Seviye', baslik: 'seviye ve toplam XP', simge: '📈', bos: 'Henüz kimse XP kazanmadı. Sohbet ederek başlayabilirsin.' },
  koleksiyon: { ad: 'Koleksiyon', baslik: 'koleksiyon puanı', simge: '🃏', bos: 'Henüz kimsenin kartı yok. **Envanter → Kasalar** ekranından başlayabilirsin.' },
  seri: { ad: 'Günlük seri', baslik: 'günlük seri', simge: '🔥', bos: 'Henüz kimsenin serisi yok. **Cüzdan** ekranındaki günlük ödülle başlayabilirsin.' },
  prestij: { ad: 'Prestij', baslik: 'prestij seviyesi', simge: '⭐', bos: 'Henüz kimse prestij yapmadı. **Prestij** ekranından başlayabilirsin.' },
  kumar: { ad: 'Haftalık kumar', baslik: 'bu haftanın kumar kazancı', simge: '🎰', bos: 'Bu hafta kumardan net kazanan yok.' },
});
export const SIRALAMA_KIMLIKLERI = Object.keys(SIRALAMA_TURLERI);

/** Her tür: `{ sql, parametreler }` — (kullanici_id, deger, ek) satırları, yalnız deger > 0. */
function altSorgu(tur, guildId, simdi) {
  const g = String(guildId);
  switch (tur) {
    case 'muz':
      return {
        sql: 'SELECT kullanici_id, bakiye AS deger, 0 AS ek FROM bakiyeler WHERE guild_id = ? AND bakiye > 0',
        parametreler: [g],
      };

    case 'toplam':
      // Bakiyesi 0 ama mevduatı olan kişi de listeye girsin: iki kaynağı birleştirip topla.
      return {
        sql: `SELECT kullanici_id, SUM(tutar) AS deger, 0 AS ek FROM (
                SELECT kullanici_id, bakiye AS tutar FROM bakiyeler WHERE guild_id = ?
                UNION ALL
                SELECT kullanici_id, anapara AS tutar FROM mevduatlar WHERE guild_id = ? AND durum = ?
                UNION ALL
                SELECT p.kullanici_id, p.adet * CAST(ROUND((SELECT f.fiyat FROM hisse_fiyatlari f
                  WHERE f.guild_id = p.guild_id AND f.sembol = p.sembol ORDER BY f.saat DESC LIMIT 1)) AS INTEGER) AS tutar
                  FROM hisse_pozisyonlari p WHERE p.guild_id = ? AND p.adet > 0
              ) GROUP BY kullanici_id HAVING SUM(tutar) > 0`,
        parametreler: [g, g, DURUMLAR.aktif, g],
      };

    case 'seviye':
      // Sıra toplam XP'ye göre (/seviye ile aynı); seviye XP'den hesaplanıp yazılır.
      return {
        sql: 'SELECT kullanici_id, xp AS deger, 0 AS ek FROM seviyeler WHERE guild_id = ? AND xp > 0',
        parametreler: [g],
      };

    case 'koleksiyon': {
      // Kart değerleri kodda tanımlı; küçük bir VALUES tablosu olarak sorguya verilir.
      // Parlak sürümler de (5 katı değerle) dahil.
      const tumKartlar = KARTLAR.flatMap((k) => [k, kartGetir(parlakKimlik(k.kimlik))]);
      const degerler = tumKartlar.flatMap((k) => [k.kimlik, kartDegeri(k)]);
      const satirlar = tumKartlar.map(() => '(?, ?)').join(', ');
      return {
        sql: `SELECT e.kullanici_id, SUM(e.adet * d.deger) AS deger, COUNT(DISTINCT REPLACE(e.esya, 'parlak:', '')) AS ek
              FROM envanter e JOIN (SELECT column1 AS esya, column2 AS deger FROM (VALUES ${satirlar})) d ON d.esya = e.esya
              WHERE e.guild_id = ? AND e.adet > 0 GROUP BY e.kullanici_id`,
        parametreler: [...degerler, g],
      };
    }

    case 'seri':
      return {
        sql: 'SELECT kullanici_id, gunluk_seri AS deger, 0 AS ek FROM bakiyeler WHERE guild_id = ? AND gunluk_seri > 0',
        parametreler: [g],
      };

    case 'prestij':
      // Eşitlikte son prestijini önce yapan üstte: deger = seviye, ek = son prestij zamanı (bilgi).
      return {
        sql: 'SELECT kullanici_id, seviye AS deger, son_prestij AS ek FROM prestijler WHERE guild_id = ? AND seviye > 0',
        parametreler: [g],
      };

    case 'kumar':
      return {
        sql: `SELECT kullanici_id, SUM(miktar) AS deger, 0 AS ek FROM ekonomi_hareketleri
              WHERE guild_id = ? AND zaman >= ?
                AND tur IN ('bahis', 'kazanc', 'iade', 'cashback') AND karsi_id IS NULL
              GROUP BY kullanici_id HAVING SUM(miktar) > 0`,
        parametreler: [g, haftaBaslangici(simdi)],
      };

    default:
      throw new RangeError(`Bilinmeyen sıralama türü: ${tur}`);
  }
}

/** Alt sorgudan yetkilileri süzer: `{ sql, parametreler }`. */
function suzulmus(db, tur, guildId, simdi, haric) {
  const { sql, parametreler } = altSorgu(tur, guildId, simdi);
  const kimlikler = [...haric.map(String), ...uzakKimlikler(db, guildId)];
  if (kimlikler.length === 0) return { sql, parametreler };
  return {
    sql: `SELECT * FROM (${sql}) WHERE kullanici_id NOT IN (${kimlikler.map(() => '?').join(', ')})`,
    parametreler: [...parametreler, ...kimlikler],
  };
}

/**
 * İlk `limit` kişi (yetkililer hariç).
 * @returns {Array<{kullanici_id: string, deger: number, ek: number}>}
 */
export function siralama(db, guildId, tur, { limit = 10, simdi = Date.now(), haric = yetkiliKimlikler() } = {}) {
  const { sql, parametreler } = suzulmus(db, tur, guildId, simdi, haric);
  return db
    .prepare(`SELECT kullanici_id, deger, ek FROM (${sql}) ORDER BY deger DESC, kullanici_id ASC LIMIT ?`)
    .all(...parametreler, Math.max(1, Math.floor(limit)));
}

/**
 * Kullanıcının kendi sırası (1 tabanlı) ve değeri; listede yoksa (yetkililer
 * dahil) null.
 * Sıra, `siralama` ile aynı eşitlik kuralını kullanır.
 */
export function kendiSirasi(db, guildId, tur, kullaniciId, { simdi = Date.now(), haric = yetkiliKimlikler() } = {}) {
  const { sql, parametreler } = suzulmus(db, tur, guildId, simdi, haric);
  const benim = db
    .prepare(`SELECT kullanici_id, deger, ek FROM (${sql}) WHERE kullanici_id = ?`)
    .get(...parametreler, String(kullaniciId));
  if (!benim) return null;
  const onde = db
    .prepare(`SELECT COUNT(*) AS adet FROM (${sql}) WHERE deger > ? OR (deger = ? AND kullanici_id < ?)`)
    .get(...parametreler, benim.deger, benim.deger, benim.kullanici_id);
  return { sira: onde.adet + 1, deger: benim.deger, ek: benim.ek, kullanici_id: benim.kullanici_id };
}

/** Bir satırın değerini türüne göre yazar. `muzBicimi`: muz miktarını yazan fonksiyon. */
export function degerMetni(tur, satir, muzBicimi, kartToplami = KARTLAR.length) {
  switch (tur) {
    case 'koleksiyon':
      return `**${satir.deger.toLocaleString('tr-TR')}** puan · ${satir.ek}/${kartToplami} farklı kart`;
    case 'seviye':
      return `**Sv ${seviyeHesapla(satir.deger).seviye}** · ${satir.deger.toLocaleString('tr-TR')} XP`;
    case 'seri':
      return `**${satir.deger.toLocaleString('tr-TR')}** gün`;
    case 'prestij':
      return `**⭐×${satir.deger}** (+%${Math.round((seviyeCarpani(satir.deger) - 1) * 100)} muz kazancı)`;
    case 'kumar':
      return `**+${muzBicimi(satir.deger)}**`;
    default:
      return `**${muzBicimi(satir.deger)}**`;
  }
}
