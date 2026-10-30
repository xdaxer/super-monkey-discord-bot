import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { acVeritabani } from '../lib/db.js';
import { duelloAc, duelloGetir } from '../lib/duello.js';
import { bakiye, ekle, TURLER } from '../lib/ekonomi.js';
import {
  acikXoxlariIadeEt, kazananBul, XOX_HAMLE_SURE_MS, xoxButonAyristir, xoxButonId, xoxGetir, xoxHamle, xoxKabul,
  xoxPes, xoxSuresiDolaniBitir,
} from '../lib/xox.js';

const G = 'g1';
const A = '100';
const B = '200';
const T0 = 1_000_000;

function hazir() {
  const v = acVeritabani(':memory:');
  ekle(v, { guildId: G, kullaniciId: A, miktar: 1000, tur: TURLER.yonetici });
  ekle(v, { guildId: G, kullaniciId: B, miktar: 1000, tur: TURLER.yonetici });
  return v;
}

/** A meydan okur, B kabul eder; `meydanX` true ise A = X (başlar). */
function basla(v, meydanX = true) {
  const { duello } = duelloAc(v, {
    guildId: G, kanalId: 'k1', meydanId: A, rakipId: B, bahis: 100, oyun: 'xox', simdi: T0,
  });
  const s = xoxKabul(v, {
    id: duello.id, kullaniciId: B, simdi: T0 + 1, rastgele: () => (meydanX ? 0.1 : 0.9),
  });
  assert.ok(s.ok);
  assert.equal(duelloGetir(v, duello.id), null);
  return s.oyun;
}

function oyna(v, oyun, hamleler, simdi = T0 + 2) {
  let son;
  for (const [kisi, hucre] of hamleler) {
    son = xoxHamle(v, { id: oyun.id, kullaniciId: kisi, hucre, simdi });
    assert.ok(son.ok, son.sebep);
  }
  return son;
}

describe('xox saf mantık', () => {
  it('çizgi bulur, boş çizgiyi saymaz', () => {
    assert.deepEqual(kazananBul('XXX......'), { isaret: 'X', cizgi: [0, 1, 2] });
    assert.deepEqual(kazananBul('O...O...O'), { isaret: 'O', cizgi: [0, 4, 8] });
    assert.equal(kazananBul('.........'), null);
    assert.equal(kazananBul('XOXXOOOXX'), null);
  });

  it('düğme kimliği gidiş dönüş; bozuk kimlik reddedilir', () => {
    assert.deepEqual(xoxButonAyristir(xoxButonId(7, 4)), { id: 7, hucre: 4 });
    assert.deepEqual(xoxButonAyristir(xoxButonId(7, 'pes')), { id: 7, hucre: 'pes' });
    for (const k of ['xox:7:9', 'xox:a:1', 'duello:kabul:1', 'xox:7', null]) assert.equal(xoxButonAyristir(k), null);
  });
});

describe('xox düellosu', () => {
  it('kabulde iki bahis düşülür, X kurayla belirlenir ve başlar', () => {
    const v = hazir();
    const oyun = basla(v, false);
    assert.equal(bakiye(v, G, A), 900);
    assert.equal(bakiye(v, G, B), 900);
    assert.equal(oyun.xId, B);
    assert.equal(oyun.oId, A);
    assert.equal(oyun.sira, 'X');
    assert.equal(oyun.tahta, '.........');
  });

  it('çizgi tamamlayan kazanır: havuzdan %5 kesilir', () => {
    const v = hazir();
    const oyun = basla(v);
    const s = oyna(v, oyun, [[A, 0], [B, 3], [A, 1], [B, 4], [A, 2]]);
    assert.equal(s.bitti.sebep, 'cizgi');
    assert.equal(s.bitti.kazananId, A);
    assert.deepEqual(s.bitti.cizgi, [0, 1, 2]);
    assert.equal(bakiye(v, G, A), 900 + 190);
    assert.equal(bakiye(v, G, B), 900);
    assert.equal(xoxGetir(v, oyun.id), null);
  });

  it('berabere biterse ikisine iade, kasa payı yok', () => {
    const v = hazir();
    const oyun = basla(v);
    // X O X / X O O / O X X
    const s = oyna(v, oyun, [[A, 0], [B, 1], [A, 2], [B, 4], [A, 3], [B, 5], [A, 7], [B, 6], [A, 8]]);
    assert.equal(s.bitti.sebep, 'berabere');
    assert.equal(s.bitti.kazananId, null);
    assert.equal(bakiye(v, G, A), 1000);
    assert.equal(bakiye(v, G, B), 1000);
  });

  it('sırası olmayan, dolu kareye oynayan ve oyun dışı kişi reddedilir', () => {
    const v = hazir();
    const oyun = basla(v);
    assert.equal(xoxHamle(v, { id: oyun.id, kullaniciId: B, hucre: 0, simdi: T0 + 2 }).sebep, 'Sıra sende değil.');
    oyna(v, oyun, [[A, 4]]);
    assert.equal(xoxHamle(v, { id: oyun.id, kullaniciId: B, hucre: 4, simdi: T0 + 3 }).sebep, 'O kare dolu.');
    assert.equal(xoxHamle(v, { id: oyun.id, kullaniciId: '300', hucre: 0, simdi: T0 + 3 }).sebep, 'Bu oyunda değilsin.');
    assert.equal(xoxGetir(v, oyun.id).tahta, '....X....');
  });

  it('süresinde oynamayan hükmen kaybeder (hamle denemesi ya da zamanlayıcı)', () => {
    const v = hazir();
    const oyun = basla(v);
    oyna(v, oyun, [[A, 4]], T0 + 10);
    assert.equal(xoxSuresiDolaniBitir(v, oyun.id, T0 + 10 + XOX_HAMLE_SURE_MS - 1), null);
    // Süre dolduktan sonra A'nın basması bile oyunu B aleyhine bitirir.
    const s = xoxHamle(v, { id: oyun.id, kullaniciId: A, hucre: 0, simdi: T0 + 10 + XOX_HAMLE_SURE_MS });
    assert.equal(s.bitti.sebep, 'sure');
    assert.equal(s.bitti.kaybedenId, B);
    assert.equal(bakiye(v, G, A), 900 + 190);

    const v2 = hazir();
    const oyun2 = basla(v2);
    const z = xoxSuresiDolaniBitir(v2, oyun2.id, T0 + 1 + XOX_HAMLE_SURE_MS);
    assert.equal(z.bitti.kaybedenId, A);
    assert.equal(bakiye(v2, G, B), 900 + 190);
  });

  it('pes eden kaybeder, sırası olmasa da', () => {
    const v = hazir();
    const oyun = basla(v);
    const s = xoxPes(v, { id: oyun.id, kullaniciId: B, simdi: T0 + 2 });
    assert.equal(s.bitti.sebep, 'pes');
    assert.equal(s.bitti.kazananId, A);
    assert.equal(xoxPes(v, { id: oyun.id, kullaniciId: A }).gecersiz, true);
  });

  it('açılışta yarım kalan oyunlarda iki tarafa iade', () => {
    const v = hazir();
    basla(v);
    assert.equal(acikXoxlariIadeEt(v, T0 + 5), 1);
    assert.equal(bakiye(v, G, A), 1000);
    assert.equal(bakiye(v, G, B), 1000);
    assert.equal(acikXoxlariIadeEt(v, T0 + 6), 0);
  });

  it('rakibin bakiyesi yetmezse oyun açılmaz', () => {
    const v = acVeritabani(':memory:');
    ekle(v, { guildId: G, kullaniciId: A, miktar: 1000, tur: TURLER.yonetici });
    ekle(v, { guildId: G, kullaniciId: B, miktar: 50, tur: TURLER.yonetici });
    const { duello } = duelloAc(v, {
      guildId: G, kanalId: 'k1', meydanId: A, rakipId: B, bahis: 100, oyun: 'xox', simdi: T0,
    });
    const s = xoxKabul(v, { id: duello.id, kullaniciId: B, simdi: T0 + 1 });
    assert.equal(s.ok, false);
    assert.ok(duelloGetir(v, duello.id), 'meydan okuma beklemeye devam eder');
    assert.equal(v.prepare('SELECT COUNT(*) AS n FROM xox_oyunlari').get().n, 0);
  });
});
