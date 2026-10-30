import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { sistemAyarla } from '../lib/ayarlar.js';
import { yatir } from '../lib/banka.js';
import { acVeritabani } from '../lib/db.js';
import {
  bakiye, ekle, gunlukAl, mesajOdulu, TURLER,
} from '../lib/ekonomi.js';
import { kategoriBul } from '../lib/ekonomi-panel.js';
import { adet, esyaEkle, etkiUzat } from '../lib/envanter.js';
import { etkinlikBaslat } from '../lib/etkinlik.js';
import { gorevIlerlet, gunlukGorevler } from '../lib/gorevler.js';
import { ciftlikDurumu, ciftlikTopla } from '../lib/ciftlik.js';
import { calis } from '../lib/meslekler.js';
import { biletAl } from '../lib/piyango.js';
import {
  DEVREDILENLER, emekGeliri, ENGELLER, ESIK_TABAN, KORUNANLAR, MAKS_PRESTIJ, prestijCarpani, prestijDurumu,
  prestijEsigi, prestijKasasi, prestijSeviyesi, prestijYap, SIFIRLANACAKLAR,
} from '../lib/prestij.js';
import {
  bilgiGomusu, butonBasildi, kutlamaMetni, onayGomusu, prestijButonAyristir, prestijButonId,
  prestijButonlari,
} from '../lib/prestij-bilesen.js';
import { carpanUygula, seviyeCarpani } from '../lib/prestij-carpan.js';
import { kendiSirasi, siralama } from '../lib/siralamalar.js';
import { profilVerisi } from '../lib/profil-gorsel.js';

const G = 'g1';
const A = '100';
const B = '200';
const T0 = Date.parse('2026-10-07T09:00:00Z'); // Çarşamba 12:00 TR
const GUN = 86_400_000;

function hazir() {
  const db = acVeritabani(':memory:');
  sistemAyarla(db, G, 'ekonomi', true);
  return db;
}

/** Emek geliri yazar (/calis): hem bakiyeye hem prestij eşiğine sayılır. Varsayılan zaman ilk prestijden (T0) önce. */
const ver = (db, k, miktar, simdi = T0 - 1000) => ekle(db, {
  guildId: G, kullaniciId: k, miktar, tur: TURLER.calis, simdi,
});
const seviyeYaz = (db, k, seviye) => db
  .prepare('INSERT OR REPLACE INTO prestijler (guild_id, kullanici_id, seviye, son_prestij) VALUES (?, ?, ?, 0)')
  .run(G, k, seviye);
const yap = (db, k = A, ek = {}) => prestijYap(db, { guildId: G, kullaniciId: k, simdi: T0, ...ek });

describe('eşik ve ödül', () => {
  it('eşik seviyeyle artar ve en üstte biter', () => {
    assert.equal(prestijEsigi(0), 100_000);
    assert.equal(prestijEsigi(1), 200_000);
    assert.equal(prestijEsigi(9), 1_000_000);
    assert.equal(prestijEsigi(MAKS_PRESTIJ), null);
    assert.equal(ESIK_TABAN, 100_000);
  });

  it('ödül kasası: 1–4 Demir, 5–9 Altın, 10 Elmas', () => {
    assert.equal(prestijKasasi(1), 'kasa-demir');
    assert.equal(prestijKasasi(4), 'kasa-demir');
    assert.equal(prestijKasasi(5), 'kasa-altin');
    assert.equal(prestijKasasi(9), 'kasa-altin');
    assert.equal(prestijKasasi(10), 'kasa-elmas');
  });

  it('emek geliri yalnız çarpanlı gelirleri ve son prestijden sonrasını sayar', () => {
    const db = hazir();
    for (const tur of [TURLER.gunluk, TURLER.mesaj, TURLER.calis, TURLER.gorev, TURLER.sefer]) {
      ekle(db, { guildId: G, kullaniciId: A, miktar: 10, tur, simdi: T0 - 1000 });
    }
    for (const tur of [TURLER.kazanc, TURLER.yonetici, TURLER.satis, TURLER.ciftlik, TURLER.boss]) {
      ekle(db, { guildId: G, kullaniciId: A, miktar: 1000, tur, simdi: T0 - 1000 });
    }
    ver(db, B, 7);
    assert.equal(emekGeliri(db, G, A), 50);
    db.prepare('INSERT INTO prestijler (guild_id, kullanici_id, seviye, son_prestij) VALUES (?, ?, 1, ?)').run(G, A, T0);
    assert.equal(emekGeliri(db, G, A), 0, 'prestijden önceki gelir sayılmaz');
    ver(db, A, 40, T0 + 1);
    assert.equal(emekGeliri(db, G, A), 40);
  });

  it('en üst seviyede prestij yapılamaz', () => {
    const db = hazir();
    seviyeYaz(db, A, MAKS_PRESTIJ);
    ver(db, A, 50_000_000);
    const s = yap(db);
    assert.equal(s.ok, false);
    assert.equal(bakiye(db, G, A), 50_000_000);
    assert.equal(prestijDurumu(db, G, A).enUst, true);
  });
});

describe('prestijYap', () => {
  it('emek geliri eşiğe ulaşmadıysa hiçbir şey değişmez; kumar kazancı sayılmaz', () => {
    const db = hazir();
    ver(db, A, 99_999);
    ekle(db, { guildId: G, kullaniciId: A, miktar: 5_000_000, tur: TURLER.kazanc });
    esyaEkle(db, G, A, 'kart-quincy', 2);
    const s = yap(db);
    assert.equal(s.ok, false);
    assert.match(s.sebep, /hazır değilsin/);
    assert.equal(bakiye(db, G, A), 5_099_999);
    assert.equal(adet(db, G, A, 'kart-quincy'), 2);
    assert.equal(prestijSeviyesi(db, G, A), 0);
  });

  it('bedel almaz: cüzdanı sıfırlar, kasa verir, seviyeyi artırır; eşik son prestijden sayılır', () => {
    const db = hazir();
    ver(db, A, 125_000);
    const s = yap(db);
    assert.equal(s.ok, true);
    assert.equal(s.seviye, 1);
    assert.equal(s.carpan, 1.2);
    assert.equal(s.kasa, 'kasa-demir');
    assert.deepEqual(s.devir, { ciftlik: 0, muz: 0 });
    assert.equal(bakiye(db, G, A), 0);
    assert.equal(adet(db, G, A, 'kasa-demir'), 1);
    assert.equal(prestijSeviyesi(db, G, A), 1);
    const satirlar = db.prepare("SELECT miktar FROM ekonomi_hareketleri WHERE tur = 'prestij' ORDER BY id").all();
    assert.deepEqual(satirlar.map((r) => r.miktar), [-125_000]);
    assert.equal(db.prepare("SELECT adet FROM esya_hareketleri WHERE tur = 'prestij'").get().adet, 1);
    // İkinci prestijin eşiği 200.000 ve yalnız ilk prestijden sonraki gelir sayılır.
    ver(db, A, 199_999, T0 + 1);
    assert.match(yap(db, A, { simdi: T0 + 2 }).sebep, /199\.999 \/ 200\.000/);
    ver(db, A, 1, T0 + 1);
    assert.equal(yap(db, A, { simdi: T0 + 2 }).ok, true);
    assert.equal(prestijSeviyesi(db, G, A), 2);
    assert.equal(emekGeliri(db, G, A), 0);
  });

  it('çiftlikleri satış değeri ve depodaki muzla yeni cüzdana devreder', () => {
    const db = hazir();
    ver(db, A, 100_000);
    const ciftlik = db.prepare(
      `INSERT INTO ciftlikler (guild_id, kullanici_id, arsa, seviye, yollar, harcanan, son_toplama, kurulus)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?)`,
    );
    ciftlik.run(G, A, 0, '0-0-0', 10_000, T0 - 3_600_000, T0 - GUN); // %70 + 1 saatte 28,8 muz
    ciftlik.run(G, A, 1, '0-0-2', 13_000, T0, T0 - GUN); // Muz Kurtarma: %90, depo boş
    ciftlik.run(G, B, 0, '0-0-0', 3_000, T0, T0 - GUN);
    const beklenen = 7_000 + 28 + 11_700;
    assert.equal(prestijDurumu(db, G, A, T0).ciftlikDevri, beklenen);

    const s = yap(db);
    assert.equal(s.ok, true, s.sebep);
    assert.deepEqual(s.devir, { ciftlik: 2, muz: beklenen });
    assert.equal(bakiye(db, G, A), beklenen);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ciftlikler WHERE kullanici_id = ?').get(A).n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ciftlikler WHERE kullanici_id = ?').get(B).n, 1);
    const defter = db.prepare("SELECT karsi_id, miktar FROM ekonomi_hareketleri WHERE tur = 'ciftlik' ORDER BY id").all();
    assert.deepEqual(defter.map((r) => [r.karsi_id, r.miktar]), [['prestij-0', 7_028], ['prestij-1', 11_700]]);
  });

  it('sıfırlananları sıfırlar, korunanları korur', () => {
    const db = hazir();
    ver(db, A, 3_000_000);
    ver(db, B, 777);
    // Sıfırlananlar
    for (const [esya, n] of [['kart-quincy', 3], ['parlak:kart-quincy', 1], ['kasa-ahsap', 2], ['kasa-gunluk', 4], ['seri-koruyucu', 5]]) {
      esyaEkle(db, G, A, esya, n);
    }
    db.prepare('INSERT INTO set_oduller (guild_id, kullanici_id, set_kimligi, zaman) VALUES (?, ?, ?, ?)').run(G, A, 'set1', T0);
    // Korunanlar
    etkiUzat(db, G, A, 'muz-ciftligi', GUN, T0);
    db.prepare('UPDATE bakiyeler SET gunluk_seri = 9, son_gunluk = ? WHERE guild_id = ? AND kullanici_id = ?').run('2026-10-07', G, A);
    esyaEkle(db, G, A, 'rozet-moab', 1);
    db.prepare('INSERT INTO seviyeler (guild_id, kullanici_id, xp, seviye) VALUES (?, ?, 5000, 12)').run(G, A);
    db.prepare('INSERT INTO basarimlar (guild_id, kullanici_id, basarim, zaman) VALUES (?, ?, ?, ?)').run(G, A, 'ilk', T0);
    db.prepare('INSERT INTO ozel_roller (guild_id, kullanici_id, rol_id, renk) VALUES (?, ?, ?, ?)').run(G, A, 'r1', 1);
    // Başkasının verisi
    esyaEkle(db, G, B, 'kart-quincy', 1);

    const s = yap(db);
    assert.equal(s.ok, true);

    assert.equal(bakiye(db, G, A), 0);
    assert.equal(adet(db, G, A, 'kart-quincy'), 0);
    assert.equal(adet(db, G, A, 'parlak:kart-quincy'), 0);
    assert.equal(adet(db, G, A, 'kasa-ahsap'), 0);
    assert.equal(adet(db, G, A, 'kasa-gunluk'), 0);
    assert.equal(adet(db, G, A, 'kasa-demir'), 1, 'eski kasalar silinir, ödül kasası sonra verilir');
    assert.equal(adet(db, G, A, 'seri-koruyucu'), 0);
    // Etkin takviyeler ve günlük seri korunur.
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM etkiler WHERE kullanici_id = ?').get(A).n, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM set_oduller WHERE kullanici_id = ?').get(A).n, 0);
    const hesap = db.prepare('SELECT gunluk_seri, son_gunluk FROM bakiyeler WHERE kullanici_id = ?').get(A);
    assert.equal(hesap.gunluk_seri, 9);
    assert.equal(hesap.son_gunluk, '2026-10-07', 'aynı gün ikinci /gunluk açılmasın');

    assert.equal(adet(db, G, A, 'rozet-moab'), 1);
    assert.equal(db.prepare('SELECT seviye FROM seviyeler WHERE kullanici_id = ?').get(A).seviye, 12);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM basarimlar WHERE kullanici_id = ?').get(A).n, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ozel_roller WHERE kullanici_id = ?').get(A).n, 1);

    assert.equal(bakiye(db, G, B), 777);
    assert.equal(adet(db, G, B, 'kart-quincy'), 1);

    const ozet = Object.fromEntries(s.ozet.map((o) => [o.kod, o.miktar]));
    assert.equal(ozet.bakiye, 3_000_000);
    assert.equal(ozet.kartlar, 4);
    assert.equal(ozet.kasalar, 6);
    assert.equal(ozet.stok, 5);
    assert.equal(ozet.seri, undefined);
    assert.equal(ozet.takviyeler, undefined);
    assert.equal(s.ozet.length, SIFIRLANACAKLAR.length);
    assert.ok(KORUNANLAR.length > 0);
    assert.ok(DEVREDILENLER.length > 0);
  });

  it('tek işlemdir: bir adım hata verirse cüzdan da seviye de geri alınır', () => {
    const db = hazir();
    ver(db, A, 2_000_000);
    esyaEkle(db, G, A, 'kart-quincy', 1);
    db.exec('DROP TABLE set_oduller'); // sıfırlama listesinin ortasında hata çıkar
    assert.throws(() => yap(db));
    assert.equal(bakiye(db, G, A), 2_000_000);
    assert.equal(adet(db, G, A, 'kart-quincy'), 1);
    assert.equal(prestijSeviyesi(db, G, A), 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ekonomi_hareketleri WHERE tur = 'prestij'").get().n, 0);
  });

  it('beklenen seviye uyuşmazsa (eski onay) reddeder', () => {
    const db = hazir();
    ver(db, A, 5_000_000);
    assert.equal(yap(db, A, { beklenenSeviye: 1 }).ok, false);
    assert.equal(yap(db, A, { beklenenSeviye: 0 }).ok, true);
    // Aynı onay ikinci kez geçmez.
    assert.equal(yap(db, A, { beklenenSeviye: 0 }).ok, false);
    assert.equal(prestijSeviyesi(db, G, A), 1);
  });
});

describe('engeller', () => {
  it('aktif mevduat varken yapılamaz, kapanınca yapılır', () => {
    const db = hazir();
    ver(db, A, 1_500_000);
    const y = yatir(db, { guildId: G, kullaniciId: A, miktar: 5000, vade: '12sa', seviye: 10, simdi: T0 });
    assert.equal(y.ok, true, y.sebep);
    const s = yap(db);
    assert.equal(s.ok, false);
    assert.match(s.sebep, /mevduat/);
    assert.equal(prestijSeviyesi(db, G, A), 0);
    assert.equal(prestijDurumu(db, G, A, T0).engeller.length, 1);
    db.prepare("UPDATE mevduatlar SET durum = 'bozuldu'").run();
    assert.equal(yap(db).ok, true);
  });

  it('açık kredi ve elde hisse varken yapılamaz (birleştirmede eklendi)', () => {
    const db = hazir();
    ver(db, A, 3_000_000);
    db.prepare(
      `INSERT INTO krediler (guild_id, kullanici_id, anapara, faiz_yuzde, faiz, baslangic, vade, durum)
       VALUES (?, ?, 5000, 15, 750, ?, ?, 'aktif')`,
    ).run(G, A, T0, T0 + 7 * GUN);
    assert.match(yap(db).sebep, /kredi/);
    db.prepare("UPDATE krediler SET durum = 'odendi'").run();

    db.prepare('INSERT INTO hisse_pozisyonlari (guild_id, kullanici_id, sembol, adet, maliyet) VALUES (?, ?, ?, 3, 300)')
      .run(G, A, 'MUZC');
    assert.match(yap(db).sebep, /hisse/);
    db.prepare('UPDATE hisse_pozisyonlari SET adet = 0').run();
    assert.equal(yap(db).ok, true);
  });

  it('açık blackjack eli ve bekleyen düello engeller', () => {
    const db = hazir();
    ver(db, A, 5_000_000);

    db.prepare(
      `INSERT INTO blackjack_oyunlari (guild_id, kullanici_id, bahis, deste, oyuncu, kurpiyer, baslangic)
       VALUES (?, ?, 10, '[]', '[]', '[]', ?)`,
    ).run(G, A, T0);
    assert.match(yap(db).sebep, /blackjack/);
    db.prepare('DELETE FROM blackjack_oyunlari').run();

    db.prepare(
      `INSERT INTO duello_meydanlari (guild_id, kanal_id, meydan_id, rakip_id, bahis, oyun, olusturma, bitis)
       VALUES (?, 'k', ?, ?, 10, 'zar', ?, ?)`,
    ).run(G, A, B, T0, T0 + 1000);
    assert.match(yap(db).sebep, /düello/);
    db.prepare('DELETE FROM duello_meydanlari').run();

    assert.equal(yap(db).ok, true);
    assert.ok(ENGELLER.length >= 4);
  });

  it('çekilmemiş piyango bileti engel değil; bilet prestijden sonra geçerli kalıyor', () => {
    const db = hazir();
    ver(db, A, 5_000_000);
    const b = biletAl(db, { guildId: G, kullaniciId: A, adet: 3, simdi: T0 });
    assert.equal(b.ok, true, b.sebep);
    assert.deepEqual(prestijDurumu(db, G, A, T0).engeller, []);
    assert.equal(yap(db).ok, true);
    const { adet } = db.prepare('SELECT SUM(adet) AS adet FROM piyango_biletleri WHERE guild_id = ? AND kullanici_id = ?').get(G, A);
    assert.equal(adet, 3);
  });
});

describe('çarpan', () => {
  it('prestij başına +%20, en çok +%200', () => {
    assert.equal(seviyeCarpani(0), 1);
    assert.equal(seviyeCarpani(1), 1.2);
    assert.equal(seviyeCarpani(5), 2);
    assert.equal(seviyeCarpani(10), 3);
    assert.equal(seviyeCarpani(99), 3);
    const db = hazir();
    assert.equal(prestijCarpani(db, G, A), 1);
    seviyeYaz(db, A, 3);
    assert.equal(prestijCarpani(db, G, A), 1.6);
    assert.equal(carpanUygula(10, 1.6), 16);
    assert.equal(carpanUygula(7, 1.2), 8);
  });

  it('/gunluk muzu çarpılır; etkinlikle (muz-2x) çarpılarak birleşir', () => {
    const db = hazir();
    seviyeYaz(db, A, 3);
    const g = gunlukAl(db, { guildId: G, kullaniciId: A, simdi: T0, rastgele: () => 0 });
    assert.equal(g.toplam, 320); // taban 200 × 1,6
    assert.equal(g.prestij, 1.6);

    seviyeYaz(db, B, 3);
    etkinlikBaslat(db, { guildId: G, tur: 'muz-2x', sureMs: 3_600_000, baslatanId: 'y', simdi: T0 });
    const e = gunlukAl(db, { guildId: G, kullaniciId: B, simdi: T0, rastgele: () => 0 });
    assert.equal(e.toplam, 640); // 200 × 2 × 1,6
  });

  it('sohbet muzu çarpılır (kesir olasılıkla yuvarlanır, beklenen değer tam çarpan)', () => {
    const db = hazir();
    seviyeYaz(db, A, 10);
    const alt = mesajOdulu(db, { guildId: G, kullaniciId: A, simdi: T0, rastgele: () => 0, carpan: prestijCarpani(db, G, A) });
    assert.equal(alt, 3); // 1 × 3,0
    // Çiftlik (3x) × prestij 1 (1,2x): ham 3,6 → rastgele 0 → 4, rastgele 0,99 → 3
    seviyeYaz(db, B, 1);
    assert.equal(mesajOdulu(db, { guildId: G, kullaniciId: B, simdi: T0, rastgele: () => 0, carpan: 3 * prestijCarpani(db, G, B) }), 4);
    const C = '300';
    seviyeYaz(db, C, 1);
    const dizi = [0, 0.99];
    assert.equal(mesajOdulu(db, { guildId: G, kullaniciId: C, simdi: T0, rastgele: () => dizi.shift(), carpan: 3 * prestijCarpani(db, G, C) }), 3);
    // Prestijsiz: davranış değişmez (rastgele ikinci kez çağrılmaz).
    const D = '400';
    assert.equal(mesajOdulu(db, { guildId: G, kullaniciId: D, simdi: T0, rastgele: () => 0, carpan: 3 }), 3);
  });

  it('/calis kazancı çarpılır', () => {
    const db = hazir();
    const sade = calis(db, { guildId: G, kullaniciId: B, simdi: T0, rastgele: () => 0 });
    seviyeYaz(db, A, 5);
    const prestijli = calis(db, { guildId: G, kullaniciId: A, simdi: T0, rastgele: () => 0 });
    assert.equal(prestijli.taban, sade.taban);
    assert.equal(prestijli.kazanc, Math.floor(sade.taban * 2));
  });

  it('görev muz ödülü çarpılır', () => {
    const db = hazir();
    const gorev = gunlukGorevler(G, A, T0).find((g) => g.odul.muz);
    assert.ok(gorev, 'günlük görevlerden biri muz ödüllü olmalı');
    seviyeYaz(db, A, 10);
    gorevIlerlet(db, { guildId: G, kullaniciId: A, tur: gorev.tur, miktar: gorev.hedef, simdi: T0 });
    assert.ok(bakiye(db, G, A) >= gorev.odul.muz * 3, 'prestij 10 → en az 3x');
    assert.equal(
      db.prepare("SELECT miktar FROM ekonomi_hareketleri WHERE tur = 'gorev' ORDER BY id LIMIT 1").get().miktar,
      gorev.odul.muz * 3,
    );
  });

  it('maymun çiftliğinin üretim hızı çarpılır (depo saati aynı kalır)', () => {
    const db = hazir();
    db.prepare('INSERT INTO seviyeler (guild_id, kullanici_id, xp, seviye) VALUES (?, ?, 5000, 12)').run(G, A);
    db.prepare(
      `INSERT INTO ciftlikler (guild_id, kullanici_id, arsa, seviye, yollar, harcanan, son_toplama, kurulus)
       VALUES (?, ?, 0, 1, '0-0-0', 3000, ?, ?)`,
    ).run(G, A, T0 - 3_600_000, T0 - GUN);
    seviyeYaz(db, A, 5); // ×2
    const d = ciftlikDurumu(db, G, A, T0);
    assert.equal(d.prestij, 2);
    assert.equal(d.arsalar[0].ciftlik.hiz, 0.016);
    assert.equal(d.arsalar[0].ciftlik.depoSaat, 12);
    const t = ciftlikTopla(db, { guildId: G, kullaniciId: A, simdi: T0 });
    assert.equal(t.toplam, 57); // 0,016 × 3600 = 57,6
  });

  it('kumar, satış ve faiz gibi gelirler çarpansız kalır (ekle doğrudan çağrılır)', () => {
    const db = hazir();
    seviyeYaz(db, A, 10);
    ekle(db, { guildId: G, kullaniciId: A, miktar: 100, tur: TURLER.kazanc });
    ekle(db, { guildId: G, kullaniciId: A, miktar: 100, tur: TURLER.faiz });
    ekle(db, { guildId: G, kullaniciId: A, miktar: 100, tur: TURLER.satis });
    assert.equal(bakiye(db, G, A), 300);
  });
});

describe('sıralama, panel ve profil', () => {
  it('prestij sıralaması seviyeye göre azalan, prestijsizler listede yok', () => {
    const db = hazir();
    seviyeYaz(db, A, 2);
    seviyeYaz(db, B, 5);
    seviyeYaz(db, '300', 0);
    const liste = siralama(db, G, 'prestij');
    assert.deepEqual(liste.map((s) => [s.kullanici_id, s.deger]), [[B, 5], [A, 2]]);
    assert.equal(kendiSirasi(db, G, 'prestij', A).sira, 2);
    assert.equal(kendiSirasi(db, G, 'prestij', '300'), null);
  });

  it('kategoriBul: prestij defteri kendi kategorisine girer', () => {
    assert.equal(kategoriBul('prestij', 'diger'), 'prestij');
    assert.equal(kategoriBul('prestij', 'yok'), 'prestij');
    assert.equal(TURLER.prestij, 'prestij');
  });

  it('profil verisi prestij seviyesini taşır', () => {
    const db = hazir();
    assert.equal(profilVerisi(db, G, A).prestij, 0);
    seviyeYaz(db, A, 4);
    assert.equal(profilVerisi(db, G, A).prestij, 4);
  });
});

describe('onay butonu', () => {
  it('customId çözümleme', () => {
    assert.deepEqual(prestijButonAyristir(prestijButonId('onay', '123', 2)), { eylem: 'onay', kullaniciId: '123', seviye: 2 });
    assert.equal(prestijButonAyristir('prestij:sil:123:0'), null);
    assert.equal(prestijButonAyristir('prestij:onay:abc:0'), null);
    assert.equal(prestijButonAyristir('bj:cek:123'), null);
    const satir = prestijButonlari('123', 0);
    assert.equal(satir.components.length, 2);
  });

  it('gömüler ne kaybedileceğini açıkça yazar', () => {
    const db = hazir();
    ver(db, A, 600_000);
    const durum = prestijDurumu(db, G, A, T0);
    const onay = onayGomusu(durum).data.description;
    assert.match(onay, /geri dönüşsüz/);
    assert.match(onay, /Kartlar/);
    assert.match(onay, /600\.000/); // cüzdandaki muz yok olur
    assert.match(onay, /Demir Kasa/);
    const bilgi = bilgiGomusu(durum).data;
    assert.match(bilgi.description, /600\.000.*100\.000/);
    assert.ok(bilgi.fields.length >= 3);
    assert.match(kutlamaMetni('123', 2, 1.2), /<@123>.*Prestij 2/);
  });

  /** Yalnız gerekli yüzeyi taklit eden sahte buton etkileşimi. */
  function sahte(kullaniciId, customId) {
    const kayit = { yanitlar: [], guncellemeler: [], takipler: [] };
    return {
      kayit,
      guildId: G,
      customId,
      user: { id: kullaniciId },
      member: null,
      reply: async (o) => kayit.yanitlar.push(o),
      update: async (o) => kayit.guncellemeler.push(o),
      followUp: async (o) => kayit.takipler.push(o),
    };
  }

  it('yalnız sahibi onaylayabilir', async () => {
    const db = hazir();
    ver(db, A, 2_000_000);
    const i = sahte(B, prestijButonId('onay', A, 0));
    await butonBasildi(i, db);
    assert.equal(i.kayit.yanitlar.length, 1);
    assert.match(i.kayit.yanitlar[0].content, /sana ait değil/);
    assert.equal(prestijSeviyesi(db, G, A), 0);
    assert.equal(bakiye(db, G, A), 2_000_000);
  });

  it('sahibi onaylayınca prestij olur, kutlama yalnız onu etiketler', async () => {
    const db = hazir();
    ver(db, A, 2_000_000);
    const i = sahte(A, prestijButonId('onay', A, 0));
    await butonBasildi(i, db);
    assert.equal(prestijSeviyesi(db, G, A), 1);
    assert.equal(i.kayit.guncellemeler.length, 1);
    assert.deepEqual(i.kayit.guncellemeler[0].components, []);
    assert.equal(i.kayit.takipler.length, 1);
    assert.deepEqual(i.kayit.takipler[0].allowedMentions, { parse: [], users: [A] });

    // Aynı (eski) onay tekrar basılırsa ikinci prestij olmaz.
    ver(db, A, 5_000_000);
    const tekrar = sahte(A, prestijButonId('onay', A, 0));
    await butonBasildi(tekrar, db);
    assert.equal(prestijSeviyesi(db, G, A), 1);
    assert.equal(bakiye(db, G, A), 5_000_000);
  });

  it('vazgeç hiçbir şeyi değiştirmez; ekonomi kapalıysa reddedilir', async () => {
    const db = hazir();
    ver(db, A, 2_000_000);
    const i = sahte(A, prestijButonId('iptal', A, 0));
    await butonBasildi(i, db);
    assert.equal(prestijSeviyesi(db, G, A), 0);
    assert.equal(bakiye(db, G, A), 2_000_000);

    sistemAyarla(db, G, 'ekonomi', false);
    const kapali = sahte(A, prestijButonId('onay', A, 0));
    await butonBasildi(kapali, db);
    assert.match(kapali.kayit.yanitlar[0].content, /kapalı/);
    assert.equal(prestijSeviyesi(db, G, A), 0);
  });
});
