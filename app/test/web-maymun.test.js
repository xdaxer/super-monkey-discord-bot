import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ekle, TURLER } from '../lib/ekonomi.js';
import { enerjiYaz } from '../lib/enerji.js';
import { esyaEkle } from '../lib/envanter.js';
import { xpVer } from '../lib/maymun.js';
import { TEST_GUILD, TEST_KULLANICI, testSunucusu } from '../web/test-yardimci.js';

async function sunucuyla(fn) {
  const s = await testSunucusu();
  try {
    await fn(s);
  } finally {
    await s.kapat();
  }
}

const para = (s, miktar) => ekle(s.db, {
  guildId: TEST_GUILD, kullaniciId: TEST_KULLANICI, miktar, tur: TURLER.yonetici,
});

describe('web: /api/maymunlar', () => {
  it('maymunlar yollar, sefer tahmini ve slotla listelenir', () => sunucuyla(async (s) => {
    esyaEkle(s.db, TEST_GUILD, TEST_KULLANICI, 'kart-quincy');
    const { durum, veri } = await s.istek('GET', '/api/maymunlar');
    assert.equal(durum, 200);
    assert.equal(veri.maymunlar.length, 1);
    const m = veri.maymunlar[0];
    assert.deepEqual(m.yollar, [0, 0, 0]);
    assert.equal(m.yolDurumu.length, 3);
    assert.equal(m.yolDurumu[0].engel, 'seviye');
    assert.ok(m.seferTahmini.kisa.muz > 0);
    assert.equal(veri.slot, 1);
    assert.equal(veri.seferTurleri.length, 3);
  }));

  it('yükseltir; seviye yetmezse 400', () => sunucuyla(async (s) => {
    esyaEkle(s.db, TEST_GUILD, TEST_KULLANICI, 'kart-quincy');
    para(s, 10_000);
    const red = await s.istek('POST', '/api/maymun/yukselt', { kimlik: 'kart-quincy', yol: 0 });
    assert.equal(red.durum, 400);
    xpVer(s.db, TEST_GUILD, TEST_KULLANICI, 'kart-quincy', 10);
    const ok = await s.istek('POST', '/api/maymun/yukselt', { kimlik: 'kart-quincy', yol: 0 });
    assert.equal(ok.durum, 200);
    assert.equal(ok.veri.kademe, 1);
    assert.deepEqual(ok.veri.maymunlar[0].yollar, [1, 0, 0]);
    assert.equal(ok.veri.bakiye, 8_500);
    assert.equal((await s.istek('POST', '/api/maymun/yukselt', { kimlik: 'kart-quincy', yol: 9 })).durum, 400);
  }));

  it('sefere gönderir, erken toplanamaz, geri çağrılır', () => sunucuyla(async (s) => {
    esyaEkle(s.db, TEST_GUILD, TEST_KULLANICI, 'kart-quincy');
    const g = await s.istek('POST', '/api/maymun/sefer', { kimlik: 'kart-quincy', sure: 'orta' });
    assert.equal(g.durum, 200);
    assert.equal(g.veri.seferler.length, 1);
    assert.equal(g.veri.maymunlar[0].seferde, 1);
    assert.equal(g.veri.maymunlar[0].serbest, 0);
    assert.equal((await s.istek('POST', '/api/maymun/sefer', { kimlik: 'kart-quincy', sure: 'yok' })).durum, 400);
    assert.equal((await s.istek('POST', '/api/maymun/topla')).durum, 400);
    const geri = await s.istek('POST', '/api/maymun/geri', { id: g.veri.gonderilen.id });
    assert.equal(geri.durum, 200);
    assert.equal(geri.veri.seferler.length, 0);
  }));
});

describe('web: çalışma olayı ve totem', () => {
  it('/api/calis bilgisi olay şansı, totem ve sefer sayısını içerir', () => sunucuyla(async (s) => {
    const { veri } = await s.istek('GET', '/api/calis');
    assert.equal(veri.olaySansi, 0.12);
    assert.equal(veri.bekleyenOlay, null);
    assert.equal(veri.hazirSefer, 0);
    assert.deepEqual([veri.totem.fiyat, veri.totem.kalan], [200, 40]);
    assert.equal(veri.dolumMs * veri.enerjiMaks, 3_600_000);
  }));

  it('bekleyen olay yoksa çözüm 400; totem enerjiyi doldurur', () => sunucuyla(async (s) => {
    assert.equal((await s.istek('POST', '/api/calis/olay', { secim: 'vur' })).durum, 400);
    para(s, 5000);
    enerjiYaz(s.db, TEST_GUILD, TEST_KULLANICI, 5);
    const al = await s.istek('POST', '/api/magaza/al', { kimlik: 'enerji-totemi' });
    assert.equal(al.durum, 200);
    assert.equal(al.veri.enerji, 100);
    const bilgi = await s.istek('GET', '/api/calis');
    assert.equal(Math.floor(bilgi.veri.enerji), 100);
    assert.equal(bilgi.veri.totem.kalan, 39);
    assert.equal(bilgi.veri.totem.fiyat, 200, 'ikinci totem de 200');
  }));
});
