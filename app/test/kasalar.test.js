import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { acVeritabani } from '../lib/db.js';
import {
  bakiye, ekle, gunlukAl, HAFTALIK_KASA, SERI_KORUYUCU, TURLER,
} from '../lib/ekonomi.js';
import { adet, esyaEkle, etkiAktifMi } from '../lib/envanter.js';
import { esyaGetir, esyaSatinAl } from '../lib/esyalar.js';
import { acButonAyristir, acButonId, kareMetni } from '../lib/kasa-bilesen.js';
import {
  acilmamisKasalar, garantiDurumu, garantiliBeklenen, HEDIYE_GUNLUK, hediyeEt, KARTLAR, KASA_GARANTI, KASA_ICERIKLERI,
  KASA_KIMLIKLERI, kartGetir, kasaAc, kasaBeklenen, kasaVer, kartSat,
  koleksiyon, kopyalariSat, NADIRLIK_SIRASI, NADIRLIKLER, ROZET_YERINE_MUZ, seviyeKasasi,
  TOPTAN_HEPSI, toptanAyristir, toptanOnizleme, toptanSat,
} from '../lib/kasalar.js';
import { satisButonAyristir, satisButonId } from '../lib/kasa-bilesen.js';
import { envanter } from '../lib/envanter.js';

const G = 'g1';
const A = '100';
const B = '200';

function hazir(para = 0) {
  const db = acVeritabani(':memory:');
  if (para > 0) ekle(db, { guildId: G, kullaniciId: A, miktar: para, tur: TURLER.yonetici });
  return db;
}

/** Sırayla verilen sayıları dönen sahte rastgelelik. */
const sira = (...d) => {
  let i = 0;
  return () => d[i++];
};

/** Kasa içeriğinde istenen ödülü seçtiren rastgele değer (ağırlıkların ortası). */
function secici(kasa, eslesir) {
  const icerik = KASA_ICERIKLERI[kasa];
  const toplam = icerik.reduce((t, o) => t + o.agirlik, 0);
  let birikmis = 0;
  for (const o of icerik) {
    if (eslesir(o)) return (birikmis + o.agirlik / 2) / toplam;
    birikmis += o.agirlik;
  }
  throw new Error('ödül yok');
}

describe('katalog', () => {
  it('63 kart, kimlikler tekil, her nadirlikte kart var', () => {
    assert.equal(KARTLAR.length, 63);
    assert.equal(new Set(KARTLAR.map((k) => k.kimlik)).size, 63);
    assert.deepEqual(NADIRLIK_SIRASI.map((n) => KARTLAR.filter((k) => k.nadirlik === n).length), [13, 16, 20, 7, 7]);
  });

  it('kasa fiyatları ve içerik ağırlıkları (toplam 1000)', () => {
    assert.deepEqual(KASA_KIMLIKLERI.map((k) => esyaGetir(k).fiyat), [null, 1_200, 4_000, 12_000, 30_000]);
    for (const k of KASA_KIMLIKLERI) assert.equal(KASA_ICERIKLERI[k].reduce((t, o) => t + o.agirlik, 0), 1000, k);
  });

  it('beklenen değer her kasada fiyatın altında (belgedeki oranlar, parlak payı ve garanti dahil)', () => {
    const satilik = KASA_KIMLIKLERI.filter((k) => esyaGetir(k).fiyat !== null);
    const oran = (f, k) => Math.round((f(k).satilabilir / esyaGetir(k).fiyat) * 1000) / 10;
    assert.deepEqual(satilik.map((k) => oran(kasaBeklenen, k)), [71.4, 86.2, 83.3, 85.9]);
    assert.deepEqual(satilik.map((k) => oran(garantiliBeklenen, k)), [89.7, 86.2, 89.3, 85.9]);
    // Eşyalar mağaza fiyatıyla sayılsa bile kasa açarak muz basılamaz.
    for (const k of satilik) assert.ok(garantiliBeklenen(k).tum < esyaGetir(k).fiyat, k);
  });

  it('günlük kasa: satılmaz, zayıf (satılabilir beklenen ≈ 329 muz, parlak payı dahil)', () => {
    assert.equal(esyaGetir('kasa-gunluk').fiyat, null);
    assert.equal(Math.round(kasaBeklenen('kasa-gunluk').satilabilir), 329);
    assert.ok(kasaBeklenen('kasa-gunluk').satilabilir < kasaBeklenen('kasa-ahsap').satilabilir / 2);
    assert.equal(esyaSatinAl(hazir(1_000_000), { guildId: G, kullaniciId: A, kimlik: 'kasa-gunluk' }).ok, false);
  });

  it('kart satış değerleri', () => {
    assert.deepEqual(NADIRLIK_SIRASI.map((n) => NADIRLIKLER[n].deger), [400, 1_500, 6_000, 25_000, 100_000]);
  });

  it('seviye kasası', () => {
    assert.deepEqual([1, 4, 5, 7, 10, 15, 19, 20, 21, 23, 25, 50, 0].map(seviyeKasasi), [
      'kasa-gunluk', 'kasa-ahsap', 'kasa-demir', 'kasa-gunluk', 'kasa-altin', 'kasa-demir', 'kasa-gunluk', 'kasa-altin',
      'kasa-ahsap', 'kasa-ahsap', 'kasa-elmas', 'kasa-elmas', 'kasa-ahsap',
    ]);
  });
});

describe('kasa açma', () => {
  it('kasa yoksa açılmıyor', () => {
    const db = hazir();
    assert.equal(kasaAc(db, { guildId: G, kullaniciId: A, kasa: 'kasa-ahsap' }).ok, false);
    assert.equal(kasaAc(db, { guildId: G, kullaniciId: A, kasa: 'kasa-yok' }).ok, false);
  });

  it('muz ödülü: kasa düşüyor, muz ekleniyor', () => {
    const db = hazir();
    kasaVer(db, { guildId: G, kullaniciId: A, kasa: 'kasa-ahsap', tur: 'test' });
    const s = kasaAc(db, { guildId: G, kullaniciId: A, kasa: 'kasa-ahsap', rastgele: sira(0, 0) });
    assert.deepEqual(s.sonuc, { tur: 'muz', miktar: 400 });
    assert.equal(s.kalan, 0);
    assert.equal(bakiye(db, G, A), 400);
  });

  it('garanti: 19 boş Ahşap\'tan sonra 20. açılış Destansı, sonra sayaç sıfırlanır', () => {
    const db = hazir();
    const { esik } = KASA_GARANTI['kasa-ahsap'];
    for (let i = 0; i < esik + 2; i += 1) kasaVer(db, { guildId: G, kullaniciId: A, kasa: 'kasa-ahsap', tur: 'test' });
    const ac = (...r) => kasaAc(db, { guildId: G, kullaniciId: A, kasa: 'kasa-ahsap', rastgele: sira(...r) });
    assert.deepEqual(garantiDurumu(db, G, A, 'kasa-ahsap'), { nadirlik: 'destansi', esik: 20, kalan: 20 });
    for (let i = 1; i < esik; i += 1) {
      const s = ac(0, 0);
      assert.equal(s.sonuc.tur, 'muz');
      assert.equal(s.garanti.kalan, esik - i);
    }
    const g = ac(0, 0, 0.5);
    assert.equal(g.sonuc.tur, 'kart');
    assert.equal(kartGetir(g.sonuc.kimlik).nadirlik, 'destansi');
    assert.equal(g.sonuc.garanti, true);
    assert.equal(g.garanti.kalan, esik);
    // Doğal hedef de sayacı sıfırlar; garanti etiketi taşımaz.
    ac(0, 0);
    const dogal = ac(secici('kasa-ahsap', (o) => o.nadirlik === 'destansi'), 0, 0.5);
    assert.equal(dogal.sonuc.garanti, undefined);
    assert.equal(dogal.garanti.kalan, esik);
    assert.equal(garantiDurumu(db, G, B, 'kasa-ahsap').kalan, esik, 'sayaç kişi başına');
    assert.equal(garantiDurumu(db, G, A, 'kasa-demir'), null);
  });

  it('garanti: Altın Kasa\'da rozet ve mitik de hedef sayılır', () => {
    const db = hazir();
    for (let i = 0; i < 3; i += 1) kasaVer(db, { guildId: G, kullaniciId: A, kasa: 'kasa-altin', tur: 'test' });
    const ac = (r) => kasaAc(db, { guildId: G, kullaniciId: A, kasa: 'kasa-altin', rastgele: sira(r, 0, 0.5) });
    assert.equal(ac(0).garanti.kalan, 9);
    assert.equal(ac(secici('kasa-altin', (o) => o.kimlik === 'rozet-altin')).garanti.kalan, 10);
    assert.equal(ac(0).garanti.kalan, 9);
    assert.equal(ac(secici('kasa-altin', (o) => o.nadirlik === 'destansi')).ok, false, 'kasa bitti');
  });

  it('kart ödülü: ilk kopya YENİ, ikincisi kopya', () => {
    const db = hazir();
    kasaVer(db, { guildId: G, kullaniciId: A, kasa: 'kasa-elmas', tur: 'test' });
    kasaVer(db, { guildId: G, kullaniciId: A, kasa: 'kasa-elmas', tur: 'test' });
    const mitik = secici('kasa-elmas', (o) => o.nadirlik === 'mitik');
    const ilk = kasaAc(db, { guildId: G, kullaniciId: A, kasa: 'kasa-elmas', rastgele: sira(mitik, 0) });
    assert.equal(ilk.sonuc.tur, 'kart');
    assert.equal(ilk.sonuc.kimlik, 'kart-bloonarius_elite');
    assert.equal(ilk.sonuc.yeniKart, true);
    const ikinci = kasaAc(db, { guildId: G, kullaniciId: A, kasa: 'kasa-elmas', rastgele: sira(mitik, 0) });
    assert.equal(ikinci.sonuc.yeniKart, false);
    assert.equal(ikinci.sonuc.adet, 2);
  });

  it('içinden üst kasa ve takviye çıkabiliyor', () => {
    const db = hazir();
    esyaEkle(db, G, A, 'kasa-ahsap', 2);
    const demir = kasaAc(db, { guildId: G, kullaniciId: A, kasa: 'kasa-ahsap', rastgele: sira(secici('kasa-ahsap', (o) => o.tur === 'kasa')) });
    assert.deepEqual([demir.sonuc.tur, demir.sonuc.kimlik], ['kasa', 'kasa-demir']);
    assert.equal(adet(db, G, A, 'kasa-demir'), 1);

    const xp = secici('kasa-demir', (o) => o.kimlik === 'xp-iksiri');
    kasaAc(db, { guildId: G, kullaniciId: A, kasa: 'kasa-demir', rastgele: sira(xp) });
    assert.equal(etkiAktifMi(db, G, A, 'xp-iksiri'), true);
  });

  it('Altın Balon bir kez; sahipse yerine muz', () => {
    const db = hazir();
    esyaEkle(db, G, A, 'kasa-elmas', 2);
    const rozet = secici('kasa-elmas', (o) => o.kimlik === 'rozet-altin');
    assert.equal(kasaAc(db, { guildId: G, kullaniciId: A, kasa: 'kasa-elmas', rastgele: sira(rozet) }).sonuc.kimlik, 'rozet-altin');
    const ikinci = kasaAc(db, { guildId: G, kullaniciId: A, kasa: 'kasa-elmas', rastgele: sira(rozet) });
    assert.deepEqual(ikinci.sonuc, { tur: 'muz', miktar: ROZET_YERINE_MUZ, yerine: 'rozet-altin' });
  });

  it('stok doluysa seri koruyucu yerine fiyatı kadar muz', () => {
    const db = hazir();
    esyaEkle(db, G, A, 'kasa-ahsap', 1);
    esyaEkle(db, G, A, SERI_KORUYUCU, 3);
    const s = kasaAc(db, { guildId: G, kullaniciId: A, kasa: 'kasa-ahsap', rastgele: sira(secici('kasa-ahsap', (o) => o.kimlik === SERI_KORUYUCU)) });
    assert.deepEqual(s.sonuc, { tur: 'muz', miktar: 3000, yerine: SERI_KORUYUCU });
  });

  it('çok sayıda açılışta dağılım ağırlıklara yakın', () => {
    const db = hazir();
    esyaEkle(db, G, A, 'kasa-ahsap', 4000);
    let kart = 0;
    for (let i = 0; i < 4000; i += 1) {
      if (kasaAc(db, { guildId: G, kullaniciId: A, kasa: 'kasa-ahsap' }).sonuc.tur === 'kart') kart += 1;
    }
    // Ahşap kasada kart ağırlığı %62,1; 20'lik destansı garantisiyle ölçülen
    // oran ≈%63,7 (200 bin açılış). 4000 denemede σ≈%0,8, ±%3,3 ≈ 4σ.
    assert.ok(kart / 4000 > 0.604 && kart / 4000 < 0.67, String(kart / 4000));
  });
});

describe('satış ve hediye', () => {
  it('kart satışı nadirlik değerinden; yetmezse hiçbir şey olmaz', () => {
    const db = hazir();
    esyaEkle(db, G, A, 'kart-quincy', 3);
    assert.equal(kartSat(db, { guildId: G, kullaniciId: A, kimlik: 'kart-quincy', adet: 4 }).ok, false);
    const s = kartSat(db, { guildId: G, kullaniciId: A, kimlik: 'kart-quincy', adet: 2 });
    assert.equal(s.tutar, 12_000);
    assert.equal(bakiye(db, G, A), 12_000);
    assert.equal(adet(db, G, A, 'kart-quincy'), 1);
  });

  it('kopyaları sat her karttan birini bırakıyor', () => {
    const db = hazir();
    esyaEkle(db, G, A, 'kart-ace', 3);
    esyaEkle(db, G, A, 'kart-lych', 1);
    esyaEkle(db, G, A, 'kasa-ahsap', 5);
    const s = kopyalariSat(db, { guildId: G, kullaniciId: A });
    assert.deepEqual(s, { adet: 2, tutar: 800 });
    assert.equal(adet(db, G, A, 'kart-ace'), 1);
    assert.equal(adet(db, G, A, 'kasa-ahsap'), 5);
  });

  it('toptan satış: hepsi ya da bir nadirlik, son kopya dahil; kasalara dokunmaz', () => {
    const db = hazir();
    esyaEkle(db, G, A, 'kart-ace', 3);
    esyaEkle(db, G, A, 'kart-quincy', 1);
    esyaEkle(db, G, A, 'kart-lych', 2);
    esyaEkle(db, G, A, 'kasa-demir', 2);

    assert.deepEqual(toptanOnizleme(envanter(db, G, A), 'siradan'), { adet: 3, tutar: 1_200 });
    assert.deepEqual(toptanSat(db, { guildId: G, kullaniciId: A, nadirlik: 'siradan' }), { adet: 3, tutar: 1_200 });
    assert.equal(adet(db, G, A, 'kart-ace'), 0);
    assert.equal(adet(db, G, A, 'kart-quincy'), 1);

    assert.deepEqual(toptanOnizleme(envanter(db, G, A)), { adet: 3, tutar: 6_000 + 50_000 });
    assert.deepEqual(toptanSat(db, { guildId: G, kullaniciId: A }), { adet: 3, tutar: 56_000 });
    assert.equal(koleksiyon(db, G, A).kartSayisi, 0);
    assert.equal(adet(db, G, A, 'kasa-demir'), 2);
    assert.equal(bakiye(db, G, A), 57_200);
    assert.deepEqual(toptanSat(db, { guildId: G, kullaniciId: A }), { adet: 0, tutar: 0 });
  });

  it('toptan seçim ve onay butonu ayrıştırma', () => {
    assert.deepEqual(toptanAyristir(TOPTAN_HEPSI), { nadirlik: null });
    assert.deepEqual(toptanAyristir('hepsi:mitik'), { nadirlik: 'mitik' });
    assert.equal(toptanAyristir('hepsi:yok'), null);
    assert.equal(toptanAyristir('kart-ace'), null);
    assert.deepEqual(satisButonAyristir(satisButonId('onay', 'tum', '42')), { eylem: 'onay', nadirlik: null, kullaniciId: '42' });
    assert.deepEqual(satisButonAyristir(satisButonId('iptal', 'nadir', '42')), { eylem: 'iptal', nadirlik: 'nadir', kullaniciId: '42' });
    assert.equal(satisButonAyristir('envsat:onay:yok:42'), null);
  });

  it('hediye: kasa ve kart, günlük sınır, kendine yok', () => {
    const db = hazir();
    esyaEkle(db, G, A, 'kasa-demir', 20);
    esyaEkle(db, G, A, 'xp-iksiri', 1);
    assert.equal(hediyeEt(db, { guildId: G, gonderenId: A, aliciId: A, kimlik: 'kasa-demir' }).ok, false);
    assert.equal(hediyeEt(db, { guildId: G, gonderenId: A, aliciId: B, kimlik: 'xp-iksiri' }).ok, false);
    assert.equal(hediyeEt(db, { guildId: G, gonderenId: A, aliciId: B, kimlik: 'kasa-demir', adet: HEDIYE_GUNLUK }).ok, true);
    assert.equal(hediyeEt(db, { guildId: G, gonderenId: A, aliciId: B, kimlik: 'kasa-demir' }).ok, false);
    assert.equal(adet(db, G, B, 'kasa-demir'), HEDIYE_GUNLUK);
    // Ertesi gün sınır yenilenir.
    assert.equal(hediyeEt(db, {
      guildId: G, gonderenId: A, aliciId: B, kimlik: 'kasa-demir', simdi: Date.now() + 86_400_000,
    }).ok, true);
  });

  it('hediye: yönetici ile üye arasında yok, yöneticiler kendi arasında verebilir', () => {
    const db = hazir();
    const yoneticiler = [A, 'Y2'];
    esyaEkle(db, G, A, 'kasa-demir', 3);
    esyaEkle(db, G, B, 'kasa-demir', 1);
    const ver = (gonderenId, aliciId) => hediyeEt(db, {
      guildId: G, gonderenId, aliciId, kimlik: 'kasa-demir', yoneticiler,
    });
    assert.match(ver(A, B).sebep, /Yöneticilerle üyeler arasında/);
    assert.match(ver(B, A).sebep, /Yöneticilerle üyeler arasında/);
    assert.equal(ver(A, 'Y2').ok, true);
    assert.equal(adet(db, G, B, 'kasa-demir'), 1);
  });

  it('koleksiyon özeti', () => {
    const db = hazir();
    esyaEkle(db, G, A, 'kart-ace', 2);
    esyaEkle(db, G, A, 'kart-lych', 1);
    const kol = koleksiyon(db, G, A);
    assert.equal(kol.farkli, 2);
    assert.equal(kol.kartSayisi, 3);
    assert.equal(kol.deger, 2 * 400 + 25_000);
    assert.equal(kol.kademeler.find((k) => k.nadirlik === 'efsanevi').sahip, 1);
  });
});

describe('kasa kaynakları', () => {
  it('mağazadan adetli alım envantere giriyor', () => {
    const db = hazir(10_000);
    const s = esyaSatinAl(db, { guildId: G, kullaniciId: A, kimlik: 'kasa-ahsap', adet: 3 });
    assert.equal(s.ok, true);
    assert.equal(s.odenen, 3_600);
    assert.equal(adet(db, G, A, 'kasa-ahsap'), 3);
    assert.equal(esyaSatinAl(db, { guildId: G, kullaniciId: A, kimlik: 'xp-iksiri', adet: 2 }).ok, false);
    assert.equal(esyaSatinAl(db, { guildId: G, kullaniciId: A, kimlik: 'kasa-ahsap', adet: 11 }).ok, false);
  });

  it('her günlük ödül Günlük Kasa, 7. gün ayrıca Ahşap Kasa veriyor', () => {
    const db = hazir();
    const tr = (gun) => Date.parse(`2026-10-${String(gun).padStart(2, '0')}T12:00:00+03:00`);
    const ilk = gunlukAl(db, { guildId: G, kullaniciId: A, simdi: tr(1) });
    assert.deepEqual(ilk.kasalar, ['kasa-gunluk']);
    let son;
    for (let gun = 2; gun <= 7; gun += 1) son = gunlukAl(db, { guildId: G, kullaniciId: A, simdi: tr(gun) });
    assert.deepEqual(son.kasalar, ['kasa-gunluk', HAFTALIK_KASA]);
    assert.equal(adet(db, G, A, 'kasa-gunluk'), 7);
    assert.equal(adet(db, G, A, HAFTALIK_KASA), 1);
    // Aynı gün ikinci kez kasa yok.
    assert.equal(gunlukAl(db, { guildId: G, kullaniciId: A, simdi: tr(7) + 1000 }).verildi, false);
    assert.equal(adet(db, G, A, 'kasa-gunluk'), 7);
  });

  it('günlük kasa hediye edilemiyor, açılabiliyor', () => {
    const db = hazir();
    esyaEkle(db, G, A, 'kasa-gunluk', 2);
    assert.equal(hediyeEt(db, { guildId: G, gonderenId: A, aliciId: B, kimlik: 'kasa-gunluk' }).ok, false);
    assert.equal(kasaAc(db, { guildId: G, kullaniciId: A, kasa: 'kasa-gunluk' }).ok, true);
    assert.equal(adet(db, G, A, 'kasa-gunluk'), 1);
  });
});

describe('açılış görünümü', () => {
  it('buton kimliği kasa ve kişiye bağlı', () => {
    assert.deepEqual(acButonAyristir(acButonId('kasa-altin', '42')), { kasa: 'kasa-altin', kullaniciId: '42' });
    assert.equal(acButonAyristir('kasa:ac:yok:42'), null);
    assert.equal(acButonAyristir('bj:cek:42'), null);
  });

  it('karede ortayı gösteren oklar', () => {
    const satirlar = kareMetni(['a', 'b', 'c', 'X', 'd', 'e', 'f']).split('\n');
    assert.equal(satirlar[1], 'abcXdef');
    assert.equal([...satirlar[0]].indexOf('🔻'), [...'▪️▪️▪️'].length);
  });
});

describe('açılmamış kasalar', () => {
  it('ucuzdan pahalıya adetleriyle listelenir', () => {
    const db = acVeritabani(':memory:');
    assert.deepEqual(acilmamisKasalar(db, G, A), []);
    esyaEkle(db, G, A, 'kasa-elmas', 1);
    esyaEkle(db, G, A, 'kasa-ahsap', 3);
    esyaEkle(db, G, A, 'kart-quincy', 2);
    assert.deepEqual(acilmamisKasalar(db, G, A), [{ kimlik: 'kasa-ahsap', adet: 3 }, { kimlik: 'kasa-elmas', adet: 1 }]);
  });
});
