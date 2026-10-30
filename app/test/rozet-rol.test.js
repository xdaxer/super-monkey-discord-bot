import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AYARLAR } from '../lib/ayarlar.js';
import {
  ROZET_RENKLERI, ROZETLER, rozetRolAdi, rozetRolAnahtari, rozetRolIdleri, rozetRoluVer,
} from '../lib/rozet-rol.js';

/** Sahte üye: rolleri bir Set'te tutar; `editable` rolün bot altında olup olmadığı. */
function uye(roller = [], { editable = true, hata = false } = {}) {
  const sahip = new Set(roller);
  return {
    sahip,
    guild: { roles: { cache: new Map([['r1', { id: 'r1', editable }]]) } },
    roles: {
      cache: { has: (id) => sahip.has(id) },
      add: async (id) => {
        if (hata) throw new Error('Missing Permissions');
        sahip.add(id);
      },
    },
  };
}

describe('rozet rolleri', () => {
  it('her rozetin rengi ve ayar anahtarı var', () => {
    assert.equal(ROZETLER.length, 13);
    for (const r of ROZETLER) {
      assert.ok(ROZET_RENKLERI[r.kimlik], r.kimlik);
      assert.ok(AYARLAR[rozetRolAnahtari(r.kimlik)], r.kimlik);
    }
    assert.equal(rozetRolAnahtari('rozet-bad'), 'rozet.rol.bad');
    assert.equal(rozetRolAdi(ROZETLER[0]), '🎈 Kırmızı Balon');
  });

  it('ayar okuyucudan rol tablosu', () => {
    const idler = rozetRolIdleri((a) => (a === 'rozet.rol.altin' ? 'r1' : null));
    assert.equal(idler['rozet-altin'], 'r1');
    assert.equal(idler['rozet-bad'], null);
  });

  it('rolü veriyor; kurulmamış, zaten sahip, botun üstünde ya da hata verirse sessiz', async () => {
    const oku = (a) => (a === 'rozet.rol.altin' ? 'r1' : null);
    const u = uye();
    assert.equal(await rozetRoluVer(u, 'rozet-altin', oku), 'r1');
    assert.equal(u.sahip.has('r1'), true);
    assert.equal(await rozetRoluVer(u, 'rozet-altin', oku), null);
    assert.equal(await rozetRoluVer(uye(), 'rozet-bad', oku), null);
    assert.equal(await rozetRoluVer(uye([], { editable: false }), 'rozet-altin', oku), null);
    assert.equal(await rozetRoluVer(uye([], { hata: true }), 'rozet-altin', oku), null);
    assert.equal(await rozetRoluVer(null, 'rozet-altin', oku), null);
  });
});
