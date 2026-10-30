import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ARSALAR, TABAN_HIZ } from '../lib/ciftlik.js';
import { ekle, TURLER } from '../lib/ekonomi.js';
import { TEST_GUILD, TEST_KULLANICI, testSunucusu } from '../web/test-yardimci.js';

async function sunucuyla(fn) {
  const s = await testSunucusu();
  try {
    await fn(s);
  } finally {
    await s.kapat();
  }
}

const seviyeVer = (s, seviye) => s.db
  .prepare('INSERT OR REPLACE INTO seviyeler (guild_id, kullanici_id, xp, seviye) VALUES (?, ?, 1, ?)')
  .run(TEST_GUILD, TEST_KULLANICI, seviye);

describe('web: /api/ciftlik', () => {

  it('Sv 5 altında kilitli; POST reddedilir', () => sunucuyla(async (s) => {
    seviyeVer(s, 3);
    const { durum, veri } = await s.istek('GET', '/api/ciftlik');
    assert.equal(durum, 200);
    assert.equal(veri.kilitli, true);
    assert.equal(veri.kilitSeviyesi, 5);
    assert.equal(veri.arsalar.length, ARSALAR.length + 1);
    assert.equal(veri.taban.hiz, TABAN_HIZ);
    assert.equal((await s.istek('POST', '/api/ciftlik/kur', { arsa: 0 })).durum, 400);
  }));

  it('kurar, toplar, yükseltir; durum her yanıtta güncel', () => sunucuyla(async (s) => {
    seviyeVer(s, 5);
    ekle(s.db, {
      guildId: TEST_GUILD, kullaniciId: TEST_KULLANICI, miktar: 50_000, tur: TURLER.yonetici,
    });
    const kur = await s.istek('POST', '/api/ciftlik/kur', { arsa: 0 });
    assert.equal(kur.durum, 200);
    assert.deepEqual(kur.veri.durum.arsalar[0].ciftlik.yollar, [0, 0, 0]);
    // Hemen toplanacak muz yok.
    assert.equal((await s.istek('POST', '/api/ciftlik/topla', {})).durum, 400);
    assert.equal((await s.istek('POST', '/api/ciftlik/yukselt', { arsa: 0 })).durum, 400, 'yol eksik');
    const yuk = await s.istek('POST', '/api/ciftlik/yukselt', { arsa: 0, yol: 1 });
    assert.equal(yuk.durum, 200);
    assert.deepEqual(yuk.veri.durum.arsalar[0].ciftlik.yollar, [0, 1, 0]);
    assert.equal(yuk.veri.durum.arsalar[0].ciftlik.depoSaat, 24);
    const sat = await s.istek('POST', '/api/ciftlik/sat', { arsa: 0 });
    assert.equal(sat.durum, 200);
    assert.equal(sat.veri.sonuc.iade, Math.floor((ARSALAR[0].bedel + 1_200) * 0.7));
    assert.equal(sat.veri.durum.arsalar[0].ciftlik, null);
    assert.equal((await s.istek('POST', '/api/ciftlik/kur', { arsa: 1 })).durum, 400, 'Sv 8 arsası');
    assert.equal((await s.istek('POST', '/api/ciftlik/kur', { arsa: 'x' })).durum, 400);
  }));
});
