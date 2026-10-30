import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { acVeritabani } from '../lib/db.js';
import { bakiye } from '../lib/ekonomi.js';
import { adet, envanter, esyaDus, esyaEkle } from '../lib/envanter.js';
import { KARTLAR, kartSat } from '../lib/kasalar.js';
import {
  alinanSetler, ilerlemeCubugu, odulDegeri, odulMetni, setDegeri, setDurumlari, SETLER, setGetir, setIlerlemesi,
  setOduluAl,
} from '../lib/setler.js';
import { setButonAyristir, setButonId } from '../lib/set-bilesen.js';

const G = 'g1';
const A = '100';
const B = '200';

function kartVer(db, kullanici, set) {
  for (const k of set.kartlar) esyaEkle(db, G, kullanici, k);
}

describe('set tanımları', () => {
  it('her kart tam bir temalı sete girer', () => {
    for (const kart of KARTLAR) {
      const girdigi = SETLER.filter((s) => s.tur === 'tema' && s.kartlar.includes(kart.kimlik));
      assert.equal(girdigi.length, 1, kart.kimlik);
    }
  });

  it('her nadirlik için bir set var ve kartları o nadirlikten', () => {
    for (const nadirlik of ['siradan', 'nadir', 'destansi', 'efsanevi', 'mitik']) {
      const set = setGetir(`nadirlik-${nadirlik}`);
      assert.ok(set);
      assert.deepEqual(set.kartlar, KARTLAR.filter((k) => k.nadirlik === nadirlik).map((k) => k.kimlik));
    }
  });

  it('kimlikler benzersiz, kartlar geçerli, ödül kasaları var', () => {
    assert.equal(new Set(SETLER.map((s) => s.kimlik)).size, SETLER.length);
    const kimlikler = new Set(KARTLAR.map((k) => k.kimlik));
    for (const s of SETLER) {
      assert.ok(s.kartlar.every((k) => kimlikler.has(k)), s.kimlik);
      assert.ok(odulDegeri(s.odul) > 0);
    }
  });

  it('ödül, set değerinin makul bir oranında kalır', () => {
    for (const s of SETLER) {
      const oran = odulDegeri(s.odul) / setDegeri(s);
      assert.ok(oran > 0.15 && oran < 0.6, `${s.kimlik} ${oran}`);
    }
  });
});

describe('ilerleme', () => {
  it('çubuk: tamamlanmadıkça dolmaz, örnek 12/17', () => {
    assert.equal(ilerlemeCubugu(12, 17), '▰▰▰▰▱');
    assert.equal(ilerlemeCubugu(0, 17), '▱▱▱▱▱');
    assert.equal(ilerlemeCubugu(16, 17), '▰▰▰▰▱');
    assert.equal(ilerlemeCubugu(17, 17), '▰▰▰▰▰');
    assert.equal(ilerlemeCubugu(1, 63), '▰▱▱▱▱');
  });

  it('setIlerlemesi yalnız sahip olunan kartları sayar', () => {
    const set = setGetir('kahramanlar');
    const r = setIlerlemesi({ 'kart-quincy': 3, 'kart-obyn': 1, 'kart-ace': 5 }, set);
    assert.deepEqual(r, { sahip: 2, toplam: 17, tamam: false });
  });
});

describe('set ödülü', () => {
  it('tamamlanmamış sette ödül verilmez', () => {
    const db = acVeritabani(':memory:');
    esyaEkle(db, G, A, 'kart-quincy');
    const s = setOduluAl(db, { guildId: G, kullaniciId: A, setKimligi: 'kahramanlar' });
    assert.equal(s.ok, false);
    assert.match(s.sebep, /1\/17/);
    assert.equal(bakiye(db, G, A), 0);
  });

  it('bilinmeyen set reddedilir', () => {
    const db = acVeritabani(':memory:');
    assert.equal(setOduluAl(db, { guildId: G, kullaniciId: A, setKimligi: 'yok' }).ok, false);
  });

  it('tamamlanınca muz ve kasa verilir, ikinci kez verilmez', () => {
    const db = acVeritabani(':memory:');
    const set = setGetir('kahramanlar');
    kartVer(db, A, set);
    const durum = setDurumlari(db, G, A).find((d) => d.set.kimlik === 'kahramanlar');
    assert.equal(durum.alinabilir, true);

    const s = setOduluAl(db, { guildId: G, kullaniciId: A, setKimligi: 'kahramanlar' });
    assert.equal(s.ok, true);
    assert.equal(bakiye(db, G, A), set.odul.muz);
    assert.equal(adet(db, G, A, 'kasa-altin'), 1);
    assert.ok(alinanSetler(db, G, A).has('kahramanlar'));

    const tekrar = setOduluAl(db, { guildId: G, kullaniciId: A, setKimligi: 'kahramanlar' });
    assert.equal(tekrar.ok, false);
    assert.equal(bakiye(db, G, A), set.odul.muz);
    assert.equal(adet(db, G, A, 'kasa-altin'), 1);
    const sonra = setDurumlari(db, G, A).find((d) => d.set.kimlik === 'kahramanlar');
    assert.equal(sonra.alindi, true);
    assert.equal(sonra.alinabilir, false);
  });

  it('kart sonradan satılsa da ödül geri alınmaz ve tekrar alınamaz', () => {
    const db = acVeritabani(':memory:');
    const set = setGetir('elit-bosslar');
    kartVer(db, A, set);
    assert.equal(setOduluAl(db, { guildId: G, kullaniciId: A, setKimligi: set.kimlik }).ok, true);
    const bak = bakiye(db, G, A);
    kartSat(db, { guildId: G, kullaniciId: A, kimlik: set.kartlar[0], adet: 1 });
    assert.equal(bakiye(db, G, A), bak + 100_000);
    assert.equal(adet(db, G, A, 'kasa-elmas'), 2);
    assert.equal(setOduluAl(db, { guildId: G, kullaniciId: A, setKimligi: set.kimlik }).ok, false);
    // Kartı geri alıp tamamlasa bile ikinci ödül yok.
    esyaEkle(db, G, A, set.kartlar[0]);
    assert.equal(setOduluAl(db, { guildId: G, kullaniciId: A, setKimligi: set.kimlik }).ok, false);
  });

  it('ödül kişiye özeldir; kart eksikse set alınamaz', () => {
    const db = acVeritabani(':memory:');
    const set = setGetir('askeri-kuleler');
    kartVer(db, A, set);
    kartVer(db, B, set);
    esyaDus(db, G, B, set.kartlar[0]);
    assert.equal(setOduluAl(db, { guildId: G, kullaniciId: B, setKimligi: set.kimlik }).ok, false);
    assert.equal(setOduluAl(db, { guildId: G, kullaniciId: A, setKimligi: set.kimlik }).ok, true);
    assert.equal(bakiye(db, G, B), 0);
    assert.equal(envanter(db, G, B)['kasa-ahsap'], undefined);
  });

  it('ödül metni ve düğme kimliği', () => {
    assert.match(odulMetni(setGetir('elit-bosslar').odul), /100\.000.*2 × Elmas Kasa/);
    const id = setButonId('elit-bosslar', A);
    assert.equal(setButonAyristir(id).set.kimlik, 'elit-bosslar');
    assert.equal(setButonAyristir('setodul:yok:100'), null);
    assert.equal(setButonAyristir('setodul:balonlar:abc'), null);
  });
});
