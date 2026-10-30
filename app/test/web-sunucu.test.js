import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { oturumDeposu } from '../web/oturum.js';
import { yonlendirici } from '../web/sunucu.js';
import { sahteIstemci, testSunucusu } from '../web/test-yardimci.js';

describe('web API çekirdeği', () => {
  it('yönlendirici parametreli yolu eşler', () => {
    const bul = yonlendirici([{ yontem: 'GET', yol: '/api/emoji/:id' }, { yontem: 'POST', yol: '/api/x' }]);
    assert.deepEqual(bul('GET', '/api/emoji/123').params, { id: '123' });
    assert.equal(bul('GET', '/api/x'), null);
    assert.equal(bul('POST', '/api/x').params && true, true);
  });

  it('oturum süresi dolunca geçersiz', () => {
    const d = oturumDeposu({ sureMs: 1000 });
    const t = d.olustur('5', 0);
    assert.equal(d.dogrula(t, 500), '5');
    assert.equal(d.dogrula(t, 1000), null);
    assert.equal(d.dogrula('yok'), null);
  });

  it('oturumsuz istek 401, oturumla 200', async () => {
    const s = await testSunucusu();
    try {
      assert.equal((await s.istek('GET', '/api/ben', undefined, { belirtec: null })).durum, 401);
      const { durum, veri } = await s.istek('GET', '/api/ben');
      assert.equal(durum, 200);
      assert.equal(veri.kullanici.ad, 'Test');
      assert.equal(veri.ekonomiAcik, true);
      assert.equal((await s.istek('GET', '/api/yok')).durum, 404);
    } finally {
      await s.kapat();
    }
  });

  it('katalog sunucunun BTD emojilerini adla verir (öteki emojileri değil)', async () => {
    const istemci = sahteIstemci();
    const emojiler = [
      { id: '111111111111111111', name: 'btd_red', animated: false },
      { id: '222222222222222222', name: 'btd_moab', animated: true },
      { id: '333333333333333333', name: 'kedi', animated: false },
    ];
    istemci.guild.emojis = { cache: { find: (fn) => emojiler.find(fn), values: () => emojiler.values() } };
    const s = await testSunucusu({ istemci });
    try {
      const k = await s.istek('GET', '/api/katalog');
      assert.deepEqual(k.veri.btd, { btd_red: '/api/emoji/111111111111111111', btd_moab: '/api/emoji/222222222222222222?a=1' });
    } finally {
      await s.kapat();
    }
  });

  it('ekonomi kapalıyken alan rotası 403, katalog çalışır', async () => {
    const s = await testSunucusu({ ekonomiAcik: false });
    try {
      const k = await s.istek('GET', '/api/katalog');
      assert.equal(k.durum, 200);
      assert.equal(k.veri.kartlar.length, 126);
      assert.ok(k.veri.esyalar.some((e) => e.kimlik === 'kasa-elmas'));
    } finally {
      await s.kapat();
    }
  });
});
