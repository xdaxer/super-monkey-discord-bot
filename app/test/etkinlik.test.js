import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { acVeritabani } from '../lib/db.js';
import { bakiye, ekle, gunlukAl, mesajOdulu, TURLER } from '../lib/ekonomi.js';
import {
  aktifEtkinlikler, etkinlikAktifMi, etkinlikBaslat, etkinlikBitir, etkinlikCarpani, etkinlikFiyati, etkinlikGecmisi,
  seviyeKasasiEtkinlikli, SURE_MAX_MS, SURE_MIN_MS,
} from '../lib/etkinlik.js';
import { adet } from '../lib/envanter.js';
import { esyaGetir, esyaSatinAl } from '../lib/esyalar.js';
import { seviyeKasasi } from '../lib/kasalar.js';

const G = 'g1';
const A = '100';
const DK = 60_000;
const SA = 3_600_000;
const T0 = Date.parse('2026-01-05T12:00:00+03:00');

const db = () => acVeritabani(':memory:');
const baslat = (v, tur, sureMs = SA, simdi = T0) => etkinlikBaslat(v, {
  guildId: G, tur, sureMs, baslatanId: 'y1', simdi,
});
/** Hep en alttaki değeri veren rastgelelik: günlük taban 200, mesaj 1. */
const enAlt = () => 0;

describe('etkinlik yaşam döngüsü', () => {
  it('başlatır, süreyi günceller, bitirir', () => {
    const v = db();
    const ilk = baslat(v, 'muz-2x');
    assert.deepEqual([ilk.ok, ilk.guncellendi, ilk.bitis], [true, false, T0 + SA]);
    assert.equal(etkinlikAktifMi(v, G, 'muz-2x', T0 + 1), true);

    const ikinci = baslat(v, 'muz-2x', 2 * SA, T0 + 10 * DK);
    assert.deepEqual([ikinci.guncellendi, ikinci.bitis], [true, T0 + 10 * DK + 2 * SA]);
    assert.equal(aktifEtkinlikler(v, G, T0 + 10 * DK).length, 1);

    assert.equal(etkinlikBitir(v, G, 'muz-2x', T0 + 11 * DK), true);
    assert.equal(etkinlikAktifMi(v, G, 'muz-2x', T0 + 11 * DK), false);
    assert.equal(etkinlikBitir(v, G, 'muz-2x', T0 + 11 * DK), false);
  });

  it('farklı türler aynı anda etkin olabilir; sunucular ayrı', () => {
    const v = db();
    baslat(v, 'muz-2x');
    baslat(v, 'xp-2x');
    assert.deepEqual(aktifEtkinlikler(v, G, T0).map((e) => e.tur).sort(), ['muz-2x', 'xp-2x']);
    assert.equal(aktifEtkinlikler(v, 'g2', T0).length, 0);
  });

  it('süre sınırları ve bilinmeyen tür', () => {
    const v = db();
    assert.equal(baslat(v, 'muz-2x', 10 * DK - 1).ok, false);
    assert.equal(baslat(v, 'muz-2x', SURE_MAX_MS + 1).ok, false);
    assert.equal(baslat(v, 'muz-2x', SURE_MIN_MS).ok, true);
    assert.equal(baslat(v, 'xp-2x', SURE_MAX_MS).ok, true);
    assert.equal(baslat(v, 'yok').ok, false);
    assert.equal(aktifEtkinlikler(v, G, T0).length, 2);
  });

  it('süresi geçmiş etkinlik etkisiz', () => {
    const v = db();
    baslat(v, 'muz-2x', SA);
    assert.equal(etkinlikAktifMi(v, G, 'muz-2x', T0 + SA - 1), true);
    assert.equal(etkinlikAktifMi(v, G, 'muz-2x', T0 + SA), false);
    assert.equal(etkinlikCarpani(v, G, 'muz-2x', T0 + SA), 1);
    assert.equal(aktifEtkinlikler(v, G, T0 + SA).length, 0);
    assert.equal(etkinlikBitir(v, G, 'muz-2x', T0 + SA), false);
  });
});

describe('etkinlik geçmişi', () => {
  it('başlatma satır açar, uzatma son satırı uzatır, erken bitirme bitişi çeker', () => {
    const v = db();
    baslat(v, 'muz-2x');
    baslat(v, 'muz-2x', 2 * SA, T0 + 10 * DK);
    baslat(v, 'xp-2x', SA, T0 + 20 * DK);
    etkinlikBitir(v, G, 'xp-2x', T0 + 30 * DK);
    // Süresi dolduktan sonra yeniden başlatma yeni satırdır.
    baslat(v, 'muz-2x', SA, T0 + 5 * SA);
    assert.deepEqual(etkinlikGecmisi(v, G).map((e) => [e.tur, e.baslangic, e.bitis, e.erken]), [
      ['muz-2x', T0 + 5 * SA, T0 + 6 * SA, false],
      ['xp-2x', T0 + 20 * DK, T0 + 30 * DK, true],
      ['muz-2x', T0, T0 + 10 * DK + 2 * SA, false],
    ]);
    assert.equal(etkinlikGecmisi(v, G, { baslangic: T0 + 4 * SA, bitis: T0 + 7 * SA }).length, 1);
    assert.equal(etkinlikGecmisi(v, G, { limit: 1 }).length, 1);
  });
});

describe('muz ve XP çarpanı', () => {
  it('günlük ödül muz kısmı 2 kat, kasalar aynı', () => {
    const v = db();
    const ilk = gunlukAl(v, { guildId: G, kullaniciId: A, simdi: T0, rastgele: enAlt });
    assert.equal(ilk.etkinlik, false);

    baslat(v, 'muz-2x');
    const cift = gunlukAl(v, { guildId: G, kullaniciId: 'b', simdi: T0, rastgele: enAlt });
    assert.equal(cift.etkinlik, true);
    assert.equal(cift.toplam, ilk.toplam * 2);
    assert.equal(bakiye(v, G, 'b'), ilk.toplam * 2);
    assert.deepEqual(cift.kasalar, ilk.kasalar);
  });

  it('sohbet muzu etkinlikle ve Muz Çiftliği ile çarpılır (6x)', () => {
    const v = db();
    baslat(v, 'muz-2x');
    const carpan = 3 * etkinlikCarpani(v, G, 'muz-2x', T0);
    assert.equal(carpan, 6);
    assert.equal(mesajOdulu(v, { guildId: G, kullaniciId: A, simdi: T0, rastgele: enAlt, carpan }), 6);
  });

  it('xp-2x yalnız XP çarpanını açar; muz çarpanı 1 kalır', () => {
    const v = db();
    baslat(v, 'xp-2x');
    assert.equal(etkinlikCarpani(v, G, 'xp-2x', T0), 2);
    assert.equal(etkinlikCarpani(v, G, 'muz-2x', T0), 1);
    assert.equal(etkinlikCarpani(v, G, 'kasa-indirim', T0), 1);
  });
});

describe('kasa indirimi', () => {
  it('yalnız kasalar %25 indirimli; yuvarlama aşağı', () => {
    const v = db();
    const ahsap = esyaGetir('kasa-ahsap');
    const iksir = esyaGetir('xp-iksiri');
    assert.equal(etkinlikFiyati(v, G, ahsap, T0).fiyat, 1200);

    baslat(v, 'kasa-indirim');
    assert.deepEqual(etkinlikFiyati(v, G, ahsap, T0), { fiyat: 900, eski: 1200, indirimli: true });
    assert.equal(etkinlikFiyati(v, G, esyaGetir('kasa-elmas'), T0).fiyat, 22_500);
    assert.equal(etkinlikFiyati(v, G, iksir, T0).fiyat, 6000);
    assert.equal(etkinlikFiyati(v, G, esyaGetir('kasa-gunluk'), T0).fiyat, null);
    assert.equal(etkinlikFiyati(v, G, ahsap, T0 + SA).fiyat, 1200);
  });

  it('satın almada indirimli fiyat düşülür, süre bitince tam fiyat', () => {
    const v = db();
    ekle(v, { guildId: G, kullaniciId: A, miktar: 10_000, tur: TURLER.yonetici, simdi: T0 });
    baslat(v, 'kasa-indirim');

    const al = esyaSatinAl(v, { guildId: G, kullaniciId: A, kimlik: 'kasa-ahsap', adet: 2, simdi: T0 });
    assert.equal(al.ok, true);
    assert.equal(al.odenen, 1800);
    assert.equal(bakiye(v, G, A), 8200);
    assert.equal(adet(v, G, A, 'kasa-ahsap'), 2);

    const sonra = esyaSatinAl(v, { guildId: G, kullaniciId: A, kimlik: 'kasa-ahsap', simdi: T0 + SA });
    assert.equal(sonra.odenen, 1200);
    // Takviye indirimden etkilenmez.
    const iksir = esyaSatinAl(v, { guildId: G, kullaniciId: A, kimlik: 'xp-iksiri', simdi: T0 });
    assert.equal(iksir.odenen, 6000);
  });
});

describe('seviye kasası', () => {
  it('bir üst sınıf; Elmas aynı; etkinlik yokken değişmez', () => {
    const v = db();
    assert.equal(seviyeKasasiEtkinlikli(v, G, 'kasa-ahsap', T0), 'kasa-ahsap');

    baslat(v, 'seviye-kasa');
    const sonuc = [1, 2, 5, 10, 25].map((sv) => seviyeKasasiEtkinlikli(v, G, seviyeKasasi(sv), T0));
    assert.deepEqual(sonuc, ['kasa-ahsap', 'kasa-demir', 'kasa-altin', 'kasa-elmas', 'kasa-elmas']);
    assert.equal(seviyeKasasiEtkinlikli(v, G, 'kasa-ahsap', T0 + SA), 'kasa-ahsap');
  });
});

describe('/ekonomi-etkinlik', () => {
  it('yalnız Yönetici yetkisine açık; kullanılırsa reddeder', async () => {
    const { data, execute } = await import('../commands/ekonomi/ekonomi-etkinlik.js');
    const { PermissionFlagsBits, PermissionsBitField } = await import('discord.js');
    const json = data.toJSON();
    assert.equal(json.default_member_permissions, String(PermissionFlagsBits.Administrator));
    assert.deepEqual(json.options.map((o) => o.name), ['baslat', 'durum', 'bitir']);

    let yanit;
    await execute({
      memberPermissions: new PermissionsBitField([PermissionFlagsBits.ManageGuild]),
      reply: async (y) => { yanit = y; },
    });
    assert.match(yanit.content, /Yönetici/);
  });
});
