import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { data } from '../commands/anket/anket.js';
import {
  anketHazirla, bitirilebilirMi, EN_UZUN_SAAT, mesajHedefi, saateCevir, seceneklerAyristir,
} from '../lib/anket.js';
import { SISTEMLER } from '../lib/ayarlar.js';
import { sureAyristir } from '../lib/bicim.js';

describe('anket seçenekleri', () => {
  it('| varsa ona göre, yoksa virgüle göre böler', () => {
    assert.deepEqual(seceneklerAyristir('Evet, kesinlikle | Hayır'), ['Evet, kesinlikle', 'Hayır']);
    assert.deepEqual(seceneklerAyristir('a, b ,c'), ['a', 'b', 'c']);
  });

  it('boşları ve büyük/küçük harf farklı tekrarları atar', () => {
    assert.deepEqual(seceneklerAyristir('Pizza,, pizza , İyi, iyi'), ['Pizza', 'İyi']);
    assert.deepEqual(seceneklerAyristir('  '), []);
  });
});

describe('anketHazirla', () => {
  const temel = { soru: 'Ne yiyelim?', secenekler: ['Pizza', 'Döner'], saat: 24 };

  it('geçerli girdiden Discord poll verisi üretir', () => {
    const sonuc = anketHazirla({ ...temel, coklu: true });
    assert.equal(sonuc.ok, true);
    assert.deepEqual(sonuc.poll, {
      question: { text: 'Ne yiyelim?' },
      answers: [{ text: 'Pizza' }, { text: 'Döner' }],
      duration: 24,
      allowMultiselect: true,
    });
  });

  it('seçenek sayısı ve uzunluk sınırlarını denetler', () => {
    assert.equal(anketHazirla({ ...temel, secenekler: ['tek'] }).ok, false);
    const onBir = Array.from({ length: 11 }, (_, i) => `s${i}`);
    assert.equal(anketHazirla({ ...temel, secenekler: onBir }).ok, false);
    assert.equal(anketHazirla({ ...temel, secenekler: ['a', 'x'.repeat(56)] }).ok, false);
    assert.equal(anketHazirla({ ...temel, soru: '  ' }).ok, false);
  });

  it('süreyi 1 saat ile 32 gün arasında tutar', () => {
    assert.equal(anketHazirla({ ...temel, saat: null }).ok, false);
    assert.equal(anketHazirla({ ...temel, saat: 0 }).ok, false);
    assert.equal(anketHazirla({ ...temel, saat: EN_UZUN_SAAT + 1 }).ok, false);
    assert.equal(anketHazirla({ ...temel, saat: EN_UZUN_SAAT }).ok, true);
  });

  it('kısa süreleri yukarı, tam saate yuvarlar', () => {
    assert.equal(saateCevir(sureAyristir('30dk')), 1);
    assert.equal(saateCevir(sureAyristir('90dk')), 2);
    assert.equal(saateCevir(sureAyristir('3g')), 72);
    assert.equal(saateCevir(sureAyristir('saçma')), null);
  });
});

describe('anket bitirme', () => {
  it('mesaj bağlantısını ve düz kimliği çözer', () => {
    assert.deepEqual(
      mesajHedefi('https://discord.com/channels/111111111111111111/222222222222222222/333333333333333333'),
      { kanalId: '222222222222222222', mesajId: '333333333333333333' },
    );
    assert.deepEqual(mesajHedefi('333333333333333333'), { kanalId: null, mesajId: '333333333333333333' });
    assert.equal(mesajHedefi('anket'), null);
  });

  it('yalnız botun açtığı, bitmemiş anketi kabul eder', () => {
    const acik = { author: { id: 'bot' }, poll: { resultsFinalized: false, expiresTimestamp: Date.now() + 1e6 } };
    assert.equal(bitirilebilirMi(acik, 'bot').ok, true);
    assert.equal(bitirilebilirMi({ ...acik, poll: null }, 'bot').ok, false);
    assert.equal(bitirilebilirMi({ ...acik, author: { id: 'baska' } }, 'bot').ok, false);
    assert.equal(bitirilebilirMi({ ...acik, poll: { resultsFinalized: true } }, 'bot').ok, false);
  });
});

describe('/anket komutu', () => {
  it('açılıp kapatılabilir bir sisteme bağlı ve iki alt komutu var', () => {
    assert.ok(SISTEMLER.anket);
    const json = data.toJSON();
    assert.deepEqual(json.options.map((o) => o.name), ['olustur', 'bitir']);
  });
});
