/**
 * Şüpheli aktarım taraması: yeni açılmış bir hesabın, kazandığını kısa sürede
 * tek bir hesaba akıtması ("yan hesapla ödül kasıp ana hesaba aktarma").
 * servisler/supheli.js her gece 00:00'da (TR) bir önceki günü tarar ve
 * eşleşen iki hesabı ekonomiden uzaklaştırır (lib/ekonomi-uzak.js).
 *
 * Bir çift (veren → alan) şu üç koşulun hepsini taşırsa şüphelidir:
 *  1. Pencerede verenden alana net akan değer ≥ DEGER_ESIGI.
 *     Değer = muz (gönder ve takasın muz kısmı, düello/XOX bahisleri, pazar)
 *     + eşya (takas, hediye, pazar; kart satış değeri, kasa mağaza fiyatı).
 *     Karşılıklı gidip gelen aynı değer birbirini götürür.
 *  2. Veren yeni: ekonomideki ilk hareketi pencere başından en çok
 *     YENI_HESAP_GUN önce.
 *  3. Veren sohbette neredeyse yok: MESAJ_SINIRI'ndan az XP'li mesaj.
 * Eşikler bilerek tutucudur: uzun süredir oynayan üyeler arasındaki takas ve
 * düellolar hiçbir zaman bu kurala girmez. Yanlış uzaklaştırma Yönetim →
 * Uzaklaştırma'dan kaldırılır.
 */

import { uzakKimlikler, uzaklastir } from './ekonomi-uzak.js';
import { esyaGetir } from './esyalar.js';
import { yetkiliKimlikler } from './izin.js';
import { kartDegeri, kartGetir } from './kasalar.js';

export const DEGER_ESIGI = 5_000;
export const YENI_HESAP_GUN = 7;
export const MESAJ_SINIRI = 50;
const GUN_MS = 86_400_000;

/** Muz akışına sayılan defter türleri (karsi_id karşı tarafı taşır). */
const MUZ_TURLERI = ['gonder', 'al', 'pazar', 'bahis', 'kazanc', 'iade'];
/** Eşya akışına sayılan türler (karsi_id karşı tarafı taşır). */
const ESYA_TURLERI = ['takas-ver', 'takas-al', 'hediye-ver', 'hediye-al', 'pazar-al'];

/** Eşyanın muz karşılığı: kart satış değeri, diğerleri mağaza fiyatı (satılmayan 0). */
export function esyaDegeri(kimlik) {
  const kart = kartGetir(kimlik);
  if (kart) return kartDegeri(kart);
  return esyaGetir(kimlik)?.fiyat ?? 0;
}

const KIMLIK = /^\d{15,21}$/;

/**
 * Penceredeki ikili akışlar: `${a}>${b}` → a'dan b'ye net değer (muz + eşya).
 * Her çift tek yönde (pozitif) tutulur.
 */
function ikiliAkislar(db, guildId, baslangic, bitis) {
  const net = new Map(); // `${kim}|${karsi}` → kim'in karşıdan net kazancı
  const yaz = (kim, karsi, deger) => {
    if (!KIMLIK.test(karsi)) return; // kasa/eşya/emanet kimlikleri karşı taraf değildir
    const k = `${kim}|${karsi}`;
    net.set(k, (net.get(k) ?? 0) + deger);
  };
  const g = String(guildId);

  for (const r of db.prepare(
    `SELECT kullanici_id, karsi_id, SUM(miktar) AS s FROM ekonomi_hareketleri
     WHERE guild_id = ? AND zaman >= ? AND zaman < ? AND karsi_id IS NOT NULL
       AND tur IN (${MUZ_TURLERI.map(() => '?').join(', ')})
     GROUP BY kullanici_id, karsi_id`,
  ).all(g, baslangic, bitis, ...MUZ_TURLERI)) yaz(r.kullanici_id, r.karsi_id, r.s);

  for (const r of db.prepare(
    `SELECT kullanici_id, karsi_id, esya, tur, SUM(adet) AS adet FROM esya_hareketleri
     WHERE guild_id = ? AND zaman >= ? AND zaman < ? AND karsi_id IS NOT NULL
       AND tur IN (${ESYA_TURLERI.map(() => '?').join(', ')})
     GROUP BY kullanici_id, karsi_id, esya, tur`,
  ).all(g, baslangic, bitis, ...ESYA_TURLERI)) {
    const deger = esyaDegeri(r.esya) * r.adet;
    yaz(r.kullanici_id, r.karsi_id, deger);
    // Pazarda satıcının eşya satırı karşı taraf taşımaz: alıcının kazandığı satıcıdan çıkmıştır.
    if (r.tur === 'pazar-al') yaz(r.karsi_id, r.kullanici_id, -deger);
  }

  // a'nın b'den net kazancı ile b'nin a'dan net kazancı birleşir: a→b akışı = (b kazancı − a kazancı) / 2.
  const akis = new Map();
  for (const [k, deger] of net) {
    const [a, b] = k.split('|');
    const anahtar = a < b ? `${a}|${b}` : `${b}|${a}`;
    const isaret = a < b ? -1 : 1; // anahtar "x|y" için pozitif = x'ten y'ye
    akis.set(anahtar, (akis.get(anahtar) ?? 0) + isaret * deger);
  }
  return [...akis].map(([k, deger]) => {
    const [x, y] = k.split('|');
    const tek = deger / 2; // iki tarafın satırları aynı akışı iki kez sayar
    return tek >= 0 ? { veren: x, alan: y, deger: Math.round(tek) } : { veren: y, alan: x, deger: Math.round(-tek) };
  });
}

/**
 * Penceredeki şüpheli çiftler (yetkililer ve zaten uzaklaştırılmışlar hariç).
 * @returns {Array<{veren: string, alan: string, deger: number, ilkHareket: number, mesaj: number}>}
 */
export function supheliTara(db, guildId, {
  baslangic, bitis, haric = yetkiliKimlikler(),
}) {
  const disarida = new Set([...haric.map(String), ...uzakKimlikler(db, guildId)]);
  const ilk = db.prepare('SELECT MIN(zaman) AS z FROM ekonomi_hareketleri WHERE guild_id = ? AND kullanici_id = ?');
  const mesaj = db.prepare('SELECT mesaj_sayisi AS n FROM seviyeler WHERE guild_id = ? AND kullanici_id = ?');
  return ikiliAkislar(db, guildId, baslangic, bitis)
    .filter((a) => a.deger >= DEGER_ESIGI && !disarida.has(a.veren) && !disarida.has(a.alan))
    .map((a) => ({
      ...a,
      ilkHareket: ilk.get(String(guildId), a.veren)?.z ?? 0,
      mesaj: mesaj.get(String(guildId), a.veren)?.n ?? 0,
    }))
    .filter((a) => a.ilkHareket >= baslangic - YENI_HESAP_GUN * GUN_MS && a.mesaj < MESAJ_SINIRI)
    .sort((x, y) => y.deger - x.deger);
}

/** Uzaklaştırma sebebi (üye pencerede görür). */
export function supheliSebebi(a, rol) {
  const deger = a.deger.toLocaleString('tr-TR');
  return rol === 'veren'
    ? `Otomatik denetim: yeni hesaptan kısa sürede tek bir hesaba ~${deger} muz değerinde aktarım (yan hesapla ödül kasıp aktarma şüphesi).`
    : `Otomatik denetim: yeni açılmış bir hesaptan kısa sürede ~${deger} muz değerinde aktarım aldın (yan hesapla ödül kasıp aktarma şüphesi).`;
}

/**
 * Tarar ve iki tarafı uzaklaştırır.
 * @returns {Array<{veren: string, alan: string, deger: number}>} uzaklaştırılan çiftler
 */
export function supheliUzaklastir(db, guildId, {
  baslangic, bitis, yetkiliId, simdi = Date.now(), haric = yetkiliKimlikler(),
}) {
  const ciftler = supheliTara(db, guildId, { baslangic, bitis, haric });
  for (const a of ciftler) {
    for (const [kim, rol] of [[a.veren, 'veren'], [a.alan, 'alan']]) {
      uzaklastir(db, {
        guildId, kullaniciId: kim, sebep: supheliSebebi(a, rol), yetkiliId, simdi, yetkililer: haric,
      });
    }
  }
  return ciftler;
}
