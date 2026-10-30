import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { ayarYaz, SISTEMLER, sistemAyarla } from '../lib/ayarlar.js';
import { acVeritabani } from '../lib/db.js';
import { otorolKarari } from '../lib/otorol.js';

const G = 'g1';

describe('otorol kararı', () => {
  let db;
  beforeEach(() => {
    db = acVeritabani(':memory:');
    sistemAyarla(db, G, 'otorol', true);
    ayarYaz(db, G, 'otorol.rol', 'r1');
  });
  afterEach(() => db.close());

  it('sistem açık ve rol ayarlıysa rolü verir', () => {
    assert.deepEqual(otorolKarari(db, G), { ok: true, rolId: 'r1' });
  });

  it('botlara vermez', () => {
    assert.equal(otorolKarari(db, G, { bot: true }).ok, false);
  });

  it('sistem kapalıysa vermez', () => {
    sistemAyarla(db, G, 'otorol', false);
    assert.match(otorolKarari(db, G).sebep, /kapalı/);
  });

  it('rol ayarlanmamışsa vermez', () => {
    const temiz = acVeritabani(':memory:');
    sistemAyarla(temiz, G, 'otorol', true);
    assert.match(otorolKarari(temiz, G).sebep, /ayarlanmamış/);
    temiz.close();
  });

  it('varsayılan kapalı', () => {
    assert.equal(SISTEMLER.otorol.varsayilan, false);
  });
});
