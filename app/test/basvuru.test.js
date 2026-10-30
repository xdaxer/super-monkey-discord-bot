import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { PermissionFlagsBits } from 'discord.js';

import {
  basvuruEkle, basvuruGetir, basvuruKarar, bekleyenBasvuru, butonAyristir, DURUMLAR, mesajBagla,
} from '../lib/basvuru.js';
import { inceleyebilirMi, kararButonlari } from '../lib/basvuru-bilesen.js';
import { acVeritabani } from '../lib/db.js';

const CEVAPLAR = { tanitim: 'Merhaba', neden: 'İstiyorum', ek: '' };

describe('başvuru kayıtları', () => {
  let db;
  beforeEach(() => { db = acVeritabani(':memory:'); });
  afterEach(() => db.close());

  it('başvuru yazılır ve cevaplar geri okunur', () => {
    const id = basvuruEkle(db, { guildId: 'g', kullaniciId: 'k', form: 'varsayilan', cevaplar: CEVAPLAR });

    const basvuru = basvuruGetir(db, 'g', id);
    assert.equal(basvuru.durum, DURUMLAR.beklemede);
    assert.deepEqual(basvuru.cevaplar, CEVAPLAR);
  });

  it('beklemede başvurusu olan ikinci kez başvuramaz', () => {
    assert.equal(bekleyenBasvuru(db, 'g', 'k'), null);

    const id = basvuruEkle(db, { guildId: 'g', kullaniciId: 'k', form: 'v', cevaplar: CEVAPLAR });
    assert.equal(bekleyenBasvuru(db, 'g', 'k').id, id);
  });

  it('sonuçlanan başvuru yeni başvuruyu engellemez', () => {
    const id = basvuruEkle(db, { guildId: 'g', kullaniciId: 'k', form: 'v', cevaplar: CEVAPLAR });
    basvuruKarar(db, { guildId: 'g', id, durum: DURUMLAR.ret, kararVerenId: 'm' });

    assert.equal(bekleyenBasvuru(db, 'g', 'k'), null);
  });

  it('başka sunucunun başvurusu engellemez', () => {
    basvuruEkle(db, { guildId: 'g1', kullaniciId: 'k', form: 'v', cevaplar: CEVAPLAR });
    assert.equal(bekleyenBasvuru(db, 'g2', 'k'), null);
  });

  it('karar yalnız bir kez yazılır: ikinci tık işlemez', () => {
    const id = basvuruEkle(db, { guildId: 'g', kullaniciId: 'k', form: 'v', cevaplar: CEVAPLAR });

    assert.equal(basvuruKarar(db, { guildId: 'g', id, durum: DURUMLAR.onay, kararVerenId: 'm1' }), true);
    assert.equal(basvuruKarar(db, { guildId: 'g', id, durum: DURUMLAR.ret, kararVerenId: 'm2' }), false);

    const basvuru = basvuruGetir(db, 'g', id);
    assert.equal(basvuru.durum, DURUMLAR.onay);
    assert.equal(basvuru.karar_veren_id, 'm1', 'ilk karar korunmalı');
  });

  it('geçersiz durum reddedilir', () => {
    const id = basvuruEkle(db, { guildId: 'g', kullaniciId: 'k', form: 'v', cevaplar: CEVAPLAR });
    assert.throws(() => basvuruKarar(db, { guildId: 'g', id, durum: 'belki', kararVerenId: 'm' }));
  });

  it('mesaj kimliği bağlanır', () => {
    const id = basvuruEkle(db, { guildId: 'g', kullaniciId: 'k', form: 'v', cevaplar: CEVAPLAR });
    mesajBagla(db, 'g', id, '12345');
    assert.equal(basvuruGetir(db, 'g', id).mesaj_id, '12345');
  });

  it('bozuk cevap JSON kaydı çökertmez', () => {
    db.prepare(`INSERT INTO basvurular (guild_id, kullanici_id, form, cevaplar, durum, zaman)
                VALUES (?,?,?,?,?,?)`).run('g', 'k', 'v', '{bozuk', 'beklemede', Date.now());

    const basvuru = basvuruGetir(db, 'g', 1);
    assert.deepEqual(basvuru.cevaplar, {});
  });
});

describe('buton kimliği ayrıştırma', () => {
  it('geçerli kimlikleri okur', () => {
    assert.deepEqual(butonAyristir('basvuru:onay:12'), { eylem: 'onay', id: 12 });
    assert.deepEqual(butonAyristir('basvuru:ret:3'), { eylem: 'ret', id: 3 });
  });

  it('yabancı veya bozuk kimlikleri reddeder', () => {
    assert.equal(butonAyristir('baska:onay:1'), null);
    assert.equal(butonAyristir('basvuru:belki:1'), null);
    assert.equal(butonAyristir('basvuru:onay:abc'), null);
    assert.equal(butonAyristir('basvuru:onay:0'), null);
    assert.equal(butonAyristir('basvuru:onay'), null);
  });
});

describe('inceleme yetkisi', () => {
  const rolsuz = { permissions: { has: () => false }, roles: { cache: { has: () => false } } };

  it('Sunucuyu Yönet yetkisi yeter', () => {
    const uye = { permissions: { has: (b) => b === PermissionFlagsBits.ManageGuild } };
    assert.equal(inceleyebilirMi(uye, null), true);
  });

  it('ayarlanan rol yeter', () => {
    const uye = {
      permissions: { has: () => false },
      roles: { cache: { has: (id) => id === 'rol1' } },
    };
    assert.equal(inceleyebilirMi(uye, 'rol1'), true);
  });

  it('rolü olmayan inceleyemez', () => {
    assert.equal(inceleyebilirMi(rolsuz, 'rol1'), false);
  });

  it('rol ayarlanmamışsa sıradan üye inceleyemez', () => {
    assert.equal(inceleyebilirMi(rolsuz, null), false);
  });
});

describe('karar butonları', () => {
  it('karar sonrası butonlar devre dışı kalır', () => {
    const acik = kararButonlari(7).toJSON();
    const kapali = kararButonlari(7, true).toJSON();

    assert.equal(acik.components[0].custom_id, 'basvuru:onay:7');
    assert.notEqual(acik.components[0].disabled, true);
    assert.equal(kapali.components[0].disabled, true);
    assert.equal(kapali.components[1].disabled, true);
  });
});
