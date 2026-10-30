import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { acVeritabani } from '../lib/db.js';
import { enerjiOku, ENERJI_MAKS } from '../lib/enerji.js';
import {
  GREV_EN_AZ_MS, GREV_SANSI, GREV_SURE_MS, grevBaslat, grevBekleyen, grevBitir, grevOzeti, grevTestYetkisi, grevZari,
} from '../lib/grev.js';
import {
  sahteIstemci, sahteUye, TEST_DIGER, TEST_GUILD, TEST_KULLANICI, testSunucusu,
} from '../web/test-yardimci.js';

const G = 'g1';
const A = '100';
const T0 = Date.parse('2026-01-05T12:00:00+03:00');

describe('grev: kurallar', () => {
  it('ihtimal binde bir: zar eşiğin altında çıkarsa grev olur', () => {
    assert.equal(GREV_SANSI, 0.001);
    assert.equal(grevZari(() => 0.0009), true);
    assert.equal(grevZari(() => 0.001), false);
    assert.equal(grevZari(() => 0.5), false);
  });

  it('kazanınca enerji korunur, kaybedince sıfırlanır', () => {
    const db = acVeritabani(':memory:');
    grevBaslat(db, { guildId: G, kullaniciId: A, simdi: T0 });
    const k = grevBitir(db, {
      guildId: G, kullaniciId: A, kazandi: true, simdi: T0 + GREV_EN_AZ_MS,
    });
    assert.deepEqual(k, { ok: true, kazandi: true });
    assert.equal(enerjiOku(db, G, A, T0), ENERJI_MAKS);

    grevBaslat(db, { guildId: G, kullaniciId: A, simdi: T0 });
    const y = grevBitir(db, {
      guildId: G, kullaniciId: A, kazandi: false, simdi: T0 + 20_000,
    });
    assert.deepEqual(y, { ok: true, kazandi: false });
    assert.equal(enerjiOku(db, G, A, T0 + 20_000), 0);
  });

  it('çok erken gelen "kazandım" geçersiz, enerji gider', () => {
    const db = acVeritabani(':memory:');
    grevBaslat(db, { guildId: G, kullaniciId: A, simdi: T0 });
    const s = grevBitir(db, {
      guildId: G, kullaniciId: A, kazandi: true, simdi: T0 + 500,
    });
    assert.equal(s.kazandi, false);
    assert.equal(enerjiOku(db, G, A, T0 + 500), 0);
  });

  it('grev yokken sonuç bildirilemez; sonuç bir kez sayılır', () => {
    const db = acVeritabani(':memory:');
    assert.equal(grevBitir(db, { guildId: G, kullaniciId: A, kazandi: true }).ok, false);
    grevBaslat(db, { guildId: G, kullaniciId: A, simdi: T0 });
    grevBitir(db, {
      guildId: G, kullaniciId: A, kazandi: true, simdi: T0 + GREV_EN_AZ_MS,
    });
    assert.equal(grevBitir(db, { guildId: G, kullaniciId: A, kazandi: false }).ok, false);
  });

  it('süre dolunca oyun kaçıran kayıp sayılır', () => {
    const db = acVeritabani(':memory:');
    grevBaslat(db, { guildId: G, kullaniciId: A, simdi: T0 });
    assert.deepEqual(grevBekleyen(db, G, A, T0 + 1000), { bitis: T0 + GREV_SURE_MS });
    assert.equal(grevBekleyen(db, G, A, T0 + GREV_SURE_MS + 1), null);
    assert.equal(enerjiOku(db, G, A, T0 + GREV_SURE_MS + 1), 0);
  });

  it('özet: gerçek grevleri sayar, testi ayrı tutar, sonuçları ayırır', () => {
    const db = acVeritabani(':memory:');
    const B = '200';
    grevBaslat(db, { guildId: G, kullaniciId: A, simdi: T0 });
    grevBitir(db, {
      guildId: G, kullaniciId: A, kazandi: true, vurulan: 14, simdi: T0 + GREV_EN_AZ_MS,
    });
    grevBaslat(db, { guildId: G, kullaniciId: A, simdi: T0 + 1000 });
    grevBitir(db, {
      guildId: G, kullaniciId: A, kazandi: false, vurulan: 3, simdi: T0 + 9000,
    });
    grevBaslat(db, { guildId: G, kullaniciId: B, simdi: T0 + 2000 });
    grevBekleyen(db, G, B, T0 + 2000 + GREV_SURE_MS + 1);
    grevBaslat(db, {
      guildId: G, kullaniciId: B, test: true, simdi: T0 + 3000,
    });

    const o = grevOzeti(db, G);
    assert.equal(o.toplam, 3);
    assert.equal(o.kisi, 2);
    assert.equal(o.kazanan, 1);
    assert.equal(o.kaybeden, 2);
    assert.equal(o.yarim, 0);
    assert.equal(o.test, 1);
    assert.equal(o.kayitlar.length, 4);
    assert.deepEqual(o.kayitlar[0], {
      kullaniciId: B, baslangic: T0 + 3000, sonuc: null, vurulan: null, test: true,
    });
    assert.equal(o.kayitlar.find((k) => k.sonuc === 'kazandi').vurulan, 14);
    assert.ok(o.kayitlar.some((k) => k.sonuc === 'sure'));
    assert.equal(grevOzeti(db, 'baska').toplam, 0);
  });

  it('test yetkisi yalnız verilen kimliklerde', () => {
    assert.equal(grevTestYetkisi('1', ['1', '2']), true);
    assert.equal(grevTestYetkisi('3', ['1', '2']), false);
    assert.equal(grevTestYetkisi('3', []), false);
  });
});

describe('grev: web', () => {
  async function sunucuyla(fn) {
    const onceki = process.env.developerUserIDs;
    const s = await testSunucusu();
    try {
      await fn(s);
    } finally {
      await s.kapat();
      if (onceki === undefined) delete process.env.developerUserIDs;
      else process.env.developerUserIDs = onceki;
    }
  }

  it('yetkisiz üyede test yolu yokmuş gibi, yanıtta iz yok', () => sunucuyla(async (s) => {
    delete process.env.developerUserIDs;
    const r = await s.istek('POST', '/api/calis/grev-test');
    assert.equal(r.durum, 404);
    const b = await s.istek('GET', '/api/calis');
    assert.equal('grev' in b.veri, false);
    assert.equal('grevTest' in b.veri, false);
    assert.equal((await s.istek('POST', '/api/calis/grev', { kazandi: true })).durum, 404);
  }));

  it('yetkili tetikler; bekleyen grevde çalışılamaz; kayıp enerjiyi alır', () => sunucuyla(async (s) => {
    process.env.developerUserIDs = TEST_KULLANICI;
    assert.equal((await s.istek('GET', '/api/calis')).veri.grevTest, true);
    const t = await s.istek('POST', '/api/calis/grev-test');
    assert.equal(t.durum, 200);
    assert.ok(t.veri.bilgi.grev.bitis > Date.now());
    assert.equal((await s.istek('POST', '/api/calis')).durum, 400);

    const k = await s.istek('POST', '/api/calis/grev', { kazandi: false });
    assert.equal(k.durum, 200);
    assert.equal(k.veri.kazandi, false);
    assert.ok(k.veri.bilgi.enerji < 0.1);
    assert.equal('grev' in k.veri.bilgi, false);
    assert.ok(enerjiOku(s.db, TEST_GUILD, TEST_KULLANICI) < 0.1);

    const yonetim = await s.istek('GET', '/api/yonetim/grev');
    assert.equal(yonetim.durum, 403); // test üyesi Discord yöneticisi değil
  }));

  it('yönetici panelde grev özetini üye adıyla görür', async () => {
    const s = await testSunucusu({
      istemci: sahteIstemci([sahteUye(TEST_KULLANICI, 'Yonetici', { yonetici: true }), sahteUye(TEST_DIGER, 'Diger')]),
    });
    try {
      grevBaslat(s.db, { guildId: TEST_GUILD, kullaniciId: TEST_DIGER, simdi: T0 });
      grevBitir(s.db, {
        guildId: TEST_GUILD, kullaniciId: TEST_DIGER, kazandi: false, vurulan: 4, simdi: T0 + 5000,
      });
      const { durum, veri } = await s.istek('GET', '/api/yonetim/grev');
      assert.equal(durum, 200);
      assert.equal(veri.toplam, 1);
      assert.equal(veri.kisi, 1);
      assert.equal(veri.kayitlar[0].uye.ad, 'Diger');
      assert.equal(veri.kayitlar[0].sonuc, 'kaybetti');
    } finally {
      await s.kapat();
    }
  });
});
