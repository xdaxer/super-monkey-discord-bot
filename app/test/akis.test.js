import assert from 'node:assert/strict';
import {
  after, afterEach, before, beforeEach, describe, it,
} from 'node:test';

import {
  akisDeposu, BUYUK_CARPAN, duyuruMesaji, duyuruMetni, kasaSonucuDuyurulurMu, kumarOlayi,
} from '../lib/akis.js';
import { ayarYaz } from '../lib/ayarlar.js';
import { ekle, TURLER } from '../lib/ekonomi.js';
import { KARTLAR, parlakKimlik } from '../lib/kasalar.js';
import { kullaniciOyunu } from '../lib/mines.js';
import { acVeritabani } from '../lib/db.js';
import { akisYayinci } from '../web/akis.js';
import {
  TEST_DIGER, TEST_GUILD, TEST_KULLANICI, testSunucusu,
} from '../web/test-yardimci.js';

// Kumar beklemesi (3 sn) bellek içi ve Date.now ile ölçülüyor: saati ileri sarıyoruz.
const gercekSimdi = Date.now;
let kayma = 0;
const ileri = (ms = 4000) => { kayma += ms; };

const kart = (nadirlik) => KARTLAR.find((k) => k.nadirlik === nadirlik);

describe('kumarOlayi', () => {
  const temel = { oyun: 'slot', bahis: 1000 };

  it('eşiği geçen kazanç ve kayıp duyurulur, arası duyurulmaz', () => {
    assert.equal(kumarOlayi({ ...temel, net: 10_000, carpan: 11 }, 10_000).tur, 'kazanc');
    assert.equal(kumarOlayi({ ...temel, net: -10_000, carpan: 0 }, 10_000).tur, 'kayip');
    assert.equal(kumarOlayi({ ...temel, net: 9_999, carpan: 2 }, 10_000), null);
    assert.equal(kumarOlayi({ ...temel, net: -9_999, carpan: 0 }, 10_000), null);
  });

  it('büyük çarpanda eşiğin onda biri yeter', () => {
    assert.equal(kumarOlayi({ ...temel, net: 1_000, carpan: BUYUK_CARPAN }, 10_000).tur, 'kazanc');
    assert.equal(kumarOlayi({ ...temel, net: 999, carpan: 36 }, 10_000), null);
    assert.equal(kumarOlayi({ ...temel, net: 1_000, carpan: BUYUK_CARPAN - 0.01 }, 10_000), null);
  });
});

describe('kasaSonucuDuyurulurMu', () => {
  it('destansı ve üstü kart, parlak kart ve rozet; gerisi değil', () => {
    assert.ok(kasaSonucuDuyurulurMu({ tur: 'kart', kimlik: kart('efsanevi').kimlik }));
    assert.ok(kasaSonucuDuyurulurMu({ tur: 'kart', kimlik: kart('mitik').kimlik }));
    assert.ok(kasaSonucuDuyurulurMu({ tur: 'kart', kimlik: parlakKimlik(kart('siradan').kimlik), parlak: true }));
    assert.ok(kasaSonucuDuyurulurMu({ tur: 'esya', kimlik: 'rozet-altin' }));
    assert.ok(kasaSonucuDuyurulurMu({ tur: 'kart', kimlik: kart('destansi').kimlik }));
    assert.ok(!kasaSonucuDuyurulurMu({ tur: 'kart', kimlik: kart('nadir').kimlik }));
    assert.ok(!kasaSonucuDuyurulurMu({ tur: 'esya', kimlik: 'xp-iksiri' }));
    assert.ok(!kasaSonucuDuyurulurMu({ tur: 'muz', miktar: 25_000 }));
  });
});

describe('duyuru metni', () => {
  it('kazanç, mines patlaması ve kasa', () => {
    const k = duyuruMetni({
      tur: 'kazanc', oyun: 'mines', net: 18_400, carpan: 7.42,
    }, '42');
    assert.match(k.baslik, /Büyük kazanç · Mines/);
    assert.match(k.aciklama, /<@42> \*\*×7,42\*\* ile \*\*\+18\.400 /);

    const p = duyuruMetni({
      tur: 'kayip', oyun: 'mines', net: -25_000, carpan: 0, acilan: 6,
    }, '42');
    assert.match(p.aciklama, /6 kare açtıktan sonra mayına bastı: \*\*25\.000 /);

    const e = kart('efsanevi');
    const kasa = duyuruMetni({
      tur: 'kasa', kasa: { ad: 'Altın Kasa' }, sonuclar: [{ tur: 'kart', kimlik: e.kimlik, adet: 1, yeniKart: true }],
    }, '42');
    assert.match(kasa.baslik, /Altın Kasa/);
    assert.ok(kasa.aciklama.includes(e.ad));
  });

  it('kimseyi etiketlemez', () => {
    const m = duyuruMesaji({
      tur: 'kayip', oyun: 'slot', net: -20_000, carpan: 0,
    }, { kullaniciId: '42', ad: 'Ali' });
    assert.deepEqual(m.allowedMentions, { parse: [] });
  });
});

describe('akisDeposu', () => {
  it('gecikmeli olay vakti gelene kadar görünmez; en yenisi önce; uzunluk sınırlı', () => {
    const d = akisDeposu({ uzunluk: 3 });
    d.ekle({ ad: 'a', zaman: 100 });
    d.ekle({ ad: 'b', zaman: 200 });
    d.ekle({ ad: 'c', zaman: 5_000 });
    assert.deepEqual(d.liste(1_000).map((o) => o.ad), ['b', 'a']);
    assert.deepEqual(d.liste(5_000).map((o) => o.ad), ['c', 'b', 'a']);
    d.ekle({ ad: 'd', zaman: 300 });
    assert.deepEqual(d.liste(5_000).map((o) => o.ad), ['d', 'c', 'b']);
  });

  it('aynı kişinin kanal duyuruları arasında bekleme var', () => {
    const d = akisDeposu({ kisiBeklemeMs: 1_000 });
    assert.ok(d.kanalaGidebilir('x', 0));
    assert.ok(!d.kanalaGidebilir('x', 999));
    assert.ok(d.kanalaGidebilir('y', 999));
    assert.ok(d.kanalaGidebilir('x', 1_000));
  });
});

describe('akisYayinci.kasa', () => {
  it('her düşen bara girer (en iyisi en üstte); kanala yalnız nadir olan', async () => {
    const gonderilen = [];
    const kanal = { isTextBased: () => true, send: async (m) => { gonderilen.push(m); } };
    const guild = { channels: { cache: new Map([['k', kanal]]) }, members: { cache: new Map() }, emojis: { cache: { find: () => undefined } } };
    const db = acVeritabani(':memory:');
    ayarYaz(db, TEST_GUILD, 'ekonomi.akisKanal', 'k');
    const y = akisYayinci({ db, client: { guilds: { cache: new Map([[TEST_GUILD, guild]]) } }, guildId: TEST_GUILD });

    const e = kart('efsanevi');
    const sonuclar = [{ tur: 'kart', kimlik: e.kimlik, adet: 1 }, { tur: 'muz', miktar: 300 }];
    const ozetler = [{ tur: 'kart', ad: e.ad, nadirlik: 'efsanevi', gorsel: null }, { tur: 'muz', nadirlik: 'siradan', miktar: 300 }];
    assert.ok(y.kasa('42', { kasa: { ad: 'Altın Kasa' }, sonuclar, ozetler }));
    await new Promise((coz) => { setImmediate(coz); });

    const liste = y.liste();
    assert.deepEqual(liste.map((o) => o.oge.tur), ['kart', 'muz']);
    assert.deepEqual(liste.map((o) => o.onemli), [true, false]);
    assert.equal(liste[1].oge.miktar, 300);
    assert.equal(gonderilen.length, 1);

    // Sıradan düşüş: bara girer, kanala gitmez.
    assert.equal(y.kasa('42', { kasa: { ad: 'Ahşap Kasa' }, sonuclar: [sonuclar[1]], ozetler: [ozetler[1]] }), null);
    assert.equal(y.liste().length, 3);
    assert.equal(gonderilen.length, 1);
  });
});

describe('GET /api/akis ve kanal duyurusu', () => {
  let s;
  let gonderilen;

  before(() => { Date.now = () => gercekSimdi() + kayma; });
  after(() => { Date.now = gercekSimdi; });

  beforeEach(async () => {
    ileri();
    s = await testSunucusu();
    gonderilen = [];
    const kanal = { isTextBased: () => true, send: async (m) => { gonderilen.push(m); } };
    s.istemci.guild.channels = { cache: new Map([['k-akis', kanal]]) };
    ayarYaz(s.db, TEST_GUILD, 'ekonomi.akisEsik', 100);
    for (const id of [TEST_KULLANICI, TEST_DIGER]) {
      ekle(s.db, { guildId: TEST_GUILD, kullaniciId: id, miktar: 5000, tur: TURLER.yonetici });
    }
  });
  afterEach(async () => { await s.kapat(); });

  /** Mines başlatıp ilk mayına basar (gecikmesiz olay). */
  async function patlat(istek, kullaniciId) {
    assert.equal((await istek('POST', '/api/kumar/mines/baslat', { bahis: '100', mayin: 3 })).durum, 200);
    const oyun = kullaniciOyunu(s.db, TEST_GUILD, kullaniciId);
    const a = await istek('POST', '/api/kumar/mines/ac', { hucre: oyun.mayinlar[0] });
    assert.equal(a.veri.bitti.tur, 'patladi');
  }

  it('kanal ayarlı değilse yalnız şeride düşer', async () => {
    await patlat(s.istek, TEST_KULLANICI);
    const { veri } = await s.istek('GET', '/api/akis');
    assert.equal(veri.olaylar.length, 1);
    const [o] = veri.olaylar;
    assert.equal(o.tur, 'kayip');
    assert.equal(o.oyun, 'mines');
    assert.equal(o.oyunAd, 'Mines');
    assert.equal(o.net, -100);
    assert.equal(o.acilan, 0);
    assert.equal(o.kullanici.id, TEST_KULLANICI);
    assert.equal(o.kullanici.ad, 'Test');
    assert.ok(!('kullaniciId' in o));
    assert.equal(gonderilen.length, 0);
  });

  it('kanal ayarlıysa duyurur; aynı kişiye bekleme, başkasına yok', async () => {
    ayarYaz(s.db, TEST_GUILD, 'ekonomi.akisKanal', 'k-akis');
    await patlat(s.istek, TEST_KULLANICI);
    await new Promise((coz) => { setImmediate(coz); });
    assert.equal(gonderilen.length, 1);
    assert.match(gonderilen[0].embeds[0].data.title, /Büyük kayıp · Mines/);
    assert.match(gonderilen[0].embeds[0].data.description, new RegExp(`<@${TEST_KULLANICI}>`));

    // Aynı kişi bir dakika dolmadan: şeride düşer, kanala gitmez.
    ileri();
    await patlat(s.istek, TEST_KULLANICI);
    await patlat(s.digerIstek, TEST_DIGER);
    await new Promise((coz) => { setImmediate(coz); });
    assert.equal(gonderilen.length, 2);
    assert.match(gonderilen[1].embeds[0].data.description, new RegExp(`<@${TEST_DIGER}>`));
    assert.equal((await s.istek('GET', '/api/akis')).veri.olaylar.length, 3);
  });
});
