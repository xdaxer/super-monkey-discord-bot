/**
 * Haftalık piyango: muzla bilet alınır, her Pazar 21:00'de (Türkiye, UTC+3
 * sabit) bilet sayısıyla ağırlıklı tek kazanan havuzun tamamını alır.
 *
 * Para akışı:
 *  - Bilet bedeli defterden düşer (`piyango`, −). Gelirin %90'ı havuza girer,
 *    %10'u hiçbir yere ödenmez: kalıcı muz çıkışı.
 *  - Her çekilişte sabit bir taban ikramiye havuza eklenir ve ödül anında
 *    yaratılır (`piyango`, +). Gerekçe: günlük ödül, faiz ve sohbet geliri
 *    sürekli muz basıyor; piyango da tek başına çıkış olsaydı katılım
 *    düşer. Taban küçük tutulur, bilet gelirinin %10'u ise karşı ağırlıktır.
 *  - Bilet gelen olmayan hafta kazanan çıkmaz ve taban BASILMAZ; ikramiye
 *    bir sonraki havuza devreder (en çok TABAN_TAVANI'na kadar). Devir muz
 *    yaratmaz, yalnız ödenecek tabanı büyütür; böylece boş haftalar
 *    enflasyon yaratmadan sonraki haftayı çekici kılar. Tavan, uzun boş
 *    dönemden sonra tek kişinin aşırı büyük havuz almasını önler.
 *  - Çekiliş ekonomi sistemi kapalıyken de BİLETLİ haftalar için yapılır:
 *    insanlar muzlarını vermiş, kapalı sistem onları rehin tutmamalı.
 *    Biletsiz haftalar için kayıt yalnız sistem açıkken açılır (devir
 *    kapalı süreyi saymaz). Bilet satışı komutta sistem kapısıyla durur.
 *
 * Bilet, satın alındığı andan sonraki ilk çekilişe yazılır; çekiliş anının
 * kendisi sonraki haftaya sayılır. Sayılar docs/para.md ile birebir aynıdır.
 *
 * Yöneticiler (bot sahibi ve geliştiriciler, izin.js yetkiliKimlikler) bilet
 * alabilir, biletleri havuzu büyütür ama kazanan seçilmezler. Yalnız
 * yöneticilerin bilet aldığı hafta kazanansız kalır ve havuz devreder.
 */

import { yetkiliKimlikler } from './izin.js';
import { haftaBaslangici } from './siralamalar.js';
import {
  dus, ekle, islem, TURLER,
} from './ekonomi.js';
import { uzakKimlikler } from './ekonomi-uzak.js';

const SAAT = 3_600_000;
const GUN = 86_400_000;

export const BILET_FIYATI = 500;
export const KISI_BASI_BILET = 40;
/** Bilet gelirinin havuza giren payı (%); kalanı muz çıkışıdır. */
export const HAVUZ_YUZDE = 90;
export const TABAN_IKRAMIYE = 5_000;
/** Devirle birikebilecek en yüksek taban (4 haftalık). */
export const TABAN_TAVANI = 4 * TABAN_IKRAMIYE;
/** Çekiliş: Pazar (Pazartesi'den 6 gün sonra) 21:00 Türkiye. */
export const CEKILIS_SAATI = 21;
/** Kaçırılmış çekilişler en çok bu kadar geriye doğru kayda alınır. */
const GERI_HAFTA = 8;

export const DURUMLAR = Object.freeze({ bitti: 'bitti', devir: 'devir' });

/** `simdi`den SONRAKİ ilk çekiliş anı (UTC ms); tam çekiliş anı sonrakine sayılır. */
export function sonrakiCekilis(simdi = Date.now()) {
  const bu = haftaBaslangici(simdi) + 6 * GUN + CEKILIS_SAATI * SAAT;
  return bu > simdi ? bu : bu + 7 * GUN;
}

/** Defterde karsi_id olarak yazılan hafta kimliği. */
export function haftaKimligi(cekilis) {
  return `piyango-${cekilis}`;
}

/** Bilet gelirinden havuza giren pay. */
export function havuzPayi(gelir) {
  return Math.floor((gelir * HAVUZ_YUZDE) / 100);
}

function biletToplami(db, guildId, cekilis) {
  const s = db
    .prepare('SELECT COALESCE(SUM(adet), 0) AS toplam FROM piyango_biletleri WHERE guild_id = ? AND cekilis = ?')
    .get(String(guildId), cekilis);
  return Number(s.toplam);
}

export function biletSayim(db, guildId, kullaniciId, cekilis) {
  const s = db
    .prepare('SELECT adet FROM piyango_biletleri WHERE guild_id = ? AND cekilis = ? AND kullanici_id = ?')
    .get(String(guildId), cekilis, String(kullaniciId));
  return s ? s.adet : 0;
}

/**
 * Kullanıcının kazanma olasılığı (%): yöneticinin biletleri havuza girer ama
 * çekilişte sayılmaz (cekilisYap), olasılık da buna göre hesaplanır.
 */
export function kazanmaOlasiligi(db, guildId, kullaniciId, cekilis, haric = yetkiliKimlikler()) {
  if (haric.includes(String(kullaniciId))) return 0;
  const biletler = db
    .prepare('SELECT kullanici_id, adet FROM piyango_biletleri WHERE guild_id = ? AND cekilis = ?')
    .all(String(guildId), cekilis)
    .filter((b) => !haric.includes(b.kullanici_id));
  const toplam = biletler.reduce((t, b) => t + b.adet, 0);
  const benim = biletler.find((b) => b.kullanici_id === String(kullaniciId))?.adet ?? 0;
  return toplam > 0 ? (benim / toplam) * 100 : 0;
}

/** Bu çekilişe girecek taban: önceki biletsiz haftalardan devir + sabit taban, tavanlı. */
function tabanHesapla(db, guildId, cekilis) {
  const onceki = db
    .prepare('SELECT durum, havuz FROM piyango_cekilisleri WHERE guild_id = ? AND cekilis < ? ORDER BY cekilis DESC LIMIT 1')
    .get(String(guildId), cekilis);
  const devir = onceki?.durum === DURUMLAR.devir ? onceki.havuz : 0;
  return Math.min(devir + TABAN_IKRAMIYE, TABAN_TAVANI);
}

/** Henüz çekilmemiş çekilişin anlık durumu (havuz, toplam bilet). */
export function havuzDurumu(db, guildId, cekilis) {
  const toplam = biletToplami(db, guildId, cekilis);
  const gelir = toplam * BILET_FIYATI;
  const taban = tabanHesapla(db, guildId, cekilis);
  return { cekilis, toplam, gelir, taban, havuz: taban + havuzPayi(gelir) };
}

/**
 * Bilet alır. Bakiye ve kişi sınırı aynı işlemde doğrulanır.
 * @returns {{ok: false, sebep: string} | {ok: true, adet: number, tutar: number, cekilis: number, sahip: number, bakiye: number}}
 */
export function biletAl(db, {
  guildId, kullaniciId, adet, simdi = Date.now(),
}) {
  if (!Number.isSafeInteger(adet) || adet < 1) return { ok: false, sebep: 'En az 1 bilet almalısın.' };

  const cekilis = sonrakiCekilis(simdi);
  return islem(db, () => {
    const sahip = biletSayim(db, guildId, kullaniciId, cekilis);
    const kalan = KISI_BASI_BILET - sahip;
    if (adet > kalan) {
      return {
        ok: false,
        sebep: kalan <= 0
          ? `Bu hafta için ${KISI_BASI_BILET} bilet sınırına ulaştın.`
          : `Bu hafta en çok ${KISI_BASI_BILET} bilet alabilirsin; ${sahip} biletin var, en çok ${kalan} daha alabilirsin.`,
      };
    }

    const tutar = adet * BILET_FIYATI;
    const sonra = dus(db, {
      guildId, kullaniciId, miktar: tutar, tur: TURLER.piyango, karsiId: haftaKimligi(cekilis), simdi,
    });
    if (sonra === null) return { ok: false, sebep: 'Bakiyen yetmiyor.' };

    db.prepare(
      `INSERT INTO piyango_biletleri (guild_id, cekilis, kullanici_id, adet) VALUES (?, ?, ?, ?)
       ON CONFLICT(guild_id, cekilis, kullanici_id) DO UPDATE SET adet = adet + excluded.adet`,
    ).run(String(guildId), cekilis, String(kullaniciId), adet);

    return {
      ok: true, adet, tutar, cekilis, sahip: sahip + adet, bakiye: sonra,
    };
  });
}

/**
 * Bilet sayısıyla ağırlıklı seçim. `rastgele` [0,1) döndürür (testte verilir).
 * Sıra kullanıcı kimliğine göre sabittir, aynı sayı aynı kazananı verir.
 */
export function agirlikliSec(biletler, rastgele = Math.random) {
  const toplam = biletler.reduce((t, b) => t + b.adet, 0);
  if (toplam === 0) return null;
  let kalan = Math.min(toplam - 1, Math.floor(rastgele() * toplam));
  for (const b of [...biletler].sort((x, y) => (x.kullanici_id < y.kullanici_id ? -1 : 1))) {
    if (kalan < b.adet) return b.kullanici_id;
    kalan -= b.adet;
  }
  return null;
}

/**
 * Tek bir çekilişi yapar; `haric`teki kimlikler kazanamaz. Satır (guild, cekilis) anahtarıyla eklenir; aynı
 * çekilişi ikinci kez ekleyemeyen çağrı `null` döner ve hiçbir şey ödemez.
 * Kayıt, seçim ve ödeme tek işlemde: yarıda kalırsa hepsi geri alınır.
 * @returns {null | {cekilis, durum, toplam, gelir, taban, havuz, kazananId}}
 */
export function cekilisYap(db, {
  guildId, cekilis, rastgele = Math.random, simdi = Date.now(), haric = yetkiliKimlikler(),
}) {
  return islem(db, () => {
    const biletler = db
      .prepare('SELECT kullanici_id, adet FROM piyango_biletleri WHERE guild_id = ? AND cekilis = ?')
      .all(String(guildId), cekilis);
    const toplam = biletler.reduce((t, b) => t + b.adet, 0);
    const gelir = toplam * BILET_FIYATI;
    const taban = tabanHesapla(db, guildId, cekilis);
    const havuz = taban + havuzPayi(gelir);
    // Yöneticiler ve ekonomiden uzaklaştırılanlar kazanamaz: biletleri gelire sayılır, seçime girmez.
    const disarida = [...haric, ...uzakKimlikler(db, guildId)];
    const kazananId = agirlikliSec(biletler.filter((b) => !disarida.includes(b.kullanici_id)), rastgele);
    const durum = kazananId ? DURUMLAR.bitti : DURUMLAR.devir;

    const { changes } = db.prepare(
      `INSERT OR IGNORE INTO piyango_cekilisleri
         (guild_id, cekilis, durum, bilet_toplam, gelir, taban, havuz, kazanan_id, zaman, duyuruldu)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(String(guildId), cekilis, durum, toplam, gelir, taban, havuz, kazananId, simdi, kazananId ? 0 : 1);
    if (changes === 0) return null;

    if (kazananId) {
      ekle(db, {
        guildId, kullaniciId: kazananId, miktar: havuz, tur: TURLER.piyango, karsiId: haftaKimligi(cekilis), simdi,
      });
    }
    return {
      cekilis, durum, toplam, gelir, taban, havuz, kazananId,
    };
  });
}

/**
 * Vakti gelmiş çekilişleri yapar (bot kapalıyken geçenler dahil).
 * `ekonomiAcik` false ise yalnız biletli haftalar çekilir (üstteki gerekçe).
 * @returns {Array<object>} bu turda yapılan çekilişler
 */
export function vadesiGelenCekilisler(db, {
  guildId, ekonomiAcik = true, rastgele = Math.random, simdi = Date.now(), haric = yetkiliKimlikler(),
}) {
  const son = sonrakiCekilis(simdi) - 7 * GUN; // simdi'den önceki en son çekiliş anı
  const kayitli = db
    .prepare('SELECT MAX(cekilis) AS son FROM piyango_cekilisleri WHERE guild_id = ?')
    .get(String(guildId)).son;
  const ilkBilet = db
    .prepare('SELECT MIN(cekilis) AS ilk FROM piyango_biletleri WHERE guild_id = ?')
    .get(String(guildId)).ilk;

  // Hiç kayıt yoksa ilk biletli haftadan; sistem hiç kullanılmadıysa yapılacak iş yok.
  let baslangic = kayitli === null ? ilkBilet : kayitli + 7 * GUN;
  if (baslangic === null) return [];
  baslangic = Math.max(baslangic, son - GERI_HAFTA * 7 * GUN);

  const yapilan = [];
  for (let c = baslangic; c <= son; c += 7 * GUN) {
    if (!ekonomiAcik && biletToplami(db, guildId, c) === 0) continue;
    const sonuc = cekilisYap(db, {
      guildId, cekilis: c, rastgele, simdi, haric,
    });
    if (sonuc) yapilan.push(sonuc);
  }
  return yapilan;
}

/** En son kazananlı çekilişi (geçen haftanın kazananı) getirir. */
export function sonKazanan(db, guildId) {
  return db
    .prepare('SELECT * FROM piyango_cekilisleri WHERE guild_id = ? AND durum = ? ORDER BY cekilis DESC LIMIT 1')
    .get(String(guildId), DURUMLAR.bitti) ?? null;
}

/** Duyurusu yapılmamış (son 24 saat) kazananlı çekilişler. */
export function duyurulacaklar(db, guildId, simdi = Date.now()) {
  return db
    .prepare(
      'SELECT * FROM piyango_cekilisleri WHERE guild_id = ? AND duyuruldu = 0 AND durum = ? AND zaman > ? ORDER BY cekilis ASC',
    )
    .all(String(guildId), DURUMLAR.bitti, simdi - GUN);
}

/** Koşullu güncelleme: aynı duyuru iki kez işaretlenmez. */
export function duyuruldu(db, guildId, cekilis) {
  return db
    .prepare('UPDATE piyango_cekilisleri SET duyuruldu = 1 WHERE guild_id = ? AND cekilis = ? AND duyuruldu = 0')
    .run(String(guildId), cekilis).changes > 0;
}
