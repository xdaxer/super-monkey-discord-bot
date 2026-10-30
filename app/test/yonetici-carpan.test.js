import assert from 'node:assert/strict';
import { test } from 'node:test';

import { YONETICI_CARPAN, yoneticiCarpani } from '../lib/yonetici-carpan.js';

test('yönetici çarpanı yalnız sahip/geliştirici listesindekilere', () => {
  const liste = ['111', '222'];
  assert.equal(YONETICI_CARPAN, 5);
  assert.equal(yoneticiCarpani('111', liste), 5);
  assert.equal(yoneticiCarpani(222, liste), 5);
  assert.equal(yoneticiCarpani('333', liste), 1);
  assert.equal(yoneticiCarpani('111', []), 1);
});
