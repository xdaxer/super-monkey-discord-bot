import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { bahisCoz, kullaniciBahisTavani } from '../lib/bahis.js';
import { acVeritabani } from '../lib/db.js';
import { ekle, TURLER } from '../lib/ekonomi.js';

const G = 'g1';
const A = '100';

function hazir(miktar) {
  const db = acVeritabani(':memory:');
  ekle(db, { guildId: G, kullaniciId: A, miktar, tur: TURLER.yonetici });
  return db;
}

const coz = (db, ham) => bahisCoz(db, { guildId: G, kullaniciId: A, ham });

describe('bahisCoz', () => {
  it('sayı, kısaltma ve binlik ayracını okur', () => {
    const db = hazir(5000);
    assert.deepEqual(coz(db, '500'), { ok: true, miktar: 500 });
    assert.deepEqual(coz(db, '1k'), { ok: true, miktar: 1000 });
    assert.deepEqual(coz(db, '1.000'), { ok: true, miktar: 1000 });
  });

  it('hepsi ve yarı bakiyeden, seviye tavanına kırpılarak hesaplanır', () => {
    const db = hazir(5000);
    assert.equal(kullaniciBahisTavani(db, G, A), 1000);
    assert.deepEqual(coz(db, 'hepsi'), { ok: true, miktar: 1000 });
    assert.deepEqual(coz(db, 'yarı'), { ok: true, miktar: 1000 });
    assert.deepEqual(coz(hazir(300), 'yarı'), { ok: true, miktar: 150 });
  });

  it('tavanı, alt sınırı ve bakiyeyi aşan açık sayı kırpılmaz, reddedilir', () => {
    const db = hazir(5000);
    assert.equal(coz(db, '1001').ok, false);
    assert.equal(coz(db, '5').ok, false);
    assert.equal(coz(hazir(50), '100').ok, false);
    assert.equal(coz(db, 'xyz').ok, false);
  });
});
