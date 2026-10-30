import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ALTIN_ENERJI, ALTIN_KAT, ANTRENMAN_XP, MOAB_KAT, MOLA_ENERJI, OLAY_SANSI, OLAY_SURE_MS, OLAYLAR, bekleyenOlay, olayCoz,
  olayZari,
} from '../lib/calis-olay.js';
import { acVeritabani } from '../lib/db.js';
import { bakiye } from '../lib/ekonomi.js';
import { ENERJI_DOLUM_MS, ENERJI_MAKS, enerjiOku } from '../lib/enerji.js';
import { adet, esyaEkle } from '../lib/envanter.js';
import { maymunKilitle, maymunXp } from '../lib/maymun.js';
import { calis } from '../lib/meslekler.js';

const G = 'g1';
const A = '100';
const SA = 3_600_000;
const T0 = Date.parse('2026-01-05T12:00:00+03:00');

/** Sırayla verilen değerleri döner; sonuncusu tekrarlanır. */
const dizi = (...d) => { let i = 0; return () => d[Math.min(i++, d.length - 1)]; };
/** Olay zarı sırası: taban, bonus kasa, olay metni, {n}, olay şansı, hangi olay. */
const olayla = (secici) => dizi(0, 0.99, 0, 0, 0, secici);
const agirlikToplami = (liste) => liste.reduce((t, o) => t + o.agirlik, 0);

/** `kimlik` olayını seçen zar değeri (maymunlu, seçimli olaylar açık). */
function seciciBul(kimlik, liste = OLAYLAR) {
  let once = 0;
  for (const o of liste) {
    if (o.kimlik === kimlik) return (once + o.agirlik / 2) / agirlikToplami(liste);
    once += o.agirlik;
  }
  throw new Error(kimlik);
}

describe('olay zarı', () => {
  it('şansın altında olay çıkar, üstünde çıkmaz', () => {
    assert.equal(olayZari(() => OLAY_SANSI), null);
    assert.ok(olayZari(dizi(OLAY_SANSI - 0.001, 0)));
  });

  it('maymunsuza antrenman, bekleyen seçimi olana seçimli olay çıkmaz', () => {
    for (let z = 0; z < 1; z += 0.01) {
      const o = olayZari(dizi(0, z), { maymunVar: false, secimliOlur: false });
      assert.ok(o.kimlik !== 'antrenman' && !o.secimli, o.kimlik);
    }
  });

  it('her olayın ağırlığı pozitif, seçimlilerin iki seçeneği var', () => {
    for (const o of OLAYLAR) {
      assert.ok(o.agirlik > 0);
      if (o.secimli) assert.equal(o.secenekler.length, 2);
    }
  });
});

describe('çalışma olayları', () => {
  const db = () => acVeritabani(':memory:');
  // Maymunsuz çalışanın zarında antrenman yoktur.
  const maymunsuz = OLAYLAR.filter((o) => !o.maymunlu);
  const calisOlay = (v, kimlik, ek = {}, liste = maymunsuz) => calis(v, {
    guildId: G, kullaniciId: A, simdi: T0, rastgele: olayla(seciciBul(kimlik, liste)), ...ek,
  });

  it('usta: kazanç bir kez daha ödenir', () => {
    const v = db();
    const s = calisOlay(v, 'usta');
    assert.equal(s.olayEtkisi.kimlik, 'usta');
    assert.equal(s.olayEtkisi.muz, s.kazanc);
    assert.equal(bakiye(v, G, A), 2 * s.kazanc);
    assert.equal(s.bakiye, bakiye(v, G, A));
  });

  it('mola: enerji geri gelir (en çok 100)', () => {
    const v = db();
    const s = calisOlay(v, 'mola');
    assert.equal(s.olayEtkisi.enerji, ENERJI_MAKS);
    assert.equal(s.enerji, ENERJI_MAKS);
    assert.ok(MOLA_ENERJI > s.bedel);
  });

  it('antrenman: kilitli maymuna ek XP', () => {
    const v = db();
    esyaEkle(v, G, A, 'kart-quincy');
    maymunKilitle(v, { guildId: G, kullaniciId: A, kimlik: 'kart-quincy' });
    const s = calisOlay(v, 'antrenman', {}, OLAYLAR);
    assert.equal(s.olayEtkisi.kimlik, 'antrenman');
    assert.equal(maymunXp(v, G, A, 'kart-quincy'), ANTRENMAN_XP + 1);
  });

  it('kasa: Ahşap Kasa envantere girer', () => {
    const v = db();
    calisOlay(v, 'kasa');
    assert.equal(adet(v, G, A, 'kasa-ahsap'), 1);
  });

  it('MOAB: vurunca %40 ihtimalle 3 kat, dürtünce garanti 1 kat; seçim bir kez çözülür', () => {
    const v = db();
    const s = calisOlay(v, 'moab');
    assert.equal(s.olayEtkisi.secenekler.length, 2);
    assert.equal(s.olayEtkisi.bitis, T0 + OLAY_SURE_MS);
    const once = bakiye(v, G, A);
    const c = olayCoz(v, {
      guildId: G, kullaniciId: A, secim: 'vur', simdi: T0 + 1000, rastgele: () => 0.1,
    });
    assert.deepEqual([c.ok, c.basarili, c.muz], [true, true, s.kazanc * MOAB_KAT]);
    assert.equal(bakiye(v, G, A), once + s.kazanc * MOAB_KAT);
    assert.equal(olayCoz(v, { guildId: G, kullaniciId: A, secim: 'vur', simdi: T0 + 2000 }).kacti, true);

    const v2 = db();
    const s2 = calisOlay(v2, 'moab');
    const iska = olayCoz(v2, {
      guildId: G, kullaniciId: A, secim: 'vur', simdi: T0 + 1000, rastgele: () => 0.9,
    });
    assert.deepEqual([iska.basarili, iska.muz], [false, 0]);
    const v3 = db();
    const s3 = calisOlay(v3, 'moab');
    assert.equal(olayCoz(v3, { guildId: G, kullaniciId: A, secim: 'durt', simdi: T0 + 1000 }).muz, s3.kazanc);
    assert.ok(s2.kazanc > 0);
  });

  it('Altın Balon: kovalamak enerji harcar, yakalanırsa 5 kat; enerji yetmezse reddedilir', () => {
    const v = db();
    const s = calisOlay(v, 'altin');
    const enerjiOnce = enerjiOku(v, G, A, T0 + 1000);
    const c = olayCoz(v, {
      guildId: G, kullaniciId: A, secim: 'kovala', simdi: T0 + 1000, rastgele: () => 0.2,
    });
    assert.equal(c.muz, s.kazanc * ALTIN_KAT);
    assert.ok(Math.abs(c.enerji - (enerjiOnce - ALTIN_ENERJI)) < 1e-9);

    const v2 = db();
    calisOlay(v2, 'altin');
    v2.prepare('UPDATE calismalar SET enerji = 5, enerji_zaman = ?').run(T0 + 1000);
    const red = olayCoz(v2, { guildId: G, kullaniciId: A, secim: 'kovala', simdi: T0 + 1000 });
    assert.equal(red.ok, false);
    assert.ok(bekleyenOlay(v2, G, A, T0 + 1000), 'reddedilen seçim olayı silmez');
    assert.equal(olayCoz(v2, { guildId: G, kullaniciId: A, secim: 'birak', simdi: T0 + 1000 }).muz, 0);
  });

  it('seçilmeyen olay süresi dolunca kaçar; geçersiz seçim reddedilir', () => {
    const v = db();
    calisOlay(v, 'moab');
    assert.equal(olayCoz(v, { guildId: G, kullaniciId: A, secim: 'kovala', simdi: T0 + 1000 }).ok, false);
    assert.equal(olayCoz(v, { guildId: G, kullaniciId: A, secim: 'vur', simdi: T0 + OLAY_SURE_MS }).kacti, true);
  });

  it('bekleyen seçim varken ikinci seçimli olay çıkmaz', () => {
    const v = db();
    calisOlay(v, 'moab');
    const s = calisOlay(v, 'moab', { simdi: T0 + SA / 60 });
    assert.ok(!s.olayEtkisi?.secenekler);
    assert.equal(bekleyenOlay(v, G, A, T0 + SA / 60).olay.kimlik, 'moab');
  });
});

describe('enerji dolumu', () => {
  it('boştan 1 saatte dolar', () => {
    assert.equal(ENERJI_DOLUM_MS * ENERJI_MAKS, SA);
  });
});
