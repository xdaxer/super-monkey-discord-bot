import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BIRLESTIRME_ADEDI, birlestir, birlestirmeOrani, birlestirilebilirMi, toptanBirlestir, toptanBirlestirOnizleme,
  ustNadirlik,
} from '../lib/birlestirme.js';
import { acVeritabani } from '../lib/db.js';
import { bakiye } from '../lib/ekonomi.js';
import { adet, envanter, esyaEkle } from '../lib/envanter.js';
import {
  hediyeEdilirMi, hediyeEt, kartDegeri, KASA_ICERIKLERI, kartGetir, kartMi, kartSat, kasaAc, kasaBeklenen, kasaVer, koleksiyon,
  NADIRLIK_SIRASI, NADIRLIKLER, PARLAK_BEKLENEN_CARPAN, PARLAK_CARPANI, parlakKimlik, toptanOnizleme, toptanSat,
} from '../lib/kasalar.js';
import { kartIzgarasi, puanSatiri } from '../lib/envanter-gorunum.js';
import { esyaGetir } from '../lib/esyalar.js';
import { setIlerlemesi, SETLER } from '../lib/setler.js';

const G = 'g1';
const A = '100';
const B = '200';

const db0 = () => acVeritabani(':memory:');
const sira = (...d) => {
  let i = 0;
  return () => d[i++];
};

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

describe('parlak kartlar', () => {
  it('kimlik, ad ve değer: normalin 5 katı', () => {
    const p = kartGetir(parlakKimlik('kart-quincy'));
    assert.ok(kartMi('parlak:kart-quincy'));
    assert.equal(p.parlak, true);
    assert.equal(p.ad, '✨ Quincy');
    assert.equal(p.emojiAdi, 'btd_quincy');
    assert.equal(kartDegeri(p), 6_000 * PARLAK_CARPANI);
    assert.equal(kartDegeri(kartGetir('kart-quincy')), 6_000);
    assert.equal(kartGetir('parlak:kart-yok'), null);
    assert.ok(hediyeEdilirMi('parlak:kart-quincy'));
  });

  it('kasadan %1 ihtimalle parlak çıkar (yeni kart sayımı normal sürümle ortak)', () => {
    const db = db0();
    for (let i = 0; i < 3; i += 1) kasaVer(db, { guildId: G, kullaniciId: A, kasa: 'kasa-elmas', tur: 'test' });
    const destansi = secici('kasa-elmas', (o) => o.nadirlik === 'destansi');
    // 0,005 < 0,01: parlak
    const p = kasaAc(db, { guildId: G, kullaniciId: A, kasa: 'kasa-elmas', rastgele: sira(destansi, 0, 0.005) });
    assert.equal(p.sonuc.kimlik, 'parlak:kart-quincy');
    assert.equal(p.sonuc.parlak, true);
    assert.equal(p.sonuc.yeniKart, true);
    // 0,01 ve üstü: normal; parlak sürüm zaten var → YENİ değil
    const n = kasaAc(db, { guildId: G, kullaniciId: A, kasa: 'kasa-elmas', rastgele: sira(destansi, 0, 0.01) });
    assert.equal(n.sonuc.kimlik, 'kart-quincy');
    assert.equal(n.sonuc.parlak, undefined);
    assert.equal(n.sonuc.yeniKart, false);
    assert.equal(adet(db, G, A, 'parlak:kart-quincy'), 1);
  });

  it('satış 5 katı; hediye ve toptan satış parlak kartı da kapsar', () => {
    const db = db0();
    esyaEkle(db, G, A, 'parlak:kart-dart_monkey', 2);
    esyaEkle(db, G, A, 'kart-dart_monkey', 1);
    const s = kartSat(db, { guildId: G, kullaniciId: A, kimlik: 'parlak:kart-dart_monkey' });
    assert.equal(s.tutar, 2_000);
    assert.equal(bakiye(db, G, A), 2_000);
    const h = hediyeEt(db, { guildId: G, gonderenId: A, aliciId: B, kimlik: 'parlak:kart-dart_monkey' });
    assert.equal(h.ok, true);
    assert.equal(adet(db, G, B, 'parlak:kart-dart_monkey'), 1);
    esyaEkle(db, G, A, 'parlak:kart-dart_monkey', 1);
    assert.deepEqual(toptanOnizleme(envanter(db, G, A)), { adet: 2, tutar: 2_400 });
    assert.deepEqual(toptanSat(db, { guildId: G, kullaniciId: A }), { adet: 2, tutar: 2_400 });
  });

  it('koleksiyon puanı ve sayımı parlak değeriyle; farklı kart tekrar sayılmaz', () => {
    const db = db0();
    esyaEkle(db, G, A, 'kart-quincy');
    esyaEkle(db, G, A, 'parlak:kart-quincy');
    esyaEkle(db, G, A, 'parlak:kart-lych');
    const k = koleksiyon(db, G, A);
    assert.equal(k.farkli, 2);
    assert.equal(k.kartSayisi, 3);
    assert.equal(k.deger, 6_000 + 30_000 + 125_000);
    const { puan, sayim } = puanSatiri(envanter(db, G, A));
    assert.equal(puan, k.deger);
    assert.equal(sayim.destansi, 2);
  });

  it('ızgarada parlak sahibi ✨ ile işaretlenir; yalnız parlak varsa kart ❔ değil', () => {
    const izgara = kartIzgarasi({ 'parlak:kart-quincy': 1, 'kart-lych': 2 }, (k) => `[${k.kimlik}]`);
    assert.ok(izgara.includes('[kart-quincy]⁰⁰✨'));
    assert.ok(izgara.includes('[kart-lych]⁰²'));
    assert.ok(!izgara.includes('[kart-lych]⁰²✨'));
  });

  it('set normal ya da parlak sürümle tamamlanır', () => {
    const set = SETLER.find((s) => s.kimlik === 'bosslar');
    const sahip = Object.fromEntries(set.kartlar.map((k, i) => [i % 2 ? parlakKimlik(k) : k, 1]));
    assert.equal(setIlerlemesi(sahip, set).tamam, true);
  });

  it('kasa beklenen değeri parlak payıyla %4 artar ve fiyatın altında kalır', () => {
    assert.ok(Math.abs(PARLAK_BEKLENEN_CARPAN - 1.04) < 1e-12);
    for (const k of ['kasa-ahsap', 'kasa-demir', 'kasa-altin', 'kasa-elmas']) {
      assert.ok(kasaBeklenen(k).tum < esyaGetir(k).fiyat, k);
    }
  });
});

describe('birleştirme', () => {
  it('oran: 5 kopya hep çıkan kartın değerinden fazla (muz şişmez); Mitik birleşmez', () => {
    for (const n of NADIRLIK_SIRASI.slice(0, -1)) {
      const oran = birlestirmeOrani(n);
      assert.ok(oran > 1 && oran < 1.35, `${n} ${oran}`);
      assert.equal(NADIRLIKLER[n].deger * BIRLESTIRME_ADEDI > NADIRLIKLER[ustNadirlik(n)].deger, true);
    }
    assert.equal(ustNadirlik('mitik'), null);
    assert.equal(birlestirilebilirMi('kart-lych_elite'), false);
    assert.equal(birlestirilebilirMi('parlak:kart-quincy'), false);
    assert.equal(birlestirilebilirMi('kart-quincy'), true);
  });

  it('5 kopya → bir üst nadirlikten 1 kart, eşya defterine birlestir', () => {
    const db = db0();
    esyaEkle(db, G, A, 'kart-dart_monkey', 5);
    const s = birlestir(db, { guildId: G, kullaniciId: A, kimlik: 'kart-dart_monkey', rastgele: sira(0) });
    assert.equal(s.ok, true);
    assert.equal(s.harcanan, 5);
    assert.equal(s.sonuclar[0].kart.kimlik, 'kart-wizard');
    assert.equal(s.sonuclar[0].kart.nadirlik, 'nadir');
    assert.equal(s.yeniKart, 1);
    assert.equal(adet(db, G, A, 'kart-dart_monkey'), 0);
    assert.equal(adet(db, G, A, 'kart-wizard'), 1);
    const defter = db.prepare("SELECT esya, adet FROM esya_hareketleri WHERE tur = 'birlestir' ORDER BY id").all();
    assert.deepEqual(defter.map((d) => [d.esya, d.adet]), [['kart-dart_monkey', -5], ['kart-wizard', 1]]);
  });

  it('yetersiz kopya, Mitik, parlak ve geçersiz adet reddedilir; hiçbir şey yazılmaz', () => {
    const db = db0();
    esyaEkle(db, G, A, 'kart-dart_monkey', 4);
    esyaEkle(db, G, A, 'kart-lych_elite', 9);
    esyaEkle(db, G, A, 'parlak:kart-quincy', 9);
    const dene = (kimlik, kac) => birlestir(db, { guildId: G, kullaniciId: A, kimlik, adet: kac });
    assert.equal(dene('kart-dart_monkey', 1).ok, false);
    assert.equal(dene('kart-lych_elite', 1).ok, false);
    assert.equal(dene('parlak:kart-quincy', 1).ok, false);
    assert.equal(dene('kart-yok', 1).ok, false);
    assert.equal(dene('kart-dart_monkey', 0).ok, false);
    assert.equal(adet(db, G, A, 'kart-dart_monkey'), 4);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM esya_hareketleri WHERE tur = 'birlestir'").get().n, 0);
  });

  it('adet: 10 kopya iki birleştirme; yeni kart bayrağı normal/parlak sürümü sayar', () => {
    const db = db0();
    esyaEkle(db, G, A, 'kart-dart_monkey', 10);
    esyaEkle(db, G, A, 'parlak:kart-wizard', 1);
    const s = birlestir(db, {
      guildId: G, kullaniciId: A, kimlik: 'kart-dart_monkey', adet: 2, rastgele: sira(0, 0),
    });
    assert.equal(s.ok, true);
    assert.equal(s.sonuclar.length, 2);
    // Parlak Büyücü zaten vardı → YENİ değil.
    assert.equal(s.yeniKart, 0);
    assert.equal(adet(db, G, A, 'kart-wizard'), 2);
  });

  it('toptan: her karttan 1 kopya kalır, 5\'li gruplar, zincirleme yok, parlak dokunulmaz', () => {
    const db = db0();
    esyaEkle(db, G, A, 'kart-dart_monkey', 12); // 11 fazla → 2 grup, 1 kalır + 4
    esyaEkle(db, G, A, 'kart-boomerang', 5); // 4 fazla → 0 grup
    esyaEkle(db, G, A, 'kart-wizard', 6); // 5 fazla → 1 grup
    esyaEkle(db, G, A, 'kart-lych_elite', 20); // Mitik
    esyaEkle(db, G, A, 'parlak:kart-dart_monkey', 9);
    const onizleme = toptanBirlestirOnizleme(envanter(db, G, A));
    assert.deepEqual(onizleme, { birlestirme: 3, harcanan: 15 });
    const s = toptanBirlestir(db, { guildId: G, kullaniciId: A, rastgele: () => 0 });
    assert.equal(s.birlestirme, 3);
    assert.equal(s.harcanan, 15);
    assert.equal(adet(db, G, A, 'kart-dart_monkey'), 2);
    assert.equal(adet(db, G, A, 'kart-boomerang'), 5);
    // Büyücü: 6 - 5 + 2 (Sıradan birleştirmelerinden).
    assert.equal(adet(db, G, A, 'kart-wizard'), 3);
    assert.equal(adet(db, G, A, 'kart-lych_elite'), 20);
    assert.equal(adet(db, G, A, 'parlak:kart-dart_monkey'), 9);
    // Sıradan 2 birleştirme → Büyücü ×2; Büyücü 1 birleştirme → Quincy (zincir yok: yeni Büyücüler sayılmadı).
    assert.equal(adet(db, G, A, 'kart-quincy'), 1);
    assert.equal(s.yeniKart, 1);
  });
});
