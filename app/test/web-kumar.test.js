import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { baslat as bjBaslat } from '../lib/blackjack.js';
import { bakiye, ekle, TURLER } from '../lib/ekonomi.js';
import { BORC_YASAK } from '../lib/kredi.js';
import { ATLAR } from '../lib/kumar.js';
import { kullaniciOyunu } from '../lib/mines.js';
import { TEST_GUILD, TEST_KULLANICI, testSunucusu } from '../web/test-yardimci.js';

// Bahis beklemesi (3 sn) bellek içi ve Date.now ile ölçülüyor: testlerde saati ileri sarıyoruz.
const gercekSimdi = Date.now;
let kayma = 0;
const ileri = (ms = 4000) => { kayma += ms; };

let s;

before(() => { Date.now = () => gercekSimdi() + kayma; });
after(() => { Date.now = gercekSimdi; });

beforeEach(async () => {
  s = await testSunucusu();
  ekle(s.db, { guildId: TEST_GUILD, kullaniciId: TEST_KULLANICI, miktar: 5000, tur: TURLER.yonetici });
  ileri();
});
afterEach(async () => { await s.kapat(); });

const cuzdan = () => bakiye(s.db, TEST_GUILD, TEST_KULLANICI);
const oyna = (govde) => s.istek('POST', '/api/kumar/oyna', govde);

/** Başarılı bir tek atışlık oyunun ortak denetimleri: net, ödeme ve bakiye tutarlı. */
function tutarli(veri, oncesi, bahis) {
  assert.equal(veri.bahis, bahis);
  assert.equal(veri.net, veri.odeme - bahis);
  assert.equal(veri.bakiye, cuzdan());
  assert.equal(veri.bakiye, oncesi + veri.net + (veri.cashback ?? 0));
  assert.equal(typeof veri.carpan, 'number');
}

describe('GET /api/kumar', () => {
  it('bakiye, tavan ve oyun tanımlarını döner; süren oyun yok', async () => {
    const { durum, veri } = await s.istek('GET', '/api/kumar');
    assert.equal(durum, 200);
    assert.equal(veri.bakiye, 5000);
    assert.equal(veri.tavan, 1000);
    assert.equal(veri.min, 10);
    assert.equal(veri.borclu, false);
    assert.equal(veri.mines, null);
    assert.equal(veri.blackjack, null);
    assert.equal(veri.oyunlar.slot.semboller.length, 7);
    assert.equal(veri.oyunlar.yazitura.carpan, 1.9);
    assert.equal(veri.oyunlar.rulet.cark.length, 37);
    assert.equal(veri.oyunlar.rulet.kirmizilar.length, 18);
    assert.equal(veri.oyunlar.at.atlar.length, 5);
    assert.deepEqual(veri.oyunlar.at.atlar[0], { no: 1, ad: ATLAR[0].ad, sans: 35, carpan: 2.7 });
    assert.equal(veri.oyunlar.mines.tablo[2].length, 6); // 6. karede 9x tavanı
    assert.equal(veri.oyunlar.mines.tablo[4].at(-1), 9);
    assert.equal(veri.oyunlar.mines.maksCarpan, 9);
    assert.equal(veri.oyunlar.mines.tablo[8][0], 8.55);
    assert.equal(veri.oyunlar.blackjack.blackjack, 2.2);
  });

  it('oturumsuz 401', async () => {
    assert.equal((await s.istek('GET', '/api/kumar', undefined, { belirtec: null })).durum, 401);
  });
});

describe('POST /api/kumar/oyna', () => {
  it('slot', async () => {
    const { durum, veri } = await oyna({ oyun: 'slot', bahis: '100' });
    assert.equal(durum, 200);
    assert.equal(veri.sonuc.makaralar.length, 3);
    tutarli(veri, 5000, 100);
  });

  it('yazı-tura', async () => {
    const { durum, veri } = await oyna({ oyun: 'yazitura', bahis: '200', secim: 'tura' });
    assert.equal(durum, 200);
    assert.ok(['yazi', 'tura'].includes(veri.sonuc.sonuc));
    assert.equal(veri.carpan, veri.sonuc.sonuc === 'tura' ? 1.9 : 0);
    tutarli(veri, 5000, 200);
  });

  it('zar', async () => {
    const { durum, veri } = await oyna({ oyun: 'zar', bahis: '100' });
    assert.equal(durum, 200);
    assert.equal(veri.sonuc.oyuncu.length, 2);
    assert.equal(veri.sonuc.kasa.length, 2);
    tutarli(veri, 5000, 100);
  });

  it('rulet: renk ve sayı seçimi', async () => {
    let { durum, veri } = await oyna({ oyun: 'rulet', bahis: '100', secim: 'kirmizi' });
    assert.equal(durum, 200);
    assert.ok(['kirmizi', 'siyah', 'yesil'].includes(veri.sonuc.renk));
    assert.ok(veri.sonuc.sayi >= 0 && veri.sonuc.sayi <= 36);
    tutarli(veri, 5000, 100);

    ileri();
    const once = cuzdan();
    ({ durum, veri } = await oyna({ oyun: 'rulet', bahis: '100', secim: 7 }));
    assert.equal(durum, 200);
    assert.equal(veri.carpan, veri.sonuc.sayi === 7 ? 35 : 0);
    tutarli(veri, once, 100);
  });

  it('at yarışı', async () => {
    const { durum, veri } = await oyna({ oyun: 'at', bahis: '100', at: 2 });
    assert.equal(durum, 200);
    assert.equal(veri.sonuc.secim, 2);
    assert.ok(veri.sonuc.kazanan >= 1 && veri.sonuc.kazanan <= 5);
    assert.equal(veri.carpan, veri.sonuc.kazanan === 2 ? 3.8 : 0);
    tutarli(veri, 5000, 100);
  });

  it('"hepsi" seviye tavanına kırpılır', async () => {
    const { durum, veri } = await oyna({ oyun: 'zar', bahis: 'hepsi' });
    assert.equal(durum, 200);
    assert.equal(veri.bahis, 1000);
  });

  it('geçersiz seçim bekleme süresini yakmaz', async () => {
    assert.equal((await oyna({ oyun: 'yazitura', bahis: '100', secim: 'ayak' })).durum, 400);
    assert.equal((await oyna({ oyun: 'rulet', bahis: '100', secim: 'mor' })).durum, 400);
    assert.equal((await oyna({ oyun: 'at', bahis: '100', at: 6 })).durum, 400);
    assert.equal((await oyna({ oyun: 'at', bahis: '100' })).durum, 400);
    assert.equal((await oyna({ oyun: 'yok', bahis: '100' })).durum, 400);
    assert.equal((await oyna({ oyun: 'slot', bahis: '100' })).durum, 200);
  });

  it('yetersiz bakiye, tavan ve alt sınır reddedilir', async () => {
    assert.equal((await oyna({ oyun: 'slot', bahis: '9999' })).durum, 400);
    assert.equal(cuzdan(), 5000);
    const t = await oyna({ oyun: 'slot', bahis: '1001' });
    assert.equal(t.durum, 400);
    assert.match(t.veri.sebep, /En çok/);
    assert.equal((await oyna({ oyun: 'slot', bahis: '5' })).durum, 400);
    assert.equal((await oyna({ oyun: 'slot', bahis: 'abc' })).durum, 400);

    // Hiç parası olmayan üye
    const d = await s.digerIstek('POST', '/api/kumar/oyna', { oyun: 'slot', bahis: '100' });
    assert.equal(d.durum, 400);
    assert.match(d.veri.sebep, /Bakiyen yetmiyor/);
  });

  it('3 saniye bekleme: ikinci bahis reddedilir, süre geçince geçer', async () => {
    assert.equal((await oyna({ oyun: 'slot', bahis: '100' })).durum, 200);
    const bekleyen = await oyna({ oyun: 'zar', bahis: '100' });
    assert.equal(bekleyen.durum, 429);
    assert.match(bekleyen.veri.sebep, /Biraz yavaş/);
    ileri();
    assert.equal((await oyna({ oyun: 'zar', bahis: '100' })).durum, 200);
  });

  it('borçlu üye oynayamaz', async () => {
    ekle(s.db, { guildId: TEST_GUILD, kullaniciId: '100000000000000002', miktar: 5000, tur: TURLER.yonetici });
    s.db.prepare(
      `INSERT INTO krediler (guild_id, kullanici_id, anapara, faiz_yuzde, faiz, baslangic, vade, durum)
       VALUES (?, '100000000000000002', 1000, 10, 100, 0, 1, 'aktif')`,
    ).run(TEST_GUILD);
    const g = await s.digerIstek('GET', '/api/kumar');
    assert.equal(g.veri.borclu, true);
    for (const [yol, govde] of [
      ['/api/kumar/oyna', { oyun: 'slot', bahis: '100' }],
      ['/api/kumar/mines/baslat', { bahis: '100' }],
      ['/api/kumar/blackjack/baslat', { bahis: '100' }],
    ]) {
      const r = await s.digerIstek('POST', yol, govde);
      assert.equal(r.durum, 403, yol);
      assert.equal(r.veri.sebep, BORC_YASAK);
    }
    assert.equal(bakiye(s.db, TEST_GUILD, '100000000000000002'), 5000);
  });
});

describe('mines', () => {
  const baslat = (govde = { bahis: '100', mayin: 2 }) => s.istek('POST', '/api/kumar/mines/baslat', govde);
  const ac = (hucre) => s.istek('POST', '/api/kumar/mines/ac', { hucre });
  const guvenli = (oyun) => Array.from({ length: 9 }, (_, i) => i).filter((i) => !oyun.mayinlar.includes(i));

  it('sürerken yanıtlarda mayın yeri yok; kare aç, çek', async () => {
    const b = await baslat();
    assert.equal(b.durum, 200);
    assert.equal(b.veri.bakiye, 4900);
    assert.equal(b.veri.oyun.bahis, 100);
    assert.equal(b.veri.oyun.mayin, 2);
    assert.equal(b.veri.oyun.sonraki, 1.22);
    assert.equal(b.veri.eski, null);
    assert.ok(!JSON.stringify(b.veri).includes('mayinlar'));

    const oyun = kullaniciOyunu(s.db, TEST_GUILD, TEST_KULLANICI);
    const [k1, k2] = guvenli(oyun);

    const a = await ac(k1);
    assert.equal(a.durum, 200);
    assert.equal(a.veri.bitti, null);
    assert.deepEqual(a.veri.oyun.acilan, [k1]);
    assert.ok(a.veri.oyun.cekilecek > 100);
    assert.ok(!JSON.stringify(a.veri).includes('mayinlar'));
    assert.ok(!('mayinlar' in a.veri.oyun));

    // Ekran yeniden açılınca süren oyun gelir, yine mayınsız.
    const g = await s.istek('GET', '/api/kumar');
    assert.equal(g.veri.mines.id, b.veri.oyun.id);
    assert.deepEqual(g.veri.mines.acilan, [k1]);
    assert.ok(!JSON.stringify(g.veri).includes('mayinlar'));

    assert.equal((await ac(k1)).durum, 400, 'açık kare');
    await ac(k2);
    const c = await s.istek('POST', '/api/kumar/mines/cek');
    assert.equal(c.durum, 200);
    assert.equal(c.veri.oyun, null);
    assert.equal(c.veri.bitti.tur, 'cekildi');
    assert.equal(c.veri.bitti.carpan, 1.62); // 9/7 × 8/6 × 0,95 = 1,6285 → aşağı yuvarlanır
    assert.deepEqual(c.veri.bitti.mayinlar, oyun.mayinlar);
    assert.equal(c.veri.bakiye, cuzdan());
    assert.equal(c.veri.bakiye, 4900 + c.veri.bitti.odeme + c.veri.bitti.cashback);
    assert.equal(kullaniciOyunu(s.db, TEST_GUILD, TEST_KULLANICI), null);
  });

  it('mayına basınca biter; mayınlar ve patlayan kare döner', async () => {
    await baslat({ bahis: '100', mayin: 3 });
    const oyun = kullaniciOyunu(s.db, TEST_GUILD, TEST_KULLANICI);
    const patlayan = oyun.mayinlar[0];
    const a = await ac(patlayan);
    assert.equal(a.durum, 200);
    assert.equal(a.veri.bitti.tur, 'patladi');
    assert.equal(a.veri.bitti.patlayan, patlayan);
    assert.deepEqual(a.veri.bitti.mayinlar, oyun.mayinlar);
    assert.equal(a.veri.bitti.net, -100);
    assert.equal(a.veri.bakiye, 4900);
    assert.equal(kullaniciOyunu(s.db, TEST_GUILD, TEST_KULLANICI), null);
    assert.equal((await ac(0)).durum, 400, 'oyun bitti');
  });

  it('hiç kare açmadan çekilmez; süren oyun varken yenisi açılmaz (bekleme yok)', async () => {
    assert.equal((await baslat()).durum, 200);
    assert.equal((await s.istek('POST', '/api/kumar/mines/cek')).durum, 400);
    ileri();
    const ikinci = await baslat();
    assert.equal(ikinci.durum, 400);
    assert.match(ikinci.veri.sebep, /Süren bir mines/);
  });

  it('zaman aşımına uğramış eski oyun bilgisiyle çekilir ve yenisi açılır', async () => {
    await baslat();
    const oyun = kullaniciOyunu(s.db, TEST_GUILD, TEST_KULLANICI);
    ileri(6 * 60_000);
    const yeni = await baslat({ bahis: '100', mayin: 1 });
    assert.equal(yeni.durum, 200);
    assert.equal(yeni.veri.eski.tur, 'iade');
    assert.equal(yeni.veri.eski.bahis, oyun.bahis);
    assert.equal(yeni.veri.bakiye, 4900);
  });

  it('bekleme, doğrulama ve yetersiz bakiye', async () => {
    assert.equal((await baslat({ bahis: '100', mayin: 9 })).durum, 400);
    assert.equal((await baslat({ bahis: '99999', mayin: 2 })).durum, 400);
    assert.equal((await baslat()).durum, 200);
    const bekleyen = await baslat();
    assert.equal(bekleyen.durum, 429);
    assert.equal((await s.istek('POST', '/api/kumar/mines/ac', { hucre: 9 })).durum, 400);
    assert.equal((await s.digerIstek('POST', '/api/kumar/mines/ac', { hucre: 1 })).durum, 400, 'oyunu olmayan');
  });
});

describe('blackjack', () => {
  const baslat = (bahis = '100') => s.istek('POST', '/api/kumar/blackjack/baslat', { bahis });
  const hamle = (tur) => s.istek('POST', '/api/kumar/blackjack/hamle', { tur });
  // 5♠ 6♠ (oyuncu) 7♥ 8♥ (kurpiyer), ardından çekilecek kartlar.
  const elAc = (deste, bahis = 100) => {
    const r = bjBaslat(s.db, { guildId: TEST_GUILD, kullaniciId: TEST_KULLANICI, bahis, deste });
    assert.ok(r.ok);
    return r.el;
  };

  it('API ile el açılır; bitmediyse dur ile kapanır', async () => {
    const b = await baslat();
    assert.equal(b.durum, 200);
    assert.equal(b.veri.el.bahis, 100);
    assert.equal(b.veri.el.oyuncu.length >= 2, true);
    assert.ok(!('deste' in b.veri.el));
    if (b.veri.el.bitti) {
      assert.equal(b.veri.el.kurpiyer.length >= 2, true);
      assert.equal(b.veri.bakiye, cuzdan());
      return;
    }
    assert.equal(b.veri.el.kurpiyer.length, 1);
    assert.equal(b.veri.el.kapaliKart, true);
    const d = await hamle('dur');
    assert.equal(d.durum, 200);
    assert.equal(d.veri.el.bitti, true);
    assert.ok(d.veri.el.kurpiyer.length >= 2);
    assert.equal(d.veri.el.net, d.veri.el.odeme - 100);
    assert.equal(d.veri.bakiye, cuzdan());
  });

  it('sürerken deste ve kapalı kart yanıtta yok (GET ve hamle)', async () => {
    elAc(['5♠', '6♠', '7♥', '8♥', '2♣', '3♣', '4♦', '5♦']);
    const g = await s.istek('GET', '/api/kumar');
    assert.deepEqual(g.veri.blackjack.oyuncu, ['5♠', '6♠']);
    assert.deepEqual(g.veri.blackjack.kurpiyer, ['7♥']);
    assert.equal(g.veri.blackjack.kapaliKart, true);
    assert.equal(g.veri.blackjack.kurpiyerDeger, null);
    assert.equal(g.veri.blackjack.katlayabilir, true);
    const ham = JSON.stringify(g.veri);
    assert.ok(!ham.includes('deste'));
    assert.ok(!ham.includes('8♥'), 'kurpiyerin ikinci kartı sızdı');
    assert.ok(!ham.includes('2♣'), 'destedeki kart sızdı');

    const c = await hamle('cek');
    assert.equal(c.durum, 200);
    assert.deepEqual(c.veri.el.oyuncu, ['5♠', '6♠', '2♣']);
    assert.equal(c.veri.el.bitti, false);
    assert.equal(c.veri.el.katlayabilir, false);
    assert.ok(!JSON.stringify(c.veri).includes('8♥'));
    assert.ok(!JSON.stringify(c.veri).includes('3♣'));

    const d = await hamle('dur'); // kurpiyer 15 + 3♣ = 18, oyuncu 13
    assert.equal(d.veri.el.sonuc, 'kaybetti');
    assert.deepEqual(d.veri.el.kurpiyer, ['7♥', '8♥', '3♣']);
    assert.equal(d.veri.el.net, -100);
    assert.equal(d.veri.bakiye, 4900);
    assert.equal((await hamle('dur')).durum, 400, 'el bitti');
  });

  it('ikiye katla bahsi iki katına çıkarır', async () => {
    elAc(['5♠', '6♠', '7♥', '8♥', '10♣', '2♦', '3♦']);
    const k = await hamle('katla'); // oyuncu 21, kurpiyer 15+2 = 17
    assert.equal(k.durum, 200);
    assert.equal(k.veri.el.bitti, true);
    assert.equal(k.veri.el.bahis, 200);
    assert.equal(k.veri.el.sonuc, 'kazandi');
    assert.equal(k.veri.el.net, 200);
    assert.equal(k.veri.bakiye, 5200);
  });

  it('böl: iki el döner, kapalı kart sızmaz, eller ayrı ödenir', async () => {
    elAc(['8♠', '8♥', '10♦', '7♣', '3♠', '10♥', '10♣']);
    const g = await s.istek('GET', '/api/kumar');
    assert.equal(g.veri.blackjack.bolebilir, true);
    const b = await hamle('bol');
    assert.equal(b.durum, 200);
    assert.equal(b.veri.el.bolundu, true);
    assert.equal(b.veri.el.bolebilir, false);
    assert.deepEqual(b.veri.el.eller.map((e) => [e.kartlar, e.oynaniyor]), [[['8♠', '3♠'], true], [['8♥', '10♥'], false]]);
    assert.equal(b.veri.el.katlayabilir, true);
    assert.equal(b.veri.bakiye, 4800);
    assert.ok(!JSON.stringify(b.veri).includes('7♣'), 'kurpiyerin kapalı kartı sızdı');
    await hamle('cek'); // 21 → 2. el
    const d = await hamle('dur');
    assert.equal(d.veri.el.bitti, true);
    assert.deepEqual(d.veri.el.eller.map((e) => [e.sonuc, e.odeme]), [['kazandi', 200], ['kazandi', 200]]);
    assert.equal(d.veri.el.net, 200);
    assert.equal(d.veri.bakiye, 5200);
  });

  it('süren el varken yeni el reddedilir ama el döner', async () => {
    elAc(['5♠', '6♠', '7♥', '8♥', '2♣', '3♣']);
    ileri();
    const r = await baslat();
    assert.equal(r.durum, 200);
    assert.equal(r.veri.zatenAcik, true);
    assert.match(r.veri.sebep, /süren/);
    assert.deepEqual(r.veri.el.oyuncu, ['5♠', '6♠']);
    assert.ok(!JSON.stringify(r.veri).includes('8♥'));
    assert.equal(cuzdan(), 4900, 'ikinci bahis düşülmedi');
  });

  it('zaman aşımlı el kapatılır, yenisi açılır', async () => {
    elAc(['5♠', '6♠', '7♥', '8♥', '2♣', '3♣']);
    ileri(6 * 60_000);
    const r = await baslat();
    assert.equal(r.durum, 200);
    assert.ok(!r.veri.zatenAcik);
    assert.equal(r.veri.eski.bitti, true);
    assert.equal(r.veri.eski.kurpiyer.length >= 2, true);
  });

  it('bekleme, geçersiz hamle ve yetersiz bakiye', async () => {
    assert.equal((await hamle('cek')).durum, 400, 'el yok');
    assert.equal((await hamle('bölün')).durum, 400);
    assert.equal((await baslat('999999')).durum, 400);
    assert.equal((await baslat('100')).durum, 200);
    assert.equal((await baslat('100')).durum, 429);
  });

  it('katlamaya bakiye yetmezse reddedilir', async () => {
    ekle(s.db, { guildId: TEST_GUILD, kullaniciId: '100000000000000002', miktar: 100, tur: TURLER.yonetici });
    const r = bjBaslat(s.db, { guildId: TEST_GUILD, kullaniciId: '100000000000000002', bahis: 100, deste: ['5♠', '6♠', '7♥', '8♥', '2♣', '3♣'] });
    assert.ok(r.ok);
    const g = await s.digerIstek('GET', '/api/kumar');
    assert.equal(g.veri.blackjack.katlayabilir, false);
    assert.equal((await s.digerIstek('POST', '/api/kumar/blackjack/hamle', { tur: 'katla' })).durum, 400);
  });
});
