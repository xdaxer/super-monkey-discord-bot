import assert from 'node:assert/strict';
import test from 'node:test';

import { atlamaNedeni, ikonSec } from '../scripts/rol-ikon-kur.js';

const emojiler = new Set(['btd_red', 'btd_bad', 'btd_boomerang']);

test('rozet rolü adındaki balon emojisine bakmadan BTD emojisine eşlenir', () => {
  assert.deepEqual(ikonSec('🎈 Kırmızı Balon', emojiler), { btd: 'red' });
  assert.deepEqual(ikonSec('🎈 B.A.D.', emojiler), { btd: 'bad' });
});

test('sunucuda emojisi olmayan BTD eşlemesi atlanır', () => {
  assert.equal(ikonSec('Ninja Maymun', emojiler), null);
});

test('desen ve unicode eşlemeleri', () => {
  assert.deepEqual(ikonSec('🌟 Prestij 3', emojiler), { unicode: '🌟' });
  assert.deepEqual(ikonSec('Bot', emojiler), { unicode: '🤖' });
  assert.equal(ikonSec('new role', emojiler), null);
});

test('atlama nedenleri', () => {
  const rol = { id: '1', managed: false, position: 5, icon: null, unicode_emoji: null };
  assert.equal(atlamaNedeni(rol, '0', 10), null);
  assert.match(atlamaNedeni({ ...rol, managed: true }, '0', 10), /yönetilen/);
  assert.match(atlamaNedeni({ ...rol, position: 10 }, '0', 10), /botun/);
  assert.match(atlamaNedeni({ ...rol, icon: 'x' }, '0', 10), /ikonu var/);
  assert.equal(atlamaNedeni(rol, '1', 10), '@everyone');
});
