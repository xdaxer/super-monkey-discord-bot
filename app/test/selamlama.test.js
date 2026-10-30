import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AYARLAR, SECENEK_SINIRI, SISTEMLER } from '../lib/ayarlar.js';
import { GRUPLAR, sadelestir, selamGrubu, selamMi } from '../lib/selamlama.js';
import { BEKLEME_MS, beklemedeMi, gerekliIntent, name } from '../events/selamlama.js';

describe('selam tanıma', () => {
  const selamlar = [
    'sa', 'SA', 's.a', 'S.A.', 's a', 's-a', 'sea',
    'slm', 'slmm',
    'selam', 'Selam!', 'selammm', 'selamlar', 'selâm',
    'selamun aleykum', 'selamün aleyküm', 'esselamu aleykum', 'aleyküm selam',
    'merhaba', 'Merhaba.', 'mrb', 'mrhb',
  ];

  for (const metin of selamlar) {
    it(`selam sayar: ${metin}`, () => assert.equal(selamMi(metin), true));
  }

  it('cümlenin içindeki selamı da yakalar', () => {
    assert.equal(selamMi('sa nasılsınız'), true);
    assert.equal(selamMi('beyler merhaba, bir sorum var'), true);
  });
});

describe('selam grupları', () => {
  const beklenen = {
    sa: ['sa', 's.a', 'SEA', 'slm', 'selam', 'selamlar', 'selamün aleyküm', 'aleyküm selam'],
    merhaba: ['merhaba', 'Merhaba!', 'mrb', 'mrhb'],
    gunaydin: ['günaydın', 'GÜNAYDIN', 'gunaydin', 'günaydınlar', 'gnydn', 'hayırlı sabahlar'],
    iyiGunler: ['iyi günler', 'iyigünler', 'İyi Günler', 'hayırlı günler'],
    iyiAksamlar: ['iyi akşamlar', 'iyiakşamlar', 'hayırlı akşamlar'],
    iyiGeceler: ['iyi geceler', 'iyigeceler', 'İYİ GECELER', 'hayırlı geceler'],
  };

  for (const [ad, metinler] of Object.entries(beklenen)) {
    for (const metin of metinler) {
      it(`${JSON.stringify(metin)} → ${ad} grubu`, () => {
        assert.equal(selamGrubu(metin)?.ad, ad);
      });
    }
  }

  it('grup bulunamazsa null döner', () => {
    assert.equal(selamGrubu('saat kaç'), null);
    assert.equal(selamGrubu(''), null);
  });

  it('iki grup da geçiyorsa metinde önce gelen kazanır', () => {
    assert.equal(selamGrubu('merhaba sa')?.ad, 'merhaba');
    assert.equal(selamGrubu('sa merhaba')?.ad, 'sa');
  });

  it('her grup farklı bir yanıt ayarına bağlı', () => {
    const ayarlar = GRUPLAR.map((g) => g.ayar);
    assert.equal(new Set(ayarlar).size, ayarlar.length);
  });

  const selamDegiller = [
    'saat kaç', 'sana diyorum', 'salı günü', 'usa', 'asa', 'sap',
    'as', 'msa', 'selamlaşmak güzel', 'aleykümselamlaşma',
    'basit', 'kasa', 'mesaj', '', '   ',
  ];

  for (const metin of selamDegiller) {
    it(`selam saymaz: ${JSON.stringify(metin)}`, () => assert.equal(selamMi(metin), false));
  }

  it('boş/geçersiz girdide patlamaz', () => {
    assert.equal(selamMi(null), false);
    assert.equal(selamMi(undefined), false);
  });

  it('sadeleştirme Türkçe harfleri ASCII yapar', () => {
    assert.equal(sadelestir('SELÂMÜN ALEYKÜM'), 'selamun aleykum');
    assert.equal(sadelestir('İIıiŞşĞğÇçÖö'), 'iiiissggccoo');
  });
});

describe('selamlama olayı', () => {
  it('MessageCreate olayına MessageContent intent\'iyle bağlanır', () => {
    assert.equal(name, 'messageCreate');
    assert.deepEqual(gerekliIntent, ['GuildMessages', 'MessageContent']);
  });

  it('ayar kaydında sistem ve anahtarlar tanımlı', () => {
    assert.equal(SISTEMLER.selamlama.varsayilan, false);
    assert.deepEqual(SISTEMLER.selamlama.gerekliIntent, ['MessageContent']);
    assert.equal(AYARLAR['selamlama.kanal'].varsayilan, null);
    assert.equal(AYARLAR['selamlama.cevap.sa'].varsayilan, 'as');
    assert.equal(AYARLAR['selamlama.cevap.merhaba'].varsayilan, 'merhaba');
    assert.equal(AYARLAR['selamlama.cevap.iyiGeceler'].varsayilan, 'iyi geceler');
  });

  // /ayar anahtar otomatik tamamlamaya geçtiği için toplam anahtar sayısı
  // artık 25 ile sınırlı değil (bkz. oylama.test.js: tamamlama yanıtı kırpılıyor).
  // Ama /ayar sistem hâlâ HAZIR seçenek kullanıyor; sistem sayısı 25'i aşarsa
  // komut kaydı Discord tarafında sessizce reddedilir.
  it('sistem sayısı Discord hazır seçenek sınırını aşmıyor', () => {
    const adet = Object.keys(SISTEMLER).length;
    assert.ok(adet <= SECENEK_SINIRI, `${adet} sistem > ${SECENEK_SINIRI}`);
  });

  it('her grubun yanıt ayarı AYARLAR içinde gerçekten var', () => {
    for (const grup of GRUPLAR) {
      assert.ok(AYARLAR[grup.ayar], `${grup.ad} grubunun ayarı tanımsız: ${grup.ayar}`);
      assert.equal(AYARLAR[grup.ayar].tur, 'metin');
    }
  });

  it('aynı kişi bekleme süresi dolmadan ikinci kez cevaplanmaz', () => {
    const anahtar = 'kanal:kisi';
    assert.equal(beklemedeMi(anahtar, 1000), false);
    assert.equal(beklemedeMi(anahtar, 1000 + BEKLEME_MS - 1), true);
    assert.equal(beklemedeMi(anahtar, 1000 + BEKLEME_MS), false);
  });

  it('farklı kişiler birbirini engellemez', () => {
    assert.equal(beklemedeMi('kanal:a', 1000), false);
    assert.equal(beklemedeMi('kanal:b', 1000), false);
  });
});
