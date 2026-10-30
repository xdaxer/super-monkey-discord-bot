import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { acVeritabani } from '../lib/db.js';
import { panelOzeti, kategoriBul } from '../lib/ekonomi-panel.js';
import { bakiye, ekle, TURLER } from '../lib/ekonomi.js';
import {
  al, DONUS_HIZI, duyurulacakHaberler, fiyatGecmisi, guncelFiyat, guncelle, HABER_MAX, HABER_MIN, haberDuyuruldu,
  hissedeKilitli, ISLEM_BEKLEME_MS, KISI_BASI_ADET, liste, portfoy, sat, SIRKETLER, sirketBul, sonrakiFiyat, 
  normal, taban, tavan, TELAFI_ADIM, haberUret, ADIM_MS, SAKLAMA_MS, EGILIM_BASLANGICI, emirEtkisi, EMIR_ETKI_SINIRI, egilim, endeks, habersizMi,
} from '../lib/hisse.js';
import { fiyatGrafigi, metinOzeti, ozet } from '../lib/hisse-grafik.js';
import { siralama } from '../lib/siralamalar.js';

const G = 'g1';
const A = '100';
const B = '200';
const SAAT_MS = 3_600_000;
// Değer çizgisinin başlangıcı (2026-10-23 12:00 TR): değer çizgisi tam `temel`.
const T0 = EGILIM_BASLANGICI;
const MUZC = SIRKETLER[0];

/** Tekrarlanabilir rastgele (mulberry32). */
function tohum(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hazir(...kisiler) {
  const db = acVeritabani(':memory:');
  for (const k of kisiler) ekle(db, { guildId: G, kullaniciId: k, miktar: 1_000_000, tur: TURLER.yonetici, simdi: 0 });
  guncelle(db, { guildId: G, simdi: T0, rastgele: tohum(1) });
  return db;
}

/** Fiyatı elle sabitler (test kolaylığı). */
/** Emir etkisiyle beklenen alım toplamı ve satış geliri (lib ile aynı hesap). */
const brutHesapla = (s, f, n, yon) => Math.round(n * emirEtkisi(s, f, n, yon).ortalama);
const alimToplami = (s, f, n) => { const b = brutHesapla(s, f, n, 'al'); return b + Math.ceil(b / 100); };
const satisGeliri = (s, f, n) => { const b = brutHesapla(s, f, n, 'sat'); return b - Math.ceil(b / 100); };

function fiyatKoy(db, sembol, fiyat, saat = T0) {
  db.prepare('INSERT OR REPLACE INTO hisse_fiyatlari (guild_id, sembol, saat, fiyat) VALUES (?, ?, ?, ?)').run(G, sembol, saat, fiyat);
}

describe('şirketler', () => {
  it('altı şirket, benzersiz dört harfli sembol, makul oynaklık', () => {
    assert.equal(SIRKETLER.length, 6);
    assert.equal(new Set(SIRKETLER.map((s) => s.sembol)).size, 6);
    for (const s of SIRKETLER) {
      assert.match(s.sembol, /^[A-Z]{4}$/);
      assert.ok(s.oynaklik >= 0.005 && s.oynaklik <= 0.04, s.sembol);
      assert.ok(s.emojiAdi.startsWith('btd_'));
    }
  });

  it('sembol büyük-küçük harfe duyarsız bulunur', () => {
    assert.equal(sirketBul('muzc'), MUZC);
    assert.equal(sirketBul('yok'), null);
  });
});

describe('fiyat modeli', () => {
  it('fiyat hep taban ile tavan arasında kalır (aşırı şoklarda da)', () => {
    const r = tohum(7);
    for (const s of SIRKETLER) {
      let f = s.temel;
      for (let i = 0; i < 5000; i += 1) {
        f = sonrakiFiyat(s, f, r, i % 50 === 0 ? 0.2 : i % 77 === 0 ? -0.2 : 0);
        assert.ok(f >= taban(s) - 1e-9 && f <= tavan(s) + 1e-9);
      }
    }
    // Uç şoklar tavana/tabana yapışır.
    assert.equal(sonrakiFiyat(MUZC, tavan(MUZC), () => 0.5, 5), tavan(MUZC));
    assert.equal(sonrakiFiyat(MUZC, taban(MUZC), () => 0.5, -0.99), taban(MUZC));
  });

  it('ortalamaya döner: uzaktan başlayan fiyat temele yaklaşır', () => {
    // Gürültüsüz (z = 0): rastgele() = 0.25 → cos(π/2)=0, normal = 0.
    const s = SIRKETLER[1];
    let f = tavan(s);
    const bas = Math.abs(Math.log(f / s.temel));
    for (let i = 0; i < 60; i += 1) f = sonrakiFiyat(s, f, () => 0.25);
    assert.ok(Math.abs(Math.log(f / s.temel)) < bas * Math.pow(1 - DONUS_HIZI, 55));
    // Aynı gürültüsüz kuralla bir adım sapmayı DONUS_HIZI kadar azaltır.
    const bir = sonrakiFiyat(s, 1000, () => 0.25);
    const beklenen = s.temel * Math.exp((1 - DONUS_HIZI) * Math.log(1000 / s.temel) - (s.oynaklik ** 2) / 2);
    assert.ok(Math.abs(bir - beklenen) < 1e-9);
  });

  it('değer çizgisi aylık büyür; uzun vadede tutan kazanır', () => {
    const AY = 30 * 24 * SAAT_MS;
    for (const s of SIRKETLER) {
      assert.equal(egilim(s), s.temel);
      assert.ok(Math.abs(egilim(s, EGILIM_BASLANGICI + AY) / s.temel - (1 + s.aylik)) < 1e-9);
      assert.ok(s.aylik >= 0.02 && s.aylik <= 0.1, s.sembol);
    }
    // 30 günlük gerçek simülasyon (ortak piyasa şokuyla): ortalama getiri çizginin büyümesine yakın, pozitif.
    const r = tohum(11);
    for (const s of [MUZC, SIRKETLER[5]]) {
      let toplam = 0;
      const tekrar = 200;
      for (let n = 0; n < tekrar; n += 1) {
        let f = s.temel;
        for (let t = 1; t <= AY / ADIM_MS; t += 1) {
          f = sonrakiFiyat(s, f, r, 0, { zaman: EGILIM_BASLANGICI + t * ADIM_MS, piyasa: normal(r) });
        }
        toplam += f / s.temel - 1;
      }
      const ort = toplam / tekrar;
      assert.ok(ort > s.aylik * 0.4 && ort < s.aylik * 1.6, `${s.sembol}: ${(ort * 100).toFixed(2)}%`);
    }
  });

  it('ortak piyasa şoku şirketleri birlikte oynatır', () => {
    // Özel gürültü yok (0.25 → z = 0); yalnız piyasa şoku: hepsi aynı yöne gider.
    const yukari = SIRKETLER.map((s) => sonrakiFiyat(s, s.temel, () => 0.25, 0, { zaman: EGILIM_BASLANGICI, piyasa: 2 }));
    SIRKETLER.forEach((s, i) => assert.ok(yukari[i] > s.temel, s.sembol));
    const asagi = SIRKETLER.map((s) => sonrakiFiyat(s, s.temel, () => 0.25, 0, { zaman: EGILIM_BASLANGICI, piyasa: -2 }));
    SIRKETLER.forEach((s, i) => assert.ok(asagi[i] < s.temel, s.sembol));
  });

  it('Türkiye saatiyle 00:00–08:00 arası haber çıkmaz', () => {
    const gun = Date.UTC(2026, 9, 22, 21, 0, 0); // 23.10 00:00 TR
    assert.equal(habersizMi(gun), true);
    assert.equal(habersizMi(gun + 7 * SAAT_MS + 55 * 60_000), true); // 07:55
    assert.equal(habersizMi(gun + 8 * SAAT_MS), false); // 08:00
    assert.equal(habersizMi(gun - 5 * 60_000), false); // 23:55
    // Gece her adımda zar haber verse de haber yazılmaz.
    const db = acVeritabani(':memory:');
    guncelle(db, { guildId: G, simdi: gun, rastgele: () => 0.001 });
    const gece = guncelle(db, { guildId: G, simdi: gun + 8 * SAAT_MS - 1, rastgele: () => 0.001 });
    assert.ok(gece.saat > 90);
    assert.equal(gece.haberler.length, 0);
    const sabah = guncelle(db, { guildId: G, simdi: gun + 8 * SAAT_MS, rastgele: () => 0.001 });
    assert.equal(sabah.haberler.length, 1);
  });

  it('endeks: başlangıçta taban değer, fiyatlarla ve 24 saatlik değişimle', () => {
    const satir = (s, ham, eskiHam) => ({ sirket: s, ham, eskiHam });
    assert.equal(endeks(SIRKETLER.map((s) => satir(s, s.temel, s.temel))).deger, 10_000);
    const e = endeks(SIRKETLER.map((s) => satir(s, s.temel * 1.1, s.temel)));
    assert.ok(Math.abs(e.deger - 11_000) < 1e-6);
    assert.ok(Math.abs(e.degisimYuzde - 10) < 1e-9);
    assert.equal(endeks([]).deger, null);
  });

  /** Durağan dağılımdan rastgele anda alıp 24 saat tutma: [başlangıç, bitiş] fiyat çiftleri. */
  function tutmaOrnekleri(s, r, adet) {
    let f = s.temel;
    for (let i = 0; i < 1000; i += 1) f = sonrakiFiyat(s, f, r); // ısınma
    const ciftler = [];
    for (let n = 0; n < adet; n += 1) {
      for (let i = 0; i < 30; i += 1) f = sonrakiFiyat(s, f, r);
      let g = f;
      for (let i = 0; i < 24; i += 1) g = sonrakiFiyat(s, g, r);
      ciftler.push([f, g]);
    }
    return ciftler;
  }
  const ortalama = (dizi) => dizi.reduce((t, x) => t + x, 0) / dizi.length;

  it('değer çizgisi sabitken beklenen getiri ~0: kısa tutmanın kârı fiyatın %1\'inden küçük (kâr çizginin büyümesinden gelir)', () => {
    const r = tohum(42);
    for (const s of SIRKETLER) {
      const c = tutmaOrnekleri(s, r, 20_000);
      const kar = ortalama(c.map(([f, g]) => g - f));
      const seviye = ortalama(c.map(([f]) => f));
      assert.ok(Math.abs(kar / seviye) < 0.01, `${s.sembol}: ${(kar / seviye * 100).toFixed(2)}%`);
    }
  });

  it('kısa vadede (çizgi büyümeden) komisyon dahil "hep al" kaybettirir', () => {
    const r = tohum(99);
    for (const s of SIRKETLER) {
      const c = tutmaOrnekleri(s, r, 20_000);
      const kar = ortalama(c.map(([f, g]) => g * 0.99 - f * 1.01));
      const seviye = ortalama(c.map(([f]) => f));
      assert.ok(kar / seviye < -0.01, `${s.sembol}: ${(kar / seviye * 100).toFixed(2)}%`);
    }
  });

  it('haber şoku aralığı %8–20 ve iki yönde de çıkar', () => {
    const r = tohum(3);
    let artis = 0;
    for (let i = 0; i < 400; i += 1) {
      const h = haberUret(r);
      const m = Math.abs(h.sok);
      assert.ok(m >= HABER_MIN && m <= HABER_MAX);
      assert.ok(h.metin.includes(h.sirket.ad));
      if (h.sok > 0) artis += 1;
    }
    assert.ok(artis > 120 && artis < 280);
  });
});

describe('saatlik güncelleme', () => {
  it('ilk çağrı temel fiyatla başlatır; aynı adımda ikinci çağrı hiçbir şey yazmaz', () => {
    const db = acVeritabani(':memory:');
    const a = guncelle(db, { guildId: G, simdi: T0 + 5000, rastgele: tohum(1) });
    assert.equal(a.saat, 1);
    for (const s of SIRKETLER) assert.equal(guncelFiyat(db, G, s.sembol), s.temel);
    const b = guncelle(db, { guildId: G, simdi: T0 + 50_000, rastgele: tohum(2) });
    assert.equal(b.saat, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM hisse_fiyatlari').get().n, SIRKETLER.length);
  });

  it('sonraki adımda (5 dk) her şirket için bir satır, bir saatte 12 satır eklenir', () => {
    const db = hazir();
    guncelle(db, { guildId: G, simdi: T0 + ADIM_MS + 1, rastgele: tohum(5) });
    assert.equal(fiyatGecmisi(db, G, 'MUZC').length, 2);
    assert.equal(fiyatGecmisi(db, G, 'SMTK').length, 2);
    guncelle(db, { guildId: G, simdi: T0 + SAAT_MS, rastgele: tohum(6) });
    assert.equal(fiyatGecmisi(db, G, 'MUZC').length, 13);
  });

  it('bot kapalıyken kaçırılan adımlar telafi edilir, en çok 48 saatlik; eski satırlar silinir', () => {
    const db = hazir();
    const sonuc = guncelle(db, { guildId: G, simdi: T0 + 10 * ADIM_MS, rastgele: tohum(5) });
    assert.equal(sonuc.saat, 10);
    assert.equal(fiyatGecmisi(db, G, 'MUZC').length, 11);

    const uzun = guncelle(db, { guildId: G, simdi: T0 + 500 * SAAT_MS, rastgele: tohum(6) });
    assert.equal(uzun.saat, TELAFI_ADIM);
    assert.equal(TELAFI_ADIM, 576);
    // Araya boşluk kalır ama son adım güncel; SAKLAMA_MS'den eskiler silinir.
    const son = fiyatGecmisi(db, G, 'MUZC', 1)[0];
    assert.equal(son.saat, T0 + 500 * SAAT_MS);
    const enEski = db.prepare("SELECT MIN(saat) AS t FROM hisse_fiyatlari WHERE sembol = 'MUZC'").get().t;
    assert.ok(enEski >= T0 + 500 * SAAT_MS - SAKLAMA_MS);
  });

  it('haber: şok uygulanır, kayıt yazılır, bir kez duyurulur', () => {
    const db = hazir();
    // İlk rastgele() < HABER_OLASILIGI (0,01) → haber; sonra şirket 0 (MUZC), artış, en büyük şok, ilk şablon.
    const dizi = [0.001, 0, 0.1, 0.999, 0];
    let i = 0;
    const r = () => (i < dizi.length ? dizi[i++] : 0.25); // sonrası gürültüsüz
    const onceki = guncelFiyat(db, G, 'MUZC');
    const sonuc = guncelle(db, { guildId: G, simdi: T0 + ADIM_MS, rastgele: r });
    assert.equal(sonuc.haberler.length, 1);
    const h = sonuc.haberler[0];
    assert.equal(h.sembol, 'MUZC');
    assert.ok(h.yuzde > 19 && h.yuzde <= 20);
    assert.match(h.metin, /Muz Çiftliği/);
    // Şok fiyata yansır: gürültüsüz adım × (1 + şok).
    const gurultusuz = sonrakiFiyat(MUZC, onceki, () => 0.25);
    assert.ok(guncelFiyat(db, G, 'MUZC') > gurultusuz * 1.19);
    // Diğer şirketler şoksuz adımla ilerler.
    assert.ok(Math.abs(guncelFiyat(db, G, 'MAYK') - sonrakiFiyat(SIRKETLER[1], 500, () => 0.25, 0, { zaman: T0 + ADIM_MS, piyasa: 0 })) < 1e-9);

    assert.equal(duyurulacakHaberler(db, G).length, 1);
    assert.equal(haberDuyuruldu(db, G, h.id), true);
    assert.equal(haberDuyuruldu(db, G, h.id), false);
    assert.equal(duyurulacakHaberler(db, G).length, 0);
  });

  it('haber ayarsız kalsa da şok uygulanır (duyuru ayrı katman)', () => {
    const db = hazir();
    const dizi = [0.001, 0, 0.9, 0.5, 0];
    let i = 0;
    const r = () => (i < dizi.length ? dizi[i++] : 0.25);
    guncelle(db, { guildId: G, simdi: T0 + ADIM_MS, rastgele: r });
    const gurultusuz = sonrakiFiyat(MUZC, 200, () => 0.25);
    assert.ok(guncelFiyat(db, G, 'MUZC') < gurultusuz * 0.93);
  });

  it('liste 24 saatlik değişimi hesaplar', () => {
    const db = hazir();
    fiyatKoy(db, 'MUZC', 100, T0 - 24 * SAAT_MS);
    fiyatKoy(db, 'MUZC', 150, T0);
    const satir = liste(db, G, T0).find((x) => x.sirket.sembol === 'MUZC');
    assert.equal(satir.fiyat, 150);
    assert.ok(Math.abs(satir.degisimYuzde - 50) < 1e-9);
    // Geçmişi tek kayıt olan şirket için değişim 0.
    assert.equal(liste(db, G, T0).find((x) => x.sirket.sembol === 'SMTK').degisimYuzde, 0);
  });
});

describe('al / sat', () => {
  const ortak = (k = A, simdi = T0) => ({ guildId: G, kullaniciId: k, simdi, rastgele: tohum(1) });

  it('alım: adet × fiyat + %1 komisyon düşer, pozisyon ve defter yazılır', () => {
    const db = hazir(A);
    fiyatKoy(db, 'MUZC', 200);
    const s = al(db, { ...ortak(), sembol: 'MUZC', adet: 10 });
    assert.equal(s.ok, true);
    // İşlem fiyatı kaymanın ortalamasıdır (2.000 / 200.000 → ~%0,5 üstü).
    assert.equal(s.fiyat, Math.round(emirEtkisi(MUZC, 200, 10, 'al').ortalama));
    assert.equal(s.fiyat, 201);
    const toplam = alimToplami(MUZC, 200, 10);
    assert.equal(s.toplam, toplam);
    assert.equal(s.komisyon, Math.ceil(brutHesapla(MUZC, 200, 10, 'al') / 100));
    assert.equal(bakiye(db, G, A), 1_000_000 - toplam);
    const d = db.prepare("SELECT miktar, karsi_id, tur FROM ekonomi_hareketleri WHERE tur = 'hisse'").get();
    assert.deepEqual({ ...d }, { miktar: -toplam, karsi_id: 'MUZC', tur: 'hisse' });
    const p = portfoy(db, G, A);
    assert.equal(p.pozisyonlar[0].adet, 10);
    assert.equal(p.pozisyonlar[0].maliyet, toplam);
    assert.equal(p.pozisyonlar[0].ortalama, toplam / 10);
    // Alım fiyatı yukarı iter: log-fiyat tutar / derinlik kadar.
    assert.ok(Math.abs(guncelFiyat(db, G, 'MUZC') - 200 * Math.exp(2000 / MUZC.derinlik)) < 1e-9);
  });

  it('tutar ile alım: komisyon dahil tutarı aşmaz', () => {
    const db = hazir(A);
    fiyatKoy(db, 'MUZC', 200);
    const s = al(db, { ...ortak(), sembol: 'muzc', tutar: 1000 });
    assert.equal(s.ok, true);
    assert.equal(s.adet, 4); // 4 × 200 + 8 = 808; 5 × 200 + 10 = 1010 > 1000
    assert.ok(s.toplam <= 1000);
    const az = al(db, { ...ortak(A, T0 + 60_000), sembol: 'MUZC', tutar: 100 });
    assert.equal(az.ok, false);
    assert.match(az.sebep, /1 hisseye yetmiyor/);
  });

  it('bakiye yetmezse hiçbir şey yazılmaz', () => {
    const db = acVeritabani(':memory:');
    ekle(db, { guildId: G, kullaniciId: A, miktar: 500, tur: TURLER.yonetici, simdi: 0 });
    guncelle(db, { guildId: G, simdi: T0, rastgele: tohum(1) });
    fiyatKoy(db, 'MUZC', 200);
    const s = al(db, { ...ortak(), sembol: 'MUZC', adet: 3 });
    assert.equal(s.ok, false);
    assert.match(s.sebep, /Bakiyen yetmiyor/);
    assert.equal(bakiye(db, G, A), 500);
    assert.equal(portfoy(db, G, A).pozisyonlar.length, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM hisse_islemleri').get().n, 0);
  });

  it('geçersiz sembol ve adet', () => {
    const db = hazir(A);
    assert.equal(al(db, { ...ortak(), sembol: 'XXXX', adet: 1 }).ok, false);
    assert.equal(al(db, { ...ortak(), sembol: 'MUZC', adet: 0 }).ok, false);
    assert.equal(al(db, { ...ortak(), sembol: 'MUZC' }).ok, false);
    assert.equal(sat(db, { ...ortak(), sembol: 'MUZC', adet: 1 }).sebep, 'MUZC hissen yok.');
  });

  it(`şirket başına ${KISI_BASI_ADET} adet sınırı`, () => {
    const db = hazir(A);
    fiyatKoy(db, 'BALN', 45); // taban
    ekle(db, { guildId: G, kullaniciId: A, miktar: 5_000_000, tur: TURLER.yonetici, simdi: 0 });
    assert.equal(al(db, { ...ortak(), sembol: 'BALN', adet: KISI_BASI_ADET }).ok, true);
    const fazla = al(db, { ...ortak(A, T0 + 60_000), sembol: 'BALN', adet: 1 });
    assert.equal(fazla.ok, false);
    assert.match(fazla.sebep, /en çok 10\.000/);
    // Başka şirket etkilenmez.
    assert.equal(al(db, { ...ortak(A, T0 + 120_000), sembol: 'MUZC', adet: 1 }).ok, true);
  });

  it('satış: gelir komisyon düşülmüş, kâr/zarar maliyete göre, defter + işaretli', () => {
    const db = hazir(A);
    fiyatKoy(db, 'MUZC', 200);
    const alis = al(db, { ...ortak(), sembol: 'MUZC', adet: 10 }).toplam;
    fiyatKoy(db, 'MUZC', 300, T0 + SAAT_MS);
    const s = sat(db, { ...ortak(A, T0 + SAAT_MS), sembol: 'MUZC', adet: 4 });
    assert.equal(s.ok, true);
    assert.equal(s.fiyat, Math.round(emirEtkisi(MUZC, 300, 4, 'sat').ortalama));
    const gelir = satisGeliri(MUZC, 300, 4);
    assert.equal(s.gelir, gelir);
    assert.equal(s.maliyet, Math.floor((alis * 4) / 10));
    assert.equal(s.kar, gelir - s.maliyet);
    const p = portfoy(db, G, A).pozisyonlar[0];
    assert.equal(p.adet, 6);
    assert.equal(p.maliyet, alis - s.maliyet);
    const d = db.prepare("SELECT miktar, karsi_id FROM ekonomi_hareketleri WHERE tur = 'hisse' ORDER BY id DESC").get();
    assert.deepEqual({ ...d }, { miktar: gelir, karsi_id: 'MUZC' });
    // Satış fiyatı aşağı iter.
    assert.ok(guncelFiyat(db, G, 'MUZC') < 300);
  });

  it('hepsi satılınca pozisyon silinir; fazla adet reddedilir', () => {
    const db = hazir(A);
    fiyatKoy(db, 'MUZC', 200);
    al(db, { ...ortak(), sembol: 'MUZC', adet: 3 });
    const fazla = sat(db, { ...ortak(A, T0 + 60_000), sembol: 'MUZC', adet: 4 });
    assert.equal(fazla.ok, false);
    const s = sat(db, { ...ortak(A, T0 + 60_000), sembol: 'MUZC', hepsi: true });
    assert.equal(s.ok, true);
    assert.equal(s.adet, 3);
    assert.equal(portfoy(db, G, A).pozisyonlar.length, 0);
    assert.equal(hissedeKilitli(db, G), 0);
  });

  it('al-hemen-sat komisyon ve kayma kadar zarardır (emir etkisiyle kâr basılamaz)', () => {
    const db = hazir(A);
    fiyatKoy(db, 'MUZC', 200);
    al(db, { ...ortak(), sembol: 'MUZC', adet: 100 });
    assert.ok(guncelFiyat(db, G, 'MUZC') > 200);
    const s = sat(db, { ...ortak(A, T0 + 60_000), sembol: 'MUZC', hepsi: true });
    assert.ok(s.kar < 0);
    // ~21.000 × %1 alışta ve satışta ≈ 420; satış yükselmiş fiyattan
    // hesaplandığı için fiyatı başladığı yerin biraz altına iter (~%1): ≈ 530.
    const kayip = 1_000_000 - bakiye(db, G, A);
    assert.ok(kayip >= 420 && kayip <= 560, String(kayip));
    const son = guncelFiyat(db, G, 'MUZC');
    assert.ok(son < 200 && son > 196, String(son));
  });

  it('yüklü emir fiyatı belirgin oynatır, sınırda kesilir; emri bölmek kazandırmaz', () => {
    // 10.000 muzluk MUZC alımı ~%5, 100.000 muzluk SMTK ~%13; çok büyük emir sınırda kesilir.
    assert.ok(Math.abs(emirEtkisi(MUZC, 200, 50, 'al').etki - 0.05) < 1e-9);
    assert.equal(emirEtkisi(MUZC, 200, 250, 'al').etki, EMIR_ETKI_SINIRI);
    assert.ok(Math.abs(emirEtkisi(SIRKETLER[5], 1000, 100, 'sat').etki + 100_000 / SIRKETLER[5].derinlik) < 1e-9);
    assert.equal(emirEtkisi(MUZC, 200, 1_000_000, 'al').etki, EMIR_ETKI_SINIRI);
    // Tek emir ile iki yarım emir aynı ortalamaya gelir (doğrusal etki).
    const tek = emirEtkisi(MUZC, 200, 1000, 'al');
    const ilk = emirEtkisi(MUZC, 200, 500, 'al');
    const ikinci = emirEtkisi(MUZC, ilk.sonFiyat, 500, 'al');
    const bolunmus = (500 * ilk.ortalama + 500 * ikinci.ortalama) / 1000;
    assert.ok(bolunmus >= tek.ortalama - 1e-6, `${bolunmus} < ${tek.ortalama}`);
  });

  it('işlemler arası bekleme: 30 sn dolmadan reddedilir, sonra olur', () => {
    const db = hazir(A, B);
    fiyatKoy(db, 'MUZC', 200);
    assert.equal(al(db, { ...ortak(), sembol: 'MUZC', adet: 1 }).ok, true);
    const hizli = al(db, { ...ortak(A, T0 + 10_000), sembol: 'MUZC', adet: 1 });
    assert.equal(hizli.ok, false);
    assert.match(hizli.sebep, /20 saniye/);
    assert.equal(sat(db, { ...ortak(A, T0 + 29_999), sembol: 'MUZC', adet: 1 }).ok, false);
    assert.equal(al(db, { ...ortak(A, T0 + ISLEM_BEKLEME_MS), sembol: 'MUZC', adet: 1 }).ok, true);
    // Bekleme kişiye özeldir.
    assert.equal(al(db, { ...ortak(B, T0 + 1000), sembol: 'MUZC', adet: 1 }).ok, true);
  });

  it('işlem, geç kalan fiyat güncellemesini önce yapar (eski fiyattan işlem yok)', () => {
    const db = hazir(A);
    const s = al(db, { guildId: G, kullaniciId: A, sembol: 'MUZC', adet: 1, simdi: T0 + 3 * ADIM_MS, rastgele: tohum(8) });
    assert.equal(s.ok, true);
    assert.equal(fiyatGecmisi(db, G, 'MUZC').length, 4);
    assert.equal(s.fiyat, Math.round(guncelFiyat(db, G, 'MUZC')));
  });
});

describe('portföy kâr/zarar', () => {
  it('birden çok alımda ortalama maliyet; değer ve net kâr/zarar', () => {
    const db = hazir(A);
    fiyatKoy(db, 'DART', 300);
    al(db, { guildId: G, kullaniciId: A, sembol: 'DART', adet: 10, simdi: T0 });
    fiyatKoy(db, 'DART', 400, T0 + SAAT_MS);
    al(db, { guildId: G, kullaniciId: A, sembol: 'DART', adet: 10, simdi: T0 + SAAT_MS });
    fiyatKoy(db, 'DART', 500, T0 + 2 * SAAT_MS);
    const p = portfoy(db, G, A);
    const x = p.pozisyonlar[0];
    const maliyet = alimToplami(SIRKETLER[2], 300, 10) + alimToplami(SIRKETLER[2], 400, 10); // ~7.072
    assert.equal(x.adet, 20);
    assert.equal(x.maliyet, maliyet);
    assert.equal(x.ortalama, maliyet / 20);
    assert.equal(x.deger, 10_000);
    assert.equal(x.netDeger, 9900);
    assert.equal(x.kar, 9900 - maliyet);
    assert.equal(p.toplamKar, 9900 - maliyet);
    assert.equal(portfoy(db, G, B).pozisyonlar.length, 0);
  });
});

describe('arz ve sıralama (ekonomi paneli)', () => {
  it('kategoriBul: hisse türü "hisse" kategorisidir', () => {
    assert.equal(kategoriBul('hisse', 'diger'), 'hisse');
    assert.equal(kategoriBul('hisse', 'yok'), 'hisse');
  });

  it('hisse alımı arzı değiştirmez; gerçekleşen kâr basılan, zarar/komisyon yok edilen', () => {
    const db = hazir(A);
    const simdi = T0 + 2 * SAAT_MS;
    guncelle(db, { guildId: G, simdi, rastgele: tohum(2) });
    const once = panelOzeti(db, G, 'bugun', simdi);
    fiyatKoy(db, 'MUZC', 200, simdi);
    al(db, { guildId: G, kullaniciId: A, sembol: 'MUZC', adet: 100, simdi });
    const alinca = panelOzeti(db, G, 'bugun', simdi);
    const alis = alimToplami(MUZC, 200, 100);
    assert.equal(alinca.arz, once.arz);
    assert.equal(alinca.hissede, alis);
    assert.equal(alinca.bakiyeler, once.bakiyeler - alis);
    assert.equal(alinca.net, once.net); // alım ne basar ne yok eder
    assert.ok(!alinca.basilan.some((k) => k.kod === 'hisse'));
    assert.ok(!alinca.yokEdilen.some((k) => k.kod === 'hisse'));

    // Fiyat artar, tamamı satılır: gerçekleşen kâr basılan sayılır ve arz tam o kadar artar.
    fiyatKoy(db, 'MUZC', 300, T0 + 3 * SAAT_MS);
    const s = sat(db, { guildId: G, kullaniciId: A, sembol: 'MUZC', hepsi: true, simdi: T0 + 3 * SAAT_MS });
    const satinca = panelOzeti(db, G, 'bugun', T0 + 3 * SAAT_MS);
    assert.equal(s.kar, satisGeliri(MUZC, 300, 100) - alis);
    assert.equal(satinca.arz - once.arz, s.kar);
    assert.equal(satinca.net - once.net, s.kar);
    assert.equal(satinca.basilan.find((k) => k.kod === 'hisse-sonucu').miktar, s.kar);
    assert.equal(satinca.hissede, 0);
    // Kazananlar listesinde hisse hareketi sayılmaz.
    assert.ok(!satinca.kazananlar.some((k) => k.kullanici_id === A && k.net === s.gelir));
  });

  it('zararla satış yok edilen olarak görünür ve arz aynı kadar azalır', () => {
    const db = hazir(A);
    const t = T0 + SAAT_MS;
    const once = panelOzeti(db, G, 'bugun', t).arz;
    fiyatKoy(db, 'MUZC', 200);
    al(db, { guildId: G, kullaniciId: A, sembol: 'MUZC', adet: 50, simdi: t });
    fiyatKoy(db, 'MUZC', 100, t + SAAT_MS);
    const s = sat(db, { guildId: G, kullaniciId: A, sembol: 'MUZC', hepsi: true, simdi: t + SAAT_MS });
    assert.ok(s.kar < 0);
    const o = panelOzeti(db, G, 'bugun', t + SAAT_MS);
    assert.equal(o.arz - once, s.kar);
    assert.equal(o.yokEdilen.find((k) => k.kod === 'hisse-sonucu').miktar, -s.kar);
  });

  it('toplam servet sıralaması hisse değerini (güncel fiyatla) içerir', () => {
    const db = hazir(A, B);
    fiyatKoy(db, 'MUZC', 200);
    const { toplam } = al(db, { guildId: G, kullaniciId: A, sembol: 'MUZC', adet: 1000, simdi: T0 }); // ~207.000 harcar
    fiyatKoy(db, 'MUZC', 600, T0 + SAAT_MS);
    const sonuc = siralama(db, G, "toplam", { simdi: T0 + SAAT_MS });
    const a = sonuc.find((s) => s.kullanici_id === A);
    assert.equal(a.deger, 1_000_000 - toplam + 600_000);
  });
});

describe('grafik', () => {
  const noktalar = Array.from({ length: 48 }, (_, i) => ({ saat: T0 + i * SAAT_MS, fiyat: 200 + 30 * Math.sin(i / 5) }));

  it('PNG imzası (canvas varsa) ya da null', async () => {
    const png = await fiyatGrafigi({ sirket: MUZC, noktalar });
    if (png === null) return; // canvas kurulu değil: komut metin özetine düşer
    assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.ok(png.length > 2000);
  });

  it('tek noktayla grafik çizilmez (null)', async () => {
    assert.equal(await fiyatGrafigi({ sirket: MUZC, noktalar: noktalar.slice(0, 1) }), null);
  });

  it('metin özeti sembol, aralık ve değişimi içerir', () => {
    const t = metinOzeti(MUZC, [{ saat: 0, fiyat: 100 }, { saat: 1, fiyat: 150 }, { saat: 2, fiyat: 120 }]);
    assert.match(t, /MUZC/);
    assert.match(t, /\+20,0%/);
    assert.match(t, /▁.*█|▁.*▇/s);
    assert.equal(ozet([]), null);
    assert.match(metinOzeti(MUZC, []), /geçmişi yok/);
  });
});

describe('piyasa panosu (resim)', () => {
  it('bütün şirketlerden PNG üretir; ikon inmese de çalışır; boş listede null', async () => {
    const { acVeritabani } = await import('../lib/db.js');
    const { guncelle: g, fiyatGecmisi: f, liste: l } = await import('../lib/hisse.js');
    const { piyasaPanosu } = await import('../lib/hisse-grafik.js');
    const db = acVeritabani(':memory:');
    const t0 = Date.parse('2026-10-08T00:00:00+03:00');
    for (let s = 0; s < 6; s += 1) g(db, { guildId: 'p', simdi: t0 + s * 3_600_000, rastgele: () => 0.5 });
    const satirlar = l(db, 'p', t0 + 5 * 3_600_000).map((s) => ({ ...s, noktalar: f(db, 'p', s.sirket.sembol) }));
    const png = await piyasaPanosu({ satirlar, ikon: async () => { throw new Error('ağ yok'); } });
    if (png === null) return; // canvas kurulu değilse görsel yok (yazılı listeye düşülür)
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(await piyasaPanosu({ satirlar: [] }), null);
  });
});
