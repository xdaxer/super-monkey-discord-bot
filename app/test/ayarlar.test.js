import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
  AYARLAR, BilinmeyenAyar, SISTEMLER,
  ayarGetir, ayarSecenekleri, ayarSifirla, ayarYaz, kanalListesiDegistir, sistemAcikMi, sistemAyarla, sunucuOzeti,
} from '../lib/ayarlar.js';
import { PermissionFlagsBits } from 'discord.js';

import { degerGoster, degerSec } from '../commands/yapilandirma/ayar.js';
import { loadCommands } from '../lib/commands.js';
import { acVeritabani } from '../lib/db.js';

const A = '111';
const B = '222';

describe('sunucuya özel ayarlar', () => {
  let db;
  beforeEach(() => { db = acVeritabani(':memory:'); });
  afterEach(() => db.close());

  it('ayarlanmamış anahtar varsayılanı döndürür', () => {
    assert.equal(ayarGetir(db, A, 'log.kanal'), null);
    assert.equal(ayarGetir(db, A, 'log.olay.mesajSil'), true);
  });

  it('yazılan değer geri okunur', () => {
    ayarYaz(db, A, 'log.kanal', '999');
    assert.equal(ayarGetir(db, A, 'log.kanal'), '999');
  });

  it('aynı anahtar iki kez yazılınca satır çoğalmaz, güncellenir', () => {
    ayarYaz(db, A, 'log.kanal', '1');
    ayarYaz(db, A, 'log.kanal', '2');

    const adet = db
      .prepare('SELECT COUNT(*) AS n FROM ayarlar WHERE guild_id = ? AND anahtar = ?')
      .get(A, 'log.kanal').n;

    assert.equal(adet, 1);
    assert.equal(ayarGetir(db, A, 'log.kanal'), '2');
  });

  it('sunucular birbirinden yalıtılmıştır', () => {
    ayarYaz(db, A, 'log.kanal', 'a-kanal');
    assert.equal(ayarGetir(db, B, 'log.kanal'), null);
  });

  it('sıfırlama varsayılana döndürür', () => {
    ayarYaz(db, A, 'karsilama.mesaj', 'özel');
    assert.equal(ayarSifirla(db, A, 'karsilama.mesaj'), AYARLAR['karsilama.mesaj'].varsayilan);
    assert.equal(ayarGetir(db, A, 'karsilama.mesaj'), AYARLAR['karsilama.mesaj'].varsayilan);
  });

  it('bilinmeyen anahtar reddedilir, sessizce uydurulmaz', () => {
    assert.throws(() => ayarGetir(db, A, 'olmayan.anahtar'), BilinmeyenAyar);
    assert.throws(() => ayarYaz(db, A, 'olmayan.anahtar', 1), BilinmeyenAyar);
  });

  it('bozuk JSON satırı komutu düşürmez, varsayılana düşer', () => {
    db.prepare('INSERT INTO ayarlar (guild_id, anahtar, deger, guncelleme) VALUES (?,?,?,?)')
      .run(A, 'log.kanal', '{bozuk', Date.now());

    assert.equal(ayarGetir(db, A, 'log.kanal'), null);
  });
});

describe('sistem aç/kapat', () => {
  let db;
  beforeEach(() => { db = acVeritabani(':memory:'); });
  afterEach(() => db.close());

  it('varsayılan durumlar tanımdan gelir', () => {
    assert.equal(sistemAcikMi(db, A, 'eglence'), SISTEMLER.eglence.varsayilan);
    assert.equal(sistemAcikMi(db, A, 'log'), SISTEMLER.log.varsayilan);
  });

  it('kapatılan sistem kapalı okunur', () => {
    sistemAyarla(db, A, 'eglence', false);
    assert.equal(sistemAcikMi(db, A, 'eglence'), false);
    assert.equal(sistemAcikMi(db, B, 'eglence'), true, 'diğer sunucu etkilenmemeli');
  });

  it('bilinmeyen sistem reddedilir', () => {
    assert.throws(() => sistemAyarla(db, A, 'olmayan', true), BilinmeyenAyar);
  });

  it('özet bütün sistemleri ve ayarları verir', () => {
    const ozet = sunucuOzeti(db, A);
    assert.equal(ozet.sistemler.length, Object.keys(SISTEMLER).length);
    assert.equal(ozet.ayarlar.length, Object.keys(AYARLAR).length);
  });

  it('ekonomi.kanallar varsayılanı boş listedir ve değiştirilemez', () => {
    assert.deepEqual(ayarGetir(db, A, 'ekonomi.kanallar'), []);
    assert.throws(() => ayarGetir(db, A, 'ekonomi.kanallar').push('x'), TypeError);
  });

  it('kanal listesine eklenir, yinelenen eklenmez, çıkarılır', () => {
    const k = 'ekonomi.kanallar';
    assert.deepEqual(kanalListesiDegistir(db, A, k, '10', 'ekle'), { ok: true, liste: ['10'], degisti: true });
    kanalListesiDegistir(db, A, k, '20', 'ekle');
    assert.deepEqual(kanalListesiDegistir(db, A, k, '10', 'ekle'), { ok: true, liste: ['10', '20'], degisti: false });
    assert.deepEqual(ayarGetir(db, A, k), ['10', '20']);

    assert.deepEqual(kanalListesiDegistir(db, A, k, '10', 'cikar'), { ok: true, liste: ['20'], degisti: true });
    assert.equal(kanalListesiDegistir(db, A, k, '77', 'cikar').degisti, false);
    assert.deepEqual(ayarGetir(db, B, k), [], 'diğer sunucu etkilenmemeli');
  });

  it('listeyi boşaltmak sınırı kaldırır; sıfırlama da boşaltır', () => {
    const k = 'ekonomi.kanallar';
    kanalListesiDegistir(db, A, k, '10', 'ekle');
    kanalListesiDegistir(db, A, k, '10', 'cikar');
    assert.deepEqual(ayarGetir(db, A, k), []);
    kanalListesiDegistir(db, A, k, '10', 'ekle');
    ayarSifirla(db, A, k);
    assert.deepEqual(ayarGetir(db, A, k), []);
  });

  it('liste dolunca ve liste olmayan ayarda ekleme reddedilir', () => {
    const k = 'ekonomi.kanallar';
    for (let i = 0; i < AYARLAR[k].azami; i += 1) kanalListesiDegistir(db, A, k, String(i), 'ekle');
    assert.equal(kanalListesiDegistir(db, A, k, 'fazla', 'ekle').ok, false);
    assert.equal(kanalListesiDegistir(db, A, 'log.kanal', '1', 'ekle').ok, false);
    assert.throws(() => kanalListesiDegistir(db, A, 'olmayan', '1', 'ekle'), BilinmeyenAyar);
  });

  it('/ayar ayarla liste ayarında listeyi tek kanala indirir; gösterim okunur', () => {
    const girdi = { kanal: '55', rol: null, metin: null, acik: null, sayi: null };
    assert.deepEqual(degerSec('ekonomi.kanallar', girdi), { ok: true, deger: ['55'] });
    assert.equal(degerSec('ekonomi.kanallar', { ...girdi, kanal: null }).ok, false);
    assert.equal(degerGoster(AYARLAR['ekonomi.kanallar'], ['1', '2']), '<#1> <#2>');
    assert.match(degerGoster(AYARLAR['ekonomi.kanallar'], []), /her yerde/);
  });

  it('kanal sınırından muaf ekonomi komutu kalmadı', async () => {
    // Muaf olan yalnız yönetici komutlarıydı; onlar artık kaydedilmiyor
    // (lib/arayuz-komut.js). Dosyalarında muaf işareti ve yetki sınırı duruyor.
    const komutlar = await loadCommands();
    const muaf = [...komutlar.values()].filter((k) => k.sistem === 'ekonomi' && k.kanalMuaf).map((k) => k.data.name);
    assert.deepEqual(muaf, []);
    const { data } = await import('../commands/ekonomi/ekonomi-yonet.js');
    assert.equal(data.default_member_permissions, String(PermissionFlagsBits.Administrator));
  });

  it('otomatik tamamlama türe göre süzülebilir', () => {
    assert.deepEqual(ayarSecenekleri('', 25, 'kanalListesi').map((s) => s.value), ['seviye.kanallar', 'ekonomi.kanallar']);
    assert.ok(ayarSecenekleri('ekonomi').some((s) => s.value === 'ekonomi.kanallar'));
  });
});
