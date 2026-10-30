/**
 * Para (muz) ekonomisi: bakiye, günlük ödül, sohbet ödülü, transfer ve defter.
 *
 * Sayılar docs/para.md ile birebir aynıdır; biri değişirse diğeri de
 * değişmeli. Bakiye yalnız bu dosyadaki `ekle` / `dus` ile değişir: düşme
 * koşullu UPDATE ile yapılır (yetersiz bakiyede hiçbir satır değişmez) ve her
 * değişim aynı işlemde ekonomi_hareketleri defterine yazılır.
 */

import {
  adet, esyaDus, esyaEkle, esyaHareketi,
} from './envanter.js';
import { etkinlikCarpani } from './etkinlik.js';
import { BORC_YASAK, borcaKes, borcluMu } from './kredi.js';
import { carpanUygula, prestijCarpani } from './prestij-carpan.js';
import { uyelikCarpani } from './uyelik-carpan.js';
import { yetkiliKimlikler } from './izin.js';
import { yoneticiCarpani } from './yonetici-carpan.js';
import { uzakAktarimSebebi } from './ekonomi-uzak.js';

export const BIRIM = 'muz';
/** Botun uygulama emojisinin adı (`npm run muzemoji` yükler). */
export const EMOJI_ADI = 'muz';
/** Uygulama emojisi bulunamazsa kullanılan yedek simge. */
export const YEDEK_SIMGE = '🍌';

let simge = YEDEK_SIMGE;

/**
 * Para simgesi. Açılışta uygulama emojisi bulunursa `<:muz:id>` olur.
 * Discord embed başlığında, alan adında ve alt bilgide özel emojiyi
 * göstermez; simge yalnız mesaj içeriği, açıklama ve alan değerinde kullanılır.
 */
export function paraSimgesi() {
  return simge;
}

/** Açılışta bir kez çağrılır; boş verilirse yedek simgeye döner. */
export function paraSimgesiAyarla(yeni) {
  simge = yeni || YEDEK_SIMGE;
  return simge;
}

/** Uygulama emojisinin mesajda kullanılacak biçimi. */
export function emojiMetni(emoji) {
  if (!emoji?.id || !emoji?.name) return null;
  return `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`;
}

/** Günlük ödül: taban aralığı (iki uç dahil), seri başına ek ve ekin tavanı. */
export const GUNLUK_MIN = 200;
export const GUNLUK_MAX = 400;
export const SERI_BASINA = 30;
export const SERI_TAVANI = 1500;
/** Serinin her 7. günü ödül ikiye katlanır. */
export const HAFTA_GUNU = 7;
/** Envanterdeki bu eşya, kaçırılan her gün için bir tane harcanarak seriyi korur. */
export const SERI_KORUYUCU = 'seri-koruyucu';
/** Serinin her 7. gününde muzun yanında verilen kasa. */
export const HAFTALIK_KASA = 'kasa-ahsap';
/** Her günlük ödülde verilen kasa (lib/kasalar.js GUNLUK_KASA ile aynı). */
export const GUNLUK_ODUL_KASASI = 'kasa-gunluk';

/** Sohbet ödülü: mesaj başına aralık ve bekleme. */
export const MESAJ_MIN = 1;
export const MESAJ_MAX = 4;
export const MESAJ_BEKLEME_MS = 60_000;

/** Transfer: en az tutar ve günlük gönderim limiti (seviyeye bağlı). */
export const TRANSFER_MIN = 10;
export const LIMIT_TABAN = 2000;
export const LIMIT_SEVIYE_BASINA = 500;

/** Defterdeki hareket türleri. */
export const TURLER = Object.freeze({
  gunluk: 'gunluk',
  mesaj: 'mesaj',
  seviye: 'seviye',
  gonder: 'gonder',
  al: 'al',
  vergi: 'vergi',
  bahis: 'bahis',
  kazanc: 'kazanc',
  iade: 'iade',
  magaza: 'magaza',
  satis: 'satis',
  mevduat: 'mevduat',
  faiz: 'faiz',
  setOdul: 'set-odul',
  yonetici: 'yonetici',
  gorev: 'gorev',
  calis: 'calis',
  piyango: 'piyango',
  basarim: 'basarim',
  boss: 'boss',
  kredi: 'kredi',
  hisse: 'hisse',
  prestij: 'prestij',
  cashback: 'cashback',
  sefer: 'sefer',
  yukseltme: 'yukseltme',
  ciftlik: 'ciftlik',
  pazar: 'pazar',
  promo: 'promo',
});

/**
 * Türkiye 2016'dan beri sabit UTC+3 (yaz saati yok). Günlük ödül ve transfer
 * limiti Türkiye takvim gününe göre sıfırlanır.
 */
const TR_OFFSET_MS = 3 * 3_600_000;
const GUN_MS = 86_400_000;

/** Türkiye takvim günü, "YYYY-MM-DD". */
export function trGunu(simdi = Date.now()) {
  return new Date(simdi + TR_OFFSET_MS).toISOString().slice(0, 10);
}

/** İçinde bulunulan Türkiye gününün başlangıcı (UTC ms). */
export function trGunBaslangici(simdi = Date.now()) {
  return Math.floor((simdi + TR_OFFSET_MS) / GUN_MS) * GUN_MS - TR_OFFSET_MS;
}

/** Bir sonraki Türkiye gece yarısı (UTC ms). */
export function sonrakiGunBaslangici(simdi = Date.now()) {
  return trGunBaslangici(simdi) + GUN_MS;
}

/** İki "YYYY-MM-DD" arasındaki gün farkı. */
function gunFarki(once, sonra) {
  return Math.round((Date.parse(`${sonra}T00:00:00Z`) - Date.parse(`${once}T00:00:00Z`)) / GUN_MS);
}

function aralik(min, max, rastgele) {
  return min + Math.floor(rastgele() * (max - min + 1));
}

/** Sayıyı "12.345" biçiminde yazar. */
export function bicimle(miktar) {
  return Math.trunc(Number(miktar) || 0).toLocaleString('tr-TR');
}

/** "1.250 🍌" (ya da uygulama emojisi) */
export function muz(miktar) {
  return `${bicimle(miktar)} ${simge}`;
}

/**
 * Bir işlem içinde çalıştırır. SAVEPOINT iç içe çağrılabilir: dış işlem varsa
 * onun parçası olur, hata olursa yalnız bu kısım geri alınır ve hata yükselir.
 */
export function islem(db, fn) {
  db.exec('SAVEPOINT ekonomi');
  try {
    const sonuc = fn();
    db.exec('RELEASE ekonomi');
    return sonuc;
  } catch (error) {
    db.exec('ROLLBACK TO ekonomi');
    db.exec('RELEASE ekonomi');
    throw error;
  }
}

export function hesapGetir(db, guildId, kullaniciId) {
  const satir = db
    .prepare(
      `SELECT bakiye, gunluk_seri, son_gunluk, son_mesaj_odulu FROM bakiyeler
       WHERE guild_id = ? AND kullanici_id = ?`,
    )
    .get(String(guildId), String(kullaniciId));

  return satir ?? { bakiye: 0, gunluk_seri: 0, son_gunluk: null, son_mesaj_odulu: 0 };
}

export function bakiye(db, guildId, kullaniciId) {
  return hesapGetir(db, guildId, kullaniciId).bakiye;
}

function hesapAc(db, guildId, kullaniciId) {
  db.prepare('INSERT OR IGNORE INTO bakiyeler (guild_id, kullanici_id) VALUES (?, ?)')
    .run(String(guildId), String(kullaniciId));
}

function deftereYaz(db, {
  guildId, kullaniciId, tur, miktar, karsiId = null, oyun = null, simdi,
}) {
  const sonra = bakiye(db, guildId, kullaniciId);
  db.prepare(
    `INSERT INTO ekonomi_hareketleri (guild_id, kullanici_id, tur, miktar, bakiye_sonra, karsi_id, zaman, oyun)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(String(guildId), String(kullaniciId), tur, miktar, sonra, karsiId ? String(karsiId) : null, simdi, oyun);
  return sonra;
}

function tamSayiMi(miktar) {
  return Number.isSafeInteger(miktar) && miktar > 0;
}

/** Bakiyeye ekler; yeni bakiyeyi döner. `oyun`: kumar/düello satırında oyunun adı. */
export function ekle(db, {
  guildId, kullaniciId, miktar, tur, karsiId = null, oyun = null, simdi = Date.now(),
}) {
  if (!tamSayiMi(miktar)) throw new RangeError(`Geçersiz miktar: ${miktar}`);

  return islem(db, () => {
    hesapAc(db, guildId, kullaniciId);
    db.prepare('UPDATE bakiyeler SET bakiye = bakiye + ? WHERE guild_id = ? AND kullanici_id = ?')
      .run(miktar, String(guildId), String(kullaniciId));
    return deftereYaz(db, {
      guildId, kullaniciId, tur, miktar, karsiId, oyun, simdi,
    });
  });
}

/**
 * Bakiyeden düşer. Bakiye yetmiyorsa hiçbir şey yazmaz ve null döner;
 * yetiyorsa yeni bakiyeyi döner.
 */
export function dus(db, {
  guildId, kullaniciId, miktar, tur, karsiId = null, oyun = null, simdi = Date.now(),
}) {
  if (!tamSayiMi(miktar)) throw new RangeError(`Geçersiz miktar: ${miktar}`);

  return islem(db, () => {
    const { changes } = db
      .prepare(
        `UPDATE bakiyeler SET bakiye = bakiye - ?
         WHERE guild_id = ? AND kullanici_id = ? AND bakiye >= ?`,
      )
      .run(miktar, String(guildId), String(kullaniciId), miktar);
    if (changes === 0) return null;
    return deftereYaz(db, {
      guildId, kullaniciId, tur, miktar: -miktar, karsiId, oyun, simdi,
    });
  });
}

/** Yönetici sıfırlaması: bakiyeyi 0'a çeker, düşülen tutarı deftere yazar. */
export function sifirla(db, { guildId, kullaniciId, yoneticiId, simdi = Date.now() }) {
  const mevcut = bakiye(db, guildId, kullaniciId);
  if (mevcut === 0) return 0;
  dus(db, { guildId, kullaniciId, miktar: mevcut, tur: TURLER.yonetici, karsiId: yoneticiId, simdi });
  return mevcut;
}

/**
 * Seriye göre günlük ödül. Taban rastgele, seri eki tavanlı; serinin her
 * 7. gününde toplam ikiye katlanır.
 */
export function gunlukOdul(seri, rastgele = Math.random) {
  const taban = aralik(GUNLUK_MIN, GUNLUK_MAX, rastgele);
  const ek = Math.min(SERI_TAVANI, SERI_BASINA * Math.max(0, seri - 1));
  const haftalik = seri > 0 && seri % HAFTA_GUNU === 0;
  return { taban, ek, haftalik, toplam: (taban + ek) * (haftalik ? 2 : 1) };
}

/**
 * Günlük ödülü verir. Aynı Türkiye gününde ikinci kez vermez; dünkü ödül
 * alınmışsa seri artar, gün atlanmışsa 1'e döner (kaçırılan gün kadar seri
 * koruyucu varsa onlar harcanır ve seri sürer).
 *
 * @returns {{verildi: false, kalanMs: number}
 *   | {verildi: true, seri: number, korunan: number, etkinlik: boolean, kasalar: string[], taban: number, ek: number, haftalik: boolean, toplam: number, bakiye: number}}
 */
export function gunlukAl(db, { guildId, kullaniciId, simdi = Date.now(), rastgele = Math.random }) {
  return islem(db, () => {
    const hesap = hesapGetir(db, guildId, kullaniciId);
    const bugun = trGunu(simdi);

    if (hesap.son_gunluk === bugun) {
      return { verildi: false, kalanMs: sonrakiGunBaslangici(simdi) - simdi };
    }

    // Kaçırılan gün sayısı kadar seri koruyucu varsa seri sürer, koruyucular harcanır.
    const kacan = hesap.son_gunluk ? gunFarki(hesap.son_gunluk, bugun) - 1 : null;
    let korunan = 0;
    if (kacan > 0 && hesap.gunluk_seri > 0 && adet(db, guildId, kullaniciId, SERI_KORUYUCU) >= kacan) {
      esyaDus(db, guildId, kullaniciId, SERI_KORUYUCU, kacan);
      korunan = kacan;
    }
    const surdu = kacan === 0 || korunan > 0;
    const seri = surdu ? hesap.gunluk_seri + 1 : 1;
    const odul = gunlukOdul(seri, rastgele);
    // muz-2x etkinliği: muz kısmı 2 kat (kasalar değişmez).
    const etkinlik = etkinlikCarpani(db, guildId, 'muz-2x', simdi);
    odul.toplam *= etkinlik;
    const prestij = prestijCarpani(db, guildId, kullaniciId); // prestij: kalıcı çarpan
    const uyelik = uyelikCarpani(db, guildId, kullaniciId); // Katıl kademesi
    odul.toplam = carpanUygula(odul.toplam, prestij * uyelik * yoneticiCarpani(kullaniciId));

    hesapAc(db, guildId, kullaniciId);
    db.prepare('UPDATE bakiyeler SET gunluk_seri = ?, son_gunluk = ? WHERE guild_id = ? AND kullanici_id = ?')
      .run(seri, bugun, String(guildId), String(kullaniciId));
    const yeni = ekle(db, { guildId, kullaniciId, miktar: odul.toplam, tur: TURLER.gunluk, simdi });
    const borcKesilen = borcaKes(db, guildId, kullaniciId, odul.toplam, simdi); // borçluysa gelirin payı borca gider
    // Her gün bir Günlük Kasa; serinin 7. gününde ayrıca Ahşap Kasa.
    const kasalar = [GUNLUK_ODUL_KASASI, ...(odul.haftalik ? [HAFTALIK_KASA] : [])];
    for (const kasa of kasalar) {
      esyaEkle(db, guildId, kullaniciId, kasa);
      esyaHareketi(db, { guildId, kullaniciId, esya: kasa, adet: 1, tur: 'gunluk', simdi });
    }

    return {
      verildi: true, seri, korunan, kasalar, etkinlik: etkinlik > 1, prestij, uyelik, ...odul, borcKesilen, bakiye: yeni - borcKesilen,
    };
  });
}

/**
 * Sohbet ödülü: bekleme dolmadıysa hiçbir şey yazmaz. `carpan` takviyeler içindir
 * (Muz Çiftliği 3x).
 * @returns {number} verilen muz (0 = verilmedi)
 */
export function mesajOdulu(db, {
  guildId, kullaniciId, simdi = Date.now(), rastgele = Math.random, carpan = 1,
}) {
  return islem(db, () => {
    const hesap = hesapGetir(db, guildId, kullaniciId);
    // 0 "hiç almamış" demek; küçük `simdi` değerlerinde ilk mesaj beklemeye takılmasın.
    if (hesap.son_mesaj_odulu > 0 && simdi - hesap.son_mesaj_odulu < MESAJ_BEKLEME_MS) return 0;

    // Prestij çarpanı kesirli olabilir (1,1x); küçük tutarda sabit yuvarlama etkiyi silerdi,
    // bu yüzden kesir olasılıkla yuvarlanır (beklenen değer tam çarpanı verir).
    const ham = aralik(MESAJ_MIN, MESAJ_MAX, rastgele) * carpan;
    const kesir = ham - Math.floor(ham + 1e-9);
    const miktar = Math.floor(ham + 1e-9) + (kesir > 1e-9 && rastgele() < kesir ? 1 : 0);
    hesapAc(db, guildId, kullaniciId);
    db.prepare('UPDATE bakiyeler SET son_mesaj_odulu = ? WHERE guild_id = ? AND kullanici_id = ?')
      .run(simdi, String(guildId), String(kullaniciId));
    ekle(db, { guildId, kullaniciId, miktar, tur: TURLER.mesaj, simdi });
    return miktar;
  });
}

/** Seviye atlama ödülü: yeni seviye × ayardaki çarpan. */
export function seviyeOdulu(seviye, carpan) {
  return Math.max(0, Math.floor(seviye)) * Math.max(0, Math.floor(carpan));
}

/** Seviyeye göre günlük gönderim limiti. */
export function gunlukLimit(seviye) {
  return LIMIT_TABAN + LIMIT_SEVIYE_BASINA * Math.max(0, Math.floor(seviye));
}

/** Bugün (Türkiye günü) gönderilen toplam; defterden hesaplanır. */
export function bugunGonderilen(db, guildId, kullaniciId, simdi = Date.now()) {
  const satir = db
    .prepare(
      `SELECT COALESCE(-SUM(miktar), 0) AS toplam FROM ekonomi_hareketleri
       WHERE guild_id = ? AND kullanici_id = ? AND tur = ? AND zaman >= ?`,
    )
    .get(String(guildId), String(kullaniciId), TURLER.gonder, trGunBaslangici(simdi));
  return satir?.toplam ?? 0;
}

/** Transferden kesilen vergi (aşağı yuvarlanır). */
export function vergiHesapla(miktar, yuzde) {
  return Math.floor((miktar * Math.max(0, yuzde)) / 100);
}

/**
 * Muz gönderir. Gönderen tutarın tamamını öder, alıcı vergi düşülmüş halini alır.
 *
 * @returns {{ok: false, sebep: string} | {ok: true, vergi: number, net: number, kalanLimit: number}}
 */
export function gonder(db, {
  guildId, gonderenId, aliciId, miktar, seviye = 0, vergiYuzde = 0, simdi = Date.now(),
}) {
  if (String(gonderenId) === String(aliciId)) return { ok: false, sebep: 'Kendine muz gönderemezsin.' };
  const uzak = uzakAktarimSebebi(db, guildId, gonderenId, aliciId);
  if (uzak) return { ok: false, sebep: uzak };
  if (borcluMu(db, guildId, gonderenId, simdi)) return { ok: false, sebep: BORC_YASAK }; // /gonder ve takasın muz kısmı
  if (!tamSayiMi(miktar) || miktar < TRANSFER_MIN) {
    return { ok: false, sebep: `En az ${muz(TRANSFER_MIN)} gönderebilirsin.` };
  }

  return islem(db, () => {
    const limit = gunlukLimit(seviye);
    const gonderilen = bugunGonderilen(db, guildId, gonderenId, simdi);
    if (gonderilen + miktar > limit) {
      return {
        ok: false,
        sebep: `Günlük gönderim limitin ${muz(limit)} (seviyeyle artar). `
          + `Bugün ${muz(gonderilen)} gönderdin, en çok ${muz(Math.max(0, limit - gonderilen))} daha gönderebilirsin.`,
      };
    }

    const kalan = dus(db, { guildId, kullaniciId: gonderenId, miktar, tur: TURLER.gonder, karsiId: aliciId, simdi });
    if (kalan === null) return { ok: false, sebep: `Bakiyen yetmiyor: ${muz(bakiye(db, guildId, gonderenId))} var.` };

    const vergi = vergiHesapla(miktar, vergiYuzde);
    const net = miktar - vergi;
    if (net > 0) ekle(db, { guildId, kullaniciId: aliciId, miktar: net, tur: TURLER.al, karsiId: gonderenId, simdi });

    return { ok: true, vergi, net, kalanLimit: limit - gonderilen - miktar };
  });
}

/** `kullanici_id NOT IN (...)` parçası ve parametreleri; liste boşsa koşulsuz. */
function haricKosulu(haric) {
  const kimlikler = haric.map(String);
  if (kimlikler.length === 0) return { kosul: '', parametreler: [] };
  return { kosul: ` AND kullanici_id NOT IN (${kimlikler.map(() => '?').join(', ')})`, parametreler: kimlikler };
}

/** Sunucunun bakiyeye göre azalan sıralaması (sıfır bakiyeler ve yetkililer hariç). */
export function zenginler(db, guildId, limit = 10, haric = yetkiliKimlikler()) {
  const { kosul, parametreler } = haricKosulu(haric);
  return db
    .prepare(
      `SELECT kullanici_id, bakiye FROM bakiyeler
       WHERE guild_id = ? AND bakiye > 0${kosul} ORDER BY bakiye DESC, kullanici_id ASC LIMIT ?`,
    )
    .all(String(guildId), ...parametreler, Math.max(1, Math.floor(limit)));
}

/** Kullanıcının zenginlik sırası (1 tabanlı, yetkililer sayılmaz); bakiyesi 0 ya da yetkiliyse null. */
export function zenginlikSirasi(db, guildId, kullaniciId, haric = yetkiliKimlikler()) {
  if (haric.map(String).includes(String(kullaniciId))) return null;
  const kendi = bakiye(db, guildId, kullaniciId);
  if (kendi <= 0) return null;
  const { kosul, parametreler } = haricKosulu(haric);
  const onde = db
    .prepare(`SELECT COUNT(*) AS adet FROM bakiyeler WHERE guild_id = ? AND bakiye > ?${kosul}`)
    .get(String(guildId), kendi, ...parametreler);
  return (onde?.adet ?? 0) + 1;
}

/**
 * Kullanıcının yazdığı tutarı ayrıştırır: "500", "10.000", "1k", "2,5k",
 * "hepsi" / "tümü", "yarı" / "yarısı".
 *
 * @returns {{ok: true, miktar: number} | {ok: false, sebep: string}}
 */
export function miktarAyristir(metin, mevcutBakiye) {
  const ham = String(metin ?? '').trim().toLocaleLowerCase('tr-TR');
  const hata = { ok: false, sebep: 'Tutarı anlayamadım. Örnek: `500`, `2.5k`, `hepsi`, `yarı`.' };

  if (['hepsi', 'tümü', 'tumu', 'all'].includes(ham)) return { ok: true, miktar: Math.floor(mevcutBakiye) };
  if (['yarı', 'yari', 'yarısı', 'yarisi', 'half'].includes(ham)) {
    return { ok: true, miktar: Math.floor(mevcutBakiye / 2) };
  }

  const kisaltma = /^(\d+(?:[.,]\d+)?)\s*(k|b|bin|m|mn|milyon)$/.exec(ham);
  if (kisaltma) {
    const sayi = Number(kisaltma[1].replace(',', '.'));
    const carpan = ['m', 'mn', 'milyon'].includes(kisaltma[2]) ? 1_000_000 : 1000;
    const miktar = Math.floor(sayi * carpan);
    return Number.isSafeInteger(miktar) ? { ok: true, miktar } : hata;
  }

  // Kısaltmasız sayıda nokta/virgül binlik ayracıdır ("10.000").
  if (/^\d{1,3}([.,]\d{3})+$|^\d+$/.test(ham)) {
    const miktar = Number(ham.replace(/[.,]/g, ''));
    return Number.isSafeInteger(miktar) ? { ok: true, miktar } : hata;
  }

  return hata;
}
