import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { acVeritabani } from '../lib/db.js';
import { bakiye } from '../lib/ekonomi.js';
import { uzaklastir } from '../lib/ekonomi-uzak.js';
import { kategoriBul } from '../lib/ekonomi-panel.js';
import {
  kodNormallestir, promoBitir, promoKullan, promoListesi, promoOlustur,
} from '../lib/promo.js';
import {
  sahteIstemci, sahteUye, TEST_DIGER, TEST_GUILD, TEST_KULLANICI, testSunucusu,
} from '../web/test-yardimci.js';

const G = 'g1';
const SA = 3_600_000;
const T = 1_000_000;
const olustur = (db, ek = {}) => promoOlustur(db, {
  guildId: G, kod: 'muz-yayin', odul: 500, sureMs: SA, olusturanId: '9', simdi: T, ...ek,
});
const kullan = (db, k, ek = {}) => promoKullan(db, {
  guildId: G, kullaniciId: k, kod: 'muz-yayin', simdi: T + 1000, ...ek,
});

describe('promo kodu', () => {
  it('normalleştirir: boşluk, küçük harf ve Türkçe harfler', () => {
    assert.equal(kodNormallestir(' muz yayın '), 'MUZYAYIN');
    assert.equal(kodNormallestir('şeker-iğde'), 'SEKER-IGDE');
  });

  it('her üye bir kez kullanır; ödül promo türüyle deftere yazılır', () => {
    const db = acVeritabani(':memory:');
    assert.equal(olustur(db).kod, 'MUZ-YAYIN');
    const r = kullan(db, '1');
    assert.deepEqual([r.ok, r.kod, r.odul, r.bakiye], [true, 'MUZ-YAYIN', 500, 500]);
    assert.match(kullan(db, '1').sebep, /zaten kullandın/);
    assert.equal(kullan(db, '2', { kod: 'Muz-Yayin' }).ok, true);
    assert.equal(bakiye(db, G, '1'), 500);
    const satir = db.prepare("SELECT tur, karsi_id FROM ekonomi_hareketleri WHERE kullanici_id = '1'").get();
    assert.equal(satir.tur, 'promo');
    assert.equal(kategoriBul('promo', 'diger'), 'promo');
    assert.equal(promoListesi(db, G)[0].kullanim, 2);
  });

  it('süresi dolan, sınırı dolan, bitirilen ve olmayan kod ödül vermez', () => {
    const db = acVeritabani(':memory:');
    olustur(db, { sinir: 1 });
    assert.equal(kullan(db, '1').ok, true);
    assert.match(kullan(db, '2').sebep, /hakkı doldu/);
    assert.match(kullan(db, '3', { simdi: T + SA }).sebep, /süresi doldu/);
    assert.match(kullan(db, '3', { kod: 'YOK-BOYLE' }).sebep, /Böyle bir kod yok/);
    const { id } = olustur(db, { kod: 'IKINCI' });
    assert.deepEqual(promoBitir(db, G, id, T + 500), { ok: true });
    assert.match(kullan(db, '4', { kod: 'ikinci' }).sebep, /süresi doldu/);
    assert.equal(bakiye(db, G, '2'), 0);
  });

  it('oluştururken doğrular; aynı kod ikinci kez açılmaz', () => {
    const db = acVeritabani(':memory:');
    assert.match(olustur(db, { kod: 'ab' }).sebep, /3–24/);
    assert.match(olustur(db, { odul: 0 }).sebep, /Ödül/);
    assert.match(olustur(db, { sinir: 0 }).sebep, /sınırı/);
    assert.match(olustur(db, { sureMs: 60_000 }).sebep, /5 dakika/);
    assert.equal(olustur(db).ok, true);
    assert.match(olustur(db, { kod: 'MUZ-YAYIN' }).sebep, /daha önce/);
  });

  it('ekonomiden uzaklaştırılan üye kullanamaz', () => {
    const db = acVeritabani(':memory:');
    olustur(db);
    uzaklastir(db, {
      guildId: G, kullaniciId: '1', sebep: 'test', yetkiliId: '9', yetkililer: [],
    });
    assert.match(kullan(db, '1').sebep, /uzaklaştırıldığın/);
    assert.equal(bakiye(db, G, '1'), 0);
  });
});

describe('web: promo', () => {
  it('yönetici oluşturur, üye kullanır, liste kullanımı gösterir; üye kod oluşturamaz', async () => {
    const s = await testSunucusu({ istemci: sahteIstemci([sahteUye(TEST_KULLANICI, 'Test', { yonetici: true }), sahteUye(TEST_DIGER, 'Diger')]) });
    try {
      const govde = {
        kod: 'yayin1', odul: 750, sinir: null, sure: '1sa',
      };
      assert.equal((await s.digerIstek('POST', '/api/yonetim/promo', govde)).durum, 403);
      const r = await s.istek('POST', '/api/yonetim/promo', govde);
      assert.equal(r.durum, 200);
      assert.equal(r.veri.kod, 'YAYIN1');
      const k = await s.digerIstek('POST', '/api/promo', { kod: 'yayin1' });
      assert.equal(k.durum, 200);
      assert.deepEqual([k.veri.odul, k.veri.bakiye], [750, 750]);
      assert.equal((await s.digerIstek('POST', '/api/promo', { kod: 'yayin1' })).durum, 400);
      const l = (await s.istek('GET', '/api/yonetim/promo')).veri.liste[0];
      assert.deepEqual([l.kod, l.kullanim, l.sonKullananlar[0].id], ['YAYIN1', 1, TEST_DIGER]);
    } finally {
      await s.kapat();
    }
  });
});
