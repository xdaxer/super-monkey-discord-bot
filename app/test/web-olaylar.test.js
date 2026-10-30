import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  bossCikar, KATILIM_MUZ, SON_VURUS_MUZ, sonSavasOdemesi, sonuclandir, SURE_MS, TESELLI_MUZ,
} from '../lib/boss.js';
import { etkinlikBaslat } from '../lib/etkinlik.js';
import { guncelle } from '../lib/hisse.js';
import { TEST_DIGER, TEST_GUILD, TEST_KULLANICI, testSunucusu } from '../web/test-yardimci.js';

async function sunucuyla(fn) {
  const s = await testSunucusu();
  try {
    await fn(s);
  } finally {
    await s.kapat();
  }
}

const SAAT = 3_600_000;
const olaylar = async (s) => {
  const r = await s.istek('GET', '/api/olaylar');
  assert.equal(r.durum, 200);
  return r.veri;
};
const hasarYaz = (s, savasId, kullaniciId, hasar) => s.db
  .prepare('INSERT INTO boss_hasarlari (savas_id, kullanici_id, hasar, saldiri, son_saldiri) VALUES (?, ?, ?, 1, ?)')
  .run(savasId, kullaniciId, hasar, Date.now() - SAAT);
const pozisyonYaz = (s, sembol, adet, kullaniciId = TEST_KULLANICI) => s.db
  .prepare('INSERT INTO hisse_pozisyonlari (guild_id, kullanici_id, sembol, adet, maliyet) VALUES (?, ?, ?, ?, ?)')
  .run(TEST_GUILD, kullaniciId, sembol, adet, adet * 100);
const haberYaz = (s, sembol, saat, yuzde = 12.5) => s.db
  .prepare('INSERT INTO hisse_haberleri (guild_id, sembol, saat, yuzde, metin) VALUES (?, ?, ?, ?, ?)')
  .run(TEST_GUILD, sembol, saat, yuzde, `${sembol} haberi`);

describe('web API: olaylar', () => {
  it('boş: boss yok, sonuç yok, haber yok', () => sunucuyla(async (s) => {
    assert.deepEqual(await olaylar(s), {
      boss: null, bossSonuc: null, duyurular: [], etkinlikler: [], haberler: [],
    });
  }));

  it('aktif boss: kimlik, ad, görsel, bitiş', () => sunucuyla(async (s) => {
    const savas = bossCikar(s.db, { guildId: TEST_GUILD, kimlik: 'lych', elit: true });
    const v = await olaylar(s);
    assert.equal(v.boss.id, savas.id);
    assert.equal(v.boss.ad, 'Elit Lych');
    assert.equal(v.boss.elit, true);
    assert.equal(v.boss.bitis, savas.bitis);
    assert.ok(v.boss.gorsel);
    assert.equal(v.bossSonuc, null);
  }));

  it('yenilen boss: son vuruşu yapanın ödülü ödenenle aynı', () => sunucuyla(async (s) => {
    const savas = bossCikar(s.db, { guildId: TEST_GUILD, kimlik: 'bloonarius', elit: false });
    s.db.prepare('UPDATE boss_savaslari SET can = 1 WHERE id = ?').run(savas.id);
    const saldiri = await s.istek('POST', '/api/boss/saldir', {});
    assert.equal(saldiri.veri.durum, 'yenildi');

    const v = await olaylar(s);
    assert.equal(v.boss, null);
    assert.deepEqual(
      { ...v.bossSonuc, gorsel: undefined },
      {
        id: savas.id, ad: 'Bloonarius', gorsel: undefined, elit: false, durum: 'yenildi', katilimci: 1,
        muz: KATILIM_MUZ + 2 * 1 + SON_VURUS_MUZ, hasar: 1, sira: 1, sonVurus: true, kasalar: ['kasa-ahsap', 'kasa-altin', 'kasa-demir'],
      },
    );
    assert.equal(v.bossSonuc.muz, saldiri.veri.odul.muz);
    assert.deepEqual(v.bossSonuc.kasalar, saldiri.veri.odul.kasalar);
  }));

  it('kaçan boss: katılana teselli, katılmayana sonuç yok', () => sunucuyla(async (s) => {
    const savas = bossCikar(s.db, { guildId: TEST_GUILD, kimlik: 'vortex', elit: false, simdi: Date.now() - SURE_MS - SAAT });
    hasarYaz(s, savas.id, TEST_DIGER, 900);
    hasarYaz(s, savas.id, TEST_KULLANICI, 400);
    assert.equal(sonuclandir(s.db, { savasId: savas.id }).durum, 'kacti');

    const v = await olaylar(s);
    assert.equal(v.bossSonuc.durum, 'kacti');
    assert.equal(v.bossSonuc.muz, TESELLI_MUZ);
    assert.deepEqual([v.bossSonuc.sira, v.bossSonuc.katilimci, v.bossSonuc.kasalar], [2, 2, []]);

    s.db.prepare('DELETE FROM boss_hasarlari WHERE kullanici_id = ?').run(TEST_KULLANICI);
    assert.equal((await olaylar(s)).bossSonuc, null);
  }));

  it('sonuç 24 saatten eskiyse bildirilmez', () => sunucuyla(async (s) => {
    const simdi = Date.now();
    const savas = bossCikar(s.db, { guildId: TEST_GUILD, kimlik: 'vortex', elit: false, simdi: simdi - SURE_MS - 30 * SAAT });
    hasarYaz(s, savas.id, TEST_KULLANICI, 400);
    sonuclandir(s.db, { savasId: savas.id, simdi: simdi - 25 * SAAT });
    const arg = { guildId: TEST_GUILD, kullaniciId: TEST_KULLANICI, simdi };
    assert.equal(sonSavasOdemesi(s.db, arg), null);
    assert.equal(sonSavasOdemesi(s.db, { ...arg, pencereMs: 26 * SAAT }).odeme.muz, TESELLI_MUZ);
  }));

  it('haber: yalnız elde tutulan hissenin son 1 saatteki haberi, adet ve fiyatla', () => sunucuyla(async (s) => {
    guncelle(s.db, { guildId: TEST_GUILD });
    const simdi = Date.now();
    pozisyonYaz(s, 'MUZC', 40);
    pozisyonYaz(s, 'DART', 0);
    pozisyonYaz(s, 'SMTK', 5, TEST_DIGER);
    haberYaz(s, 'MUZC', simdi - 10 * 60_000, -14.2);
    haberYaz(s, 'MUZC', simdi - 2 * SAAT); // eski
    haberYaz(s, 'DART', simdi - 5 * 60_000); // sattı (0 adet)
    haberYaz(s, 'SMTK', simdi - 4 * 60_000); // başkasının

    const { haberler } = await olaylar(s);
    assert.equal(haberler.length, 1);
    const [h] = haberler;
    assert.deepEqual([h.sembol, h.yuzde, h.adet, h.metin], ['MUZC', -14.2, 40, 'MUZC haberi']);
    assert.ok(h.ad && h.gorsel && h.fiyat > 0 && h.id > 0);
  }));
  it('etkin etkinlik: tür, ad, etki ve bitiş; yeniden başlatılırsa yeni kimlik', () => sunucuyla(async (s) => {
    const simdi = Date.now();
    etkinlikBaslat(s.db, { guildId: TEST_GUILD, tur: 'muz-2x', sureMs: 3_600_000, baslatanId: TEST_DIGER, simdi });
    const [e] = (await olaylar(s)).etkinlikler;
    assert.equal(e.tur, 'muz-2x');
    assert.equal(e.ad, '2x Muz');
    assert.equal(e.bitis, simdi + 3_600_000);
    assert.equal(e.id, `muz-2x-${simdi}`);
  }));
});
