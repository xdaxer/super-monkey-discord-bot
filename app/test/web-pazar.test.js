import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { bakiye, ekle, TURLER } from '../lib/ekonomi.js';
import { adet, esyaEkle } from '../lib/envanter.js';
import {
  sahteIstemci, sahteUye, TEST_DIGER, TEST_GUILD, TEST_KULLANICI, testSunucusu,
} from '../web/test-yardimci.js';

const KART = 'kart-quincy';

describe('web: topluluk pazarı', () => {
  it('ilan aç, vitrinde gör, başkası alsın, geçmişte görünsün', async () => {
    const istemci = sahteIstemci();
    const dmler = [];
    istemci.users = { fetch: async (id) => ({ send: async (m) => { dmler.push([id, m]); } }) };
    const s = await testSunucusu({ istemci });
    try {
      esyaEkle(s.db, TEST_GUILD, TEST_KULLANICI, KART, 3);
      esyaEkle(s.db, TEST_GUILD, TEST_KULLANICI, `parlak:${KART}`, 1);
      ekle(s.db, { guildId: TEST_GUILD, kullaniciId: TEST_DIGER, miktar: 50_000, tur: TURLER.yonetici });

      const benim = await s.istek('GET', '/api/pazar/benim');
      assert.deepEqual(benim.veri.kartlar.map((k) => k.kimlik).sort(), [KART, `parlak:${KART}`].sort());
      assert.equal((await s.istek('POST', '/api/pazar/ilan', { kimlik: 'kasa-ahsap', fiyat: 5000 })).durum, 404);
      assert.equal((await s.istek('POST', '/api/pazar/ilan', { kimlik: KART, adet: 2, fiyat: 100 })).durum, 400);

      const ilan = await s.istek('POST', '/api/pazar/ilan', { kimlik: KART, adet: 2, fiyat: 8000 });
      assert.equal(ilan.durum, 200);
      assert.equal(adet(s.db, TEST_GUILD, TEST_KULLANICI, KART), 1);

      const vitrin = await s.istek('GET', '/api/pazar');
      assert.deepEqual(vitrin.veri.vitrin.map((v) => [v.kimlik, v.adet, v.enDusuk]), [[KART, 2, 8000]]);
      assert.equal(vitrin.veri.acikIlanim, 1);

      const sayfa = await s.digerIstek('GET', `/api/pazar/kart/${encodeURIComponent(KART)}`);
      assert.equal(sayfa.veri.ilanlar.length, 1);
      assert.equal(sayfa.veri.ilanlar[0].satici.id, TEST_KULLANICI);
      assert.equal(sayfa.veri.ilanlar[0].alinamaz, null);
      const kendi = await s.istek('GET', `/api/pazar/kart/${encodeURIComponent(KART)}`);
      assert.equal(kendi.veri.ilanlar[0].benim, true);
      assert.equal((await s.istek('GET', '/api/pazar/kart/kasa-ahsap')).durum, 404);

      const al = await s.digerIstek('POST', '/api/pazar/al', { id: ilan.veri.ilan.id, adet: 1 });
      assert.equal(al.durum, 200);
      assert.equal(al.veri.toplam, 8000);
      assert.equal(al.veri.bakiye, bakiye(s.db, TEST_GUILD, TEST_DIGER));
      // Satıcıya DM: beklenmeden gönderilir.
      await new Promise((r) => { setTimeout(r, 20); });
      assert.equal(dmler.length, 1);
      assert.equal(dmler[0][0], TEST_KULLANICI);
      assert.match(dmler[0][1].content, /Quincy/);
      assert.match(dmler[0][1].content, /7\.200/);
      assert.ok(bakiye(s.db, TEST_GUILD, TEST_KULLANICI) >= 7200);
      assert.equal((await s.istek('POST', '/api/pazar/al', { id: ilan.veri.ilan.id })).durum, 400, 'kendi ilanı');

      const gecmis = (await s.istek('GET', '/api/pazar/benim')).veri.gecmis;
      assert.deepEqual(gecmis.map((g) => [g.yon, g.tutar, g.karsi.id]), [['satis', 7200, TEST_DIGER]]);
      const alici = (await s.digerIstek('GET', '/api/pazar/benim')).veri.gecmis;
      assert.deepEqual(alici.map((g) => [g.yon, g.tutar]), [['alis', 8000]]);

      const iptal = await s.istek('POST', `/api/pazar/ilan/${ilan.veri.ilan.id}/iptal`);
      assert.equal(iptal.durum, 200);
      assert.equal(iptal.veri.adet, 1);
      assert.equal(adet(s.db, TEST_GUILD, TEST_KULLANICI, KART), 2);
      assert.equal((await s.istek('POST', '/api/pazar/ilan/abc/iptal')).durum, 400);
    } finally {
      await s.kapat();
    }
  });

  it('yönetim: yalnız yönetici; özet, ilanlar, düzenle, kaldır, geri al, ayar ve DM', async () => {
    const istemci = sahteIstemci([sahteUye(TEST_KULLANICI, 'Test', { yonetici: true }), sahteUye(TEST_DIGER, 'Diger')]);
    const dmler = [];
    istemci.users = { fetch: async (id) => ({ send: async (m) => { dmler.push([id, m.content]); } }) };
    const s = await testSunucusu({ istemci });
    try {
      assert.equal((await s.digerIstek('GET', '/api/yonetim/pazar')).durum, 403);
      assert.equal((await s.digerIstek('POST', '/api/yonetim/pazar/ayarlar', { acik: false })).durum, 403);

      esyaEkle(s.db, TEST_GUILD, TEST_DIGER, KART, 5);
      ekle(s.db, { guildId: TEST_GUILD, kullaniciId: TEST_KULLANICI, miktar: 100_000, tur: TURLER.yonetici });
      const a = (await s.digerIstek('POST', '/api/pazar/ilan', { kimlik: KART, adet: 3, fiyat: 7000 })).veri.ilan;
      const b2 = (await s.digerIstek('POST', '/api/pazar/ilan', { kimlik: KART, adet: 2, fiyat: 7000 })).veri.ilan;

      const ilanlar = await s.istek('GET', '/api/yonetim/pazar/ilanlar?durum=acik');
      assert.equal(ilanlar.durum, 200);
      assert.equal(ilanlar.veri.toplam, 2);
      assert.equal(ilanlar.veri.satirlar[0].satici.ad, 'Diger');
      assert.equal((await s.istek('GET', '/api/yonetim/pazar/ilanlar?durum=yok')).durum, 400);

      const duz = await s.istek('POST', `/api/yonetim/pazar/ilan/${a.id}/duzenle`, { fiyat: 6500, adet: 2 });
      assert.equal(duz.durum, 200);
      assert.equal(duz.veri.ilan.fiyat, 6500);
      assert.equal(adet(s.db, TEST_GUILD, TEST_DIGER, KART), 1);

      const kal = await s.istek('POST', `/api/yonetim/pazar/ilan/${b2.id}/kaldir`, { iade: false, sebep: 'deneme' });
      assert.equal(kal.durum, 200);
      assert.equal(kal.veri.iade, false);
      assert.equal(adet(s.db, TEST_GUILD, TEST_DIGER, KART), 1);

      // Test kimlikleri .env'deki yetkili listesinde değil; yönetici burada sıradan üye gibi alır.
      assert.equal((await s.istek('POST', '/api/pazar/al', { id: a.id })).durum, 200);
      const satislar = await s.istek('GET', '/api/yonetim/pazar/satislar?donem=tumu');
      assert.equal(satislar.veri.toplam, 1);
      const geri = await s.istek('POST', `/api/yonetim/pazar/satis/${satislar.veri.satirlar[0].id}/geri-al`, { sebep: 'test' });
      assert.equal(geri.durum, 200);
      assert.equal(geri.veri.toplam, 6500);

      const ayar = await s.istek('POST', '/api/yonetim/pazar/ayarlar', { acik: false, kesintiYuzde: 15 });
      assert.equal(ayar.veri.ayarlar.acik, false);
      assert.equal((await s.istek('POST', '/api/yonetim/pazar/ayarlar', { kesintiYuzde: 99 })).durum, 400);
      assert.equal((await s.digerIstek('GET', '/api/pazar')).veri.acik, false);
      assert.equal((await s.digerIstek('POST', '/api/pazar/ilan', { kimlik: KART, fiyat: 7000 })).durum, 400);

      const ozet = await s.istek('GET', '/api/yonetim/pazar?donem=tumu');
      assert.equal(ozet.durum, 200);
      assert.equal(ozet.veri.geriAlinan, 1);
      assert.deepEqual(ozet.veri.gunluk.map((g) => g.eylem), ['ayar', 'satis-geri', 'ilan-kaldir', 'ilan-duzenle']);
      assert.equal(ozet.veri.gunluk[0].yonetici.id, TEST_KULLANICI);

      await new Promise((r) => { setTimeout(r, 20); });
      const metinler = dmler.map(([, m]) => m).join('\n');
      assert.match(metinler, /düzenlendi/);
      assert.match(metinler, /el konuldu/);
      assert.match(metinler, /geri alındı/);
    } finally {
      await s.kapat();
    }
  });

  it('alım isteği: ver, kartta görün, isteğe hemen sat, DM; yönetici kaldırır', async () => {
    const istemci = sahteIstemci([sahteUye(TEST_KULLANICI, 'Test', { yonetici: true }), sahteUye(TEST_DIGER, 'Diger')]);
    const dmler = [];
    istemci.users = { fetch: async (id) => ({ send: async (m) => { dmler.push([id, m.content]); } }) };
    const s = await testSunucusu({ istemci });
    try {
      ekle(s.db, { guildId: TEST_GUILD, kullaniciId: TEST_KULLANICI, miktar: 100_000, tur: TURLER.yonetici });
      esyaEkle(s.db, TEST_GUILD, TEST_DIGER, KART, 3);
      const r = await s.istek('POST', '/api/pazar/istek', { kimlik: KART, adet: 3, fiyat: 7000 });
      assert.equal(r.durum, 200);
      assert.equal(r.veri.emanet, 21_000);
      const kart = await s.digerIstek('GET', `/api/pazar/kart/${encodeURIComponent(KART)}`);
      assert.deepEqual(kart.veri.istekler, [{ fiyat: 7000, adet: 3, istek: 1 }]);
      assert.equal((await s.digerIstek('GET', '/api/pazar')).veri.vitrin[0].enYuksekIstek, 7000);

      const sat = await s.digerIstek('POST', '/api/pazar/isteklere-sat', { kimlik: KART, adet: 2, enAz: 7000 });
      assert.equal(sat.durum, 200);
      assert.equal(sat.veri.adet, 2);
      assert.equal(sat.veri.net, 12_600);
      assert.equal(adet(s.db, TEST_GUILD, TEST_KULLANICI, KART), 2);
      await new Promise((ok) => { setTimeout(ok, 20); });
      assert.ok(dmler.some(([id, m]) => id === TEST_KULLANICI && /karşılandı/.test(m)));

      const benim = await s.istek('GET', '/api/pazar/benim');
      assert.deepEqual(benim.veri.istekler.map((i) => [i.adet, i.emanet]), [[1, 7000]]);
      const yon = await s.istek('GET', '/api/yonetim/pazar/istekler?durum=acik');
      assert.equal(yon.veri.toplam, 1);
      assert.equal((await s.istek('POST', `/api/yonetim/pazar/istek/${yon.veri.satirlar[0].id}/kaldir`, {})).veri.iade, 7000);
      assert.equal((await s.istek('POST', `/api/pazar/istek/${yon.veri.satirlar[0].id}/iptal`)).durum, 400);
    } finally {
      await s.kapat();
    }
  });
});

