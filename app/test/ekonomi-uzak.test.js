import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { acVeritabani } from '../lib/db.js';
import { bakiye, ekle, gonder, TURLER } from '../lib/ekonomi.js';
import {
  UZAK_AKTARIM_SEBEBI, uzakKimlikler, uzakMi, uzaklastir, uzaklastirma, uzaklastirmaKaldir, uzaklastirmaListesi,
} from '../lib/ekonomi-uzak.js';
import { uzakYaniti } from '../lib/ekonomi-uzak-bilesen.js';
import { esyaEkle } from '../lib/envanter.js';
import { createInteractionHandler } from '../lib/interactions.js';
import { hediyeEt } from '../lib/kasalar.js';
import { sesXpVer, siralama as xpSiralamasi, xpVer } from '../lib/seviye.js';
import { siralama } from '../lib/siralamalar.js';
import { PANEL_BUTON } from '../lib/talep.js';
import { teklifOlustur } from '../lib/takas.js';
import {
  sahteIstemci, sahteUye, TEST_DIGER, TEST_GUILD, TEST_KULLANICI, testSunucusu,
} from '../web/test-yardimci.js';

const G = 'g1';
const [A, B, Y] = ['111', '222', '999'];

function hazir() {
  return acVeritabani(':memory:');
}
const uzak = (db, k = A, ek = {}) => uzaklastir(db, {
  guildId: G, kullaniciId: k, sebep: 'Yan hesapla aktarım', yetkiliId: Y, yetkililer: [], ...ek,
});

describe('uzaklaştırma kaydı', () => {
  it('ekler, sebebi günceller, listeler ve kaldırır', () => {
    const db = hazir();
    assert.equal(uzakMi(db, G, A), false);
    assert.deepEqual(uzak(db), { ok: true, yeni: true });
    assert.deepEqual(uzak(db, A, { sebep: 'Yeni sebep' }), { ok: true, yeni: false });
    assert.equal(uzaklastirma(db, G, A).sebep, 'Yeni sebep');
    assert.deepEqual(uzakKimlikler(db, G), [A]);
    assert.equal(uzaklastirmaListesi(db, G).length, 1);
    assert.equal(uzakMi(db, 'baska-sunucu', A), false);
    assert.deepEqual(uzaklastirmaKaldir(db, { guildId: G, kullaniciId: A }), { ok: true });
    assert.equal(uzaklastirmaKaldir(db, { guildId: G, kullaniciId: A }).ok, false);
    assert.equal(uzakMi(db, G, A), false);
  });

  it('sebepsiz, kendini ve yetkilileri uzaklaştırmaz', () => {
    const db = hazir();
    assert.match(uzak(db, A, { sebep: '  ' }).sebep, /sebebi/);
    assert.match(uzak(db, Y).sebep, /Kendini/);
    assert.match(uzak(db, A, { yetkililer: [A] }).sebep, /sahibi/);
    assert.match(uzak(db, A, { sebep: 'x'.repeat(501) }).sebep, /500/);
    assert.equal(uzakMi(db, G, A), false);
  });
});

describe('uzaklaştırılan üye', () => {
  it('mesaj ve ses XP kazanmaz', () => {
    const db = hazir();
    uzak(db);
    assert.equal(xpVer(db, { guildId: G, kullaniciId: A, rastgele: () => 0 }).verildi, false);
    assert.equal(sesXpVer(db, { guildId: G, kullaniciId: A, rastgele: () => 0 }).verildi, false);
    assert.equal(xpVer(db, { guildId: G, kullaniciId: B, rastgele: () => 0 }).verildi, true);
  });

  it('muz gönderemez ve alamaz; hediye ve takas da yok', () => {
    const db = hazir();
    ekle(db, { guildId: G, kullaniciId: A, miktar: 5000, tur: TURLER.yonetici });
    ekle(db, { guildId: G, kullaniciId: B, miktar: 5000, tur: TURLER.yonetici });
    esyaEkle(db, G, B, 'kasa-ahsap', 1);
    uzak(db);
    const g = (gonderenId, aliciId) => gonder(db, {
      guildId: G, gonderenId, aliciId, miktar: 100, seviye: 10,
    });
    assert.equal(g(A, B).sebep, UZAK_AKTARIM_SEBEBI);
    assert.equal(g(B, A).sebep, UZAK_AKTARIM_SEBEBI);
    assert.equal(bakiye(db, G, A), 5000);
    assert.equal(hediyeEt(db, {
      guildId: G, gonderenId: B, aliciId: A, kimlik: 'kasa-ahsap', yoneticiler: [],
    }).sebep, UZAK_AKTARIM_SEBEBI);
    assert.equal(teklifOlustur(db, {
      guildId: G, tekliEdenId: B, karsiId: A, muzVer: 100, yoneticiler: [],
    }).sebep, UZAK_AKTARIM_SEBEBI);
  });

  it('muz ve XP sıralamalarında görünmez', () => {
    const db = hazir();
    ekle(db, { guildId: G, kullaniciId: A, miktar: 9000, tur: TURLER.yonetici });
    ekle(db, { guildId: G, kullaniciId: B, miktar: 100, tur: TURLER.yonetici });
    xpVer(db, { guildId: G, kullaniciId: A, rastgele: () => 0 });
    xpVer(db, { guildId: G, kullaniciId: B, rastgele: () => 0 });
    uzak(db);
    assert.deepEqual(siralama(db, G, 'muz', { haric: [] }).map((s) => s.kullanici_id), [B]);
    assert.deepEqual(xpSiralamasi(db, G, 10, []).map((s) => s.kullanici_id), [B]);
  });
});

describe('Discord: komut ve bileşen engeli', () => {
  function sahte({ komut = null, customId = null } = {}) {
    const yanitlar = [];
    return {
      yanitlar,
      guildId: G,
      user: { id: A },
      commandName: komut,
      customId,
      replied: false,
      deferred: false,
      isChatInputCommand: () => komut !== null,
      isButton: () => customId !== null,
      reply: async (o) => { yanitlar.push(o); },
      followUp: async (o) => { yanitlar.push(o); },
    };
  }

  it('ekonomi komutu ve ekonomi butonu çalışmaz, sebep ve talep butonu gelir; diğerleri çalışır', async () => {
    const db = hazir();
    uzak(db);
    const calisan = [];
    const komutlar = new Map([
      ['gunluk', { sistem: 'ekonomi', execute: async () => { calisan.push('gunluk'); } }],
      ['ping', { sistem: null, execute: async () => { calisan.push('ping'); } }],
    ]);
    const isle = createInteractionHandler(komutlar, { error() {} }, {
      uzakKontrol: (i) => uzakYaniti(db, i),
      bilesenler: [
        { eslesir: (i) => i.customId === 'kasa:ac', calistir: async () => { calisan.push('kasa'); }, ekonomi: true },
        { eslesir: (i) => i.customId === 'cekilis:katil', calistir: async () => { calisan.push('cekilis'); } },
      ],
    });

    const gunluk = sahte({ komut: 'gunluk' });
    await isle(gunluk);
    await isle(sahte({ komut: 'ping' }));
    const kasa = sahte({ customId: 'kasa:ac' });
    await isle(kasa);
    await isle(sahte({ customId: 'cekilis:katil' }));

    assert.deepEqual(calisan, ['ping', 'cekilis']);
    assert.match(gunluk.yanitlar[0].content, /uzaklaştırıldın[\s\S]*Yan hesapla aktarım/);
    assert.equal(gunluk.yanitlar[0].components[0].components[0].data.custom_id, PANEL_BUTON);
    assert.match(kasa.yanitlar[0].content, /uzaklaştırıldın/);
  });
});

describe('web API', () => {
  const yoneticiIstemci = () => sahteIstemci([
    sahteUye(TEST_KULLANICI, 'Test', { yonetici: true }), sahteUye(TEST_DIGER, 'Diger'),
  ]);

  async function sunucuyla(fn) {
    const s = await testSunucusu({ istemci: yoneticiIstemci() });
    try {
      await fn(s);
    } finally {
      await s.kapat();
    }
  }

  it('uzaklaştırılan üye ekonomi rotalarında 403 + kod alır; /api/ben uzaklaştırmayı söyler', () => sunucuyla(async (s) => {
    uzaklastir(s.db, {
      guildId: TEST_GUILD, kullaniciId: TEST_DIGER, sebep: 'Test sebebi', yetkiliId: TEST_KULLANICI, yetkililer: [],
    });
    const ozet = await s.digerIstek('GET', '/api/ozet');
    assert.equal(ozet.durum, 403);
    assert.equal(ozet.veri.kod, 'ekonomi-uzak');
    assert.equal(ozet.veri.uzak.sebep, 'Test sebebi');
    assert.equal((await s.digerIstek('POST', '/api/gunluk', {})).durum, 403);
    const ben = await s.digerIstek('GET', '/api/ben');
    assert.equal(ben.durum, 200);
    assert.equal(ben.veri.uzak.sebep, 'Test sebebi');
    // Diğer üye etkilenmez.
    assert.equal((await s.istek('GET', '/api/ozet')).durum, 200);
    assert.equal((await s.istek('GET', '/api/ben')).veri.uzak, null);
  }));

  it('yönetici uzaklaştırır, listeler, kaldırır; yönetici olmayan giremez', () => sunucuyla(async (s) => {
    assert.equal((await s.digerIstek('GET', '/api/yonetim/uzaklastirma')).durum, 403);
    assert.equal((await s.istek('POST', '/api/yonetim/uzaklastir', { uyeId: TEST_DIGER })).durum, 400);
    const r = await s.istek('POST', '/api/yonetim/uzaklastir', { uyeId: TEST_DIGER, sebep: 'Alt hesap' });
    assert.equal(r.durum, 200);
    assert.equal(r.veri.yeni, true);
    const l = await s.istek('GET', '/api/yonetim/uzaklastirma');
    assert.deepEqual(l.veri.liste.map((k) => [k.uye.id, k.sebep, k.yetkili.id]), [[TEST_DIGER, 'Alt hesap', TEST_KULLANICI]]);
    assert.equal((await s.digerIstek('GET', '/api/ozet')).durum, 403);
    assert.equal((await s.istek('POST', '/api/yonetim/uzaklastirma-kaldir', { uyeId: TEST_DIGER })).durum, 200);
    assert.equal((await s.digerIstek('GET', '/api/ozet')).durum, 200);
  }));
});
