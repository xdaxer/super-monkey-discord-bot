import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { ayarYaz, sistemAyarla } from '../lib/ayarlar.js';
import { acVeritabani } from '../lib/db.js';
import { ICERIK_YOK, icerikGoster, loglanmaliMi } from '../lib/log.js';

const G = 'g1';

describe('log kararı', () => {
  let db;
  beforeEach(() => {
    db = acVeritabani(':memory:');
    sistemAyarla(db, G, 'log', true);
    ayarYaz(db, G, 'log.kanal', 'kanal1');
  });
  afterEach(() => db.close());

  it('her şey hazırsa loglar', () => {
    const karar = loglanmaliMi(db, G, 'log.olay.mesajSil');
    assert.equal(karar.ok, true);
    assert.equal(karar.kanalId, 'kanal1');
  });

  it('log sistemi kapalıysa loglamaz', () => {
    sistemAyarla(db, G, 'log', false);
    const karar = loglanmaliMi(db, G, 'log.olay.mesajSil');
    assert.equal(karar.ok, false);
    assert.match(karar.sebep, /log sistemi kapalı/);
  });

  it('kanal ayarlanmamışsa loglamaz ve hata vermez', () => {
    const temiz = acVeritabani(':memory:');
    sistemAyarla(temiz, G, 'log', true);

    const karar = loglanmaliMi(temiz, G, 'log.olay.mesajSil');
    assert.equal(karar.ok, false);
    assert.match(karar.sebep, /kanalı ayarlanmamış/);
    temiz.close();
  });

  it('olay türü tek tek kapatılabilir', () => {
    ayarYaz(db, G, 'log.olay.mesajSil', false);

    assert.equal(loglanmaliMi(db, G, 'log.olay.mesajSil').ok, false);
    assert.equal(loglanmaliMi(db, G, 'log.olay.mesajDuzenle').ok, true, 'diğer olay etkilenmemeli');
  });

  it('sunucu dışı olayları loglamaz', () => {
    assert.equal(loglanmaliMi(db, null, 'log.olay.mesajSil').ok, false);
  });
});

describe('içerik gösterimi', () => {
  it('normal içeriği olduğu gibi verir', () => {
    assert.equal(icerikGoster('merhaba'), 'merhaba');
  });

  it('MessageContent kapalıyken açık not bırakır, sessizce boş geçmez', () => {
    assert.equal(icerikGoster(''), ICERIK_YOK);
    assert.equal(icerikGoster(null), ICERIK_YOK);
    assert.equal(icerikGoster(undefined), ICERIK_YOK);
    assert.match(ICERIK_YOK, /MessageContent/);
  });

  it('uzun içeriği kısaltır', () => {
    const uzun = 'a'.repeat(2000);
    const sonuc = icerikGoster(uzun, 100);
    assert.equal(sonuc.length, 101);
    assert.ok(sonuc.endsWith('…'));
  });
});

describe('değişim yardımcıları', async () => {
  const { alanDegisimleri, rolFarki, sesDegisimi } = await import('../lib/log.js');

  it('ses giriş/çıkış/geçişi ayırır, kanal dışı değişimi yok sayar', () => {
    assert.equal(sesDegisimi(null, 'a'), 'giris');
    assert.equal(sesDegisimi('a', null), 'cikis');
    assert.equal(sesDegisimi('a', 'b'), 'gecis');
    assert.equal(sesDegisimi('a', 'a'), null);
    assert.equal(sesDegisimi(undefined, null), null);
  });

  it('rol farkını iki yönde verir', () => {
    assert.deepEqual(rolFarki(['1', '2'], ['2', '3']), { eklenen: ['3'], cikan: ['1'] });
    assert.deepEqual(rolFarki(['1'], ['1']), { eklenen: [], cikan: [] });
  });

  it('yalnız değişen alanları yazar; okunmaz değerler için "değişti" der', () => {
    const satirlar = alanDegisimleri(
      { ad: 'eski', konu: null, avatar: 'h1', sabit: 1 },
      { ad: 'yeni', konu: 'selam', avatar: 'h2', sabit: 1 },
      [
        ['Ad', (x) => x.ad],
        ['Konu', (x) => x.konu],
        ['Avatar', (x) => x.avatar, { yalnizDegisti: true }],
        ['Sabit', (x) => x.sabit],
      ],
    );
    assert.deepEqual(satirlar, ['**Ad:** eski → yeni', '**Konu:** _yok_ → selam', '**Avatar** değişti']);
  });
});
