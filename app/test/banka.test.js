import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  aktifMevduatlar, boz, faizHesapla, kilitliToplam, mevduatGetir, mevduatTavani, VADELER, vadesiGelenleriOde, yatir,
} from '../lib/banka.js';
import { acVeritabani } from '../lib/db.js';
import { bakiye, ekle, TURLER } from '../lib/ekonomi.js';

const G = 'g1';
const A = '100';
const GUN = 86_400_000;

function hazir(para = 100_000) {
  const db = acVeritabani(':memory:');
  ekle(db, { guildId: G, kullaniciId: A, miktar: para, tur: TURLER.yonetici, simdi: 0 });
  return db;
}

const yatirA = (db, miktar, vade, ek = {}) => yatir(db, {
  guildId: G, kullaniciId: A, miktar, vade, simdi: 0, ...ek,
});

describe('banka sayıları', () => {
  it('vade ve faizler belgedeki gibi', () => {
    assert.deepEqual(VADELER.map((v) => [v.kimlik, v.ms / GUN, v.yuzde]), [['12sa', 0.5, 4], ['36sa', 1.5, 14], ['84sa', 3.5, 40], ['7g', 7, 100]]);
    assert.equal(faizHesapla(10_000, 12), 1200);
    assert.equal(faizHesapla(999, 1), 9);
  });

  it('tavan seviyeyle artıyor, 500.000\'de duruyor', () => {
    assert.equal(mevduatTavani(0), 20_000);
    assert.equal(mevduatTavani(10), 70_000);
    assert.equal(mevduatTavani(200), 500_000);
  });
});

describe('yatırma', () => {
  it('muz düşülüp kilitleniyor', () => {
    const db = hazir();
    const s = yatirA(db, 10_000, '84sa');
    assert.equal(s.ok, true);
    assert.equal(s.faiz, 4000);
    assert.equal(bakiye(db, G, A), 90_000);
    assert.equal(kilitliToplam(db, G, A), 10_000);
    assert.equal(s.mevduat.vade, 3.5 * GUN);
  });

  it('en az tutar, tavan, aktif sınır ve bakiye denetleniyor', () => {
    const db = hazir();
    assert.equal(yatirA(db, 999, '12sa').ok, false);
    assert.equal(yatirA(db, 20_001, '12sa').ok, false);
    assert.equal(yatirA(db, 1_000, 'yok').ok, false);
    for (let i = 0; i < 5; i += 1) assert.equal(yatirA(db, 1_000, '12sa').ok, true);
    assert.equal(yatirA(db, 1_000, '12sa').ok, false);
    assert.equal(aktifMevduatlar(db, G, A).length, 5);

    const fakir = hazir(500);
    assert.equal(yatir(fakir, { guildId: G, kullaniciId: A, miktar: 1_000, vade: '12sa' }).ok, false);
    assert.equal(bakiye(fakir, G, A), 500);
  });

  it('yüksek seviye daha çok kilitleyebiliyor', () => {
    const db = hazir();
    assert.equal(yatirA(db, 50_000, '36sa').ok, false);
    assert.equal(yatirA(db, 50_000, '36sa', { seviye: 6 }).ok, true);
  });
});

describe('vade ve bozma', () => {
  it('vade dolmadan ödenmiyor, dolunca anapara + faiz bir kez', () => {
    const db = hazir();
    const { mevduat } = yatirA(db, 10_000, '36sa');
    assert.deepEqual(vadesiGelenleriOde(db, { simdi: 1.5 * GUN - 1 }), []);
    const odenen = vadesiGelenleriOde(db, { simdi: 1.5 * GUN });
    assert.deepEqual(odenen.map((o) => [o.anapara, o.faiz]), [[10_000, 1_400]]);
    assert.equal(bakiye(db, G, A), 101_400);
    assert.deepEqual(vadesiGelenleriOde(db, { simdi: 10 * GUN }), []);
    assert.equal(mevduatGetir(db, mevduat.id).durum, 'odendi');
    assert.equal(kilitliToplam(db, G, A), 0);
  });

  it('erken bozma: faiz yok, %10 ceza', () => {
    const db = hazir();
    const { mevduat } = yatirA(db, 10_000, '7g');
    const s = boz(db, { guildId: G, kullaniciId: A, id: mevduat.id, simdi: GUN });
    assert.deepEqual([s.iade, s.ceza], [9_000, 1_000]);
    assert.equal(bakiye(db, G, A), 99_000);
    assert.equal(boz(db, { guildId: G, kullaniciId: A, id: mevduat.id, simdi: GUN }).ok, false);
  });

  it('başkasının mevduatı bozulamıyor; vadesi geçmişse faiziyle ödeniyor', () => {
    const db = hazir();
    const { mevduat } = yatirA(db, 10_000, '12sa');
    assert.equal(boz(db, { guildId: G, kullaniciId: '999', id: mevduat.id }).ok, false);
    const s = boz(db, { guildId: G, kullaniciId: A, id: mevduat.id, simdi: 2 * GUN });
    assert.equal(s.ok, false);
    assert.equal(bakiye(db, G, A), 100_400);
  });

  it('yalnız istenen kişinin vadesi ödenebiliyor', () => {
    const db = hazir();
    ekle(db, { guildId: G, kullaniciId: 'B', miktar: 5_000, tur: TURLER.yonetici, simdi: 0 });
    yatirA(db, 2_000, '12sa');
    yatir(db, { guildId: G, kullaniciId: 'B', miktar: 2_000, vade: '12sa', simdi: 0 });
    const odenen = vadesiGelenleriOde(db, { simdi: GUN, guildId: G, kullaniciId: A });
    assert.deepEqual(odenen.map((o) => o.kullanici_id), [A]);
    assert.equal(kilitliToplam(db, G, 'B'), 2_000);
  });
});
