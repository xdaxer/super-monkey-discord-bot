/**
 * Hisse piyasası: BTD temalı şirketlerin 5 dakikada bir güncellenen fiyatları, al/sat
 * işlemleri, portföy ve haberler. Sayıların gerekçesi docs/para.md'de.
 *
 * Fiyat modeli (2026-10-23, BIST'e benzesin diye): her şirketin büyüyen bir
 * "değer çizgisi" vardır, T(t) = temel × (1 + aylık)^(geçen ay). Fiyat bu
 * çizginin etrafında ortalamaya dönen log-normal yürüyüş yapar:
 *   x = ln(fiyat / T(t)),   x' = (1 − K) · x − σ²/2 + σ · z
 * `−σ²/2` log-normal yanlılığı giderir; x durağan olduğundan uzun vadede
 * beklenen getiri çizginin büyümesidir (aylık %3–8, riskli şirkette daha çok):
 * tutan kazanır, komisyon kısa al-satı cezalandırır. z = ρ·piyasa + √(1−ρ²)·ε:
 * bütün şirketler ortak bir piyasa şokunu paylaşır (endeks gibi birlikte
 * hareket ederler). Fiyat [taban, tavan] × T(t) aralığında kalır. Ara sıra bir
 * şirkete haber şoku gelir (aritmetik ±%8–20, beklenen etkisi sıfır); Türkiye
 * saatiyle 00:00–08:00 arası haber çıkmaz.
 *
 * Emir etkisi: alım fiyatı yukarı, satım aşağı iter; log-fiyat değişimi
 * işlem tutarı / şirketin derinliği (en çok ±%10). Emir bu kaymanın ortasından
 * dolar (ortalama fiyat), yani al-hemen-sat döngüsü komisyon kadar kaybettirir;
 * etki doğrusal olduğundan emri bölmek de kazandırmaz.
 *
 * Güncelleme her ADIM_MS (5 dk) başında bir kez yapılır (2026-10-23; önceden
 * saatlikti, bir saatte birkaç alım-satım yapılabilsin diye hızlandı):
 * (sunucu, sembol, saat) birincil anahtar olduğundan servis ve işlem yolu aynı
 * adımı iki kez yazamaz (`saat` sütunu adımın başlangıcıdır). İşlemler de
 * önce `guncelle` çağırır; böylece servis geç kalsa bile eski fiyattan işlem olmaz.
 * Emir etkisi o adımın satırını günceller; sonraki adım oradan devam eder.
 */

import {
  bakiye, dus, ekle, islem, TURLER,
} from './ekonomi.js';

const SAAT_MS = 3_600_000;
const AY_MS = 30 * 24 * SAAT_MS;
const TR_OFFSET_MS = 3 * SAAT_MS;
/** Fiyat adımı: 5 dakika (saatte 12 adım). */
export const ADIM_MS = 5 * 60_000;
/** Değer çizgisinin başladığı an (2026-10-23 12:00 TR): `temel` bu andaki değerdir. */
export const EGILIM_BASLANGICI = Date.UTC(2026, 9, 23, 9, 0, 0);

/** Ortalamaya dönüş hızı (adım başına). 0.01 → sapmanın yarılanması ~69 adım (~6 saat). */
export const DONUS_HIZI = 0.01;
/** Ortak piyasa şokunun payı: iki şirketin adım şokları arası korelasyon. */
export const PIYASA_KORELASYONU = 0.6;
/** Adım başına haber olasılığı (gündüz saatte ~%11) ve şok aralığı (aritmetik, iki yönde de). */
export const HABER_OLASILIGI = 0.01;
export const HABER_MIN = 0.08;
export const HABER_MAX = 0.2;
/** Haber çıkmayan saatler (Türkiye): [başlangıç, bitiş). */
export const HABERSIZ_SAATLER = Object.freeze([0, 8]);
/** Açılışta en çok bu kadar adım (48 saat) telafi edilir. */
export const TELAFI_ADIM = (48 * SAAT_MS) / ADIM_MS;
/** Bundan eski fiyat satırları silinir (liste 24 saat, grafik 12 saat kullanır). */
export const SAKLAMA_MS = 3 * 24 * SAAT_MS;
/** Taban ve tavan, değer çizgisinin katı olarak. */
export const TABAN_CARPAN = 0.3;
export const TAVAN_CARPAN = 3;
/** Tek emrin log-fiyata en çok etkisi (0,25 ≈ fiyatta +%28 / −%22). */
export const EMIR_ETKI_SINIRI = 0.25;

export const KOMISYON_YUZDE = 1;
export const KISI_BASI_ADET = 10_000;
export const ISLEM_BEKLEME_MS = 30_000;
/** Grafikteki nokta sayısı: 144 adım = son 12 saat. */
export const GRAFIK_ADIM = 144;
export const GRAFIK_SAATI = (GRAFIK_ADIM * ADIM_MS) / SAAT_MS;
/** Piyasa endeksinin adı ve başlangıç değeri (bütün şirketler değer çizgisinde iken). */
export const ENDEKS_ADI = 'MAYMUN 100';
export const ENDEKS_TABAN = 10_000;

/**
 * Şirketler. `oynaklik`: adım başına (5 dk) log-fiyat standart sapması; saatlik
 * oynaklık bunun √12 ≈ 3,5 katıdır (MUZC ~%2,8 … SMTK ~%10 saatte).
 * `aylik`: değer çizgisinin aylık büyümesi (riskli şirket daha çok getirir).
 * `derinlik`: log-fiyatı 1 oynatan işlem tutarı (muz); 10.000 muzluk emir
 * MUZC'yi ~%5, SMTK'yi ~%1,3 oynatır (2026-10-23'te 20 kat sığlaştırıldı:
 * kullanıcı "yüklü alım satımın etkisi çok daha büyük olsun" dedi).
 */
export const SIRKETLER = Object.freeze([
  {
    sembol: 'MUZC', ad: 'Muz Çiftliği A.Ş.', temel: 200, oynaklik: 0.008, aylik: 0.03, derinlik: 200_000, emojiAdi: 'btd_banana_farm', yedek: '🌴',
  },
  {
    sembol: 'MAYK', ad: 'Maymun Köyü Holding', temel: 500, oynaklik: 0.011, aylik: 0.04, derinlik: 500_000, emojiAdi: 'btd_village', yedek: '🏘️',
  },
  {
    sembol: 'DART', ad: 'Dart Savunma', temel: 300, oynaklik: 0.015, aylik: 0.05, derinlik: 300_000, emojiAdi: 'btd_dart_monkey', yedek: '🎯',
  },
  {
    sembol: 'BALN', ad: 'Balon Patlatma Sanayi', temel: 150, oynaklik: 0.018, aylik: 0.05, derinlik: 200_000, emojiAdi: 'btd_red', yedek: '🎈',
  },
  {
    sembol: 'SIML', ad: 'Simya Laboratuvarları', temel: 400, oynaklik: 0.022, aylik: 0.06, derinlik: 300_000, emojiAdi: 'btd_alchemist', yedek: '🧪',
  },
  {
    sembol: 'SMTK', ad: 'Süper Maymun Teknoloji', temel: 1000, oynaklik: 0.03, aylik: 0.08, derinlik: 750_000, emojiAdi: 'btd_super_monkey', yedek: '🦸',
  },
]);

export function sirketBul(sembol) {
  const ham = String(sembol ?? '').trim().toLocaleUpperCase('en-US');
  return SIRKETLER.find((s) => s.sembol === ham) ?? null;
}

/** Değer çizgisi: `zaman`daki adil değer (verilmezse başlangıçtaki, yani `temel`). */
export function egilim(sirket, zaman = EGILIM_BASLANGICI) {
  return sirket.temel * (1 + sirket.aylik) ** ((zaman - EGILIM_BASLANGICI) / AY_MS);
}

export function taban(sirket, zaman = EGILIM_BASLANGICI) {
  return egilim(sirket, zaman) * TABAN_CARPAN;
}
export function tavan(sirket, zaman = EGILIM_BASLANGICI) {
  return egilim(sirket, zaman) * TAVAN_CARPAN;
}

/** İçinde bulunulan fiyat adımının başlangıcı. */
export function adimBaslangici(ms) {
  return Math.floor(ms / ADIM_MS) * ADIM_MS;
}

/** Saatlik oynaklık (gösterim için): adım oynaklığı × √(saatteki adım). */
export function saatlikOynaklik(sirket) {
  return sirket.oynaklik * Math.sqrt(SAAT_MS / ADIM_MS);
}

/** Türkiye saatiyle 00:00–08:00 arası mı (haber çıkmaz)? */
export function habersizMi(zaman) {
  const saat = Math.floor((zaman + TR_OFFSET_MS) / SAAT_MS) % 24;
  return saat >= HABERSIZ_SAATLER[0] && saat < HABERSIZ_SAATLER[1];
}

/** Standart normal (Box–Muller). */
export function normal(rastgele = Math.random) {
  const u1 = Math.max(rastgele(), Number.EPSILON);
  const u2 = rastgele();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Bir fiyat adımı (saf). `sok`: aritmetik haber şoku (0,12 = +%12), yoksa 0.
 * `zaman`: yeni adımın başlangıcı (değer çizgisi için; verilmezse çizgi sabit
 * `temel`dir). `piyasa`: o adımın ortak şoku (N(0,1)); verilmezse yalnız
 * şirkete özgü gürültü.
 * @returns {number} yeni fiyat (taban/tavan içinde)
 */
export function sonrakiFiyat(sirket, fiyat, rastgele = Math.random, sok = 0, { zaman = null, piyasa = null } = {}) {
  const onceT = zaman === null ? sirket.temel : egilim(sirket, zaman - ADIM_MS);
  const yeniT = zaman === null ? sirket.temel : egilim(sirket, zaman);
  const x = Math.log(fiyat / onceT);
  const s = sirket.oynaklik;
  const ozel = normal(rastgele);
  const z = piyasa === null ? ozel : Math.sqrt(PIYASA_KORELASYONU) * piyasa + Math.sqrt(1 - PIYASA_KORELASYONU) * ozel;
  const yeniX = (1 - DONUS_HIZI) * x - (s * s) / 2 + s * z;
  let yeni = yeniT * Math.exp(yeniX);
  yeni *= 1 + sok;
  return Math.min(yeniT * TAVAN_CARPAN, Math.max(yeniT * TABAN_CARPAN, yeni));
}

/**
 * Emir etkisi (saf): `adet` hisselik emir fiyatı ne kadar kaydırır ve
 * ortalama hangi fiyattan dolar. Log-fiyat değişimi tutar / derinlik (en çok
 * EMIR_ETKI_SINIRI); dolum, kaymanın integral ortalamasıdır.
 * @returns {{etki: number, ortalama: number, sonFiyat: number}} etki işaretli (alım +)
 */
export function emirEtkisi(sirket, fiyat, adet, yon) {
  const buyukluk = Math.min(EMIR_ETKI_SINIRI, (adet * fiyat) / sirket.derinlik);
  const etki = yon === 'al' ? buyukluk : -buyukluk;
  const ortalama = etki === 0 ? fiyat : (fiyat * Math.expm1(etki)) / etki;
  return { etki, ortalama, sonFiyat: fiyat * Math.exp(etki) };
}

const OLUMLU = [
  '{ad} rekor çeyrek kârı açıkladı.',
  '{ad} dev bir ihaleyi kazandı.',
  '{ad} yeni bir yatırım turunu tamamladı.',
  '{ad} için analistler "al" tavsiyesi verdi.',
];
const OLUMSUZ = [
  '{ad} beklenenden zayıf bilanço açıkladı.',
  '{ad} fabrikasında üretim durdu.',
  '{ad} hakkında soruşturma haberleri yayıldı.',
  '{ad} için analistler "sat" tavsiyesi verdi.',
];

/** Haber şoku üretir (saf): hangi şirket, işaretli oran, metin. */
export function haberUret(rastgele = Math.random) {
  const sirket = SIRKETLER[Math.floor(rastgele() * SIRKETLER.length)];
  const artis = rastgele() < 0.5;
  const buyukluk = HABER_MIN + rastgele() * (HABER_MAX - HABER_MIN);
  const sablonlar = artis ? OLUMLU : OLUMSUZ;
  const sablon = sablonlar[Math.floor(rastgele() * sablonlar.length)];
  return { sirket, sok: artis ? buyukluk : -buyukluk, metin: sablon.replace('{ad}', sirket.ad) };
}

function sonSatir(db, guildId, sembol) {
  return db
    .prepare('SELECT saat, fiyat FROM hisse_fiyatlari WHERE guild_id = ? AND sembol = ? ORDER BY saat DESC LIMIT 1')
    .get(String(guildId), sembol);
}

/**
 * Eksik adımların fiyatlarını yazar (en çok 48 saat telafi). Aynı adım için
 * ikinci çağrı hiçbir şey yazmaz; SAKLAMA_MS'den eski satırlar silinir.
 * @returns {{saat: number, haberler: Array<{id: number, sembol: string, yuzde: number, metin: string}>}}
 *   `saat`: yazılan adım sayısı
 */
export function guncelle(db, { guildId, simdi = Date.now(), rastgele = Math.random }) {
  const g = String(guildId);
  const su = adimBaslangici(simdi);

  return islem(db, () => {
    const son = new Map(SIRKETLER.map((s) => [s.sembol, sonSatir(db, g, s.sembol)]));
    const enEski = Math.min(...[...son.values()].map((r) => (r ? r.saat + ADIM_MS : su)));
    const ilk = Math.max(enEski, su - (TELAFI_ADIM - 1) * ADIM_MS);
    const ekleSatir = db.prepare('INSERT OR IGNORE INTO hisse_fiyatlari (guild_id, sembol, saat, fiyat) VALUES (?, ?, ?, ?)');
    const haberler = [];
    let yazilan = 0;

    for (let t = ilk; t <= su; t += ADIM_MS) {
      const eksikler = SIRKETLER.filter((s) => !son.get(s.sembol) || son.get(s.sembol).saat < t);
      if (eksikler.length === 0) continue;

      // O adımın haberi (en çok bir tane; gece yok). Haberin şirketi bu adımda zaten yazılmışsa şok atlanır.
      const haber = !habersizMi(t) && rastgele() < HABER_OLASILIGI ? haberUret(rastgele) : null;
      // Bütün şirketlerin paylaştığı piyasa şoku.
      const piyasa = normal(rastgele);

      for (const s of eksikler) {
        const onceki = son.get(s.sembol);
        const sok = onceki && haber && haber.sirket.sembol === s.sembol ? haber.sok : 0;
        const fiyat = onceki ? sonrakiFiyat(s, onceki.fiyat, rastgele, sok, { zaman: t, piyasa }) : egilim(s, t);
        ekleSatir.run(g, s.sembol, t, fiyat);
        son.set(s.sembol, { saat: t, fiyat });
        if (sok !== 0) {
          const yuzde = Math.round(sok * 1000) / 10;
          const { lastInsertRowid, changes } = db
            .prepare('INSERT OR IGNORE INTO hisse_haberleri (guild_id, sembol, saat, yuzde, metin) VALUES (?, ?, ?, ?, ?)')
            .run(g, s.sembol, t, yuzde, haber.metin);
          if (changes > 0) haberler.push({ id: Number(lastInsertRowid), sembol: s.sembol, yuzde, metin: haber.metin });
        }
      }
      yazilan += 1;
    }
    if (yazilan > 0) db.prepare('DELETE FROM hisse_fiyatlari WHERE guild_id = ? AND saat < ?').run(g, su - SAKLAMA_MS);
    return { saat: yazilan, haberler };
  });
}

/** Duyurulmamış haberler (eskiden yeniye). */
export function duyurulacakHaberler(db, guildId) {
  return db
    .prepare('SELECT id, sembol, saat, yuzde, metin FROM hisse_haberleri WHERE guild_id = ? AND duyuruldu = 0 ORDER BY saat ASC, id ASC')
    .all(String(guildId));
}

/**
 * Kişinin şu an elinde tuttuğu hisselere son `pencereMs` içinde gelen
 * haberler (eskiden yeniye), elindeki adetle. Activity'deki haber penceresi için.
 */
export function sahipHaberleri(db, {
  guildId, kullaniciId, pencereMs = SAAT_MS, simdi = Date.now(),
}) {
  return db
    .prepare(
      `SELECT h.id, h.sembol, h.saat, h.yuzde, h.metin, p.adet FROM hisse_haberleri h
         JOIN hisse_pozisyonlari p ON p.guild_id = h.guild_id AND p.sembol = h.sembol AND p.kullanici_id = ? AND p.adet > 0
        WHERE h.guild_id = ? AND h.saat > ? ORDER BY h.saat ASC, h.id ASC`,
    )
    .all(String(kullaniciId), String(guildId), simdi - pencereMs);
}

/** Duyuruyu işaretler; ilk işaretleyen true alır. */
export function haberDuyuruldu(db, guildId, id) {
  return db
    .prepare('UPDATE hisse_haberleri SET duyuruldu = 1 WHERE guild_id = ? AND id = ? AND duyuruldu = 0')
    .run(String(guildId), id).changes > 0;
}

/** Son kaydedilmiş fiyat (ondalıklı) ya da null. */
export function guncelFiyat(db, guildId, sembol) {
  return sonSatir(db, guildId, sembol)?.fiyat ?? null;
}

/** İşlemde geçerli tam sayı fiyat. */
export function islemFiyati(fiyat) {
  return Math.round(fiyat);
}

/** Son `adet` adımın fiyatı, eskiden yeniye. */
export function fiyatGecmisi(db, guildId, sembol, adet = GRAFIK_ADIM) {
  return db
    .prepare('SELECT saat, fiyat FROM hisse_fiyatlari WHERE guild_id = ? AND sembol = ? ORDER BY saat DESC LIMIT ?')
    .all(String(guildId), sembol, adet)
    .reverse();
}

/**
 * Fiyat listesi: güncel fiyat ve 24 saatlik değişim (24 saat önce kayıt yoksa
 * eldeki en eski kayda göre).
 */
export function liste(db, guildId, simdi = Date.now()) {
  const g = String(guildId);
  const hedef = adimBaslangici(simdi) - 24 * SAAT_MS;
  return SIRKETLER.map((sirket) => {
    const guncel = sonSatir(db, g, sirket.sembol);
    const eski = db
      .prepare('SELECT fiyat FROM hisse_fiyatlari WHERE guild_id = ? AND sembol = ? AND saat >= ? ORDER BY saat ASC LIMIT 1')
      .get(g, sirket.sembol, hedef);
    const fiyat = guncel ? islemFiyati(guncel.fiyat) : null;
    const degisimYuzde = guncel && eski && eski.fiyat > 0 ? ((guncel.fiyat - eski.fiyat) / eski.fiyat) * 100 : null;
    return {
      sirket, fiyat, degisimYuzde, ham: guncel?.fiyat ?? null, eskiHam: eski?.fiyat ?? null,
    };
  });
}

/**
 * Piyasa endeksi (MAYMUN 100, saf): şirketlerin fiyat / başlangıç değeri
 * oranlarının eşit ağırlıklı ortalaması × ENDEKS_TABAN; değer çizgisiyle
 * uzun vadede yükselir. `satirlar`: liste() çıktısı.
 * @returns {{ad: string, deger: number|null, degisimYuzde: number|null}}
 */
export function endeks(satirlar) {
  const olcu = satirlar.filter((s) => s.ham !== null);
  if (olcu.length === 0) return { ad: ENDEKS_ADI, deger: null, degisimYuzde: null };
  const ort = (f) => (ENDEKS_TABAN * olcu.reduce((t, s) => t + f(s) / s.sirket.temel, 0)) / olcu.length;
  const deger = ort((s) => s.ham);
  const eski = ort((s) => s.eskiHam ?? s.ham);
  return { ad: ENDEKS_ADI, deger, degisimYuzde: eski > 0 ? ((deger - eski) / eski) * 100 : null };
}

// ── Pozisyonlar ────────────────────────────────────────────────────────────

export function pozisyon(db, guildId, kullaniciId, sembol) {
  return db
    .prepare('SELECT adet, maliyet FROM hisse_pozisyonlari WHERE guild_id = ? AND kullanici_id = ? AND sembol = ?')
    .get(String(guildId), String(kullaniciId), sembol) ?? { adet: 0, maliyet: 0 };
}

/** Emir etkisini fiyata yazar: o adımın satırı güncellenir (taban/tavan içinde). */
function etkiYaz(db, guildId, sirket, fiyat, simdi) {
  const yeni = Math.min(tavan(sirket, simdi), Math.max(taban(sirket, simdi), fiyat));
  const son = sonSatir(db, guildId, sirket.sembol);
  db.prepare('UPDATE hisse_fiyatlari SET fiyat = ? WHERE guild_id = ? AND sembol = ? AND saat = ?')
    .run(yeni, String(guildId), sirket.sembol, son.saat);
  return yeni;
}

/** Alımın tutarı: emir etkisiyle ortalama dolum, brüt, komisyon ve toplam. */
function alimHesapla(sirket, ham, adet) {
  const e = emirEtkisi(sirket, ham, adet, 'al');
  const brut = Math.round(adet * e.ortalama);
  const komisyon = komisyonHesapla(brut);
  return {
    ...e, brut, komisyon, toplam: brut + komisyon,
  };
}

export function komisyonHesapla(tutar) {
  return Math.ceil((tutar * KOMISYON_YUZDE) / 100);
}

function sonIslemZamani(db, guildId, kullaniciId) {
  return db
    .prepare('SELECT MAX(zaman) AS zaman FROM hisse_islemleri WHERE guild_id = ? AND kullanici_id = ?')
    .get(String(guildId), String(kullaniciId)).zaman;
}

function beklemeKontrol(db, guildId, kullaniciId, simdi) {
  const son = sonIslemZamani(db, guildId, kullaniciId);
  if (son !== null && simdi >= son && simdi - son < ISLEM_BEKLEME_MS) {
    const kalan = Math.ceil((ISLEM_BEKLEME_MS - (simdi - son)) / 1000);
    return `Çok hızlı işlem yapıyorsun; ${kalan} saniye sonra tekrar dene.`;
  }
  return null;
}

/**
 * Hisse alır. `adet` ya da `tutar` (komisyon dahil harcanacak en çok muz) verilir.
 * Tek işlemde: bakiye düşer, pozisyon artar, defter ve işlem kaydı yazılır.
 * @returns {{ok: false, sebep: string} | {ok: true, sirket: object, adet: number, fiyat: number, komisyon: number, toplam: number, bakiye: number, etkiYuzde: number, yeniFiyat: number}}
 * `fiyat`: emir etkisiyle ortalama dolum (tam sayıya yuvarlı); `yeniFiyat`: işlemden sonraki piyasa fiyatı.
 */
export function al(db, {
  guildId, kullaniciId, sembol, adet = null, tutar = null, simdi = Date.now(), rastgele = Math.random,
}) {
  const sirket = sirketBul(sembol);
  if (!sirket) return { ok: false, sebep: 'Böyle bir hisse yok. Sembollere **Borsa** ekranından bak.' };

  return islem(db, () => {
    guncelle(db, { guildId, simdi, rastgele });
    const bekle = beklemeKontrol(db, guildId, kullaniciId, simdi);
    if (bekle) return { ok: false, sebep: bekle };

    const ham = guncelFiyat(db, guildId, sirket.sembol);
    let alinacak = adet;
    if (alinacak === null) {
      if (!Number.isSafeInteger(tutar) || tutar <= 0) return { ok: false, sebep: 'Kaç hisse alacağını ya da ne kadar harcayacağını yaz.' };
      // Emir etkisiyle tutar adede doğrusal değil: sığan en çok adet ikili aramayla.
      let alt = 0;
      let ust = Math.floor(tutar / ham) + 1;
      while (alt < ust) {
        const orta = Math.ceil((alt + ust) / 2);
        if (alimHesapla(sirket, ham, orta).toplam <= tutar) alt = orta;
        else ust = orta - 1;
      }
      alinacak = alt;
      if (alinacak < 1) return { ok: false, sebep: `Bu tutar 1 hisseye yetmiyor (${islemFiyati(ham)} muz + %${KOMISYON_YUZDE} komisyon).` };
    }
    if (!Number.isSafeInteger(alinacak) || alinacak < 1) return { ok: false, sebep: 'Adet en az 1 olmalı.' };

    const mevcut = pozisyon(db, guildId, kullaniciId, sirket.sembol);
    if (mevcut.adet + alinacak > KISI_BASI_ADET) {
      return {
        ok: false,
        sebep: `Bir şirketten en çok ${KISI_BASI_ADET.toLocaleString('tr-TR')} hisse tutabilirsin `
          + `(${sirket.sembol}: ${mevcut.adet.toLocaleString('tr-TR')} var).`,
      };
    }

    const h = alimHesapla(sirket, ham, alinacak);
    const { komisyon, toplam } = h;
    const fiyat = islemFiyati(h.ortalama);
    const kalan = dus(db, {
      guildId, kullaniciId, miktar: toplam, tur: TURLER.hisse, karsiId: sirket.sembol, simdi,
    });
    if (kalan === null) {
      return {
        ok: false,
        sebep: `Bakiyen yetmiyor: ${toplam.toLocaleString('tr-TR')} muz gerekiyor (komisyon dahil), `
          + `${bakiye(db, guildId, kullaniciId).toLocaleString('tr-TR')} var.`,
      };
    }

    db.prepare(
      `INSERT INTO hisse_pozisyonlari (guild_id, kullanici_id, sembol, adet, maliyet) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (guild_id, kullanici_id, sembol) DO UPDATE SET adet = adet + excluded.adet, maliyet = maliyet + excluded.maliyet`,
    ).run(String(guildId), String(kullaniciId), sirket.sembol, alinacak, toplam);
    db.prepare(
      `INSERT INTO hisse_islemleri (guild_id, kullanici_id, sembol, yon, adet, fiyat, komisyon, sonuc, zaman)
       VALUES (?, ?, ?, 'al', ?, ?, ?, 0, ?)`,
    ).run(String(guildId), String(kullaniciId), sirket.sembol, alinacak, fiyat, komisyon, simdi);
    const yeniFiyat = etkiYaz(db, guildId, sirket, h.sonFiyat, simdi);

    return {
      ok: true,
      sirket,
      adet: alinacak,
      fiyat,
      komisyon,
      toplam,
      bakiye: kalan,
      etkiYuzde: (yeniFiyat / ham - 1) * 100,
      yeniFiyat: islemFiyati(yeniFiyat),
    };
  });
}

/**
 * Hisse satar. `adet` verilir ya da `hepsi` true. Gelir komisyon düşülmüş halidir.
 * @returns {{ok: false, sebep: string} | {ok: true, sirket: object, adet: number, fiyat: number, komisyon: number, gelir: number, maliyet: number, kar: number, bakiye: number, etkiYuzde: number, yeniFiyat: number}}
 */
export function sat(db, {
  guildId, kullaniciId, sembol, adet = null, hepsi = false, simdi = Date.now(), rastgele = Math.random,
}) {
  const sirket = sirketBul(sembol);
  if (!sirket) return { ok: false, sebep: 'Böyle bir hisse yok. Sembollere **Borsa** ekranından bak.' };

  return islem(db, () => {
    guncelle(db, { guildId, simdi, rastgele });
    const mevcut = pozisyon(db, guildId, kullaniciId, sirket.sembol);
    if (mevcut.adet < 1) return { ok: false, sebep: `${sirket.sembol} hissen yok.` };
    const bekle = beklemeKontrol(db, guildId, kullaniciId, simdi);
    if (bekle) return { ok: false, sebep: bekle };

    const satilacak = hepsi ? mevcut.adet : adet;
    if (!Number.isSafeInteger(satilacak) || satilacak < 1) return { ok: false, sebep: 'Adet en az 1 olmalı.' };
    if (satilacak > mevcut.adet) return { ok: false, sebep: `Yalnız ${mevcut.adet.toLocaleString('tr-TR')} ${sirket.sembol} hissen var.` };

    const ham = guncelFiyat(db, guildId, sirket.sembol);
    const e = emirEtkisi(sirket, ham, satilacak, 'sat');
    const fiyat = islemFiyati(e.ortalama);
    const brut = Math.round(satilacak * e.ortalama);
    const komisyon = komisyonHesapla(brut);
    const gelir = brut - komisyon;
    const maliyet = satilacak === mevcut.adet ? mevcut.maliyet : Math.floor((mevcut.maliyet * satilacak) / mevcut.adet);

    const yeniBakiye = ekle(db, {
      guildId, kullaniciId, miktar: gelir, tur: TURLER.hisse, karsiId: sirket.sembol, simdi,
    });
    if (satilacak === mevcut.adet) {
      db.prepare('DELETE FROM hisse_pozisyonlari WHERE guild_id = ? AND kullanici_id = ? AND sembol = ?')
        .run(String(guildId), String(kullaniciId), sirket.sembol);
    } else {
      db.prepare('UPDATE hisse_pozisyonlari SET adet = adet - ?, maliyet = maliyet - ? WHERE guild_id = ? AND kullanici_id = ? AND sembol = ?')
        .run(satilacak, maliyet, String(guildId), String(kullaniciId), sirket.sembol);
    }
    db.prepare(
      `INSERT INTO hisse_islemleri (guild_id, kullanici_id, sembol, yon, adet, fiyat, komisyon, sonuc, zaman)
       VALUES (?, ?, ?, 'sat', ?, ?, ?, ?, ?)`,
    ).run(String(guildId), String(kullaniciId), sirket.sembol, satilacak, fiyat, komisyon, gelir - maliyet, simdi);
    const yeniFiyat = etkiYaz(db, guildId, sirket, e.sonFiyat, simdi);

    return {
      ok: true,
      sirket,
      adet: satilacak,
      fiyat,
      komisyon,
      gelir,
      maliyet,
      kar: gelir - maliyet,
      bakiye: yeniBakiye,
      etkiYuzde: (yeniFiyat / ham - 1) * 100,
      yeniFiyat: islemFiyati(yeniFiyat),
    };
  });
}

/**
 * Portföy: pozisyon başına adet, ortalama maliyet, güncel değer ve kâr/zarar.
 * Kâr/zarar, hepsi şimdi satılsaydı (satış komisyonu düşülmüş) hesaplanır.
 */
export function portfoy(db, guildId, kullaniciId) {
  const satirlar = db
    .prepare('SELECT sembol, adet, maliyet FROM hisse_pozisyonlari WHERE guild_id = ? AND kullanici_id = ? AND adet > 0')
    .all(String(guildId), String(kullaniciId));
  const pozisyonlar = [];
  for (const s of satirlar) {
    const sirket = sirketBul(s.sembol);
    const ham = guncelFiyat(db, guildId, s.sembol);
    if (!sirket || ham === null) continue;
    const fiyat = islemFiyati(ham);
    const deger = s.adet * fiyat;
    const netDeger = deger - komisyonHesapla(deger);
    pozisyonlar.push({
      sirket, adet: s.adet, maliyet: s.maliyet, ortalama: s.maliyet / s.adet, fiyat, deger, netDeger, kar: netDeger - s.maliyet,
    });
  }
  pozisyonlar.sort((a, b) => b.deger - a.deger);
  const topla = (alan) => pozisyonlar.reduce((t, p) => t + p[alan], 0);
  return {
    pozisyonlar, toplamDeger: topla('deger'), toplamMaliyet: topla('maliyet'), toplamKar: topla('kar'),
  };
}

// ── Ekonomi paneli için ────────────────────────────────────────────────────

/** `haric` kişileri dışarıda bırakan SQL parçası (boşsa hiçbir şey). */
const haricKosulu = (haric) => (haric.length ? ` AND kullanici_id NOT IN (${haric.map(() => '?').join(', ')})` : '');

/** Portföylerde tutulan muz, maliyet değeriyle (arza dahildir; bkz. ekonomi-panel.js). `haric`: sayılmayacak üyeler. */
export function hissedeKilitli(db, guildId, haric = []) {
  return db
    .prepare(`SELECT COALESCE(SUM(maliyet), 0) AS toplam FROM hisse_pozisyonlari WHERE guild_id = ?${haricKosulu(haric)}`)
    .get(String(guildId), ...haric.map(String)).toplam;
}

/** Dönemde gerçekleşen net hisse sonucu (satış geliri − maliyet; komisyonlar dahil). Pozitif = basılan. */
export function hisseSonucu(db, guildId, { baslangic, bitis }, haric = []) {
  return db
    .prepare(
      `SELECT COALESCE(SUM(sonuc), 0) AS toplam FROM hisse_islemleri
        WHERE guild_id = ? AND yon = 'sat' AND zaman >= ? AND zaman < ?${haricKosulu(haric)}`,
    )
    .get(String(guildId), baslangic, bitis, ...haric.map(String)).toplam;
}
