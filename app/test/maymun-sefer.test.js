import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { acVeritabani } from '../lib/db.js';
import { bakiye, ekle } from '../lib/ekonomi.js';
import { ENERJI_MAKS, enerjiOku, enerjiYaz } from '../lib/enerji.js';
import {
  adet, esyaDus, esyaEkle, serbestEnvanter,
} from '../lib/envanter.js';
import { esyaSatinAl } from '../lib/esyalar.js';
import {
  KADEMELER, maymunBilgisi, maymunKilitle, maymunXp, maymunYukselt, sonrakiYukseltme, yukseltmeEtkisi,
  yukseltmeGecerliMi, xpVer,
} from '../lib/maymun.js';
import { calis, calismaDurumu, YORGUNLUK } from '../lib/meslekler.js';
import { prestijYap } from '../lib/prestij.js';
import {
  SEFER_SAATLIK, SEFERLER, seferGeri, seferGetir, seferGonder, seferKasasi, seferListesi, seferSlotu, seferTahmini,
  seferTopla,
} from '../lib/sefer.js';

const G = 'g1';
const A = '100';
const SA = 3_600_000;
const T0 = Date.parse('2026-01-05T12:00:00+03:00');

const db = () => acVeritabani(':memory:');
const k = { guildId: G, kullaniciId: A };
const seviyeAyarla = (v, seviye) => v
  .prepare('INSERT OR REPLACE INTO seviyeler (guild_id, kullanici_id, xp, seviye) VALUES (?, ?, 0, ?)')
  .run(G, A, seviye);
/** Maymunu `seviye`ye çıkaracak kadar XP verir. */
function maymunSeviyesi(v, kart, seviye) {
  while (maymunBilgisi(v, G, A, kart).seviye < seviye) xpVer(v, G, A, kart, 10);
}

describe('yükseltme yolları (BTD6 5-2-0)', () => {
  it('çapraz yol kuralı', () => {
    assert.ok(yukseltmeGecerliMi([5, 2, 0]));
    assert.ok(yukseltmeGecerliMi([0, 2, 5]));
    assert.ok(yukseltmeGecerliMi([2, 2, 0]));
    assert.ok(!yukseltmeGecerliMi([3, 3, 0]));
    assert.ok(!yukseltmeGecerliMi([1, 1, 1]));
    assert.equal(sonrakiYukseltme([3, 2, 0], 2, 99).engel, 'capraz');
    assert.equal(sonrakiYukseltme([3, 2, 0], 1, 99).engel, 'capraz');
    assert.equal(sonrakiYukseltme([5, 0, 0], 0, 99).engel, 'tavan');
    assert.equal(sonrakiYukseltme([0, 0, 0], 0, 1).engel, 'seviye');
  });

  it('etkiler kademelerle artar', () => {
    assert.deepEqual(yukseltmeEtkisi([0, 0, 0]), {
      kazanc: 0, enerji: 0, sure: 0, olay: 0, kasa: 1,
    });
    const e = yukseltmeEtkisi([5, 2, 0]);
    assert.equal(e.kazanc, 0.5);
    assert.equal(e.enerji, 0.12);
    assert.equal(yukseltmeEtkisi([0, 0, 5]).kasa, 5);
  });

  it('seviye ve bakiye denetlenir, bedel düşer, yol yazılır', () => {
    const v = db();
    esyaEkle(v, G, A, 'kart-quincy');
    ekle(v, { ...k, miktar: 100_000, tur: 'yonetici' });
    assert.match(maymunYukselt(v, { ...k, kimlik: 'kart-quincy', yol: 0 }).sebep, /Sv 2/);
    maymunSeviyesi(v, 'kart-quincy', 2);
    const s = maymunYukselt(v, { ...k, kimlik: 'kart-quincy', yol: 0 });
    assert.equal(s.ok, true);
    assert.deepEqual(s.maymun.yollar, [1, 0, 0]);
    assert.equal(bakiye(v, G, A), 100_000 - KADEMELER[0].bedel);
    const satir = v.prepare("SELECT miktar, karsi_id FROM ekonomi_hareketleri WHERE tur = 'yukseltme'").get();
    assert.deepEqual({ ...satir }, { miktar: -KADEMELER[0].bedel, karsi_id: 'kart-quincy' });
  });

  it('bakiye yetmezse hiçbir şey yazılmaz; maymun olmayan kart reddedilir', () => {
    const v = db();
    esyaEkle(v, G, A, 'kart-quincy');
    esyaEkle(v, G, A, 'kart-zebra');
    maymunSeviyesi(v, 'kart-quincy', 2);
    assert.match(maymunYukselt(v, { ...k, kimlik: 'kart-quincy', yol: 0 }).sebep, /Bakiyen yetmiyor/);
    assert.deepEqual(maymunBilgisi(v, G, A, 'kart-quincy').yollar, [0, 0, 0]);
    assert.equal(maymunYukselt(v, { ...k, kimlik: 'kart-zebra', yol: 0 }).ok, false);
  });

  it('Kazanç yolu çalışma muzunu, Dayanıklılık enerji bedelini değiştirir', () => {
    const v = db();
    esyaEkle(v, G, A, 'kart-quincy');
    ekle(v, { ...k, miktar: 100_000, tur: 'yonetici' });
    maymunKilitle(v, { ...k, kimlik: 'kart-quincy' });
    const once = calismaDurumu(v, G, A, T0).bedel;
    maymunSeviyesi(v, 'kart-quincy', 4);
    const direncliBedel = calismaDurumu(v, G, A, T0).bedel;
    maymunYukselt(v, { ...k, kimlik: 'kart-quincy', yol: 1 });
    maymunYukselt(v, { ...k, kimlik: 'kart-quincy', yol: 1 });
    const d = calismaDurumu(v, G, A, T0);
    assert.ok(Math.abs(d.bedel - direncliBedel * (1 - 0.12)) < 1e-9);
    assert.ok(d.bedel < once);
    assert.ok(Math.abs(d.bedel - YORGUNLUK * (1 - d.maymun.direnc) * 0.88) < 1e-9);

    maymunYukselt(v, { ...k, kimlik: 'kart-quincy', yol: 0 });
    const s = calis(v, { ...k, simdi: T0, rastgele: () => 0.99 });
    assert.equal(s.kazanc, Math.floor(s.taban * 1.08 + 1e-9));
  });
});

describe('seferler', () => {
  it('tahmin: saat, verim, nadirlik ve seviye', () => {
    const v = db();
    esyaEkle(v, G, A, 'kart-quincy');
    const m = maymunBilgisi(v, G, A, 'kart-quincy');
    const kisa = seferTahmini(m, seferGetir('kisa'));
    const nadirlik = { siradan: 1, nadir: 1.25, destansi: 1.6 }[m.kart.nadirlik];
    assert.equal(kisa.muz, Math.round(SEFER_SAATLIK * nadirlik));
    assert.equal(kisa.sureMs, SA);
    const uzun = seferTahmini(m, seferGetir('uzun'));
    assert.ok(uzun.muz / 8 < kisa.muz, 'uzun sefer saat başı daha az verir');
    assert.equal(uzun.xp, 32);
  });

  it('slot seviyeyle açılır', () => {
    assert.deepEqual([0, 9, 10, 24, 25, 99].map(seferSlotu), [1, 1, 2, 2, 3, 3]);
  });

  it('gönderilir, kilitlenir, dönmeden toplanmaz, dönünce ödül ve XP gelir', () => {
    const v = db();
    esyaEkle(v, G, A, 'kart-quincy');
    const g = seferGonder(v, {
      ...k, kimlik: 'kart-quincy', sure: 'kisa', simdi: T0,
    });
    assert.equal(g.ok, true);
    assert.equal(g.bitis, T0 + SA);
    assert.equal(esyaDus(v, G, A, 'kart-quincy'), false, 'seferdeki kopya satılamaz');
    assert.deepEqual(serbestEnvanter(v, G, A), {});
    assert.match(maymunKilitle(v, { ...k, kimlik: 'kart-quincy' }).sebep, /seferde/);
    assert.match(seferGonder(v, { ...k, kimlik: 'kart-quincy', sure: 'kisa' }).sebep, /meşgul/);

    assert.equal(seferTopla(v, { ...k, simdi: T0 + SA - 1 }).ok, false);
    const t = seferTopla(v, { ...k, simdi: T0 + SA, rastgele: () => 0.99 });
    assert.equal(t.ok, true);
    assert.equal(t.toplamMuz, g.muz);
    assert.equal(bakiye(v, G, A), g.muz);
    assert.equal(maymunXp(v, G, A, 'kart-quincy'), g.xp);
    assert.equal(seferListesi(v, G, A, T0 + SA).length, 0);
    assert.equal(esyaDus(v, G, A, 'kart-quincy'), true, 'dönen maymun serbest');
  });

  it('slot dolunca reddedilir; çalışan maymunun tek kopyası sefere gidemez', () => {
    const v = db();
    esyaEkle(v, G, A, 'kart-quincy');
    esyaEkle(v, G, A, 'kart-dart_monkey', 2);
    maymunKilitle(v, { ...k, kimlik: 'kart-quincy' });
    assert.match(seferGonder(v, { ...k, kimlik: 'kart-quincy', sure: 'kisa' }).sebep, /meşgul/);
    assert.equal(seferGonder(v, { ...k, kimlik: 'kart-dart_monkey', sure: 'kisa' }).ok, true);
    assert.match(seferGonder(v, { ...k, kimlik: 'kart-dart_monkey', sure: 'kisa' }).sebep, /en çok \*\*1\*\*/);
    seviyeAyarla(v, 10);
    assert.equal(seferGonder(v, { ...k, kimlik: 'kart-dart_monkey', sure: 'orta' }).ok, true);
    assert.equal(adet(v, G, A, 'kart-dart_monkey'), 2);
    assert.equal(esyaDus(v, G, A, 'kart-dart_monkey'), false);
  });

  it('geri çağırınca ödülsüz döner', () => {
    const v = db();
    esyaEkle(v, G, A, 'kart-quincy');
    const g = seferGonder(v, { ...k, kimlik: 'kart-quincy', sure: 'uzun' });
    assert.equal(seferGeri(v, { ...k, id: g.id }).ok, true);
    assert.equal(seferGeri(v, { ...k, id: g.id }).ok, false);
    assert.equal(bakiye(v, G, A), 0);
  });

  it('Dayanıklılık süreyi kısaltır; kasa zarı Şans çarpanıyla', () => {
    const v = db();
    esyaEkle(v, G, A, 'kart-quincy');
    v.prepare("INSERT INTO maymun_deneyim (guild_id, kullanici_id, kart, xp, yukseltme) VALUES (?, ?, ?, 0, '0-2-0')").run(G, A, 'kart-quincy');
    assert.equal(seferTahmini(maymunBilgisi(v, G, A, 'kart-quincy'), seferGetir('uzun')).sureMs, Math.round(8 * SA * 0.88));
    const uzun = SEFERLER.at(-1);
    assert.equal(seferKasasi(uzun, 1, () => uzun.demir / 2), 'kasa-demir');
    assert.equal(seferKasasi(uzun, 1, () => uzun.demir + uzun.ahsap - 0.001), 'kasa-ahsap');
    assert.equal(seferKasasi(uzun, 1, () => uzun.demir + uzun.ahsap + 0.001), null);
    assert.equal(seferKasasi(uzun, 2, () => uzun.demir + uzun.ahsap + 0.001), 'kasa-ahsap');
  });

  it('prestij seferleri kartlarla siler, yükseltmeler korunur', () => {
    const v = db();
    esyaEkle(v, G, A, 'kart-quincy');
    v.prepare("INSERT INTO maymun_deneyim (guild_id, kullanici_id, kart, xp, yukseltme) VALUES (?, ?, ?, 50, '2-0-0')").run(G, A, 'kart-quincy');
    seferGonder(v, { ...k, kimlik: 'kart-quincy', sure: 'kisa' });
    seviyeAyarla(v, 99);
    ekle(v, { ...k, miktar: 200_000, tur: 'calis' });
    const p = prestijYap(v, { ...k, beklenenSeviye: 0 });
    assert.equal(p.ok, true, p.sebep);
    assert.equal(seferListesi(v, G, A).length, 0);
    assert.deepEqual(maymunBilgisi(v, G, A, 'kart-quincy').yollar, [2, 0, 0]);
  });
});

describe('Enerji Totemi', () => {
  it('enerjiyi doldurur; doluyken ve günde 40 kezden fazla alınmaz', () => {
    const v = db();
    ekle(v, { ...k, miktar: 100_000, tur: 'yonetici' });
    const al = (simdi) => esyaSatinAl(v, { ...k, kimlik: 'enerji-totemi', simdi });
    assert.match(al(T0).sebep, /zaten dolu/);
    for (let i = 0; i < 40; i += 1) {
      enerjiYaz(v, G, A, 10, T0 + i);
      const s = al(T0 + i);
      assert.equal(s.ok, true, s.sebep);
      assert.equal(s.sonuc.enerji, ENERJI_MAKS);
      assert.equal(s.odenen, 200, 'fiyat gün içinde sabit');
    }
    enerjiYaz(v, G, A, 10, T0 + 50);
    assert.match(al(T0 + 50).sebep, /günde en çok 40/);
    assert.equal(enerjiOku(v, G, A, T0 + 50), 10);
    enerjiYaz(v, G, A, 10, T0 + 24 * SA);
    assert.equal(al(T0 + 24 * SA).ok, true, 'ertesi gün yenilenir');
  });
});
