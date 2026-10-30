import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { acVeritabani } from '../lib/db.js';
import {
  duyuruGonder, duyuruListesi, duyuruSil, uyeninDuyurulari,
} from '../lib/duyuru.js';
import {
  sahteIstemci, sahteUye, TEST_DIGER, TEST_GUILD, TEST_KULLANICI, testSunucusu,
} from '../web/test-yardimci.js';

const G = 'g1';
const SA = 3_600_000;
const gonder = (db, ek = {}) => duyuruGonder(db, {
  guildId: G, baslik: 'Başlık', metin: 'Mesaj', ikon: 'megafon', gonderenId: '9', sureMs: SA, simdi: 1000, ...ek,
});

describe('duyuru', () => {
  it('herkese gidene herkes, seçiliye yalnız alıcılar; süresi dolunca kimse görmez', () => {
    const db = acVeritabani(':memory:');
    const h = gonder(db).id;
    const s = gonder(db, { alicilar: ['1', '1', '2'] }).id;
    assert.deepEqual(uyeninDuyurulari(db, G, '1', 2000).map((d) => d.id), [h, s]);
    assert.deepEqual(uyeninDuyurulari(db, G, '3', 2000).map((d) => d.id), [h]);
    assert.deepEqual(duyuruListesi(db, G)[0].alicilar, ['1', '2']);
    assert.deepEqual(uyeninDuyurulari(db, G, '1', 1000 + SA), []);
  });

  it('doğrular: başlık, mesaj, ikon, süre, alıcı sınırı', () => {
    const db = acVeritabani(':memory:');
    assert.match(gonder(db, { baslik: ' ' }).sebep, /Başlık/);
    assert.match(gonder(db, { metin: '' }).sebep, /Mesaj/);
    assert.match(gonder(db, { ikon: '🍌' }).sebep, /ikon/);
    assert.match(gonder(db, { sureMs: 60_000 }).sebep, /10 dakika/);
    assert.match(gonder(db, { alicilar: Array.from({ length: 51 }, (_, i) => String(i)) }).sebep, /50/);
    assert.deepEqual(duyuruListesi(db, G), []);
  });

  it('geri çekilen bildirim artık düşmez', () => {
    const db = acVeritabani(':memory:');
    const { id } = gonder(db);
    assert.deepEqual(duyuruSil(db, G, id), { ok: true });
    assert.equal(duyuruSil(db, G, id).ok, false);
    assert.deepEqual(uyeninDuyurulari(db, G, '1', 2000), []);
  });
});

describe('web: bildirim gönder', () => {
  async function sunucuyla(fn) {
    const s = await testSunucusu({ istemci: sahteIstemci([sahteUye(TEST_KULLANICI, 'Test', { yonetici: true }), sahteUye(TEST_DIGER, 'Diger')]) });
    try {
      await fn(s);
    } finally {
      await s.kapat();
    }
  }

  it('yönetici seçili üyeye gönderir; olaylarda yalnız o görür; yönetici olmayan gönderemez', () => sunucuyla(async (s) => {
    const govde = {
      baslik: 'Selam', metin: '**Kalın** mesaj', ikon: 'hediye', sure: '1g', hedef: 'secili', alicilar: [TEST_DIGER],
    };
    assert.equal((await s.digerIstek('POST', '/api/yonetim/duyuru', govde)).durum, 403);
    assert.equal((await s.istek('POST', '/api/yonetim/duyuru', { ...govde, alicilar: [] })).durum, 400);
    const r = await s.istek('POST', '/api/yonetim/duyuru', govde);
    assert.equal(r.durum, 200);

    const diger = (await s.digerIstek('GET', '/api/olaylar')).veri.duyurular;
    assert.deepEqual(diger.map((d) => [d.id, d.baslik, d.ikon, d.gonderen.id]), [[r.veri.id, 'Selam', 'hediye', TEST_KULLANICI]]);
    assert.deepEqual((await s.istek('GET', '/api/olaylar')).veri.duyurular, []);

    const liste = (await s.istek('GET', '/api/yonetim/duyurular')).veri;
    assert.deepEqual(liste.liste[0].alicilar.map((u) => u.id), [TEST_DIGER]);
    assert.ok(liste.ikonlar.includes('megafon'));

    await s.istek('POST', '/api/yonetim/duyuru', { ...govde, hedef: 'herkes', alicilar: undefined });
    assert.equal((await s.istek('GET', '/api/olaylar')).veri.duyurular.length, 1);
    assert.equal((await s.istek('POST', '/api/yonetim/duyuru/sil', { id: r.veri.id })).durum, 200);
    assert.equal((await s.digerIstek('GET', '/api/olaylar')).veri.duyurular.length, 1);
  }));
});
