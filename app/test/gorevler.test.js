import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { sistemAyarla } from '../lib/ayarlar.js';
import { acVeritabani } from '../lib/db.js';
import { bakiye, trGunBaslangici } from '../lib/ekonomi.js';
import { adet } from '../lib/envanter.js';
import {
  GOREV_TURLERI, GUNLUK_BONUS, GUNLUK_HAVUZ, gorevIlerlet, gorevleriGetir, gunDonemi, gunlukGorevler,
  haftaBaslangici, haftaDonemi, haftalikGorevler, HAFTALIK_HAVUZ, ilerlemeCubugu, odulMetni,
  sonrakiHaftaBaslangici,
} from '../lib/gorevler.js';
import { kumarOlaylari, kasaOlaylari } from '../lib/gorev-bilesen.js';

const G = 'g1';
const A = '100';
const B = '200';

/** 2026-10-07 Çarşamba 12:00 (TR) */
const CARSAMBA = Date.parse('2026-10-07T09:00:00Z');
const GUN = 86_400_000;

function hazir() {
  const db = acVeritabani(':memory:');
  sistemAyarla(db, G, 'ekonomi', true); // varsayılan kapalı
  return db;
}

/** Bir görevi tek çağrıyla bitirir. */
function bitir(db, kullaniciId, tanim, simdi) {
  return gorevIlerlet(db, {
    guildId: G, kullaniciId, tur: tanim.tur, miktar: tanim.hedef, simdi,
  });
}

/** Ödülün toplam etkisi: muz bakiyesi ve kasa adedi. */
function varlik(db, kullaniciId, kasa) {
  return { muz: bakiye(db, G, kullaniciId), kasa: adet(db, G, kullaniciId, kasa) };
}

describe('havuz', () => {
  it('havuz boyutları ve türler geçerli', () => {
    const gunluk = Object.values(GUNLUK_HAVUZ).flat();
    const haftalik = Object.values(HAFTALIK_HAVUZ).flat();
    assert.ok(gunluk.length >= 10 && gunluk.length <= 15);
    assert.ok(haftalik.length >= 5 && haftalik.length <= 8);
    for (const g of [...gunluk, ...haftalik]) {
      assert.ok(GOREV_TURLERI.includes(g.tur), g.kimlik);
      assert.ok(g.hedef >= 1);
    }
    assert.equal(new Set([...gunluk, ...haftalik].map((g) => g.kimlik)).size, gunluk.length + haftalik.length);
  });
});

describe('belirlenimli seçim', () => {
  it('aynı kullanıcı ve gün için hep aynı üç görev, türleri farklı', () => {
    const bir = gunlukGorevler(G, A, CARSAMBA).map((g) => g.kimlik);
    const iki = gunlukGorevler(G, A, CARSAMBA + 3_600_000).map((g) => g.kimlik);
    assert.deepEqual(bir, iki);
    assert.equal(bir.length, 3);
    assert.equal(new Set(gunlukGorevler(G, A, CARSAMBA).map((g) => g.tur)).size, 3);
  });

  it('günler ve kullanıcılar arasında çeşitlenir', () => {
    const gunler = new Set();
    const kullanicilar = new Set();
    for (let i = 0; i < 30; i += 1) {
      gunler.add(gunlukGorevler(G, A, CARSAMBA + i * GUN).map((g) => g.kimlik).join());
      kullanicilar.add(gunlukGorevler(G, String(1000 + i), CARSAMBA).map((g) => g.kimlik).join());
    }
    assert.ok(gunler.size > 5);
    assert.ok(kullanicilar.size > 5);
  });

  it('haftalık görev iki tane ve hafta boyunca sabit', () => {
    const pazartesi = haftaBaslangici(CARSAMBA);
    const ilk = haftalikGorevler(G, A, pazartesi).map((g) => g.kimlik);
    assert.equal(ilk.length, 2);
    for (let i = 0; i < 7; i += 1) {
      assert.deepEqual(haftalikGorevler(G, A, pazartesi + i * GUN + 5_000).map((g) => g.kimlik), ilk);
    }
  });
});

describe('gün ve hafta sınırı', () => {
  it('hafta Pazartesi 00:00 (TR) başlar', () => {
    const pazartesi = haftaBaslangici(CARSAMBA);
    assert.equal(new Date(pazartesi).toISOString(), '2026-10-04T21:00:00.000Z'); // 5 Ekim 00:00 TR
    assert.equal(haftaBaslangici(pazartesi), pazartesi);
    assert.equal(haftaBaslangici(pazartesi - 1), pazartesi - 7 * GUN, 'Pazar 23:59 önceki haftadır');
    assert.equal(sonrakiHaftaBaslangici(CARSAMBA), pazartesi + 7 * GUN);
    assert.equal(haftaDonemi(pazartesi + 6 * GUN), haftaDonemi(pazartesi));
    assert.notEqual(haftaDonemi(pazartesi + 7 * GUN), haftaDonemi(pazartesi));
  });

  it('gün Türkiye gece yarısı değişir', () => {
    const gece = trGunBaslangici(CARSAMBA);
    assert.notEqual(gunDonemi(gece - 1), gunDonemi(gece));
    assert.equal(gunDonemi(gece), gunDonemi(gece + GUN - 1));
  });

  it('yenilenme zamanı gece yarısı ve sonraki Pazartesi', () => {
    const db = hazir();
    const d = gorevleriGetir(db, { guildId: G, kullaniciId: A, simdi: CARSAMBA });
    assert.equal(d.gunluk.bitis, trGunBaslangici(CARSAMBA) + GUN);
    assert.equal(d.haftalik.bitis, sonrakiHaftaBaslangici(CARSAMBA));
  });
});

describe('ilerleme ve ödül', () => {
  it('görev kısmi ilerler, hedefte biter ve ödül bir kez verilir', () => {
    const db = hazir();
    const [kolay] = gunlukGorevler(G, A, CARSAMBA);
    const kasa = kolay.odul.kasa ?? 'kasa-ahsap';
    const once = varlik(db, A, kasa);

    if (kolay.hedef > 1) {
      assert.deepEqual(gorevIlerlet(db, { guildId: G, kullaniciId: A, tur: kolay.tur, simdi: CARSAMBA }), []);
      const d = gorevleriGetir(db, { guildId: G, kullaniciId: A, simdi: CARSAMBA });
      assert.equal(d.gunluk.gorevler[0].ilerleme, 1);
    }

    const biten = bitir(db, A, kolay, CARSAMBA);
    assert.equal(biten.length, 1);
    assert.equal(biten[0].donem, 'gunluk');
    assert.equal(biten[0].ad, kolay.ad);
    const sonra = varlik(db, A, kasa);
    assert.equal(sonra.muz - once.muz, kolay.odul.muz);

    // Tekrar ilerletmek ne görevi ne ödülü tekrarlar.
    assert.deepEqual(bitir(db, A, kolay, CARSAMBA + 1000), []);
    assert.deepEqual(varlik(db, A, kasa), sonra);
  });

  it('ilerleme hedefi aşmaz ve defterde gorev türüyle görünür', () => {
    const db = hazir();
    const [kolay] = gunlukGorevler(G, A, CARSAMBA);
    gorevIlerlet(db, { guildId: G, kullaniciId: A, tur: kolay.tur, miktar: kolay.hedef * 5, simdi: CARSAMBA });
    const d = gorevleriGetir(db, { guildId: G, kullaniciId: A, simdi: CARSAMBA });
    assert.equal(d.gunluk.gorevler[0].ilerleme, kolay.hedef);
    assert.ok(d.gunluk.gorevler[0].bitti > 0);
    const satir = db.prepare("SELECT COUNT(*) AS n FROM ekonomi_hareketleri WHERE kullanici_id = ? AND tur = 'gorev'").get(A);
    assert.equal(satir.n, kolay.odul.muz ? 1 : 0);
  });

  it('kasa ödüllü görev kasayı envantere ekler', () => {
    const db = hazir();
    // Ahşap Kasa veren bir günlük görevi olan kullanıcıyı ara.
    let bulunan = null;
    for (let i = 0; i < 400 && !bulunan; i += 1) {
      const k = String(5000 + i);
      const zor = gunlukGorevler(G, k, CARSAMBA)[2];
      if (zor.odul.kasa) bulunan = { k, zor };
    }
    assert.ok(bulunan);
    const { k, zor } = bulunan;
    assert.equal(adet(db, G, k, 'kasa-ahsap'), 0);
    bitir(db, k, zor, CARSAMBA);
    assert.equal(adet(db, G, k, 'kasa-ahsap'), 1);
    assert.deepEqual(bitir(db, k, zor, CARSAMBA), []);
    assert.equal(adet(db, G, k, 'kasa-ahsap'), 1);
  });

  it('ilerleme yeni günde sıfırlanır, eski gün satırları silinir', () => {
    const db = hazir();
    const [kolay] = gunlukGorevler(G, A, CARSAMBA);
    bitir(db, A, kolay, CARSAMBA);
    const yarin = trGunBaslangici(CARSAMBA) + GUN + 1000;
    const d = gorevleriGetir(db, { guildId: G, kullaniciId: A, simdi: yarin });
    assert.ok(d.gunluk.gorevler.every((g) => g.ilerleme === 0 && g.bitti === 0));
    const donemler = db.prepare("SELECT DISTINCT donem FROM gorev_ilerleme WHERE kullanici_id = ? AND donem LIKE 'g:%'").all(A);
    assert.deepEqual(donemler.map((s) => s.donem), [gunDonemi(yarin)]);
  });

  it('haftalık görev günlerden bağımsız birikir ve haftada bir kez ödenir', () => {
    const db = hazir();
    const pazartesi = haftaBaslangici(CARSAMBA);
    const [orta] = haftalikGorevler(G, A, pazartesi);
    const yarisi = Math.ceil(orta.hedef / 2);
    assert.deepEqual(gorevIlerlet(db, {
      guildId: G, kullaniciId: A, tur: orta.tur, miktar: yarisi, simdi: pazartesi + 1000,
    }), []);
    const biten = gorevIlerlet(db, {
      guildId: G, kullaniciId: A, tur: orta.tur, miktar: orta.hedef - yarisi, simdi: pazartesi + 4 * GUN,
    });
    const haftalikBiten = biten.filter((b) => b.donem === 'haftalik');
    assert.equal(haftalikBiten.length, 1);
    assert.deepEqual(haftalikBiten[0].odul, orta.odul);
    assert.deepEqual(
      gorevIlerlet(db, { guildId: G, kullaniciId: A, tur: orta.tur, miktar: 1, simdi: pazartesi + 5 * GUN })
        .filter((b) => b.donem === 'haftalik'),
      [],
    );
    // Sonraki hafta yeniden başlar.
    const sonraki = gorevleriGetir(db, { guildId: G, kullaniciId: A, simdi: pazartesi + 7 * GUN });
    assert.ok(sonraki.haftalik.gorevler.every((g) => g.ilerleme === 0));
  });

  it('aynı olay hem günlük hem haftalık görevi ilerletir; kullanıcılar ayrıdır', () => {
    const db = hazir();
    const [kolay] = gunlukGorevler(G, A, CARSAMBA);
    bitir(db, A, kolay, CARSAMBA);
    const b = gorevleriGetir(db, { guildId: G, kullaniciId: B, simdi: CARSAMBA });
    assert.ok(b.gunluk.gorevler.every((g) => g.bitti === 0));
  });
});

describe('günlük bonus', () => {
  it('üç görevin hepsi bitince bonus kasa bir kez verilir', () => {
    const db = hazir();
    const [kolay, orta, zor] = gunlukGorevler(G, A, CARSAMBA);
    const kasaOnce = adet(db, G, A, 'kasa-ahsap');
    // Başka bir kasa ödülü karışmasın diye sayımı ödüllere göre yap.
    const beklenen = [kolay, orta, zor].filter((g) => g.odul.kasa === 'kasa-ahsap').length + 1;

    assert.equal(bitir(db, A, kolay, CARSAMBA).some((b) => b.donem === 'bonus'), false);
    assert.equal(bitir(db, A, orta, CARSAMBA).some((b) => b.donem === 'bonus'), false);
    const son = bitir(db, A, zor, CARSAMBA);
    const bonus = son.filter((b) => b.donem === 'bonus');
    assert.equal(bonus.length, 1);
    assert.deepEqual(bonus[0].odul, GUNLUK_BONUS);
    assert.equal(adet(db, G, A, 'kasa-ahsap') - kasaOnce, beklenen);

    // Sonradan hiçbir şey ikinci bonus getirmez.
    for (const g of [kolay, orta, zor]) assert.deepEqual(bitir(db, A, g, CARSAMBA), []);
    assert.equal(adet(db, G, A, 'kasa-ahsap') - kasaOnce, beklenen);
    assert.ok(gorevleriGetir(db, { guildId: G, kullaniciId: A, simdi: CARSAMBA }).gunluk.bonus > 0);
  });

  it('iki görev bitince bonus yok', () => {
    const db = hazir();
    const [kolay, orta] = gunlukGorevler(G, A, CARSAMBA);
    bitir(db, A, kolay, CARSAMBA);
    bitir(db, A, orta, CARSAMBA);
    assert.equal(gorevleriGetir(db, { guildId: G, kullaniciId: A, simdi: CARSAMBA }).gunluk.bonus, 0);
  });
});

describe('güvenlik', () => {
  it('ekonomi sistemi kapalıyken hiçbir şey yazmaz', () => {
    const db = hazir();
    sistemAyarla(db, G, 'ekonomi', false);
    const [kolay] = gunlukGorevler(G, A, CARSAMBA);
    assert.deepEqual(bitir(db, A, kolay, CARSAMBA), []);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM gorev_ilerleme').get().n, 0);
    assert.equal(bakiye(db, G, A), 0);

    sistemAyarla(db, G, 'ekonomi', true);
    assert.equal(bitir(db, A, kolay, CARSAMBA).length, 1);
  });

  it('geçersiz tür ve miktar yok sayılır, hata atmaz', () => {
    const db = hazir();
    assert.deepEqual(gorevIlerlet(db, { guildId: G, kullaniciId: A, tur: 'yok' }), []);
    assert.deepEqual(gorevIlerlet(db, { guildId: G, kullaniciId: A, tur: 'mesaj', miktar: 0 }), []);
    assert.deepEqual(gorevIlerlet(db, { guildId: G, kullaniciId: A, tur: 'mesaj', miktar: -3 }), []);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM gorev_ilerleme').get().n, 0);
  });

  it('veritabanı hatası dışarı sızmaz', () => {
    const db = hazir();
    db.close();
    assert.deepEqual(gorevIlerlet(db, { guildId: G, kullaniciId: A, tur: 'mesaj' }), []);
  });
});

describe('gösterim yardımcıları', () => {
  it('ilerleme çubuğu', () => {
    assert.equal(ilerlemeCubugu(3, 5), '▰▰▰▱▱ 3/5');
    assert.equal(ilerlemeCubugu(0, 10), '▱▱▱▱▱ 0/10');
    assert.equal(ilerlemeCubugu(99, 10), '▰▰▰▰▰ 10/10');
    assert.equal(ilerlemeCubugu(5, 5000), '▱▱▱▱▱ 5/5.000');
  });

  it('ödül metni', () => {
    assert.equal(odulMetni({ muz: 120 }, (n) => `${n} muz`), '120 muz');
    assert.match(odulMetni({ kasa: 'kasa-ahsap' }, String), /Ahşap Kasa/);
  });

  it('kanca olay listeleri', () => {
    const bitti = (net) => ({ bahis: 100, biten: { bahis: 100, net } });
    assert.deepEqual(kumarOlaylari(bitti(50)), [{ tur: 'kumar' }, { tur: 'kumar-kazan' }]);
    assert.deepEqual(kumarOlaylari(bitti(49)), [{ tur: 'kumar' }]); // kâr bahsin yarısından az
    assert.deepEqual(kumarOlaylari(bitti(-50)), [{ tur: 'kumar' }]);
    assert.deepEqual(kumarOlaylari({ bahis: 100 }), [{ tur: 'kumar' }]); // el sürüyor
    assert.deepEqual(kumarOlaylari({ biten: { bahis: 200, net: 100 } }), [{ tur: 'kumar-kazan' }]);
    // 100 muzdan küçük bahis ne oyun ne kâr sayılır.
    assert.deepEqual(kumarOlaylari({ bahis: 99, biten: { bahis: 99, net: 99 } }), []);
    assert.deepEqual(kasaOlaylari([{ yeniKart: true }, { yeniKart: false }]), [
      { tur: 'kasa-ac', miktar: 2 }, { tur: 'kart-yeni', miktar: 1 },
    ]);
  });
});
