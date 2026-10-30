import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { boz, yatir } from '../lib/banka.js';
import { bahisOyna } from '../lib/kumar.js';
import { acVeritabani } from '../lib/db.js';
import {
  dus, ekle, gonder, trGunBaslangici, TURLER,
} from '../lib/ekonomi.js';
import {
  arzDegisimi, arzOzeti, basilanYokEdilen, donemAraligi, donemSatirlari, enCokKazananlar, kasaKartOzeti,
  hareketAra, kategoriBul, kumarOyunlari, magazaSatislari, panelOzeti, sonHareketler, takasOzeti, TUR_ETIKETLERI, TUR_GRUPLARI, yoneticiGonderimleri,
} from '../lib/ekonomi-panel.js';
import { esyaHareketi } from '../lib/envanter.js';
import { esyaGetir, esyaSatinAl } from '../lib/esyalar.js';
import { etkinlikBaslat } from '../lib/etkinlik.js';
import { satinAl } from '../lib/magaza.js';
import { hareketEmbed, ozetEmbed, yuzdeMetni } from '../commands/ekonomi/ekonomi-panel.js';

const G = 'g1';
const A = '100';
const B = '200';
const C = '300';
const GUN = 86_400_000;

/** Türkiye saatiyle verilen anın UTC ms karşılığı. */
const tr = (metin) => Date.parse(`${metin}+03:00`);
const SIMDI = tr('2026-03-10T15:00:00');

const satir = (tur, karsi, artan, azalan) => ({
  tur, karsi, artan, azalan,
});
const bul = (liste, kod) => liste.find((k) => k.kod === kod)?.miktar;

describe('kategoriBul', () => {
  it('karşı taraf tipine göre kumar / düello / kasa / mağaza ayırır', () => {
    assert.equal(kategoriBul('bahis', 'yok'), 'kumar');
    assert.equal(kategoriBul('bahis', 'uye'), 'duello');
    assert.equal(kategoriBul('bahis', 'sayi'), 'duello');
    assert.equal(kategoriBul('kazanc', 'yok'), 'kumar');
    assert.equal(kategoriBul('kazanc', 'kasa'), 'kasa');
    assert.equal(kategoriBul('kazanc', 'diger'), 'kasa');
    assert.equal(kategoriBul('kazanc', 'uye'), 'duello');
    assert.equal(kategoriBul('iade', 'yok'), 'kumar');
    assert.equal(kategoriBul('iade', 'uye'), 'duello');
    assert.equal(kategoriBul('iade', 'sayi'), 'magaza');
    assert.equal(kategoriBul('iade', 'diger'), 'magaza');
    assert.equal(kategoriBul('gonder', 'uye'), 'transfer');
    assert.equal(kategoriBul('al', 'uye'), 'transfer');
    assert.equal(kategoriBul('satis', 'diger'), 'kart-satisi');
    assert.equal(kategoriBul('set-odul', 'diger'), 'set-odul');
    assert.equal(kategoriBul('boss', 'diger'), 'boss');
    assert.equal(kategoriBul('bilinmeyen', 'yok'), 'diger:bilinmeyen');
  });
});

describe('basilanYokEdilen (sahte defter)', () => {
  it('ödül türlerini basılan sayar', () => {
    const r = basilanYokEdilen([
      satir('gunluk', 'yok', 1000, 0), satir('mesaj', 'yok', 200, 0), satir('seviye', 'yok', 300, 0),
      satir('gorev', 'yok', 120, 0), satir('set-odul', 'diger', 500, 0), satir('faiz', 'diger', 40, 0),
      satir('satis', 'diger', 75, 0),
    ]);
    assert.equal(r.toplamBasilan, 2235);
    assert.equal(r.toplamYokEdilen, 0);
    assert.equal(r.net, 2235);
    assert.equal(bul(r.basilan, 'gunluk'), 1000);
    assert.equal(bul(r.basilan, 'kart-satisi'), 75);
  });

  it('kumar: bahis − kazanç kasa kârıdır (yok edilen); kasa ödülü ayrı basılan', () => {
    const r = basilanYokEdilen([
      satir('bahis', 'yok', 0, 1000), satir('kazanc', 'yok', 700, 0), satir('iade', 'yok', 100, 0),
      satir('kazanc', 'kasa', 250, 0),
    ]);
    assert.equal(bul(r.yokEdilen, 'kumar'), 200);
    assert.equal(bul(r.basilan, 'kasa'), 250);
    assert.equal(bul(r.basilan, 'kumar'), undefined);
    assert.equal(r.net, 50);
  });

  it('kasa kumarda zarar ederse net basılan olur', () => {
    const r = basilanYokEdilen([satir('bahis', 'yok', 0, 100), satir('kazanc', 'yok', 400, 0)]);
    assert.equal(bul(r.basilan, 'kumar'), 300);
    assert.equal(r.toplamYokEdilen, 0);
  });

  it('vergi gönder − al farkıdır; üyeler arası aktarım nötr', () => {
    const r = basilanYokEdilen([satir('gonder', 'uye', 0, 1000), satir('al', 'uye', 950, 0)]);
    assert.equal(bul(r.yokEdilen, 'transfer'), 50);
    assert.equal(r.toplamBasilan, 0);
  });

  it('düello: iki bahis − kazanç = kasa payı', () => {
    const r = basilanYokEdilen([satir('bahis', 'uye', 0, 2000), satir('kazanc', 'uye', 1900, 0)]);
    assert.equal(bul(r.yokEdilen, 'duello'), 100);
  });

  it('mağaza harcaması yok edilir, iadesi düşer; mevduat nötr', () => {
    const r = basilanYokEdilen([
      satir('magaza', 'sayi', 0, 5000), satir('iade', 'sayi', 1000, 0), satir('mevduat', 'yok', 800, 5000),
    ]);
    assert.equal(bul(r.yokEdilen, 'magaza'), 4000);
    assert.equal(r.yokEdilen.length, 1);
    assert.equal(r.basilan.length, 0);
  });

  it('yönetici ver/al iki yönde ayrı sayılır', () => {
    const r = basilanYokEdilen([satir('yonetici', 'uye', 5000, 0), satir('yonetici', 'uye', 0, 1200)]);
    assert.equal(bul(r.basilan, 'yonetici'), 5000);
    assert.equal(bul(r.yokEdilen, 'yonetici'), 1200);
    assert.equal(r.net, 3800);
  });

  it('erken bozma cezası yok edilene eklenir; büyükten küçüğe sıralanır', () => {
    const r = basilanYokEdilen([satir('magaza', 'diger', 0, 300)], 100);
    assert.deepEqual(r.yokEdilen.map((k) => k.kod), ['magaza', 'erken-bozma']);
    assert.equal(r.toplamYokEdilen, 400);
    assert.equal(r.net, -400);
  });

  it('bilinmeyen tür kaybolmaz', () => {
    const r = basilanYokEdilen([satir('yenitur', 'yok', 10, 0)]);
    assert.equal(bul(r.basilan, 'diger:yenitur'), 10);
  });

  it('boş defter sıfır döner', () => {
    assert.deepEqual(basilanYokEdilen([]), {
      basilan: [], yokEdilen: [], toplamBasilan: 0, toplamYokEdilen: 0, net: 0,
    });
  });
});

describe('arzDegisimi ve dönem', () => {
  it('yüzde dönem başı arza göre hesaplanır', () => {
    assert.equal(arzDegisimi(1100, 100), 10);
    assert.equal(arzDegisimi(900, -100), -10);
    assert.equal(arzDegisimi(100, 100), null);
    assert.equal(yuzdeMetni(10), '+10,0%');
    assert.equal(yuzdeMetni(-4.25), '-4,3%');
    assert.equal(yuzdeMetni(null), '—');
  });

  it('dönemler Türkiye gün başlangıcından, bugün dahil sayılır', () => {
    const bugun = trGunBaslangici(SIMDI);
    assert.equal(donemAraligi('bugun', SIMDI).baslangic, bugun);
    assert.equal(donemAraligi('7g', SIMDI).baslangic, bugun - 6 * GUN);
    assert.equal(donemAraligi('30g', SIMDI).baslangic, bugun - 29 * GUN);
    assert.equal(donemAraligi('yok', SIMDI).baslangic, bugun);
  });
});

describe('panel sorguları (gerçek defter)', () => {
  function kur() {
    const db = acVeritabani(':memory:');
    const ortak = { guildId: G, simdi: SIMDI - 1000 };
    ekle(db, { ...ortak, kullaniciId: A, miktar: 10_000, tur: TURLER.gunluk });
    ekle(db, { ...ortak, kullaniciId: B, miktar: 3000, tur: TURLER.mesaj });
    return db;
  }

  it('akışların toplamı arz değişimine eşittir (muz yoktan var olmaz)', () => {
    const db = acVeritabani(':memory:');
    const t0 = SIMDI - 10 * GUN;
    ekle(db, { guildId: G, kullaniciId: A, miktar: 20_000, tur: TURLER.gunluk, simdi: t0 });
    ekle(db, { guildId: G, kullaniciId: B, miktar: 5000, tur: TURLER.gunluk, simdi: t0 });
    const once = arzOzeti(db, G).arz;

    const t = SIMDI - 3_600_000;
    ekle(db, { guildId: G, kullaniciId: A, miktar: 400, tur: TURLER.mesaj, simdi: t });
    ekle(db, { guildId: G, kullaniciId: B, miktar: 600, tur: TURLER.gorev, simdi: t });
    // A 1000 yatırır 300 geri alır (kasa kârı 700); B 500 yatırır 1000 alır (kasa zararı 500).
    bahisOyna(db, { guildId: G, kullaniciId: A, bahis: 1000, oyun: () => ({ carpan: 0.3 }), simdi: t });
    bahisOyna(db, { guildId: G, kullaniciId: B, bahis: 500, oyun: () => ({ carpan: 2 }), simdi: t });
    gonder(db, { guildId: G, gonderenId: A, aliciId: C, miktar: 2000, vergiYuzde: 5, simdi: t });
    const m = yatir(db, { guildId: G, kullaniciId: B, miktar: 2000, vade: '84sa', simdi: t });
    assert.equal(m.ok, true);
    const b = boz(db, { guildId: G, kullaniciId: B, id: m.mevduat.id, simdi: t + 1000 });
    assert.equal(b.ceza, 200);
    dus(db, { guildId: G, kullaniciId: C, miktar: 100, tur: TURLER.yonetici, karsiId: A, simdi: t });
    // Bankada aktif bir mevduat kalsın: arza dahil, enflasyon sayılmaz.
    assert.equal(yatir(db, { guildId: G, kullaniciId: A, miktar: 1500, vade: '36sa', simdi: t }).ok, true);

    const ozet = panelOzeti(db, G, 'bugun', SIMDI);
    assert.equal(ozet.arz - once, ozet.net);
    assert.equal(bul(ozet.yokEdilen, 'kumar'), 200);
    assert.equal(bul(ozet.yokEdilen, 'transfer'), 100);
    assert.equal(bul(ozet.yokEdilen, 'erken-bozma'), 200);
    assert.equal(bul(ozet.yokEdilen, 'yonetici'), 100);
    assert.equal(bul(ozet.basilan, 'mesaj'), 400);
    assert.equal(bul(ozet.basilan, 'gorev'), 600);
    assert.equal(ozet.bankada, 1500);
    assert.equal(ozet.uyeSayisi, 3);
    assert.equal(ozet.net, 1000 - 600);
  });

  it('dönem dışı hareketler sayılmaz; 7g dünü kapsar', () => {
    const db = kur();
    ekle(db, { guildId: G, kullaniciId: A, miktar: 777, tur: TURLER.gunluk, simdi: SIMDI - 2 * GUN });
    assert.equal(bul(panelOzeti(db, G, 'bugun', SIMDI).basilan, 'gunluk'), 10_000);
    assert.equal(bul(panelOzeti(db, G, '7g', SIMDI).basilan, 'gunluk'), 10_777);
  });

  it('erken bozma cezası kapanış anına göre döneme girer', () => {
    const db = acVeritabani(':memory:');
    ekle(db, { guildId: G, kullaniciId: A, miktar: 50_000, tur: TURLER.yonetici, simdi: 0 });
    const m = yatir(db, { guildId: G, kullaniciId: A, miktar: 10_000, vade: '7g', simdi: SIMDI - 5 * GUN });
    boz(db, { guildId: G, kullaniciId: A, id: m.mevduat.id, simdi: SIMDI - 2 * GUN });
    assert.equal(bul(panelOzeti(db, G, 'bugun', SIMDI).yokEdilen, 'erken-bozma'), undefined);
    assert.equal(bul(panelOzeti(db, G, '7g', SIMDI).yokEdilen, 'erken-bozma'), 1000);
  });

  it('karşı taraf tipi: hesabı olan rakip üye, olmayan sayısal kimlik sayı', () => {
    const db = kur();
    const ortak = { guildId: G, simdi: SIMDI - 500 };
    ekle(db, { ...ortak, kullaniciId: A, miktar: 100, tur: TURLER.iade, karsiId: B }); // düello iadesi
    ekle(db, { ...ortak, kullaniciId: A, miktar: 300, tur: TURLER.iade, karsiId: '999999' }); // rol iadesi
    const satirlar = donemSatirlari(db, G, donemAraligi('bugun', SIMDI));
    const iadeler = satirlar.filter((s) => s.tur === 'iade').map((s) => s.karsi).sort();
    assert.deepEqual(iadeler, ['sayi', 'uye']);
  });

  it('kasa açılan ve satılan kart eşya defterinden sayılır', () => {
    const db = kur();
    const h = (tur, adet) => esyaHareketi(db, {
      guildId: G, kullaniciId: A, esya: 'x', adet, tur, simdi: SIMDI - 100,
    });
    h('kasa-ac', -1); h('kasa-ac', -1); h('sat', -3); h('sat', -2); h('kasa-odul', 1);
    esyaHareketi(db, {
      guildId: G, kullaniciId: A, esya: 'x', adet: -1, tur: 'kasa-ac', simdi: SIMDI - 3 * GUN,
    });
    assert.deepEqual(kasaKartOzeti(db, G, donemAraligi('bugun', SIMDI)), { kasaAcilan: 2, kartSatilan: 5 });
  });

  it('en çok kazananlar dönem netine göre; yönetici ve mevduat sayılmaz', () => {
    const db = kur();
    ekle(db, { guildId: G, kullaniciId: C, miktar: 99_999, tur: TURLER.yonetici, simdi: SIMDI - 50 });
    dus(db, { guildId: G, kullaniciId: B, miktar: 2500, tur: TURLER.magaza, simdi: SIMDI - 40 });
    const liste = enCokKazananlar(db, G, donemAraligi('bugun', SIMDI));
    assert.deepEqual(liste.map((k) => [k.kullanici_id, k.net]), [[A, 10_000], [B, 500]]);
    assert.equal(enCokKazananlar(db, G, donemAraligi('bugun', SIMDI), 1).length, 1);
  });

  it('sunucular birbirinden yalıtılmıştır', () => {
    const db = kur();
    ekle(db, { guildId: 'g2', kullaniciId: A, miktar: 1, tur: TURLER.gunluk, simdi: SIMDI - 10 });
    assert.equal(panelOzeti(db, G, 'bugun', SIMDI).toplamBasilan, 13_000);
  });

  it('sonHareketler yeniden eskiye, en çok 15', () => {
    const db = acVeritabani(':memory:');
    for (let i = 1; i <= 20; i += 1) {
      ekle(db, { guildId: G, kullaniciId: A, miktar: i, tur: TURLER.mesaj, simdi: SIMDI + i });
    }
    ekle(db, { guildId: G, kullaniciId: B, miktar: 5, tur: TURLER.mesaj, simdi: SIMDI });
    const liste = sonHareketler(db, G, A);
    assert.equal(liste.length, 15);
    assert.equal(liste[0].miktar, 20);
    assert.equal(liste[0].bakiye_sonra, 210);
    assert.equal(liste[14].miktar, 6);
    assert.equal(sonHareketler(db, G, 'yok').length, 0);
  });
});

describe('yöneticiler hariç görünüm, kumar oyunları, etkinlikler', () => {
  const Y = '900';

  it('yöneticinin bakiyesi ve geliri sayılmaz; üyeye geçen muz yönetici kategorisinde', () => {
    const db = acVeritabani(':memory:');
    const t = SIMDI - 3_600_000;
    ekle(db, { guildId: G, kullaniciId: Y, miktar: 50_000, tur: TURLER.calis, simdi: t });
    ekle(db, { guildId: G, kullaniciId: A, miktar: 1000, tur: TURLER.calis, simdi: t });
    gonder(db, { guildId: G, gonderenId: Y, aliciId: A, miktar: 2000, vergiYuzde: 5, simdi: t });
    gonder(db, { guildId: G, gonderenId: A, aliciId: Y, miktar: 100, vergiYuzde: 5, simdi: t });

    const hepsi = panelOzeti(db, G, 'bugun', SIMDI);
    assert.equal(hepsi.yoneticiHaric, false);
    assert.equal(bul(hepsi.basilan, 'calis'), 51_000);

    const haric = panelOzeti(db, G, 'bugun', SIMDI, { haric: [Y] });
    assert.equal(haric.yoneticiHaric, true);
    assert.equal(bul(haric.basilan, 'calis'), 1000);
    assert.equal(bul(haric.basilan, 'yonetici'), 1900, 'yöneticiden gelen net 1.900');
    assert.equal(bul(haric.yokEdilen, 'yonetici'), 100, 'yöneticiye giden 100');
    assert.equal(haric.arz, 1000 + 1900 - 100);
    assert.equal(haric.uyeSayisi, 1);
    assert.equal(haric.arz - haric.net, 0, 'dönem başı arz sıfır');
  });

  it('kumar oyunları oyun başına yatırılan, ödenen ve geri ödeme', () => {
    const db = acVeritabani(':memory:');
    const t = SIMDI - 3_600_000;
    ekle(db, { guildId: G, kullaniciId: A, miktar: 10_000, tur: TURLER.gunluk, simdi: t });
    ekle(db, { guildId: G, kullaniciId: Y, miktar: 10_000, tur: TURLER.gunluk, simdi: t });
    bahisOyna(db, {
      guildId: G, kullaniciId: A, bahis: 1000, oyun: () => ({ carpan: 0 }), oyunAdi: 'slot', simdi: t,
    });
    bahisOyna(db, {
      guildId: G, kullaniciId: A, bahis: 1000, oyun: () => ({ carpan: 1.9 }), oyunAdi: 'slot', simdi: t,
    });
    bahisOyna(db, {
      guildId: G, kullaniciId: Y, bahis: 500, oyun: () => ({ carpan: 2 }), oyunAdi: 'zar', simdi: t,
    });
    bahisOyna(db, { guildId: G, kullaniciId: A, bahis: 100, oyun: () => ({ carpan: 0 }), simdi: t });
    const aralik = donemAraligi('bugun', SIMDI);
    const oyunlar = kumarOyunlari(db, G, aralik);
    assert.deepEqual(oyunlar.map((o) => [o.ad, o.adet, o.bahis, o.odeme]), [
      ['Slot', 2, 2000, 1900], ['Zar', 1, 500, 1000], ['Kayıt öncesi', 1, 100, 0],
    ]);
    assert.equal(oyunlar[0].geriOdeme, 95);
    assert.deepEqual(kumarOyunlari(db, G, aralik, [Y]).map((o) => o.ad), ['Slot', 'Kayıt öncesi']);
    assert.equal(hareketAra(db, G, { turler: ['bahis'], siralama: 'eski' }).satirlar[0].oyun, 'slot');
  });

  it('döneme değen etkinlikler listelenir', () => {
    const db = acVeritabani(':memory:');
    etkinlikBaslat(db, {
      guildId: G, tur: 'muz-2x', sureMs: 3_600_000, baslatanId: Y, simdi: SIMDI - 2 * 3_600_000,
    });
    etkinlikBaslat(db, {
      guildId: G, tur: 'xp-2x', sureMs: 3_600_000, baslatanId: Y, simdi: SIMDI - 3 * GUN,
    });
    const e = panelOzeti(db, G, 'bugun', SIMDI).etkinlikler;
    assert.deepEqual(e.map((x) => x.tur), ['muz-2x']);
    assert.match(e[0].ad, /2x Muz/);
    assert.equal(panelOzeti(db, G, '7g', SIMDI).etkinlikler.length, 2);
  });
});

describe('magazaSatislari', () => {
  it('ürün, adet, tutar ve alıcı; iade edilen rol alımı ve dönem dışı sayılmaz', async () => {
    const db = acVeritabani(':memory:');
    for (const k of [A, B]) ekle(db, { guildId: G, kullaniciId: k, miktar: 1_000_000, tur: TURLER.yonetici, simdi: SIMDI - 3 * GUN });
    const kasa = esyaGetir('kasa-ahsap');
    assert.equal(esyaSatinAl(db, { guildId: G, kullaniciId: A, kimlik: 'kasa-ahsap', adet: 3, simdi: SIMDI - 100 }).ok, true);
    assert.equal(esyaSatinAl(db, { guildId: G, kullaniciId: B, kimlik: 'kasa-ahsap', simdi: SIMDI - 90 }).ok, true);
    assert.equal(esyaSatinAl(db, { guildId: G, kullaniciId: B, kimlik: 'xp-iksiri', simdi: SIMDI - 80 }).ok, true);
    const urun = { rol_id: '555', fiyat: 7000 };
    assert.equal((await satinAl(db, { guildId: G, kullaniciId: A, urun, rolVer: async () => {}, simdi: SIMDI - 70 })).ok, true);
    // Rol verilemedi → iade: satış sayılmaz.
    const rolHatasi = async () => { throw new Error('yetki'); };
    assert.equal((await satinAl(db, { guildId: G, kullaniciId: B, urun, rolVer: rolHatasi, simdi: SIMDI - 60 })).ok, false);
    // Dönem dışı (7g'den eski).
    esyaSatinAl(db, { guildId: G, kullaniciId: A, kimlik: 'xp-iksiri', simdi: SIMDI - 3 * GUN });

    const aralik = donemAraligi('bugun', SIMDI);
    const s = magazaSatislari(db, G, aralik);
    assert.deepEqual({ ...s.ozet }, { alim: 4, adet: 6, toplam: kasa.fiyat * 4 + 6000 + 7000, alici: 2 });
    // Çok harcanandan aza: rol 7000, iksir 6000, 4 ahşap kasa 4 × fiyat.
    assert.equal(kasa.fiyat * 4 < 6000, true);
    assert.deepEqual(s.urunler.map((u) => [u.urun, u.adet, u.alici]), [['555', 1, 1], ['xp-iksiri', 1, 1], ['kasa-ahsap', 4, 2]]);
    assert.deepEqual(s.satirlar.map((h) => [h.urun, h.adet]), [['555', 1], ['xp-iksiri', 1], ['kasa-ahsap', 1], ['kasa-ahsap', 3]]);

    const kasaSuz = magazaSatislari(db, G, { ...aralik, urun: 'kasa-ahsap' });
    assert.deepEqual({ ...kasaSuz.ozet }, { alim: 2, adet: 4, toplam: kasa.fiyat * 4, alici: 2 });
    assert.equal(kasaSuz.urunler.length, 3, 'ürün dökümü ürün süzgecini yok sayar');
    assert.deepEqual(kasaSuz.alicilar.map((a) => [a.kullanici_id, a.adet]), [[A, 3], [B, 1]]);

    const b = magazaSatislari(db, G, { ...aralik, haric: [A] });
    assert.deepEqual(b.alicilar.map((a) => a.kullanici_id), [B]);
    assert.equal(magazaSatislari(db, G, { uyeId: A }).ozet.alim, 3, 'dönemsiz: bütün zamanlar');
    assert.equal(magazaSatislari(db, G, { ...aralik, limit: 3, sayfa: 2 }).satirlar.length, 1);
  });
});

describe('embedler', () => {
  it('özet embed gerekli alanları taşır', () => {
    const db = acVeritabani(':memory:');
    ekle(db, { guildId: G, kullaniciId: A, miktar: 5000, tur: TURLER.gunluk, simdi: SIMDI - 10 });
    const embed = ozetEmbed(panelOzeti(db, G, '7g', SIMDI)).toJSON();
    assert.match(embed.title, /Son 7 gün/);
    const adlar = embed.fields.map((f) => f.name);
    assert.ok(adlar.some((a) => a.startsWith('Basılan muz')));
    assert.ok(adlar.some((a) => a.startsWith('Yok edilen muz')));
    assert.ok(adlar.includes('Kasa açılan') && adlar.includes('Satılan kart'));
    assert.ok(adlar.some((a) => a.startsWith('En çok kazanan')));
    for (const f of embed.fields) assert.ok(f.value.length > 0 && f.value.length <= 1024);
  });

  it('hareket embed boş listede de çalışır', () => {
    assert.match(hareketEmbed(A, [], 'hesap yok').toJSON().fields[0].value, /hareketi yok/);
  });
});

describe('panel ve sonradan eklenen türler', () => {
  it('çalışma, başarım ve piyango "Diğer"e düşmüyor', async () => {
    const { kategoriBul, KATEGORILER } = await import('../lib/ekonomi-panel.js');
    for (const tur of ['calis', 'basarim', 'piyango']) {
      assert.equal(kategoriBul(tur, 'yok'), tur);
      assert.ok(KATEGORILER[tur], tur);
    }
  });
});

describe('yönetici gönderimleri ve takaslar', () => {
  const aralik = { baslangic: 0, bitis: SIMDI + 1 };

  it('yalnız yöneticiden üyeye gönderim sayılır, alıcıya göre gruplanır', () => {
    const db = acVeritabani(':memory:');
    ekle(db, { guildId: G, kullaniciId: A, miktar: 10_000, tur: TURLER.yonetici, simdi: SIMDI });
    ekle(db, { guildId: G, kullaniciId: C, miktar: 10_000, tur: TURLER.yonetici, simdi: SIMDI });
    gonder(db, { guildId: G, gonderenId: A, aliciId: B, miktar: 500, simdi: SIMDI });
    gonder(db, { guildId: G, gonderenId: A, aliciId: B, miktar: 300, simdi: SIMDI });
    gonder(db, { guildId: G, gonderenId: A, aliciId: 'Y2', miktar: 100, simdi: SIMDI }); // yöneticiler arası
    gonder(db, { guildId: G, gonderenId: C, aliciId: B, miktar: 999, simdi: SIMDI }); // üye → üye
    const y = yoneticiGonderimleri(db, G, aralik, [A, 'Y2']);
    assert.deepEqual([y.toplam, y.adet, y.aliciSayisi], [800, 2, 1]);
    assert.deepEqual(y.alicilar, [{ kullanici_id: B, toplam: 800, adet: 2 }]);
    assert.equal(yoneticiGonderimleri(db, G, aralik, []).toplam, 0);
  });

  it('kabul edilen takasların değeri ve en dengesizleri', () => {
    const db = acVeritabani(':memory:');
    const ekleTakas = (eden, karsi, ver, verAdet, iste, isteAdet, durum = 'kabul') => db.prepare(
      `INSERT INTO takas_teklifleri (guild_id, teklif_eden, karsi_id, ver_esya, ver_adet, iste_esya, iste_adet, durum, olusturma, bitis)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(G, eden, karsi, ver, verAdet, iste, isteAdet, durum, SIMDI, SIMDI + 1);
    ekleTakas(B, C, 'kart-heli', 1, 'kasa-elmas', 2); // 400 ⇄ 60.000
    ekleTakas(A, B, 'kart-quincy', 1, 'kart-obyn', 1); // 6.000 ⇄ 6.000 (dengeli, yönetici taraf)
    ekleTakas(B, C, 'kart-heli', 1, 'kasa-altin', 5, 'red');
    const t = takasOzeti(db, G, aralik, [A]);
    assert.equal(t.adet, 2);
    assert.equal(t.toplamDeger, 400 + 60_000 + 12_000);
    assert.equal(t.yoneticili, 1);
    assert.equal(t.dengesiz.length, 1);
    assert.deepEqual([t.dengesiz[0].verDeger, t.dengesiz[0].isteDeger, t.dengesiz[0].fark, t.dengesiz[0].yonetici], [400, 60_000, 59_600, false]);
  });
});

describe('hareket dökümü', () => {
  it('sayfalar, yöneticiyi dışarıda bırakır, dönem süzer', () => {
    const db = acVeritabani(':memory:');
    for (let i = 0; i < 5; i += 1) ekle(db, { guildId: G, kullaniciId: A, miktar: 10 + i, tur: TURLER.calis, simdi: SIMDI - i * GUN });
    ekle(db, { guildId: G, kullaniciId: B, miktar: 999, tur: TURLER.gunluk, simdi: SIMDI });
    const s1 = hareketAra(db, G, { limit: 2, sayfa: 1 });
    assert.deepEqual([s1.toplam, s1.sayfaSayisi, s1.satirlar.length], [6, 3, 2]);
    const s3 = hareketAra(db, G, { limit: 2, sayfa: 99 });
    assert.equal(s3.sayfa, 3); // aşan sayfa son sayfaya iner
    assert.equal(hareketAra(db, G, { haric: [B] }).toplam, 5);
    assert.equal(hareketAra(db, G, { baslangic: SIMDI - GUN, bitis: SIMDI + 1 }).toplam, 3);
  });

  it('her defter türünün adı ve grubu var', () => {
    const gruplu = TUR_GRUPLARI.flatMap((g) => g.turler);
    assert.deepEqual([...gruplu].sort(), Object.keys(TUR_ETIKETLERI).sort());
    for (const tur of Object.values(TURLER)) assert.ok(TUR_ETIKETLERI[tur], tur);
  });
});
