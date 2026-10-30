import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { ayarYaz, SISTEMLER, sistemAyarla } from '../lib/ayarlar.js';
import { acVeritabani } from '../lib/db.js';
import {
  ilkResim, kayitGetir, kayitSil, kayitYaz, nsfwEngeli, panoAyari, panoKarari, panoMetni, yildizSayisi,
} from '../lib/yildiz.js';

const G = 'g1';

describe('yıldız sayımı', () => {
  it('botları ve mesaj sahibini saymaz', () => {
    const kullanicilar = [{ id: 'a' }, { id: 'b' }, { id: 'yazar' }, { id: 'bot', bot: true }];
    assert.equal(yildizSayisi(kullanicilar, 'yazar'), 2);
  });
});

describe('pano kararı', () => {
  it('eşiğe ulaşınca oluşturur, sonra günceller', () => {
    assert.equal(panoKarari(2, 2, false), 'olustur');
    assert.equal(panoKarari(3, 2, true), 'guncelle');
  });

  it('eşiğin altına düşünce siler, kayıt yoksa bir şey yapmaz', () => {
    assert.equal(panoKarari(1, 2, true), 'sil');
    assert.equal(panoKarari(1, 2, false), 'yok');
  });
});

describe('pano ayarı', () => {
  let db;
  beforeEach(() => {
    db = acVeritabani(':memory:');
    sistemAyarla(db, G, 'yildiz', true);
    ayarYaz(db, G, 'yildiz.kanal', 'pano');
  });
  afterEach(() => db.close());

  it('açık ve kanal ayarlıysa varsayılan eşik 2 (Carl-bot ayarı)', () => {
    assert.deepEqual(panoAyari(db, G, 'genel'), { ok: true, panoId: 'pano', esik: 2 });
  });

  it('pano kanalının kendi mesajları yıldızlanmaz', () => {
    assert.match(panoAyari(db, G, 'pano').sebep, /pano kanalı/);
  });

  it('sistem kapalıyken çalışmaz; varsayılan kapalı', () => {
    sistemAyarla(db, G, 'yildiz', false);
    assert.equal(panoAyari(db, G, 'genel').ok, false);
    assert.equal(SISTEMLER.yildiz.varsayilan, false);
  });

  it('kanal ayarlanmamışsa çalışmaz', () => {
    const temiz = acVeritabani(':memory:');
    sistemAyarla(temiz, G, 'yildiz', true);
    assert.match(panoAyari(temiz, G, 'genel').sebep, /ayarlanmamış/);
    temiz.close();
  });

  it('NSFW mesaj yalnız NSFW panoya gider', () => {
    assert.equal(nsfwEngeli(true, false), true);
    assert.equal(nsfwEngeli(true, true), false);
    assert.equal(nsfwEngeli(false, false), false);
  });

  it('kayıt yazılır, güncellenir ve silinir', () => {
    kayitYaz(db, { guildId: G, mesajId: 'm1', kanalId: 'genel', panoMesajId: 'p1', sayi: 2 });
    kayitYaz(db, { guildId: G, mesajId: 'm1', kanalId: 'genel', panoMesajId: 'p1', sayi: 5 });
    assert.equal(kayitGetir(db, 'm1').sayi, 5);
    kayitSil(db, 'm1');
    assert.equal(kayitGetir(db, 'm1'), null);
  });
});

describe('pano mesajı', () => {
  it('metin sayıyı ve kanalı gösterir', () => {
    assert.equal(panoMetni(3, 'c1'), '⭐ **3** <#c1>');
  });

  it('ilk resim ekini, yoksa gömme resmini alır', () => {
    const ekler = new Map([
      ['1', { contentType: 'text/plain', url: 'dosya' }],
      ['2', { contentType: 'image/png', url: 'resim' }],
    ]);
    assert.equal(ilkResim({ attachments: ekler, embeds: [] }), 'resim');
    assert.equal(ilkResim({ attachments: new Map(), embeds: [{ image: { url: 'gomme' } }] }), 'gomme');
    assert.equal(ilkResim({ attachments: new Map(), embeds: [] }), null);
  });
});
