import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { VADELER as BANKA_VADELERI, boz, yatir } from '../lib/banka.js';
import { acVeritabani } from '../lib/db.js';
import {
  bakiye, ekle, gonder, gunlukAl, mesajOdulu, TURLER,
} from '../lib/ekonomi.js';
import { basilanYokEdilen, enCokKazananlar, kategoriBul } from '../lib/ekonomi-panel.js';
import {
  aktifKredi, borcaKes, borcluMu, borcOzeti, cezaHedefi, KREDI_MIN_SEVIYE, krediAl, krediLimiti, krediOde, VADELER,
  vadesiGelenleriIsle,
} from '../lib/kredi.js';
import { calis } from '../lib/meslekler.js';

const G = 'g1';
const A = '100';
const B = '200';
const GUN = 86_400_000;
const T0 = 10 * GUN;

function hazir(para = 0) {
  const db = acVeritabani(':memory:');
  if (para > 0) ekle(db, { guildId: G, kullaniciId: A, miktar: para, tur: TURLER.yonetici, simdi: T0 });
  return db;
}

const al = (db, miktar, vade = '7g', ek = {}) => krediAl(db, {
  guildId: G, kullaniciId: A, miktar, vade, seviye: 10, simdi: T0, ...ek,
});

/** Krediyi alır, parayı harcatır (bakiye 0) ve vadesini geçirir. */
function borcaDus(db, miktar = 10_000, vade = '7g') {
  assert.equal(al(db, miktar, vade).ok, true);
  db.prepare('UPDATE bakiyeler SET bakiye = 0 WHERE guild_id = ? AND kullanici_id = ?').run(G, A);
  const k = aktifKredi(db, G, A);
  return { k, vadeSonu: k.vade };
}

describe('kredi sayıları ve sınırlar', () => {
  it('vadeler ve faizler belgedeki gibi', () => {
    assert.deepEqual(VADELER.map((v) => [v.kimlik, v.gun, v.yuzde]), [['3g', 3, 25], ['7g', 7, 60], ['14g', 14, 130]]);
  });

  it('limit seviyeyle artar, 200.000\'de durur', () => {
    assert.equal(krediLimiti(0), 5_000);
    assert.equal(krediLimiti(10), 25_000);
    assert.equal(krediLimiti(97), 199_000);
    assert.equal(krediLimiti(500), 200_000);
  });

  it('en az 1.000, en çok limit, geçersiz vade reddedilir', () => {
    const db = hazir();
    assert.equal(al(db, 999).ok, false);
    assert.equal(al(db, 25_001).ok, false);
    assert.equal(al(db, 5000, '1g').ok, false);
    assert.equal(bakiye(db, G, A), 0);
    const iyi = al(db, 25_000);
    assert.equal(iyi.ok, true);
    assert.equal(bakiye(db, G, A), 25_000);
  });

  it('aynı anda tek aktif kredi', () => {
    const db = hazir();
    assert.equal(al(db, 5000).ok, true);
    const ikinci = al(db, 5000, '3g');
    assert.equal(ikinci.ok, false);
    assert.match(ikinci.sebep, /bir kredi/);
    assert.equal(bakiye(db, G, A), 5000);
    // Başka kişi etkilenmez.
    assert.equal(krediAl(db, { guildId: G, kullaniciId: B, miktar: 2000, vade: '3g', seviye: 3, simdi: T0 }).ok, true);
  });

  it('Sv 3\'ün altında kredi çekilemez', () => {
    const db = hazir();
    const r = al(db, 1000, '3g', { seviye: KREDI_MIN_SEVIYE - 1 });
    assert.equal(r.ok, false);
    assert.match(r.sebep, /Sv 3/);
    assert.equal(bakiye(db, G, A), 0);
    assert.equal(al(db, 1000, '3g', { seviye: KREDI_MIN_SEVIYE }).ok, true);
    assert.equal(KREDI_MIN_SEVIYE, 3);
  });

  it('veritabanı da ikinci açık krediyi reddeder', () => {
    const db = hazir();
    al(db, 5000);
    assert.throws(() => db.prepare(
      `INSERT INTO krediler (guild_id, kullanici_id, anapara, faiz_yuzde, faiz, baslangic, vade, durum)
       VALUES (?, ?, 1000, 10, 100, 0, 1, 'aktif')`,
    ).run(G, A));
  });
});

describe('faiz ve erken ödeme', () => {
  it('faiz vade sonunda bir kez, anapara üzerinden', () => {
    const db = hazir();
    const s = al(db, 10_000, '7g');
    assert.equal(s.faiz, 6000);
    assert.equal(borcOzeti(s.kredi, T0).kalan, 10_000 + Math.floor((6000 * 1) / 7));
    assert.equal(borcOzeti(s.kredi, s.kredi.vade - 1).kalan, 10_000 + Math.floor((6000 * 7) / 7));
    assert.equal(borcOzeti(s.kredi, s.kredi.vade).kalan, 16_000);
  });

  it('erken ödemede faiz orantılı: başlanmış gün tam sayılır', () => {
    const db = hazir();
    const s = al(db, 14_000, '14g'); // faiz 18.200, günü 1.300
    assert.equal(borcOzeti(s.kredi, T0).kalan, 15_300); // aynı an: en az 1 gün
    assert.equal(borcOzeti(s.kredi, T0 + 2 * GUN + 1).kalan, 14_000 + 3900); // 3. gün başladı
    assert.equal(borcOzeti(s.kredi, T0 + 7 * GUN).kalan, 14_000 + 9100);
  });

  it('kısmi ve tam erken ödeme krediyi kapatır', () => {
    const db = hazir();
    al(db, 10_000, '7g'); // aynı an borç 10.857
    ekle(db, { guildId: G, kullaniciId: A, miktar: 1000, tur: TURLER.yonetici, simdi: T0 });
    const ilk = krediOde(db, { guildId: G, kullaniciId: A, miktar: 4000, simdi: T0 });
    assert.deepEqual([ilk.ok, ilk.odenen, ilk.kalan, ilk.kapandi], [true, 4000, 6857, false]);
    const son = krediOde(db, { guildId: G, kullaniciId: A, simdi: T0 });
    assert.equal(son.kapandi, true);
    assert.equal(son.kalan, 0);
    assert.equal(aktifKredi(db, G, A), null);
    assert.equal(bakiye(db, G, A), 11_000 - 10_857);
  });
});

describe('vade tahsilatı ve borç bakiyesi', () => {
  it('vadede cüzdan yeterse tam tahsil edilir ve kredi kapanır', () => {
    const db = hazir();
    const s = al(db, 10_000, '7g'); // vadede 16.000
    ekle(db, { guildId: G, kullaniciId: A, miktar: 9000, tur: TURLER.yonetici, simdi: T0 });
    const sonuc = vadesiGelenleriIsle(db, { simdi: s.kredi.vade });
    assert.equal(sonuc.length, 1);
    assert.deepEqual([sonuc[0].yeni, sonuc[0].tahsil, sonuc[0].kalan, sonuc[0].kapandi], [true, 16_000, 0, true]);
    assert.equal(bakiye(db, G, A), 3000);
    assert.equal(aktifKredi(db, G, A), null);
    assert.equal(borcluMu(db, G, A, s.kredi.vade), false);
  });

  it('vadeden önce servis hiçbir şey yapmaz', () => {
    const db = hazir();
    const s = al(db, 10_000);
    assert.deepEqual(vadesiGelenleriIsle(db, { simdi: s.kredi.vade - 1 }), []);
    assert.equal(aktifKredi(db, G, A).durum, 'aktif');
    assert.equal(borcluMu(db, G, A, s.kredi.vade - 1), false);
  });

  it('cüzdan yetmezse yetenini tahsil eder, kalan borç olarak durur', () => {
    const db = hazir();
    const s = al(db, 10_000, '7g');
    db.prepare('UPDATE bakiyeler SET bakiye = 3000 WHERE guild_id = ?').run(G);
    const [r] = vadesiGelenleriIsle(db, { simdi: s.kredi.vade });
    assert.deepEqual([r.tahsil, r.kalan, r.kapandi], [3000, 13_000, false]);
    const k = aktifKredi(db, G, A);
    assert.equal(k.durum, 'gecikmis');
    assert.equal(k.odenen, 3000);
    assert.equal(bakiye(db, G, A), 0);
    assert.equal(borcluMu(db, G, A, s.kredi.vade), true);
  });

  it('servis aynı krediyi iki kez gecikmeye düşürmez, boş cüzdandan tahsilat yapmaz', () => {
    const db = hazir();
    const { vadeSonu } = borcaDus(db);
    const ilk = vadesiGelenleriIsle(db, { simdi: vadeSonu });
    assert.equal(ilk.length, 1);
    assert.equal(ilk[0].yeni, true);
    assert.deepEqual(vadesiGelenleriIsle(db, { simdi: vadeSonu }), []);
    assert.deepEqual(vadesiGelenleriIsle(db, { simdi: vadeSonu + 60_000 }), []);
    assert.equal(aktifKredi(db, G, A).odenen, 0);
  });

  it('gecikmişken cüzdana giren muz sonraki turda borca çekilir', () => {
    const db = hazir();
    const { vadeSonu } = borcaDus(db); // borç 16.000
    vadesiGelenleriIsle(db, { simdi: vadeSonu });
    ekle(db, { guildId: G, kullaniciId: A, miktar: 2000, tur: TURLER.kazanc, simdi: vadeSonu + 1 });
    const [r] = vadesiGelenleriIsle(db, { simdi: vadeSonu + 60_000 });
    assert.deepEqual([r.yeni, r.tahsil], [false, 2000]);
    assert.equal(bakiye(db, G, A), 0);
  });

  it('borç tamamen ödenince kısıtlar kalkar', () => {
    const db = hazir();
    const { vadeSonu } = borcaDus(db);
    vadesiGelenleriIsle(db, { simdi: vadeSonu });
    ekle(db, { guildId: G, kullaniciId: A, miktar: 20_000, tur: TURLER.kazanc, simdi: vadeSonu });
    const o = krediOde(db, { guildId: G, kullaniciId: A, simdi: vadeSonu });
    assert.equal(o.kapandi, true);
    assert.equal(o.odenen, 16_000);
    assert.equal(borcluMu(db, G, A, vadeSonu), false);
    assert.equal(al(db, 5000, '3g', { simdi: vadeSonu }).ok, true);
  });
});

describe('gecikme cezası', () => {
  it('günde %1, en çok %20', () => {
    const db = hazir();
    const { k } = borcaDus(db, 10_000, '7g');
    assert.equal(cezaHedefi(k, k.vade + GUN - 1), 0);
    assert.equal(cezaHedefi(k, k.vade + GUN), 100);
    assert.equal(cezaHedefi(k, k.vade + 5 * GUN), 500);
    assert.equal(cezaHedefi(k, k.vade + 20 * GUN), 2000);
    assert.equal(cezaHedefi(k, k.vade + 400 * GUN), 2000);
  });

  it('servis cezayı işletir, tavandan sonra borç büyümez', () => {
    const db = hazir();
    const { vadeSonu } = borcaDus(db, 10_000, '7g');
    vadesiGelenleriIsle(db, { simdi: vadeSonu });
    vadesiGelenleriIsle(db, { simdi: vadeSonu + 3 * GUN });
    let k = aktifKredi(db, G, A);
    assert.equal(k.ceza, 300);
    assert.equal(borcOzeti(k, vadeSonu + 3 * GUN).kalan, 16_300);
    vadesiGelenleriIsle(db, { simdi: vadeSonu + 100 * GUN });
    k = aktifKredi(db, G, A);
    assert.equal(k.ceza, 2000);
    assert.equal(borcOzeti(k, vadeSonu + 500 * GUN).kalan, 18_000);
  });
});

describe('gelir kesintisi', () => {
  it('borçluysa gelirin %50\'si borca gider, defterde kredi satırı olur', () => {
    const db = hazir();
    const { vadeSonu } = borcaDus(db);
    ekle(db, { guildId: G, kullaniciId: A, miktar: 400, tur: TURLER.calis, simdi: vadeSonu });
    const kesilen = borcaKes(db, G, A, 400, vadeSonu);
    assert.equal(kesilen, 200);
    assert.equal(bakiye(db, G, A), 200);
    assert.equal(aktifKredi(db, G, A).odenen, 200);
    const satir = db.prepare("SELECT miktar, karsi_id FROM ekonomi_hareketleri WHERE tur = 'kredi' ORDER BY id DESC LIMIT 1").get();
    assert.equal(satir.miktar, -200);
    assert.match(satir.karsi_id, /^kredi-\d+$/);
  });

  it('borcu olmayana ve vadesi gelmemiş krediye kesinti yok', () => {
    const db = hazir();
    assert.equal(borcaKes(db, G, A, 1000, T0), 0);
    al(db, 5000);
    ekle(db, { guildId: G, kullaniciId: A, miktar: 1000, tur: TURLER.calis, simdi: T0 });
    assert.equal(borcaKes(db, G, A, 1000, T0 + GUN), 0);
  });

  it('kesinti borçtan fazla olmaz ve borç bitince kredi kapanır', () => {
    const db = hazir();
    const { vadeSonu } = borcaDus(db, 1000, '3g'); // borç 1.250
    ekle(db, { guildId: G, kullaniciId: A, miktar: 10_000, tur: TURLER.calis, simdi: vadeSonu });
    assert.equal(borcaKes(db, G, A, 10_000, vadeSonu), 1250);
    assert.equal(aktifKredi(db, G, A), null);
    assert.equal(borcaKes(db, G, A, 10_000, vadeSonu), 0);
  });

  it('günlük ödül borçluyken kesilir, bakiye kesilmiş halini yansıtır', () => {
    const db = hazir();
    const { vadeSonu } = borcaDus(db);
    const s = gunlukAl(db, { guildId: G, kullaniciId: A, simdi: vadeSonu, rastgele: () => 0 });
    assert.equal(s.borcKesilen, Math.floor(s.toplam / 2));
    assert.equal(s.bakiye, s.toplam - s.borcKesilen);
    assert.equal(bakiye(db, G, A), s.bakiye);
  });

  it('/calis kesinti uygular ve dönen bakiye gerçeği yansıtır', () => {
    const db = hazir();
    const { vadeSonu } = borcaDus(db);
    const c = calis(db, { guildId: G, kullaniciId: A, simdi: vadeSonu, rastgele: () => 0 });
    assert.equal(c.ok, true);
    assert.equal(c.borcKesilen, Math.floor(c.kazanc / 2));
    assert.equal(c.bakiye, bakiye(db, G, A));
  });

  it('sohbet muzu: ödül gelir, kanca payı keser', () => {
    const db = hazir();
    const { vadeSonu } = borcaDus(db);
    const verilen = mesajOdulu(db, { guildId: G, kullaniciId: A, simdi: vadeSonu, rastgele: () => 0.99, carpan: 10 });
    assert.equal(verilen, 40);
    assert.equal(borcaKes(db, G, A, verilen, vadeSonu), 20);
    assert.equal(bakiye(db, G, A), 20);
  });
});

describe('borçlu kısıtları', () => {
  it('borçlu yeni kredi alamaz', () => {
    const db = hazir();
    const { vadeSonu } = borcaDus(db);
    const s = al(db, 5000, '3g', { simdi: vadeSonu + 1 });
    assert.equal(s.ok, false);
    assert.match(s.sebep, /Vadesi geçmiş/);
  });

  it('borçlu muz gönderemez (takasın muz kısmı da aynı yoldan geçer)', () => {
    const db = hazir();
    const { vadeSonu } = borcaDus(db);
    ekle(db, { guildId: G, kullaniciId: A, miktar: 500, tur: TURLER.kazanc, simdi: vadeSonu });
    const s = gonder(db, { guildId: G, gonderenId: A, aliciId: B, miktar: 100, simdi: vadeSonu });
    assert.equal(s.ok, false);
    assert.match(s.sebep, /kredi borcun/);
    assert.equal(bakiye(db, G, B), 0);
    // Alıcı olmak serbest: B, borçluya gönderebilir.
    ekle(db, { guildId: G, kullaniciId: B, miktar: 500, tur: TURLER.kazanc, simdi: vadeSonu });
    assert.equal(gonder(db, { guildId: G, gonderenId: B, aliciId: A, miktar: 100, simdi: vadeSonu }).ok, true);
  });

  it('vadesi gelmemiş kredisi olan kısıtlanmaz', () => {
    const db = hazir(1000);
    al(db, 5000);
    assert.equal(borcluMu(db, G, A, T0 + GUN), false);
    assert.equal(gonder(db, { guildId: G, gonderenId: A, aliciId: B, miktar: 100, simdi: T0 + GUN }).ok, true);
  });

  it('borçluluk sunucuya ve kişiye özeldir', () => {
    const db = hazir();
    const { vadeSonu } = borcaDus(db);
    assert.equal(borcluMu(db, G, B, vadeSonu), false);
    assert.equal(borcluMu(db, 'g2', A, vadeSonu), false);
    assert.equal(borcluMu(db, G, A, vadeSonu), true);
  });
});

describe('ekonomi paneli', () => {
  it('kredi türü tek kategoride net toplanır; faiz ve ceza yok edilen olur', () => {
    assert.equal(kategoriBul('kredi', 'diger'), 'kredi');
    // Verilen 10.000 (+), ödenen 12.300 (−): net −2.300 = faiz + ceza yok edildi.
    const kapali = basilanYokEdilen([{ tur: 'kredi', karsi: 'diger', artan: 10_000, azalan: 12_300 }]);
    assert.deepEqual(kapali.yokEdilen.map((k) => k.miktar), [2300]);
    assert.equal(kapali.toplamBasilan, 0);
    // Açık kredi: verilen anapara geçici basım sayılır.
    const acik = basilanYokEdilen([{ tur: 'kredi', karsi: 'diger', artan: 10_000, azalan: 0 }]);
    assert.deepEqual(acik.basilan.map((k) => k.miktar), [10_000]);
  });

  it('kredi, en çok kazananlar listesine girmez', () => {
    const db = hazir();
    al(db, 20_000, '7g', { seviye: 100 });
    assert.deepEqual(enCokKazananlar(db, G, { baslangic: 0, bitis: T0 + 1 }).filter((k) => k.kullanici_id === A).map((k) => k.net), []);
  });
});

describe('arbitraj: kredi al, bankaya yatır', () => {
  // Mevduat süreleri yarıya inince (2026-10-23) kısa vadenin günlük getirisi
  // kredinin günlük maliyetini geçebilir; bu yüzden ikisi birbirini dışlar.
  it('açık kredisi olan mevduat açamaz', () => {
    for (const v of VADELER) {
      const db = hazir();
      assert.equal(krediAl(db, { guildId: G, kullaniciId: A, miktar: 20_000, vade: v.kimlik, seviye: 100, simdi: T0 }).ok, true);
      for (const b of BANKA_VADELERI) {
        const y = yatir(db, { guildId: G, kullaniciId: A, miktar: 20_000, vade: b.kimlik, seviye: 100, simdi: T0 });
        assert.equal(y.ok, false, `${v.kimlik} + ${b.kimlik}`);
        assert.match(y.sebep, /Açık kredin varken/);
      }
    }
  });

  it('açık mevduatı olan kredi alamaz; mevduat kapanınca alır', () => {
    const db = hazir();
    ekle(db, { guildId: G, kullaniciId: A, miktar: 20_000, tur: TURLER.yonetici });
    const y = yatir(db, { guildId: G, kullaniciId: A, miktar: 20_000, vade: '7g', seviye: 100, simdi: T0 });
    assert.equal(y.ok, true);
    const red = al(db, 5_000, '3g', { seviye: 100 });
    assert.equal(red.ok, false);
    assert.match(red.sebep, /açık mevduatın varken/);
    boz(db, { guildId: G, kullaniciId: A, id: y.mevduat.id, simdi: T0 + GUN });
    assert.equal(al(db, 5_000, '3g', { seviye: 100, simdi: T0 + GUN }).ok, true);
  });
});

