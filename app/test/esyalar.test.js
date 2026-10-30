import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { acVeritabani } from '../lib/db.js';
import {
  bakiye, ekle, gunlukAl, mesajOdulu, SERI_KORUYUCU, TURLER,
} from '../lib/ekonomi.js';
import {
  adet, esyaDus, esyaEkle, etkiAktifMi, etkiBitisi, etkiUzat, etkinEtkiler,
} from '../lib/envanter.js';
import {
  ESYALAR, esyaEmoji, esyaGetir, esyaSatinAl, RENK_DEGISIM, RENK_FIYAT,
  renkAyristir, renkMetni, renkSatinAl, rozetler, satilikEsyalar,
} from '../lib/esyalar.js';

const G = 'g1';
const A = '100';
const SAAT = 3_600_000;
const GUN = 24 * SAAT;

function hazir(para = 1_000_000) {
  const db = acVeritabani(':memory:');
  ekle(db, { guildId: G, kullaniciId: A, miktar: para, tur: TURLER.yonetici, simdi: 0 });
  return db;
}

const tr = (metin) => Date.parse(`${metin}+03:00`);

describe('katalog', () => {
  it('kimlikler tekil, satılık olanların fiyatı pozitif tam sayı', () => {
    const kimlikler = ESYALAR.map((e) => e.kimlik);
    assert.equal(new Set(kimlikler).size, kimlikler.length);
    for (const e of satilikEsyalar()) assert.ok(Number.isSafeInteger(e.fiyat) && e.fiyat > 0, e.kimlik);
  });

  it('belgedeki fiyatlar', () => {
    const fiyat = (k) => esyaGetir(k)?.fiyat;
    assert.equal(fiyat('xp-iksiri'), 6000);
    assert.equal(fiyat('muz-ciftligi'), 2500);
    assert.equal(fiyat(SERI_KORUYUCU), 3000);
    assert.equal(fiyat('gizemli-kutu'), undefined);
    assert.equal(fiyat('rozet-kirmizi'), 1000);
    assert.equal(fiyat('rozet-bad'), 2_500_000);
    assert.equal(fiyat('rozet-altin'), null);
    assert.equal(RENK_FIYAT, 25_000);
    assert.equal(RENK_DEGISIM, 2_500);
  });

  it('emoji: sunucuda varsa o, yoksa yedek', () => {
    const iksir = esyaGetir('xp-iksiri');
    assert.equal(esyaEmoji(iksir, (ad) => (ad === 'btd_alchemist' ? '<:btd_alchemist:1>' : null)), '<:btd_alchemist:1>');
    assert.equal(esyaEmoji(iksir), '🧪');
  });
});

describe('envanter ve etkiler', () => {
  it('eşya ekleme/düşme eksiye inmiyor', () => {
    const db = hazir();
    assert.equal(esyaEkle(db, G, A, 'x', 2), 2);
    assert.equal(esyaDus(db, G, A, 'x', 3), false);
    assert.equal(esyaDus(db, G, A, 'x', 2), true);
    assert.equal(adet(db, G, A, 'x'), 0);
  });

  it('etki uzatılıyor ve süresi geçince etkisiz', () => {
    const db = hazir();
    assert.equal(etkiUzat(db, G, A, 'xp-iksiri', GUN, 1000), 1000 + GUN);
    assert.equal(etkiUzat(db, G, A, 'xp-iksiri', GUN, 2000), 1000 + 2 * GUN);
    assert.equal(etkiAktifMi(db, G, A, 'xp-iksiri', 1000 + 2 * GUN - 1), true);
    assert.equal(etkiAktifMi(db, G, A, 'xp-iksiri', 1000 + 2 * GUN), false);
    // Süresi geçmiş etkiye uzatma şimdiden sayılır.
    assert.equal(etkiUzat(db, G, A, 'xp-iksiri', SAAT, 10 * GUN), 10 * GUN + SAAT);
    assert.deepEqual(Object.keys(etkinEtkiler(db, G, A, 10 * GUN)), ['xp-iksiri']);
  });
});

describe('satın alma', () => {
  it('takviye etkinleşiyor, en çok 7 gün birikiyor', () => {
    const db = hazir();
    const ilk = esyaSatinAl(db, { guildId: G, kullaniciId: A, kimlik: 'xp-iksiri', simdi: 0 });
    assert.equal(ilk.ok, true);
    assert.equal(ilk.sonuc.bitis, GUN);
    assert.equal(bakiye(db, G, A), 1_000_000 - 6000);
    for (let i = 0; i < 6; i += 1) assert.equal(esyaSatinAl(db, { guildId: G, kullaniciId: A, kimlik: 'xp-iksiri', simdi: 0 }).ok, true);
    const fazla = esyaSatinAl(db, { guildId: G, kullaniciId: A, kimlik: 'xp-iksiri', simdi: 0 });
    assert.equal(fazla.ok, false);
    assert.equal(etkiBitisi(db, G, A, 'xp-iksiri', 0), 7 * GUN);
    assert.equal(bakiye(db, G, A), 1_000_000 - 7 * 6000);
  });

  it('rozet bir kez alınıyor; koleksiyon katalog sırasında', () => {
    const db = hazir();
    assert.equal(esyaSatinAl(db, { guildId: G, kullaniciId: A, kimlik: 'rozet-mavi' }).ok, true);
    assert.equal(esyaSatinAl(db, { guildId: G, kullaniciId: A, kimlik: 'rozet-mavi' }).ok, false);
    assert.equal(esyaSatinAl(db, { guildId: G, kullaniciId: A, kimlik: 'rozet-kirmizi' }).ok, true);
    assert.deepEqual(rozetler(db, G, A).map((r) => r.kimlik), ['rozet-kirmizi', 'rozet-mavi']);
  });

  it('Altın Balon satılmıyor', () => {
    const db = hazir();
    assert.equal(esyaSatinAl(db, { guildId: G, kullaniciId: A, kimlik: 'rozet-altin' }).ok, false);
    assert.equal(esyaSatinAl(db, { guildId: G, kullaniciId: A, kimlik: 'yok-boyle' }).ok, false);
  });

  it('seri koruyucu en çok 3 tane', () => {
    const db = hazir();
    for (let i = 0; i < 3; i += 1) assert.equal(esyaSatinAl(db, { guildId: G, kullaniciId: A, kimlik: SERI_KORUYUCU }).ok, true);
    assert.equal(esyaSatinAl(db, { guildId: G, kullaniciId: A, kimlik: SERI_KORUYUCU }).ok, false);
    assert.equal(adet(db, G, A, SERI_KORUYUCU), 3);
  });

  it('bakiye yetmezse hiçbir şey verilmiyor', () => {
    const db = hazir(100);
    assert.equal(esyaSatinAl(db, { guildId: G, kullaniciId: A, kimlik: 'rozet-kirmizi' }).ok, false);
    assert.equal(rozetler(db, G, A).length, 0);
    assert.equal(bakiye(db, G, A), 100);
  });
});

describe('takviyelerin etkisi', () => {
  it('seri koruyucu kaçırılan günü kapatıyor', () => {
    const db = hazir();
    const al = (gun) => gunlukAl(db, { guildId: G, kullaniciId: A, simdi: tr(`${gun}T12:00:00`), rastgele: () => 0 });
    al('2026-10-01');
    al('2026-10-02');
    esyaEkle(db, G, A, SERI_KORUYUCU, 2);

    const korundu = al('2026-10-04');
    assert.equal(korundu.seri, 3);
    assert.equal(korundu.korunan, 1);
    assert.equal(adet(db, G, A, SERI_KORUYUCU), 1);

    // İki gün kaçırıldı ama tek koruyucu var: seri sıfırlanır, koruyucu harcanmaz.
    const sifir = al('2026-10-07');
    assert.equal(sifir.seri, 1);
    assert.equal(sifir.korunan, 0);
    assert.equal(adet(db, G, A, SERI_KORUYUCU), 1);
  });

  it('ilk günlükte koruyucu harcanmıyor', () => {
    const db = hazir();
    esyaEkle(db, G, A, SERI_KORUYUCU, 1);
    assert.equal(gunlukAl(db, { guildId: G, kullaniciId: A }).korunan, 0);
    assert.equal(adet(db, G, A, SERI_KORUYUCU), 1);
  });

  it('sohbet ödülü çarpanı', () => {
    const db = hazir(1);
    assert.equal(mesajOdulu(db, { guildId: G, kullaniciId: A, simdi: 1, rastgele: () => 0.9999, carpan: 3 }), 12);
  });
});

describe('özel renk rolü', () => {
  it('renk ayrıştırma', () => {
    assert.equal(renkAyristir('#ff8800'), 0xff8800);
    assert.equal(renkAyristir('3FA'), 0x33ffaa);
    assert.equal(renkAyristir('#000000'), null);
    assert.equal(renkAyristir('mavi'), null);
    assert.equal(renkMetni(0x00ff00), '#00ff00');
  });

  const discord = () => {
    const roller = new Map();
    let sayac = 0;
    return {
      roller,
      rolBul: async (id) => roller.get(id) ?? null,
      rolOlustur: async (renk) => {
        sayac += 1;
        const rol = { id: `r${sayac}`, renk };
        roller.set(rol.id, rol);
        return rol;
      },
      rolRenkle: async (rol, renk) => { rol.renk = renk; },
    };
  };

  it('ilk alım 25.000, renk değişimi 2.500; silinen rol yeniden açılıyor', async () => {
    const db = hazir();
    const d = discord();
    const ilk = await renkSatinAl(db, { guildId: G, kullaniciId: A, renk: 0xff0000, ...d });
    assert.deepEqual([ilk.ok, ilk.yeni, ilk.fiyat], [true, true, RENK_FIYAT]);

    assert.equal((await renkSatinAl(db, { guildId: G, kullaniciId: A, renk: 0xff0000, ...d })).ok, false);

    const degisim = await renkSatinAl(db, { guildId: G, kullaniciId: A, renk: 0x00ff00, ...d });
    assert.deepEqual([degisim.yeni, degisim.fiyat, degisim.rolId], [false, RENK_DEGISIM, 'r1']);
    assert.equal(d.roller.get('r1').renk, 0x00ff00);

    d.roller.clear();
    const yeniden = await renkSatinAl(db, { guildId: G, kullaniciId: A, renk: 0x0000ff, ...d });
    assert.deepEqual([yeniden.yeni, yeniden.fiyat, yeniden.rolId], [true, RENK_FIYAT, 'r2']);
    assert.equal(bakiye(db, G, A), 1_000_000 - 2 * RENK_FIYAT - RENK_DEGISIM);
  });

  it('Discord hata verirse muz iade ediliyor', async () => {
    const db = hazir();
    const sonuc = await renkSatinAl(db, {
      guildId: G, kullaniciId: A, renk: 0xff0000,
      rolBul: async () => null, rolOlustur: async () => { throw new Error('Missing Permissions'); }, rolRenkle: async () => {},
    });
    assert.equal(sonuc.ok, false);
    assert.equal(bakiye(db, G, A), 1_000_000);
  });
});
