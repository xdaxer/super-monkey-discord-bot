import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  AYNI_TIK_ESIGI, CEZALAR_MS, EN_AZ_CEVAP_MS, SECENEK_ADEDI, SIRA_ALT, SIRA_UST, secenekleriKur, siraEsigi,
  tikAyristir, tikIzle, tikIzleriniSil, yoklamaBaslat, yoklamaBekleyen, yoklamaCevapla, yoklamaDenetle, yoklamaOzeti,
} from '../lib/calis-yoklama.js';
import { acVeritabani } from '../lib/db.js';
import { enerjiYaz } from '../lib/enerji.js';
import { grevBitir } from '../lib/grev.js';
import { MESLEKLER } from '../lib/meslekler.js';
import {
  sahteIstemci, sahteUye, TEST_DIGER, TEST_GUILD, TEST_KULLANICI, testSunucusu,
} from '../web/test-yardimci.js';

const G = 'g1';
const A = '100';
const T0 = Date.parse('2026-01-05T12:00:00+03:00');

/** Çalışmış bir üye (calismalar satırı var). */
function calisanDb() {
  const db = acVeritabani(':memory:');
  enerjiYaz(db, G, A, 100, T0);
  return db;
}

const yanlisSecim = (y) => y.secenekler.find((k) => k !== y.hedef);

beforeEach(() => tikIzleriniSil());

describe('yoklama: tık izi', () => {
  it('gövdeden tık izi okunur; eksik ya da bozuksa null, hata yok', () => {
    assert.deepEqual(tikAyristir({ x: 12, y: 30 }), {
      x: 12, y: 30, klavye: false, guvenli: true,
    });
    assert.deepEqual(tikAyristir({
      x: 0, y: 0, klavye: true, guvenli: false,
    }), {
      x: 0, y: 0, klavye: true, guvenli: false,
    });
    assert.equal(tikAyristir({}), null);
    assert.equal(tikAyristir(undefined), null);
    assert.equal(tikAyristir({ x: 1.5, y: 2 }), null);
    assert.equal(tikAyristir({ x: 'a', y: 2 }), null);
    assert.equal(tikAyristir({ x: 99_999, y: 2 }), null);
  });

  it(`aynı piksele ${AYNI_TIK_ESIGI} kez basılınca "tik" der, iz sıfırlanır`, () => {
    for (let i = 1; i < AYNI_TIK_ESIGI; i += 1) assert.equal(tikIzle(G, A, { x: 40, y: 20, guvenli: true }), null);
    assert.equal(tikIzle(G, A, { x: 40, y: 20, guvenli: true }), 'tik');
    assert.equal(tikIzle(G, A, { x: 40, y: 20, guvenli: true }), null);
  });

  it('bir piksel bile kayan insan eli sayılmaz; hep klavye sayılır', () => {
    for (let i = 0; i < AYNI_TIK_ESIGI * 2; i += 1) {
      assert.equal(tikIzle(G, A, { x: 40 + (i % 2), y: 20, guvenli: true }), null);
    }
    for (let i = 1; i < AYNI_TIK_ESIGI; i += 1) {
      assert.equal(tikIzle(G, '200', {
        x: 0, y: 0, klavye: true, guvenli: true,
      }), null);
    }
    assert.equal(tikIzle(G, '200', {
      x: 0, y: 0, klavye: true, guvenli: true,
    }), 'tik');
  });

  it('betikle verilen tık hemen "sentetik"; iz yoksa hiçbir şey', () => {
    assert.equal(tikIzle(G, A, { x: 3, y: 4, guvenli: false }), 'sentetik');
    assert.equal(tikIzle(G, A, null), null);
  });
});

describe('yoklama: açılış', () => {
  it(`seçenekler ${SECENEK_ADEDI} farklı meslek, hedef içlerinde`, () => {
    for (let i = 0; i < 50; i += 1) {
      const { hedef, secenekler } = secenekleriKur();
      assert.equal(secenekler.length, SECENEK_ADEDI);
      assert.equal(new Set(secenekler).size, SECENEK_ADEDI);
      assert.ok(secenekler.every((k) => MESLEKLER.some((m) => m.kimlik === k)));
      assert.ok(secenekler.includes(hedef));
    }
  });

  it(`sıra eşiği ${SIRA_ALT}–${SIRA_UST}`, () => {
    assert.equal(siraEsigi(() => 0), SIRA_ALT);
    assert.equal(siraEsigi(() => 0.9999), SIRA_UST);
  });

  it('sıra dolunca açılır, sayaç yeniden kurulur', () => {
    const db = calisanDb();
    // İlk eşik SIRA_ALT (rastgele 0): SIRA_ALT − 1 çalışma sessiz geçer.
    for (let i = 1; i < SIRA_ALT; i += 1) {
      assert.equal(yoklamaDenetle(db, {
        guildId: G, kullaniciId: A, simdi: T0 + i, rastgele: () => 0,
      }), null);
    }
    const y = yoklamaDenetle(db, {
      guildId: G, kullaniciId: A, simdi: T0 + SIRA_ALT, rastgele: () => 0,
    });
    assert.equal(y.sebep, 'sira');
    assert.equal(y.acilis, T0 + SIRA_ALT);
    assert.equal(db.prepare('SELECT yoklama_kalan AS k FROM calismalar').get().k, SIRA_ALT);
  });

  it('robot tık sırayı beklemez; kişi başı tek bekleyen olur', () => {
    const db = calisanDb();
    let y = null;
    for (let i = 0; i < AYNI_TIK_ESIGI; i += 1) {
      y = yoklamaDenetle(db, {
        guildId: G, kullaniciId: A, tik: { x: 5, y: 5, guvenli: true }, simdi: T0 + i,
      });
    }
    assert.equal(y.sebep, 'tik');
    const ikinci = yoklamaBaslat(db, {
      guildId: G, kullaniciId: A, sebep: 'sira', simdi: T0 + 99,
    });
    assert.equal(ikinci.id, y.id);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM calis_yoklamalari').get().n, 1);
  });
});

describe('yoklama: cevap', () => {
  it('doğru cevap kapatır', () => {
    const db = calisanDb();
    const y = yoklamaBaslat(db, {
      guildId: G, kullaniciId: A, sebep: 'sira', simdi: T0,
    });
    const s = yoklamaCevapla(db, {
      guildId: G, kullaniciId: A, secim: y.hedef, simdi: T0 + 2000,
    });
    assert.deepEqual(s, {
      ok: true, dogru: true, hizli: false, cezaMs: 0, yoklama: null,
    });
    assert.equal(yoklamaBekleyen(db, G, A), null);
  });

  it('yanlış cevap artan cezayla yeni yoklama açar; doğru cevap cezayı sıfırlar', () => {
    const db = calisanDb();
    let y = yoklamaBaslat(db, {
      guildId: G, kullaniciId: A, sebep: 'tik', simdi: T0,
    });
    let simdi = T0 + 2000;
    for (const beklenen of [...CEZALAR_MS, CEZALAR_MS.at(-1)]) {
      const s = yoklamaCevapla(db, {
        guildId: G, kullaniciId: A, secim: yanlisSecim(y), simdi,
      });
      assert.equal(s.dogru, false);
      assert.equal(s.cezaMs, beklenen);
      assert.equal(s.yoklama.sebep, 'tekrar');
      assert.equal(s.yoklama.acilis, simdi + beklenen);
      y = s.yoklama;
      simdi = y.acilis + 2000;
    }
    assert.equal(yoklamaCevapla(db, {
      guildId: G, kullaniciId: A, secim: y.hedef, simdi,
    }).dogru, true);
    y = yoklamaBaslat(db, {
      guildId: G, kullaniciId: A, sebep: 'sira', simdi,
    });
    assert.equal(yoklamaCevapla(db, {
      guildId: G, kullaniciId: A, secim: yanlisSecim(y), simdi: simdi + 2000,
    }).cezaMs, CEZALAR_MS[0]);
  });

  it(`${EN_AZ_CEVAP_MS} ms'den hızlı doğru cevap da yanlış sayılır`, () => {
    const db = calisanDb();
    const y = yoklamaBaslat(db, {
      guildId: G, kullaniciId: A, sebep: 'sira', simdi: T0,
    });
    const s = yoklamaCevapla(db, {
      guildId: G, kullaniciId: A, secim: y.hedef, simdi: T0 + EN_AZ_CEVAP_MS - 1,
    });
    assert.equal(s.dogru, false);
    assert.equal(s.hizli, true);
    assert.equal(db.prepare('SELECT sonuc FROM calis_yoklamalari WHERE id = ?').get(y.id).sonuc, 'hizli');
  });

  it('ceza bitmeden, olmayan seçenekle ya da yoklama yokken cevap sayılmaz', () => {
    const db = calisanDb();
    assert.equal(yoklamaCevapla(db, { guildId: G, kullaniciId: A, secim: 'dart' }).ok, false);
    const y = yoklamaBaslat(db, {
      guildId: G, kullaniciId: A, sebep: 'sira', simdi: T0, acilis: T0 + 30_000,
    });
    assert.equal(yoklamaCevapla(db, {
      guildId: G, kullaniciId: A, secim: y.hedef, simdi: T0 + 10_000,
    }).ok, false);
    assert.equal(yoklamaCevapla(db, {
      guildId: G, kullaniciId: A, secim: 'zebra', simdi: T0 + 40_000,
    }).ok, false);
    assert.equal(yoklamaBekleyen(db, G, A).id, y.id);
  });
});

describe('yoklama: yönetim özeti', () => {
  it('kişi başı sayar, şüpheliyi üste koyar, eskiyi katmaz', () => {
    const db = calisanDb();
    const ac = (kullaniciId, sebep, simdi) => yoklamaBaslat(db, {
      guildId: G, kullaniciId, sebep, simdi,
    });
    // Eski (8 gün önce) kayıt sayılmaz.
    const eski = ac('300', 'sira', T0 - 8 * 86_400_000);
    yoklamaCevapla(db, {
      guildId: G, kullaniciId: '300', secim: eski.hedef, simdi: eski.acilis + 1000,
    });
    // İnsan: iki doğru, 2 ve 4 sn'de.
    for (const sure of [2000, 4000]) {
      const y = ac(A, 'sira', T0);
      yoklamaCevapla(db, {
        guildId: G, kullaniciId: A, secim: y.hedef, simdi: T0 + sure,
      });
    }
    // Makro: tıkla açılan yoklamaya üç yanlış, boşa tıklarla; sonra takılı kalır.
    let y = ac('200', 'tik', T0);
    for (let i = 0; i < 3; i += 1) {
      y = yoklamaCevapla(db, {
        guildId: G, kullaniciId: '200', secim: yanlisSecim(y), bosTik: 9, simdi: y.acilis + 1000,
      }).yoklama;
    }
    const o = yoklamaOzeti(db, G, T0 + 3_600_000);
    assert.equal(o.kisi, 2);
    assert.equal(o.supheli, 1);
    assert.equal(o.bekleyen, 1);
    assert.equal(o.dogru, 2);
    assert.equal(o.yanlis, 3);
    const [makro, insan] = o.kisiler;
    assert.equal(makro.kullaniciId, '200');
    assert.equal(makro.supheli, true);
    assert.equal(makro.tik, 1);
    assert.equal(makro.bosTik, 27);
    assert.ok(makro.bekliyor !== null);
    assert.equal(insan.kullaniciId, A);
    assert.equal(insan.supheli, false);
    assert.equal(insan.medyanMs, 3000);
  });
});

describe('web: /api/calis yoklaması', () => {
  it('yoklama bekliyorken çalışılmaz; doğru cevap bilinmez, yanlış cezalı, doğru açar', async () => {
    const s = await testSunucusu();
    try {
      const y = yoklamaBaslat(s.db, {
        guildId: TEST_GUILD, kullaniciId: TEST_KULLANICI, sebep: 'sira', simdi: Date.now() - 5000,
      });
      const engel = await s.istek('POST', '/api/calis', { x: 1, y: 1 });
      assert.equal(engel.durum, 200);
      assert.equal(engel.veri.calisti, false);
      const v = engel.veri.bilgi.yoklama;
      assert.equal(v.hedef, MESLEKLER.find((m) => m.kimlik === y.hedef).ad);
      assert.equal(v.secenekler.length, SECENEK_ADEDI);
      assert.ok(v.secenekler.every((o) => o.ad && o.gorsel && !('dogru' in o)));
      assert.ok(!JSON.stringify(engel.veri).includes('"sebep"'));

      const yanlis = await s.istek('POST', '/api/calis/yoklama', { secim: yanlisSecim(y), bosTik: 3 });
      assert.equal(yanlis.durum, 200);
      assert.equal(yanlis.veri.dogru, false);
      assert.equal(yanlis.veri.cezaMs, CEZALAR_MS[0]);
      assert.ok(yanlis.veri.bilgi.yoklama.kalanMs > CEZALAR_MS[0] - 5000);
      assert.equal(engel.veri.bilgi.yoklama.kalanMs, 0);
      const erken = await s.istek('POST', '/api/calis/yoklama', { secim: 'dart' });
      assert.equal(erken.durum, 400);

      const yeni = yoklamaBekleyen(s.db, TEST_GUILD, TEST_KULLANICI);
      s.db.prepare('UPDATE calis_yoklamalari SET acilis = ? WHERE id = ?').run(Date.now() - 5000, yeni.id);
      const dogru = await s.istek('POST', '/api/calis/yoklama', { secim: yeni.hedef });
      assert.equal(dogru.veri.dogru, true);
      assert.equal(dogru.veri.bilgi.yoklama, null);

      const calis = await s.istek('POST', '/api/calis', { x: 1, y: 1 });
      assert.equal(calis.veri.calisti, true);
    } finally {
      await s.kapat();
    }
  });

  it(`aynı piksele ${AYNI_TIK_ESIGI} çalışma yoklama açar`, async () => {
    const s = await testSunucusu();
    try {
      let son = null;
      for (let i = 0; i < AYNI_TIK_ESIGI; i += 1) {
        s.db.prepare('UPDATE calismalar SET son_calisma = 0, enerji = 100').run();
        son = await s.istek('POST', '/api/calis', { x: 120, y: 24, guvenli: true });
        assert.equal(son.veri.calisti, true);
        // Binde bir çıkan grev sonraki çalışmayı durdurmasın.
        grevBitir(s.db, { guildId: TEST_GUILD, kullaniciId: TEST_KULLANICI, kazandi: false });
      }
      assert.ok(son.veri.bilgi.yoklama);
      assert.equal(yoklamaBekleyen(s.db, TEST_GUILD, TEST_KULLANICI).sebep, 'tik');
    } finally {
      await s.kapat();
    }
  });

  it('yönetim özeti yalnız yöneticiye, üye adıyla', async () => {
    const uye = await testSunucusu();
    try {
      assert.equal((await uye.istek('GET', '/api/yonetim/yoklama')).durum, 403);
    } finally {
      await uye.kapat();
    }
    const s = await testSunucusu({
      istemci: sahteIstemci([sahteUye(TEST_KULLANICI, 'Yonetici', { yonetici: true }), sahteUye(TEST_DIGER, 'Diger')]),
    });
    try {
      yoklamaBaslat(s.db, {
        guildId: TEST_GUILD, kullaniciId: TEST_DIGER, sebep: 'tik', simdi: Date.now(),
      });
      const { durum, veri } = await s.istek('GET', '/api/yonetim/yoklama');
      assert.equal(durum, 200);
      assert.equal(veri.bekleyen, 1);
      assert.equal(veri.kisiler[0].uye.ad, 'Diger');
      assert.equal('kullaniciId' in veri.kisiler[0], false);
    } finally {
      await s.kapat();
    }
  });
});
