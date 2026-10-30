/**
 * Başarımlar: mevcut durumdan ve defterlerden hesaplanan kalıcı rozetler.
 *
 * Hiçbir yere kanca eklenmez; ölçütler ekonomi_hareketleri, esya_hareketleri,
 * bakiyeler, seviyeler, envanter, mevduatlar ve set_oduller tablolarından
 * okunur. `basarimlariKontrolEt` ilk kez sağlanan başarımı basarimlar tablosuna
 * yazar ve küçük ödülünü verir; ikisi tek işlemde yapıldığı için ödül kişi
 * başı bir kez verilir. Kart satılsa ya da bakiye düşse bile kazanılan başarım
 * geri alınmaz. Ödüller docs/para.md "Başarımlar" ile birebir aynıdır.
 */

import { sistemAcikMi } from './ayarlar.js';
import { DURUMLAR } from './banka.js';
import {
  ekle, hesapGetir, islem, TURLER,
} from './ekonomi.js';
import { envanter } from './envanter.js';
import { esyaGetir } from './esyalar.js';
import { KARTLAR, kartSahibiMi, kasaVer } from './kasalar.js';
import { KUMAR_SAYIM_MIN } from './kumar.js';
import { kullaniciGetir } from './seviye.js';
import { setGetir } from './setler.js';

const GUN_MS = 86_400_000;

export const KATEGORILER = Object.freeze({
  koleksiyon: { ad: 'Koleksiyon', simge: '🃏' },
  kasa: { ad: 'Kasa ve ticaret', simge: '📦' },
  servet: { ad: 'Servet ve banka', simge: '💰' },
  kumar: { ad: 'Kumar ve düello', simge: '🎰' },
  surec: { ad: 'Süreklilik', simge: '🔥' },
});

/** Kademe: gösterim ve başarım puanı. */
export const KADEMELER = Object.freeze({
  bronz: { ad: 'Bronz', simge: '🥉', puan: 1 },
  gumus: { ad: 'Gümüş', simge: '🥈', puan: 2 },
  altin: { ad: 'Altın', simge: '🥇', puan: 3 },
});

const MITIK_KARTLAR = KARTLAR.filter((k) => k.nadirlik === 'mitik').map((k) => k.kimlik);
const KAHRAMANLAR = setGetir('kahramanlar').kartlar;

function sayi(db, sql, ...parametreler) {
  return db.prepare(sql).get(...parametreler)?.n ?? 0;
}

/**
 * Ölçüt işlevleri: (db, g, u) -> sayı. Her biri tek hızlı sorgudur ve yalnız
 * o ölçütü kullanan, henüz kazanılmamış başarım varsa çalışır.
 * Kumar ayrımı lib/siralamalar.js'teki gibi karsi_id IS NULL ile yapılır;
 * düello kazancı `kazanc` + karsi_id = kaybedenin kullanıcı kimliği (rakamla
 * başlar), kasa/eşya/mevduat kayıtlarının karsi_id'si ise harfle başlar.
 */
const OLCUTLER = {
  // Bir kartın normal ya da ✨ parlak sürümü sahiplik için yeter (setlerdeki kural).
  farkliKart: (db, g, u) => {
    const sahip = envanter(db, g, u);
    return KARTLAR.filter((k) => kartSahibiMi(sahip, k.kimlik)).length;
  },
  mitikKart: (db, g, u) => {
    const sahip = envanter(db, g, u);
    return MITIK_KARTLAR.filter((k) => kartSahibiMi(sahip, k)).length;
  },
  kahramanlar: (db, g, u) => {
    // Set ödülü alındıysa kartlar sonradan satılsa da tamamlanmış sayılır.
    const odulAlindi = sayi(
      db,
      'SELECT COUNT(*) AS n FROM set_oduller WHERE guild_id = ? AND kullanici_id = ? AND set_kimligi = ?',
      String(g), String(u), 'kahramanlar',
    );
    if (odulAlindi > 0) return KAHRAMANLAR.length;
    const sahip = envanter(db, g, u);
    return KAHRAMANLAR.filter((k) => kartSahibiMi(sahip, k)).length;
  },
  setSayisi: (db, g, u) => sayi(
    db, 'SELECT COUNT(*) AS n FROM set_oduller WHERE guild_id = ? AND kullanici_id = ?', String(g), String(u),
  ),
  kasaAc: (db, g, u) => sayi(
    db,
    `SELECT COALESCE(-SUM(adet), 0) AS n FROM esya_hareketleri
     WHERE guild_id = ? AND kullanici_id = ? AND tur = 'kasa-ac'`,
    String(g), String(u),
  ),
  kartSat: (db, g, u) => sayi(
    db,
    `SELECT COALESCE(-SUM(adet), 0) AS n FROM esya_hareketleri
     WHERE guild_id = ? AND kullanici_id = ? AND tur = 'sat'`,
    String(g), String(u),
  ),
  takas: (db, g, u) => sayi(
    db,
    `SELECT COUNT(DISTINCT zaman) AS n FROM esya_hareketleri
     WHERE guild_id = ? AND kullanici_id = ? AND tur IN ('takas-ver', 'takas-al')`,
    String(g), String(u),
  ),
  bakiyeZirvesi: (db, g, u) => Math.max(
    hesapGetir(db, g, u).bakiye,
    sayi(
      db,
      'SELECT COALESCE(MAX(bakiye_sonra), 0) AS n FROM ekonomi_hareketleri WHERE guild_id = ? AND kullanici_id = ?',
      String(g), String(u),
    ),
  ),
  mevduat: (db, g, u) => sayi(
    db,
    'SELECT COUNT(*) AS n FROM mevduatlar WHERE guild_id = ? AND kullanici_id = ? AND durum = ?',
    String(g), String(u), DURUMLAR.odendi,
  ),
  mevduat14: (db, g, u) => sayi(
    db,
    `SELECT COUNT(*) AS n FROM mevduatlar
     WHERE guild_id = ? AND kullanici_id = ? AND durum = ? AND vade - baslangic >= ? AND faiz_yuzde >= 100`,
    String(g), String(u), DURUMLAR.odendi, 7 * GUN_MS,
  ),
  kumarSayisi: (db, g, u) => sayi(
    db,
    `SELECT COUNT(*) AS n FROM ekonomi_hareketleri
     WHERE guild_id = ? AND kullanici_id = ? AND tur = ? AND karsi_id IS NULL AND miktar <= ?`,
    String(g), String(u), TURLER.bahis, -KUMAR_SAYIM_MIN,
  ),
  kumarOdeme: (db, g, u) => sayi(
    db,
    `SELECT COALESCE(MAX(miktar), 0) AS n FROM ekonomi_hareketleri
     WHERE guild_id = ? AND kullanici_id = ? AND tur = ? AND karsi_id IS NULL`,
    String(g), String(u), TURLER.kazanc,
  ),
  duelloGalibiyet: (db, g, u) => sayi(
    db,
    `SELECT COUNT(*) AS n FROM ekonomi_hareketleri
     WHERE guild_id = ? AND kullanici_id = ? AND tur = ? AND karsi_id GLOB '[0-9]*'`,
    String(g), String(u), TURLER.kazanc,
  ),
  seri: (db, g, u) => hesapGetir(db, g, u).gunluk_seri,
  seviye: (db, g, u) => kullaniciGetir(db, g, u).seviye,
};

const b = (kimlik, kategori, kademe, ad, aciklama, olcut, hedef, odul) => (
  { kimlik, kategori, kademe, ad, aciklama, olcut, hedef, odul }
);

/**
 * Başarım tanımları. `odul`: { muz, kasa? } (kasa: bir adet).
 * Değerler docs/para.md "Başarımlar" tablosuyla aynıdır.
 */
export const BASARIMLAR = Object.freeze([
  // Koleksiyon
  b('koleksiyon-15', 'koleksiyon', 'bronz', 'Koleksiyoncu', '15 farklı kart topla', 'farkliKart', 15, { muz: 500 }),
  b('koleksiyon-30', 'koleksiyon', 'gumus', 'Hevesli Koleksiyoncu', '30 farklı kart topla', 'farkliKart', 30,
    { muz: 3_000, kasa: 'kasa-ahsap' }),
  b('koleksiyon-tam', 'koleksiyon', 'altin', 'Tam Koleksiyon', `Bütün kartları (${KARTLAR.length}) topla`,
    'farkliKart', KARTLAR.length, { muz: 30_000, kasa: 'kasa-elmas' }),
  b('ilk-mitik', 'koleksiyon', 'altin', 'Mitik Avcısı', 'İlk mitik kartını bul', 'mitikKart', 1,
    { muz: 5_000, kasa: 'kasa-demir' }),
  b('tum-kahramanlar', 'koleksiyon', 'gumus', 'Kahraman Kadrosu', 'Bütün kahramanları topla', 'kahramanlar',
    KAHRAMANLAR.length, { muz: 4_000, kasa: 'kasa-demir' }),
  b('set-1', 'koleksiyon', 'bronz', 'İlk Set', 'Bir koleksiyon setini tamamla', 'setSayisi', 1, { muz: 1_000 }),
  b('set-5', 'koleksiyon', 'gumus', 'Set Ustası', '5 koleksiyon setini tamamla', 'setSayisi', 5,
    { muz: 4_000, kasa: 'kasa-demir' }),

  // Kasa ve ticaret
  b('kasa-10', 'kasa', 'bronz', 'Kasa Meraklısı', '10 kasa aç', 'kasaAc', 10, { muz: 500 }),
  b('kasa-100', 'kasa', 'gumus', 'Kasa Avcısı', '100 kasa aç', 'kasaAc', 100, { muz: 3_000, kasa: 'kasa-ahsap' }),
  b('kasa-500', 'kasa', 'altin', 'Kasa Efendisi', '500 kasa aç', 'kasaAc', 500, { muz: 12_000, kasa: 'kasa-altin' }),
  b('kart-sat-50', 'kasa', 'bronz', 'Tüccar', '50 kart sat', 'kartSat', 50, { muz: 1_000 }),
  b('takas-1', 'kasa', 'bronz', 'İlk Takas', 'Bir takas yap', 'takas', 1, { muz: 300 }),
  b('takas-10', 'kasa', 'gumus', 'Pazarlıkçı', '10 takas yap', 'takas', 10, { muz: 2_000, kasa: 'kasa-ahsap' }),

  // Servet ve banka
  b('servet-50k', 'servet', 'bronz', 'Muz Tasarrufu', '50.000 muz biriktir', 'bakiyeZirvesi', 50_000, { muz: 1_000 }),
  b('servet-1m', 'servet', 'gumus', 'Muz Zengini', '1.000.000 muz biriktir', 'bakiyeZirvesi', 1_000_000,
    { muz: 10_000, kasa: 'kasa-altin' }),
  b('servet-10m', 'servet', 'altin', 'Muz Baronu', '10.000.000 muz biriktir', 'bakiyeZirvesi', 10_000_000,
    { muz: 50_000, kasa: 'kasa-elmas' }),
  b('mevduat-1', 'servet', 'bronz', 'Sabırlı Yatırımcı', 'Bir vadeli mevduatı tamamla', 'mevduat', 1, { muz: 500 }),
  b('mevduat-14g', 'servet', 'gumus', 'Uzun Vadeci', 'Bankada 7 günlük mevduatı tamamla', 'mevduat14', 1,
    { muz: 3_000, kasa: 'kasa-ahsap' }),

  // Kumar ve düello
  b('kumar-25', 'kumar', 'bronz', 'Şansını Dene', 'Toplam 25 kumar oyna', 'kumarSayisi', 25, { muz: 500 }),
  b('kumar-100', 'kumar', 'gumus', 'Kumarbaz', 'Toplam 100 kumar oyna', 'kumarSayisi', 100,
    { muz: 2_500, kasa: 'kasa-ahsap' }),
  b('kumar-500', 'kumar', 'altin', 'Casino Kralı', 'Toplam 500 kumar oyna', 'kumarSayisi', 500,
    { muz: 8_000, kasa: 'kasa-demir' }),
  b('kumar-buyuk', 'kumar', 'gumus', 'Büyük Vurgun', 'Kumarda tek seferde 10.000+ muz kazan', 'kumarOdeme', 10_000,
    { muz: 3_000, kasa: 'kasa-ahsap' }),
  b('duello-10', 'kumar', 'gumus', 'Düellocu', '10 düello kazan', 'duelloGalibiyet', 10,
    { muz: 2_500, kasa: 'kasa-ahsap' }),
  b('duello-50', 'kumar', 'altin', 'Meydan Hakimi', '50 düello kazan', 'duelloGalibiyet', 50,
    { muz: 10_000, kasa: 'kasa-demir' }),

  // Süreklilik
  b('seri-7', 'surec', 'bronz', 'Haftalık Seri', '7 günlük seri yap', 'seri', 7, { muz: 500 }),
  b('seri-30', 'surec', 'gumus', 'Aylık Seri', '30 günlük seri yap', 'seri', 30, { muz: 3_000, kasa: 'kasa-demir' }),
  b('seri-100', 'surec', 'altin', 'Vazgeçmeyen', '100 günlük seri yap', 'seri', 100,
    { muz: 15_000, kasa: 'kasa-altin' }),
  b('seviye-10', 'surec', 'bronz', 'Yükselen', 'Seviye 10\'a ulaş', 'seviye', 10, { muz: 500 }),
  b('seviye-25', 'surec', 'gumus', 'Deneyimli', 'Seviye 25\'e ulaş', 'seviye', 25, { muz: 3_000, kasa: 'kasa-ahsap' }),
  b('seviye-50', 'surec', 'altin', 'Efsane', 'Seviye 50\'ye ulaş', 'seviye', 50, { muz: 12_000, kasa: 'kasa-altin' }),
]);

const HARITA = new Map(BASARIMLAR.map((t) => [t.kimlik, t]));

export function basarimGetir(kimlik) {
  return HARITA.get(kimlik) ?? null;
}

/** Bütün başarımların toplam puanı. */
export function toplamPuan() {
  return BASARIMLAR.reduce((t, x) => t + KADEMELER[x.kademe].puan, 0);
}

/** Ödülün tek satır yazısı: "3.000 🍌 + Ahşap Kasa". `muzBicimi`: muz miktarını yazan işlev. */
export function odulMetni(odul, muzBicimi) {
  return [muzBicimi(odul.muz), ...(odul.kasa ? [esyaGetir(odul.kasa).ad] : [])].join(' + ');
}

/** Ölçüt değerlerini ilk istendiğinde hesaplayıp tutan işlev. */
function olcutOnbellegi(db, guildId, kullaniciId) {
  const onbellek = new Map();
  return (olcut) => {
    if (!onbellek.has(olcut)) onbellek.set(olcut, OLCUTLER[olcut](db, guildId, kullaniciId));
    return onbellek.get(olcut);
  };
}

function kazanilanlar(db, guildId, kullaniciId) {
  const satirlar = db
    .prepare('SELECT basarim, zaman FROM basarimlar WHERE guild_id = ? AND kullanici_id = ?')
    .all(String(guildId), String(kullaniciId));
  return new Map(satirlar.map((s) => [s.basarim, s.zaman]));
}

/**
 * Bir kişinin bütün başarımları: kazanıldıysa `zaman`, değilse `deger` (hedefe
 * kadar kırpılmış ilerleme). Hiçbir şey yazmaz.
 */
export function basarimDurumlari(db, guildId, kullaniciId) {
  const kazanildi = kazanilanlar(db, guildId, kullaniciId);
  const olc = olcutOnbellegi(db, guildId, kullaniciId);
  return BASARIMLAR.map((tanim) => {
    const zaman = kazanildi.get(tanim.kimlik) ?? null;
    const deger = zaman ? tanim.hedef : Math.min(tanim.hedef, olc(tanim.olcut));
    return { tanim, zaman, deger };
  });
}

/** Kazanılan başarım sayısı ve puanı. */
export function basarimOzeti(db, guildId, kullaniciId) {
  let puan = 0;
  let adet = 0;
  for (const kimlik of kazanilanlar(db, guildId, kullaniciId).keys()) {
    const tanim = HARITA.get(kimlik);
    if (!tanim) continue;
    adet += 1;
    puan += KADEMELER[tanim.kademe].puan;
  }
  return {
    adet, toplam: BASARIMLAR.length, puan, toplamPuan: toplamPuan(),
  };
}

/**
 * Tek giriş noktası: yeni sağlanan başarımları kaydeder, ödüllerini verir.
 * Ekonomi sistemi kapalıysa hiçbir şey okumaz/yazmaz. Hata atmaz.
 *
 * @returns {Array<{tanim: object, zaman: number}>} yeni kazanılanlar
 */
export function basarimlariKontrolEt(db, guildId, kullaniciId, simdi = Date.now()) {
  try {
    if (!sistemAcikMi(db, guildId, 'ekonomi')) return [];

    const kazanildi = kazanilanlar(db, guildId, kullaniciId);
    const olc = olcutOnbellegi(db, guildId, kullaniciId);
    const yeniler = [];

    for (const tanim of BASARIMLAR) {
      if (kazanildi.has(tanim.kimlik) || olc(tanim.olcut) < tanim.hedef) continue;

      // Kayıt ve ödül tek işlemde; satır zaten varsa (yarış) ödül verilmez.
      const verildi = islem(db, () => {
        const { changes } = db
          .prepare('INSERT OR IGNORE INTO basarimlar (guild_id, kullanici_id, basarim, zaman) VALUES (?, ?, ?, ?)')
          .run(String(guildId), String(kullaniciId), tanim.kimlik, simdi);
        if (changes === 0) return false;
        ekle(db, {
          guildId, kullaniciId, miktar: tanim.odul.muz, tur: TURLER.basarim, karsiId: tanim.kimlik, simdi,
        });
        if (tanim.odul.kasa) {
          kasaVer(db, { guildId, kullaniciId, kasa: tanim.odul.kasa, tur: 'basarim', simdi });
        }
        return true;
      });
      if (verildi) yeniler.push({ tanim, zaman: simdi });
    }
    return yeniler;
  } catch {
    return [];
  }
}
