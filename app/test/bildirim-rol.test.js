import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BILDIRIM_ROLLERI, bildirimButonAyristir, bildirimButonId, bildirimPaneli,
} from '../lib/bildirim-rol.js';

describe('bildirim rolleri', () => {
  it('düğme kimliği gidip gelir; yalnız listedeki roller tanınır', () => {
    for (const r of BILDIRIM_ROLLERI) assert.equal(bildirimButonAyristir(bildirimButonId(r.anahtar)), r);
    assert.equal(bildirimButonAyristir('bildirim:yonetici'), null);
    assert.equal(bildirimButonAyristir('bildirim:video:fazla'), null);
    assert.equal(bildirimButonAyristir('kasa:ac:ahsap:1'), null);
    assert.equal(bildirimButonAyristir(undefined), null);
  });

  it('panel her rol için bir düğme taşır (tek satır, en çok 5)', () => {
    const { components } = bildirimPaneli();
    assert.equal(components.length, 1);
    assert.equal(components[0].components.length, BILDIRIM_ROLLERI.length);
    assert.ok(BILDIRIM_ROLLERI.length <= 5);
  });

  it('duyuru bildirimi rolü listede yok (2026-10-20 kaldırıldı)', () => {
    assert.ok(!BILDIRIM_ROLLERI.some((r) => r.anahtar === 'duyuru'));
  });
});
