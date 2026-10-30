import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { acVeritabani } from '../lib/db.js';
import { bakiye, ekle, TURLER } from '../lib/ekonomi.js';
import {
  acikMinesIadeEt, MINES_HUCRE, MINES_KASA_ORANI, MINES_MAKS_CARPAN, MINES_ZAMAN_ASIMI_MS, mayinYerlestir, minesAc,
  minesBaslat, minesButonAyristir, minesButonId, minesCarpani, minesCek, minesGetir, minesKareSiniri,
} from '../lib/mines.js';

const G = 'g1';
const A = '100';
const T0 = 1_000_000;

function tohumlu(tohum = 1) {
  let x = tohum;
  return () => {
    x = (x * 16807) % 2147483647;
    return x / 2147483647;
  };
}

function hazir(miktar = 1000) {
  const v = acVeritabani(':memory:');
  ekle(v, { guildId: G, kullaniciId: A, miktar, tur: TURLER.yonetici });
  return v;
}

function basla(v, mayin = 3, ek = {}) {
  const s = minesBaslat(v, {
    guildId: G, kullaniciId: A, bahis: 100, mayin, simdi: T0, rastgele: tohumlu(9), ...ek,
  });
  assert.ok(s.ok, s.sebep);
  return s.oyun;
}

const guvenliKareler = (oyun) => Array.from({ length: MINES_HUCRE }, (_, i) => i).filter((i) => !oyun.mayinlar.includes(i));

describe('mines saf mantık', () => {
  it('çarpan adil oranın %95\'i, aşağı yuvarlanır', () => {
    assert.equal(minesCarpani(3, 0), 1);
    assert.equal(minesCarpani(1, 1), 1.06); // 9/8 × 0,95 = 1,0687…
    assert.equal(minesCarpani(3, 2), 2.28); // 9/6 × 8/5 × 0,95 = 2,28
    assert.equal(minesCarpani(8, 1), 8.55); // 9 × 0,95 (kayan noktada 8,5499…)
    assert.equal(minesCarpani(4, 3), 7.98);
  });

  it('çarpan 9x\'i geçmez; oyun tavana varınca biter', () => {
    assert.equal(MINES_MAKS_CARPAN, 9);
    assert.equal(minesCarpani(4, 5), 9); // tavansız C(9,4) × 0,95 = 119,7 olurdu
    assert.equal(minesCarpani(2, 6), 9); // tavansız 11,4
    for (let m = 1; m < MINES_HUCRE; m += 1) {
      for (let k = 1; k <= MINES_HUCRE - m; k += 1) assert.ok(minesCarpani(m, k) <= 9, `m=${m} k=${k}`);
    }
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map(minesKareSiniri), [8, 6, 5, 4, 3, 2, 2, 1]);
  });

  it('her çekme anında beklenen geri ödeme en çok %95', () => {
    for (let m = 1; m < MINES_HUCRE; m += 1) {
      let hayatta = 1;
      for (let k = 1; k <= MINES_HUCRE - m; k += 1) {
        hayatta *= (MINES_HUCRE - m - (k - 1)) / (MINES_HUCRE - (k - 1));
        assert.ok(hayatta * minesCarpani(m, k) <= MINES_KASA_ORANI + 1e-12, `m=${m} k=${k}`);
      }
    }
  });

  it('mayınlar tekrarsız ve tahtada', () => {
    const y = mayinYerlestir(7, tohumlu(3));
    assert.equal(y.length, 7);
    assert.equal(new Set(y).size, 7);
    assert.ok(y.every((i) => i >= 0 && i < MINES_HUCRE));
  });

  it('düğme kimliği gidiş dönüş; bozuk kimlik reddedilir', () => {
    assert.deepEqual(minesButonAyristir(minesButonId(4, 8)), { id: 4, hucre: 8 });
    assert.deepEqual(minesButonAyristir(minesButonId(4, 'cek')), { id: 4, hucre: 'cek' });
    for (const k of ['mines:4:9', 'mines:x:1', 'xox:4:1', null]) assert.equal(minesButonAyristir(k), null);
  });
});

describe('mines oyunu', () => {
  it('başta bahis düşülür; mayın sayısı sınırlı', () => {
    const v = hazir();
    basla(v);
    assert.equal(bakiye(v, G, A), 900);
    const yanlis = minesBaslat(v, { guildId: G, kullaniciId: '2', bahis: 100, mayin: 9 });
    assert.equal(yanlis.ok, false);
  });

  it('güvenli kareler açılıp çekilince bahis × çarpan ödenir', () => {
    const v = hazir();
    const oyun = basla(v);
    const [a, b] = guvenliKareler(oyun);
    assert.equal(minesAc(v, { id: oyun.id, kullaniciId: A, hucre: a }).bitti, null);
    assert.equal(minesAc(v, { id: oyun.id, kullaniciId: A, hucre: a }).sebep, 'O kare zaten açık.');
    minesAc(v, { id: oyun.id, kullaniciId: A, hucre: b });
    const s = minesCek(v, { id: oyun.id, kullaniciId: A });
    assert.equal(s.bitti.carpan, 2.28);
    assert.equal(s.bitti.odeme, 228);
    assert.equal(bakiye(v, G, A), 900 + 228);
    assert.equal(minesGetir(v, oyun.id), null);
  });

  it('mayına basınca bahis gider, oyun biter', () => {
    const v = hazir();
    const oyun = basla(v);
    const s = minesAc(v, { id: oyun.id, kullaniciId: A, hucre: oyun.mayinlar[0] });
    assert.equal(s.bitti.tur, 'patladi');
    assert.equal(s.bitti.net, -100);
    assert.equal(bakiye(v, G, A), 900);
    assert.equal(minesCek(v, { id: oyun.id, kullaniciId: A }).gecersiz, true);
  });

  it('kare açmadan çekilemez; başkası oynayamaz', () => {
    const v = hazir();
    const oyun = basla(v);
    assert.equal(minesCek(v, { id: oyun.id, kullaniciId: A }).ok, false);
    assert.match(minesAc(v, { id: oyun.id, kullaniciId: '2', hucre: 0 }).sebep, /senin değil/);
  });

  it('bütün güvenli kareler açılınca kendiliğinden çekilir', () => {
    const v = hazir();
    const oyun = basla(v, 8);
    const s = minesAc(v, { id: oyun.id, kullaniciId: A, hucre: guvenliKareler(oyun)[0] });
    assert.equal(s.bitti.tur, 'cekildi');
    assert.equal(s.bitti.odeme, 855);
  });

  it('çarpan 9x\'e varınca güvenli kare kalsa da kendiliğinden çekilir', () => {
    const v = hazir();
    const oyun = basla(v, 2);
    const kareler = guvenliKareler(oyun);
    let s;
    for (let i = 0; i < 6; i += 1) s = minesAc(v, { id: oyun.id, kullaniciId: A, hucre: kareler[i] });
    assert.equal(s.bitti.tur, 'cekildi');
    assert.equal(s.bitti.carpan, 9);
    assert.equal(s.bitti.odeme, 900);
    assert.equal(minesGetir(v, oyun.id), null);
  });

  it('süren oyun varken yenisi açılmaz; unutulmuş oyun çekilip yenisi açılır', () => {
    const v = hazir();
    const oyun = basla(v);
    assert.equal(minesBaslat(v, { guildId: G, kullaniciId: A, bahis: 100, mayin: 3, simdi: T0 + 1 }).ok, false);
    minesAc(v, { id: oyun.id, kullaniciId: A, hucre: guvenliKareler(oyun)[0] });
    const s = minesBaslat(v, {
      guildId: G, kullaniciId: A, bahis: 100, mayin: 3, simdi: T0 + MINES_ZAMAN_ASIMI_MS,
    });
    assert.ok(s.ok);
    assert.equal(s.eski.bitti.tur, 'cekildi');
    assert.equal(bakiye(v, G, A), 900 + 142 - 100);
  });

  it('açılışta yarım kalan oyunların bahsi iade edilir', () => {
    const v = hazir();
    basla(v);
    assert.equal(acikMinesIadeEt(v, T0 + 5), 1);
    assert.equal(bakiye(v, G, A), 1000);
    assert.equal(acikMinesIadeEt(v, T0 + 6), 0);
  });

  it('bakiye yetmezse oyun açılmaz', () => {
    const v = hazir(50);
    const s = minesBaslat(v, { guildId: G, kullaniciId: A, bahis: 100, mayin: 3 });
    assert.equal(s.ok, false);
    assert.equal(v.prepare('SELECT COUNT(*) AS n FROM mines_oyunlari').get().n, 0);
  });
});
