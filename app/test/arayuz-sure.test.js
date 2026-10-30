import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { KOPMA_MS, NABIZ_MS, kullanimOzeti, nabizKaydet } from '../lib/arayuz-sure.js';
import { acVeritabani } from '../lib/db.js';

const G = 'g1';
const A = '100';
const B = '200';
const T0 = Date.parse('2026-01-05T12:00:00+03:00');
const nabiz = (db, k, simdi, ekran = 'ana') => nabizKaydet(db, {
  guildId: G, kullaniciId: k, ekran, simdi,
});

describe('arayüz süresi', () => {
  it('ilk nabız oturum açar; sonrakiler aradaki süreyi o ekrana yazar', () => {
    const db = acVeritabani(':memory:');
    assert.equal(nabiz(db, A, T0), 0);
    assert.equal(nabiz(db, A, T0 + NABIZ_MS), NABIZ_MS);
    assert.equal(nabiz(db, A, T0 + 2 * NABIZ_MS, 'kumar'), NABIZ_MS);
    const o = kullanimOzeti(db, G, { baslangic: T0, simdi: T0 + 2 * NABIZ_MS });
    assert.equal(o.toplamMs, 2 * NABIZ_MS);
    assert.deepEqual([o.kisi, o.oturum], [1, 1]);
    assert.deepEqual(o.ekranlar.map((e) => e.ekran).sort(), ['ana', 'kumar']);
    assert.equal(o.uyeler[0].kullaniciId, A);
    assert.equal(o.simdiAktif.length, 1);
  });

  it('kopmadan sonra yeni oturum başlar, aradaki boşluk sayılmaz', () => {
    const db = acVeritabani(':memory:');
    nabiz(db, A, T0);
    nabiz(db, A, T0 + NABIZ_MS);
    assert.equal(nabiz(db, A, T0 + NABIZ_MS + KOPMA_MS + 1), 0);
    nabiz(db, A, T0 + 2 * NABIZ_MS + KOPMA_MS + 1);
    const o = kullanimOzeti(db, G, { simdi: T0 + 10 * NABIZ_MS });
    assert.equal(o.toplamMs, 2 * NABIZ_MS);
    assert.equal(o.oturum, 2);
    assert.equal(o.ortalamaOturumMs, NABIZ_MS);
  });

  it('sık nabız gerçek süreden fazlasını yazdıramaz; geçersiz ekran "diger" olur', () => {
    const db = acVeritabani(':memory:');
    for (let i = 0; i <= 60; i += 1) nabiz(db, A, T0 + i * 1000, '../x');
    const o = kullanimOzeti(db, G, { simdi: T0 + 60_000 });
    assert.equal(o.toplamMs, 60_000);
    assert.deepEqual(o.ekranlar.map((e) => e.ekran), ['diger']);
  });

  it('dönem süzgeci ve kişi sıralaması', () => {
    const db = acVeritabani(':memory:');
    const dun = T0 - 86_400_000;
    nabiz(db, A, dun);
    nabiz(db, A, dun + NABIZ_MS);
    nabiz(db, A, dun + 2 * NABIZ_MS);
    nabiz(db, B, T0);
    nabiz(db, B, T0 + NABIZ_MS);
    const bugun = kullanimOzeti(db, G, { baslangic: T0 - 3_600_000, simdi: T0 + NABIZ_MS });
    assert.deepEqual(bugun.uyeler.map((u) => u.kullaniciId), [B]);
    const hepsi = kullanimOzeti(db, G, { simdi: T0 + NABIZ_MS });
    assert.deepEqual(hepsi.uyeler.map((u) => u.kullaniciId), [A, B]);
    assert.equal(hepsi.gunluk.length, 2);
    assert.equal(hepsi.simdiAktif.length, 1);
  });
});
