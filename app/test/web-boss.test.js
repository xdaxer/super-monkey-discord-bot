import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ayarYaz } from '../lib/ayarlar.js';
import { bossCikar } from '../lib/boss.js';
import { bakiye, ekle, TURLER } from '../lib/ekonomi.js';
import { esyaEkle } from '../lib/envanter.js';
import { ESIK_TABAN } from '../lib/prestij.js';
import { KARTLAR } from '../lib/kasalar.js';
import { TEST_DIGER, TEST_GUILD, TEST_KULLANICI, testSunucusu } from '../web/test-yardimci.js';

const ver = (s, miktar, kullaniciId = TEST_KULLANICI) => ekle(s.db, {
  guildId: TEST_GUILD, kullaniciId, miktar, tur: TURLER.yonetici,
});
/** Emek geliri (/calis): hem bakiyeye hem prestij eşiğine sayılır. */
const emek = (s, miktar) => ekle(s.db, {
  guildId: TEST_GUILD, kullaniciId: TEST_KULLANICI, miktar, tur: TURLER.calis, simdi: Date.now() - 1000,
});
const cuzdan = (s, k = TEST_KULLANICI) => bakiye(s.db, TEST_GUILD, k);

async function sunucuyla(fn) {
  const s = await testSunucusu();
  try {
    await fn(s);
  } finally {
    await s.kapat();
  }
}

const bossCagir = (s, secenek = {}) => bossCikar(s.db, { guildId: TEST_GUILD, kimlik: 'bloonarius', elit: false, ...secenek });

describe('web API: boss', () => {
  it('GET aktif boss yokken sonraki çıkışı döner', () => sunucuyla(async (s) => {
    const { durum, veri } = await s.istek('GET', '/api/boss');
    assert.equal(durum, 200);
    assert.equal(veri.aktif, false);
    assert.ok(veri.sonrakiCikis > Date.now());
  }));

  it('boss yokken saldırı reddedilir', () => sunucuyla(async (s) => {
    const r = await s.istek('POST', '/api/boss/saldir', {});
    assert.equal(r.durum, 400);
    assert.match(r.veri.sebep, /aktif bir boss yok/);
  }));

  it('GET aktif boss: görsel, can, sıralama, kendi durumum ve kart gücü', () => sunucuyla(async (s) => {
    const savas = bossCagir(s, { elit: true });
    const kart = KARTLAR.find((k) => k.nadirlik === 'nadir');
    esyaEkle(s.db, TEST_GUILD, TEST_KULLANICI, kart.kimlik, 1);

    const g = await s.istek('GET', '/api/boss');
    assert.equal(g.durum, 200);
    assert.equal(g.veri.aktif, true);
    assert.equal(g.veri.ad, 'Elit Bloonarius');
    assert.equal(g.veri.elit, true);
    assert.equal(g.veri.can, savas.max_can);
    assert.equal(g.veri.maxCan, savas.max_can);
    assert.ok(g.veri.bitis > Date.now());
    assert.ok(g.veri.gorsel.metin);
    assert.deepEqual(g.veri.siralama, []);
    assert.equal(g.veri.ben.hasar, 0);
    assert.equal(g.veri.ben.sira, null);
    assert.equal(g.veri.sonrakiSaldiri, 0);
    assert.equal(g.veri.guc, 25);
  }));

  it('saldır: hasar yazılır, sıralama dolar, ikinci saldırı dinlenme hatası verir', () => sunucuyla(async (s) => {
    const savas = bossCagir(s);
    const r = await s.istek('POST', '/api/boss/saldir', {});
    assert.equal(r.durum, 200);
    assert.ok(r.veri.hasar >= 1);
    assert.equal(typeof r.veri.kritik, 'boolean');
    assert.equal(r.veri.can, savas.max_can - r.veri.hasar);
    assert.equal(r.veri.sonVurus, false);
    assert.equal(r.veri.bitti, false);
    assert.ok(r.veri.sonrakiSaldiri > Date.now());

    const tekrar = await s.istek('POST', '/api/boss/saldir', {});
    assert.equal(tekrar.durum, 400);
    assert.match(tekrar.veri.sebep, /dinleniyorsun/);
    assert.match(tekrar.veri.sebep, /\d/);

    // Başka üye de vurabilir; sıralama hasara göre.
    assert.equal((await s.digerIstek('POST', '/api/boss/saldir', {})).durum, 200);
    const g = await s.istek('GET', '/api/boss');
    assert.equal(g.veri.siralama.length, 2);
    assert.ok(g.veri.siralama[0].hasar >= g.veri.siralama[1].hasar);
    assert.deepEqual(g.veri.siralama.map((x) => x.sira), [1, 2]);
    assert.ok([TEST_KULLANICI, TEST_DIGER].includes(g.veri.siralama[0].uye.id));
    assert.ok(g.veri.siralama[0].uye.ad);
    assert.equal(g.veri.ben.hasar, r.veri.hasar);
    assert.equal(g.veri.ben.katilimci, 2);
    assert.ok(g.veri.sonrakiSaldiri > Date.now());
  }));

  it('Discord mesajı güncellenemese de (sahte istemci) saldırı başarılı olur', () => sunucuyla(async (s) => {
    const savas = bossCagir(s);
    s.db.prepare('UPDATE boss_savaslari SET kanal_id = ?, mesaj_id = ? WHERE id = ?').run('1', '2', savas.id);
    s.istemci.channels = { fetch: async () => { throw new Error('Kanal yok'); } };
    const r = await s.istek('POST', '/api/boss/saldir', {});
    assert.equal(r.durum, 200);
  }));

  it('son vuruş: boss yenilir, ödül ve bakiye yanıtta gelir', () => sunucuyla(async (s) => {
    const savas = bossCagir(s);
    s.db.prepare('UPDATE boss_savaslari SET can = 1 WHERE id = ?').run(savas.id);
    const once = cuzdan(s);

    const r = await s.istek('POST', '/api/boss/saldir', {});
    assert.equal(r.durum, 200);
    assert.equal(r.veri.hasar, 1);
    assert.equal(r.veri.sonVurus, true);
    assert.equal(r.veri.bitti, true);
    assert.equal(r.veri.durum, 'yenildi');
    assert.equal(r.veri.can, 0);
    assert.equal(r.veri.odul.sira, 1);
    assert.equal(r.veri.odul.sonVurus, true);
    assert.ok(r.veri.odul.muz > 1000);
    assert.ok(r.veri.bakiye >= once + r.veri.odul.muz);
    assert.equal(r.veri.bakiye, cuzdan(s));

    assert.equal((await s.istek('GET', '/api/boss')).veri.aktif, false);
    assert.equal((await s.istek('POST', '/api/boss/saldir', {})).durum, 400);
  }));
});

describe('web API: prestij', () => {
  it('GET durumu, sıfırlananları, korunanları ve çarpanı döner', () => sunucuyla(async (s) => {
    emek(s, 250_000);
    const { durum, veri } = await s.istek('GET', '/api/prestij');
    assert.equal(durum, 200);
    assert.equal(veri.seviye, 0);
    assert.equal(veri.carpan, 1);
    assert.equal(veri.enUst, false);
    assert.equal(veri.esik, ESIK_TABAN);
    assert.equal(veri.emek, 250_000);
    assert.equal(veri.sonrakiCarpan, 1.2);
    assert.equal(veri.odulKasa.kimlik, 'kasa-demir');
    assert.equal(veri.bakiye, 250_000);
    assert.equal(veri.ciftlikDevri, 0);
    assert.deepEqual(veri.engeller, []);
    assert.equal(veri.maksPrestij, 10);
    assert.equal(veri.carpanYuzde, 20);
    assert.ok(veri.sifirlanacaklar.some((x) => x.kod === 'kartlar'));
    assert.ok(veri.devredilenler.length > 0);
    assert.ok(veri.korunanlar.length >= 4);
  }));

  it('emek geliri eşiğe ulaşmadan prestij reddedilir, hiçbir şey değişmez', () => sunucuyla(async (s) => {
    emek(s, 50_000);
    ver(s, 900_000); // yönetici/kumar muzu eşiğe sayılmaz
    const r = await s.istek('POST', '/api/prestij/yap', { beklenenSeviye: 0 });
    assert.equal(r.durum, 400);
    assert.match(r.veri.sebep, /hazır değilsin/);
    assert.equal(cuzdan(s), 950_000);
    assert.equal((await s.istek('GET', '/api/prestij')).veri.seviye, 0);
  }));

  it('beklenenSeviye eksik, geçersiz ya da eski ise reddedilir', () => sunucuyla(async (s) => {
    emek(s, 3_000_000);
    assert.equal((await s.istek('POST', '/api/prestij/yap', {})).durum, 400);
    assert.equal((await s.istek('POST', '/api/prestij/yap', { beklenenSeviye: 99 })).durum, 400);
    const eski = await s.istek('POST', '/api/prestij/yap', { beklenenSeviye: 3 });
    assert.equal(eski.durum, 400);
    assert.match(eski.veri.sebep, /değişmiş/);
    assert.equal(cuzdan(s), 3_000_000);
  }));

  it('engel varken (mevduat) prestij yapılamaz', () => sunucuyla(async (s) => {
    emek(s, 3_000_000);
    assert.equal((await s.istek('POST', '/api/banka/yatir', { miktar: '5000', vade: '12sa' })).durum, 200);
    const g = await s.istek('GET', '/api/prestij');
    assert.equal(g.veri.engeller.length, 1);
    assert.match(g.veri.engeller[0], /mevduat/);
    const r = await s.istek('POST', '/api/prestij/yap', { beklenenSeviye: 0 });
    assert.equal(r.durum, 400);
    assert.match(r.veri.sebep, /mevduat/);
  }));

  it('başarılı prestij: bakiye ve kartlar sıfırlanır, kasa verilir, çarpan artar, rol verilir', () => sunucuyla(async (s) => {
    emek(s, 1_500_000);
    const kart = KARTLAR[0];
    esyaEkle(s.db, TEST_GUILD, TEST_KULLANICI, kart.kimlik, 2);

    // Prestij 1 rolü kurulu ve botun düzenleyebildiği bir rol.
    const guild = s.istemci.guild;
    const uye = guild.members.cache.get(TEST_KULLANICI);
    uye.guild = guild;
    guild.roles.cache.set('555', { id: '555', editable: true });
    ayarYaz(s.db, TEST_GUILD, 'prestij.rol.1', '555');

    const r = await s.istek('POST', '/api/prestij/yap', { beklenenSeviye: 0 });
    assert.equal(r.durum, 200);
    assert.equal(r.veri.seviye, 1);
    assert.equal(r.veri.carpan, 1.2);
    assert.equal(r.veri.kasa.kimlik, 'kasa-demir');
    assert.deepEqual(r.veri.devir, { ciftlik: 0, muz: 0 });
    assert.equal(r.veri.bakiye, cuzdan(s));
    assert.equal(r.veri.ozet.find((o) => o.kod === 'bakiye').miktar, 1_500_000);
    assert.equal(r.veri.ozet.find((o) => o.kod === 'kartlar').miktar, 2);
    assert.ok(uye.roles.cache.has('555'));

    const g = await s.istek('GET', '/api/prestij');
    assert.equal(g.veri.seviye, 1);
    assert.equal(g.veri.esik, 2 * ESIK_TABAN);
    assert.equal(g.veri.emek, 0);
    // Aynı onay ikinci kez geçerli değil.
    assert.equal((await s.istek('POST', '/api/prestij/yap', { beklenenSeviye: 0 })).durum, 400);
  }));

  it('rol kurulu değilse de prestij yazılır', () => sunucuyla(async (s) => {
    emek(s, 1_000_000);
    const r = await s.istek('POST', '/api/prestij/yap', { beklenenSeviye: 0 });
    assert.equal(r.durum, 200);
    assert.equal(r.veri.seviye, 1);
  }));
});
