import assert from 'node:assert/strict';
import { test } from 'node:test';

import { KASA_ICERIKLERI, KARTLAR, kartGetir } from '../lib/kasalar.js';
import {
  BOYUT_SINIRI, GENISLIK, HEDEF_INDEKSI, HUCRE, KAYMA_KARESI, SERIT_HUCRESI, YUKSEKLIK,
  gifSuresi, kareIlerlemeleri, kasaGifiUret, kaymaMiktari, odulOgesi, onbellegiTemizle,
  ortadakiHucre, rastgeleOge, seritOlustur, yavaslama,
} from '../lib/kasa-gif.js';

/** Sıralı sahte rastgele: testler tekrarlanabilir. */
function tohumlu(tohum = 1) {
  let x = tohum;
  return () => {
    x = (x * 16807) % 2147483647;
    return x / 2147483647;
  };
}

test('yavaşlama: 0\'dan 1\'e tek yönlü artar', () => {
  assert.equal(yavaslama(0), 0);
  assert.equal(yavaslama(1), 1);
  assert.equal(yavaslama(2), 1);
  assert.equal(yavaslama(-1), 0);
  let onceki = -1;
  for (let i = 0; i <= 100; i += 1) {
    const d = yavaslama(i / 100);
    assert.ok(d >= onceki);
    onceki = d;
  }
});

test('kayma hızı monoton azalır ve sonda durur', () => {
  const konumlar = [0, ...kareIlerlemeleri().map((ilerleme) => kaymaMiktari({ ilerleme }))];
  const adimlar = konumlar.slice(1).map((k, i) => k - konumlar[i]);
  for (let i = 1; i < adimlar.length; i += 1) {
    assert.ok(adimlar[i] <= adimlar[i - 1] + 1e-9, `adım ${i} öncekinden büyük`);
  }
  assert.ok(adimlar[0] > adimlar.at(-1) * 10, 'başlangıç hızı bitişin çok üstünde olmalı');
  assert.ok(adimlar.at(-1) >= 0);
});

test('son karede ödülün hücresi tam ortada', () => {
  const kayma = kaymaMiktari({ ilerleme: 1 });
  assert.equal(ortadakiHucre(kayma), HEDEF_INDEKSI);
  // Hücrenin merkezi görüntünün merkezine denk gelir.
  assert.equal(HEDEF_INDEKSI * HUCRE - kayma + HUCRE / 2, GENISLIK / 2);
  assert.notEqual(ortadakiHucre(kaymaMiktari({ ilerleme: 0 })), HEDEF_INDEKSI);
  assert.equal(kareIlerlemeleri().at(-1), 1);
  assert.equal(kareIlerlemeleri().length, KAYMA_KARESI);
});

test('şerit: ödül hedef hücrede, diğerleri kasa içeriğinden', () => {
  const sonuc = { tur: 'kart', kimlik: 'kart-lych', yeniKart: true, adet: 1 };
  const serit = seritOlustur('kasa-demir', sonuc, { rastgele: tohumlu(7) });
  assert.equal(serit.length, SERIT_HUCRESI);
  assert.deepEqual(serit[HEDEF_INDEKSI], odulOgesi(sonuc));
  assert.equal(serit[HEDEF_INDEKSI].emojiAdi, kartGetir('kart-lych').emojiAdi);
  assert.equal(serit[HEDEF_INDEKSI].nadirlik, 'efsanevi');

  // Demir kasada olmayan nadirlik/eşya şeritte çıkmamalı.
  const nadirlikler = new Set(KASA_ICERIKLERI['kasa-demir'].filter((o) => o.tur === 'kart').map((o) => o.nadirlik));
  for (let i = 0; i < 300; i += 1) {
    const oge = rastgeleOge('kasa-demir', tohumlu(i + 1));
    if (oge.tur === 'kart') assert.ok(nadirlikler.has(oge.nadirlik));
    assert.ok(['muz', 'kart', 'esya', 'kasa'].includes(oge.tur));
  }
});

test('ödül öğesi: muz, eşya ve kasa sonuçları', () => {
  assert.equal(odulOgesi({ tur: 'muz', miktar: 500 }).tur, 'muz');
  assert.equal(odulOgesi({ tur: 'muz', miktar: 12_000 }).nadirlik, 'efsanevi');
  assert.equal(odulOgesi({ tur: 'kasa', kimlik: 'kasa-altin', adet: 1 }).tur, 'kasa');
  assert.equal(odulOgesi({ tur: 'muz', miktar: 15_000, yerine: 'rozet-altin' }).tur, 'muz');
  assert.equal(odulOgesi({ tur: 'esya', kimlik: 'xp-iksiri', adet: 1 }).emojiAdi, 'btd_alchemist');
});

test('GIF süresi 2,5-3,5 sn aralığında', () => {
  assert.ok(gifSuresi() >= 2500 && gifSuresi() <= 3500, String(gifSuresi()));
});

test('indirici hep başarısız olsa da geçerli, sınırlı boyutlu GIF üretilir', async () => {
  onbellegiTemizle();
  let istek = 0;
  const sonuc = { tur: 'kart', kimlik: KARTLAR[0].kimlik, yeniKart: true, adet: 1 };
  const gif = await kasaGifiUret({
    kasa: 'kasa-ahsap',
    sonuc,
    rastgele: tohumlu(3),
    emojiBul: (ad) => ({ imageURL: () => `https://ornek.test/${ad}.png` }),
    indir: async () => {
      istek += 1;
      throw new Error('ağ yok');
    },
  });
  assert.ok(gif, 'canvas kurulu olmalı');
  assert.ok(istek > 0, 'indirici denenmeli');
  assert.equal(gif.gif.subarray(0, 6).toString('latin1'), 'GIF89a');
  assert.equal(gif.gif.readUInt16LE(6), GENISLIK);
  assert.equal(gif.gif.readUInt16LE(8), YUKSEKLIK);
  assert.ok(gif.kareSayisi > 1);
  assert.ok(gif.gif.length < BOYUT_SINIRI);
  assert.ok(gif.sureMs >= 2500 && gif.sureMs <= 3500, String(gif.sureMs));
  assert.equal(gif.png.subarray(1, 4).toString('latin1'), 'PNG');
  // Kare sayısı GIF içindeki görüntü tanımlayıcılarına (0x2C) denk gelir.
  assert.ok(gif.gif.at(-1) === 0x3b, 'GIF bitiş baytı');
});

test('emoji görseli bir kez indirilir (bellek önbelleği)', async () => {
  onbellegiTemizle();
  // 1x1 geçerli PNG
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const istekler = [];
  const gif = await kasaGifiUret({
    kasa: 'kasa-elmas',
    sonuc: { tur: 'kart', kimlik: 'kart-lych_elite', yeniKart: true, adet: 1 },
    rastgele: tohumlu(5),
    emojiBul: (ad) => ({ imageURL: () => `https://ornek.test/${ad}.png` }),
    indir: async (url) => {
      istekler.push(url);
      return png;
    },
  });
  assert.ok(gif);
  assert.equal(new Set(istekler).size, istekler.length, 'aynı URL iki kez indirilmemeli');
});
