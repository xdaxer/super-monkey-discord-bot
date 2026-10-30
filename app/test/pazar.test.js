import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { acVeritabani } from '../lib/db.js';
import {
  bakiye, dus, ekle, TURLER,
} from '../lib/ekonomi.js';
import { adet, esyaEkle } from '../lib/envanter.js';
import { basilanYokEdilen, donemSatirlari } from '../lib/ekonomi-panel.js';
import {
  fiyatAraligi, fiyatGecmisi, gecmisim, ILAN_SINIRI, ilanAc, ilanIptal, ilanlarim, kartIlanlari, kesintiHesapla, pazardanAl,
  alimIstegiAc, alimIstegiIptal, isteklereSat, isteklerim, kartIstekleri, PAZAR_KAPALI_SEBEBI, pazarAyarla, pazarAyarlari, satisDmIcerigi, satisGeriAl, sonSatislar, vitrin, YONETICI_PAZAR_SEBEBI,
  yoneticiIlanDuzenle, yoneticiIlanKaldir, yoneticiIstekKaldir, yonetimIstekleri, yonetimGunlugu, yonetimIlanlari, yonetimOzeti, yonetimSatislari,
} from '../lib/pazar.js';
import { kartGetir } from '../lib/kasalar.js';

const G = 'g1';
const SATICI = '100';
const ALICI = '200';
const YONETICI = '900';
const SIMDI = Date.parse('2026-10-25T12:00:00+03:00');
const KART = 'kart-quincy'; // destansı, değer 6.000

function kur() {
  const db = acVeritabani(':memory:');
  esyaEkle(db, G, SATICI, KART, 5);
  ekle(db, { guildId: G, kullaniciId: ALICI, miktar: 100_000, tur: TURLER.yonetici, simdi: SIMDI - 1000 });
  return db;
}

describe('pazar', () => {
  it('fiyat aralığı kart değeri ile 10 katı; kart olmayan satılmaz', () => {
    assert.deepEqual(fiyatAraligi(KART), { min: 6000, max: 60_000 });
    assert.deepEqual(fiyatAraligi(`parlak:${KART}`), { min: 30_000, max: 300_000 });
    assert.equal(fiyatAraligi('kasa-ahsap'), null);
    assert.deepEqual(kesintiHesapla(6999), { kesinti: 699, net: 6300 });
  });

  it('ilan kopyaları emanete alır; iptal geri verir', () => {
    const db = kur();
    assert.equal(ilanAc(db, { guildId: G, saticiId: SATICI, kimlik: KART, adet: 3, fiyat: 5000 }).ok, false, 'tabanın altı');
    assert.equal(ilanAc(db, { guildId: G, saticiId: SATICI, kimlik: KART, adet: 3, fiyat: 60_001 }).ok, false, 'tavanın üstü');
    assert.equal(ilanAc(db, { guildId: G, saticiId: SATICI, kimlik: 'kasa-ahsap', fiyat: 5000 }).ok, false);
    assert.equal(ilanAc(db, { guildId: G, saticiId: SATICI, kimlik: KART, adet: 6, fiyat: 7000 }).ok, false, 'elinde yok');
    const r = ilanAc(db, {
      guildId: G, saticiId: SATICI, kimlik: KART, adet: 3, fiyat: 7000, simdi: SIMDI,
    });
    assert.equal(r.ok, true);
    assert.equal(adet(db, G, SATICI, KART), 2);
    assert.equal(ilanlarim(db, G, SATICI).length, 1);

    assert.equal(ilanIptal(db, { guildId: G, kullaniciId: ALICI, id: r.ilan.id }).ok, false, 'başkası kaldıramaz');
    const iptal = ilanIptal(db, { guildId: G, kullaniciId: SATICI, id: r.ilan.id });
    assert.equal(iptal.ok, true);
    assert.equal(adet(db, G, SATICI, KART), 5);
    assert.equal(ilanIptal(db, { guildId: G, kullaniciId: SATICI, id: r.ilan.id }).ok, false, 'iki kez iade yok');
  });

  it('satın alma: alıcı öder, satıcıya kesintili geçer, kart taşınır, kesinti yok edilir', () => {
    const db = kur();
    const { ilan } = ilanAc(db, {
      guildId: G, saticiId: SATICI, kimlik: KART, adet: 3, fiyat: 7000, simdi: SIMDI,
    });
    assert.equal(pazardanAl(db, { guildId: G, aliciId: SATICI, id: ilan.id }).ok, false, 'kendi ilanı');
    assert.equal(pazardanAl(db, { guildId: G, aliciId: ALICI, id: ilan.id, adet: 4 }).ok, false, 'ilanda yok');

    const r = pazardanAl(db, {
      guildId: G, aliciId: ALICI, id: ilan.id, adet: 2, simdi: SIMDI + 10,
    });
    assert.equal(r.ok, true);
    assert.equal(r.toplam, 14_000);
    assert.equal(r.kesinti, 1400);
    assert.equal(bakiye(db, G, ALICI), 86_000);
    assert.equal(bakiye(db, G, SATICI), 12_600);
    assert.equal(adet(db, G, ALICI, KART), 2);
    assert.equal(kartIlanlari(db, G, KART)[0].adet, 1);

    // Son kopya alınınca ilan kapanır.
    assert.equal(pazardanAl(db, {
      guildId: G, aliciId: ALICI, id: ilan.id, simdi: SIMDI + 20,
    }).ok, true);
    assert.equal(kartIlanlari(db, G, KART).length, 0);
    assert.equal(pazardanAl(db, { guildId: G, aliciId: ALICI, id: ilan.id }).ok, false);
    assert.equal(ilanIptal(db, { guildId: G, kullaniciId: SATICI, id: ilan.id }).ok, false, 'satılmış ilan iade vermez');

    assert.equal(sonSatislar(db, G).length, 2);
    assert.equal(gecmisim(db, G, SATICI).length, 2);
    assert.deepEqual(fiyatGecmisi(db, G, KART, { simdi: SIMDI + 30 }).map((g) => [g.gun, g.ortalama, g.adet]), [['2026-10-25', 7000, 3]]);

    const v = vitrin(db, G, SIMDI + 30);
    assert.deepEqual(v.map((x) => [x.kart, x.adet, x.enDusuk, x.satis24, x.sonFiyat]), [[KART, 0, null, 3, 7000]]);

    // Panel: alıcının ödediği 21.000, satıcıya 18.900 → 2.100 yok edilen.
    const o = basilanYokEdilen(donemSatirlari(db, G, { baslangic: SIMDI, bitis: SIMDI + 100 }));
    assert.equal(o.yokEdilen.find((k) => k.kod === 'pazar')?.miktar, 2100);
  });

  it('bakiye yetmezse hiçbir şey değişmez', () => {
    const db = kur();
    const { ilan } = ilanAc(db, {
      guildId: G, saticiId: SATICI, kimlik: KART, adet: 5, fiyat: 60_000, simdi: SIMDI,
    });
    const r = pazardanAl(db, { guildId: G, aliciId: ALICI, id: ilan.id, adet: 2 });
    assert.equal(r.ok, false);
    assert.equal(bakiye(db, G, ALICI), 100_000);
    assert.equal(kartIlanlari(db, G, KART)[0].adet, 5);
    assert.equal(adet(db, G, ALICI, KART), 0);
  });

  it('yönetici ile üye arasında alışveriş yok; ilan sınırı', () => {
    const db = kur();
    esyaEkle(db, G, YONETICI, KART, ILAN_SINIRI + 1);
    const { ilan } = ilanAc(db, {
      guildId: G, saticiId: YONETICI, kimlik: KART, fiyat: 6000, simdi: SIMDI,
    });
    const r = pazardanAl(db, {
      guildId: G, aliciId: ALICI, id: ilan.id, yoneticiler: [YONETICI],
    });
    assert.deepEqual(r, { ok: false, sebep: YONETICI_PAZAR_SEBEBI });
    for (let i = 1; i < ILAN_SINIRI; i += 1) {
      assert.equal(ilanAc(db, {
        guildId: G, saticiId: YONETICI, kimlik: KART, fiyat: 6000, simdi: SIMDI,
      }).ok, true);
    }
    assert.equal(ilanAc(db, {
      guildId: G, saticiId: YONETICI, kimlik: KART, fiyat: 6000, simdi: SIMDI,
    }).ok, false);
  });

  it('ucuz ilan önce listelenir; vitrin en düşük fiyatı gösterir', () => {
    const db = kur();
    ilanAc(db, {
      guildId: G, saticiId: SATICI, kimlik: KART, adet: 1, fiyat: 9000, simdi: SIMDI,
    });
    ilanAc(db, {
      guildId: G, saticiId: SATICI, kimlik: KART, adet: 2, fiyat: 6500, simdi: SIMDI,
    });
    assert.deepEqual(kartIlanlari(db, G, KART).map((i) => i.fiyat), [6500, 9000]);
    const [v] = vitrin(db, G, SIMDI);
    assert.equal(v.enDusuk, 6500);
    assert.equal(v.adet, 3);
    assert.equal(v.ilan, 2);
  });

  it('satış DM içeriği: kart, alan, eline geçen ve kalan', () => {
    const { content, allowedMentions } = satisDmIcerigi({
      kart: kartGetir(KART), emoji: '<:btd_quincy:1>', adet: 2, fiyat: 7000, kesinti: 1400, aliciId: ALICI, kalan: 1,
    });
    assert.match(content, /<:btd_quincy:1> Quincy\*\* kartın/);
    assert.match(content, new RegExp(`<@${ALICI}>`));
    assert.match(content, /12\.600/);
    assert.match(content, /1 kopya daha/);
    assert.deepEqual(allowedMentions, { parse: [] });
    assert.match(satisDmIcerigi({
      kart: kartGetir(KART), adet: 1, fiyat: 7000, kesinti: 700, aliciId: ALICI, kalan: 0,
    }).content, /tamamen satıldı/);
  });

});

describe('pazar yönetimi', () => {
  const Y = '999';

  it('ayarlar: kapalı pazarda ilan ve alım yok, kaldırma serbest; kesinti ve sınır uygulanır', () => {
    const db = kur();
    const { ilan } = ilanAc(db, {
      guildId: G, saticiId: SATICI, kimlik: KART, adet: 2, fiyat: 7000, simdi: SIMDI,
    });
    assert.equal(pazarAyarla(db, { guildId: G, yoneticiId: Y, degisiklik: { kesintiYuzde: 60 } }).ok, false);
    assert.equal(pazarAyarla(db, { guildId: G, yoneticiId: Y, degisiklik: { acik: 'evet' } }).ok, false);
    const r = pazarAyarla(db, {
      guildId: G, yoneticiId: Y, degisiklik: { acik: false, kesintiYuzde: 20, ilanSiniri: 1 }, simdi: SIMDI,
    });
    assert.equal(r.ok, true);
    assert.deepEqual(pazarAyarlari(db, G), {
      acik: false, kesintiYuzde: 20, tavanCarpani: 10, ilanSiniri: 1,
    });
    assert.deepEqual(pazardanAl(db, { guildId: G, aliciId: ALICI, id: ilan.id }), { ok: false, sebep: PAZAR_KAPALI_SEBEBI });
    assert.equal(ilanAc(db, {
      guildId: G, saticiId: SATICI, kimlik: KART, fiyat: 7000,
    }).sebep, PAZAR_KAPALI_SEBEBI);

    pazarAyarla(db, { guildId: G, yoneticiId: Y, degisiklik: { acik: true } });
    assert.match(ilanAc(db, {
      guildId: G, saticiId: SATICI, kimlik: KART, fiyat: 7000,
    }).sebep, /en çok 1 ilan/);
    const al = pazardanAl(db, { guildId: G, aliciId: ALICI, id: ilan.id });
    assert.equal(al.kesinti, 1400);
    assert.equal(yonetimGunlugu(db, G).filter((g) => g.eylem === 'ayar').length, 2);
    assert.equal(ilanIptal(db, { guildId: G, kullaniciId: SATICI, id: ilan.id }).ok, true, 'kapalıyken de kaldırılır');
  });

  it('ilan düzenle: fiyat aralıkta, adet yalnız azalır ve fark satıcıya döner', () => {
    const db = kur();
    const { ilan } = ilanAc(db, {
      guildId: G, saticiId: SATICI, kimlik: KART, adet: 4, fiyat: 7000, simdi: SIMDI,
    });
    assert.equal(adet(db, G, SATICI, KART), 1);
    assert.equal(yoneticiIlanDuzenle(db, { guildId: G, yoneticiId: Y, id: ilan.id, fiyat: 100 }).ok, false);
    assert.equal(yoneticiIlanDuzenle(db, { guildId: G, yoneticiId: Y, id: ilan.id, adet: 5 }).ok, false);
    const r = yoneticiIlanDuzenle(db, {
      guildId: G, yoneticiId: Y, id: ilan.id, fiyat: 6500, adet: 1, simdi: SIMDI,
    });
    assert.equal(r.ok, true);
    assert.equal(r.ilan.fiyat, 6500);
    assert.equal(r.ilan.adet, 1);
    assert.equal(adet(db, G, SATICI, KART), 4);
    const [g] = yonetimGunlugu(db, G);
    assert.equal(g.eylem, 'ilan-duzenle');
    assert.deepEqual(g.ayrinti.adet, { once: 4, sonra: 1 });
  });

  it('ilan kaldır: iadeli ya da el koyarak', () => {
    const db = kur();
    const a = ilanAc(db, {
      guildId: G, saticiId: SATICI, kimlik: KART, adet: 2, fiyat: 7000, simdi: SIMDI,
    }).ilan;
    const b = ilanAc(db, {
      guildId: G, saticiId: SATICI, kimlik: KART, adet: 2, fiyat: 7000, simdi: SIMDI,
    }).ilan;
    assert.equal(adet(db, G, SATICI, KART), 1);
    assert.equal(yoneticiIlanKaldir(db, { guildId: G, yoneticiId: Y, id: a.id }).ok, true);
    assert.equal(adet(db, G, SATICI, KART), 3);
    assert.equal(yoneticiIlanKaldir(db, {
      guildId: G, yoneticiId: Y, id: b.id, iade: false, sebep: 'alt hesap',
    }).ok, true);
    assert.equal(adet(db, G, SATICI, KART), 3, 'el konulan kopyalar dönmez');
    assert.equal(yoneticiIlanKaldir(db, { guildId: G, yoneticiId: Y, id: b.id }).ok, false);
    assert.deepEqual(yonetimIlanlari(db, G, { durum: 'kaldirildi' }).satirlar.map((i) => i.id).sort(), [a.id, b.id].sort());
    assert.equal(yonetimGunlugu(db, G)[0].ayrinti.sebep, 'alt hesap');
  });

  it('satışı geri al: para ve kart iki yöne döner; tutmazsa hiçbir şey değişmez', () => {
    const db = kur();
    const { ilan } = ilanAc(db, {
      guildId: G, saticiId: SATICI, kimlik: KART, adet: 3, fiyat: 7000, simdi: SIMDI,
    });
    pazardanAl(db, {
      guildId: G, aliciId: ALICI, id: ilan.id, adet: 2, simdi: SIMDI + 1,
    });
    const satis = yonetimSatislari(db, G).satirlar[0];
    // Satıcı muzunu harcadı: geri alınamaz, alıcının kartı da yerinde kalır.
    const saticiBakiye = bakiye(db, G, SATICI);
    dus(db, { guildId: G, kullaniciId: SATICI, miktar: saticiBakiye - 100, tur: TURLER.yonetici });
    const olmaz = satisGeriAl(db, { guildId: G, yoneticiId: Y, id: satis.id });
    assert.equal(olmaz.ok, false);
    assert.match(olmaz.sebep, /bakiyesi yetmiyor/);
    assert.equal(adet(db, G, ALICI, KART), 2);
    ekle(db, { guildId: G, kullaniciId: SATICI, miktar: saticiBakiye - 100, tur: TURLER.yonetici });

    const r = satisGeriAl(db, {
      guildId: G, yoneticiId: Y, id: satis.id, sebep: 'hata', simdi: SIMDI + 2,
    });
    assert.equal(r.ok, true);
    assert.equal(bakiye(db, G, ALICI), 100_000);
    assert.equal(bakiye(db, G, SATICI), 0);
    assert.equal(adet(db, G, ALICI, KART), 0);
    assert.equal(adet(db, G, SATICI, KART), 4);
    assert.equal(satisGeriAl(db, { guildId: G, yoneticiId: Y, id: satis.id }).ok, false, 'iki kez geri alınmaz');
    assert.equal(sonSatislar(db, G).length, 0, 'geri alınan satış listelerde yok');
    assert.equal(yonetimSatislari(db, G).satirlar[0].geriZaman, SIMDI + 2);
    assert.equal(yonetimOzeti(db, G).satis.islem, 0);
    assert.equal(yonetimOzeti(db, G).geriAlinan, 1);
  });

  it('özet: hacim, kesinti, açık ilanlar, çiftler ve pahalı satışlar', () => {
    const db = kur();
    esyaEkle(db, G, SATICI, KART, 5);
    for (const fiyat of [7000, 35_000]) {
      const { ilan } = ilanAc(db, {
        guildId: G, saticiId: SATICI, kimlik: KART, fiyat, simdi: SIMDI,
      });
      pazardanAl(db, { guildId: G, aliciId: ALICI, id: ilan.id, simdi: SIMDI + 1 });
    }
    ilanAc(db, {
      guildId: G, saticiId: SATICI, kimlik: KART, adet: 2, fiyat: 8000, simdi: SIMDI,
    });
    const o = yonetimOzeti(db, G);
    assert.deepEqual({ ...o.satis }, {
      islem: 2, adet: 2, hacim: 42_000, kesinti: 4200, satici: 1, alici: 1,
    });
    assert.deepEqual({ ...o.acik }, {
      ilan: 1, adet: 2, deger: 16_000, satici: 1,
    });
    assert.equal(o.ciftler[0].islem, 2);
    assert.deepEqual(o.pahali.map((s) => s.fiyat), [35_000]);
    assert.equal(o.saticilar[0].tutar, 37_800);
    assert.equal(yonetimOzeti(db, G, { haric: [ALICI] }).satis.islem, 0);
  });
});

describe('alım istekleri', () => {
  const UCUNCU = '300';

  it('istek emanete alır, iptal iade eder; bakiye ve fiyat sınırı', () => {
    const db = kur();
    assert.equal(alimIstegiAc(db, { guildId: G, aliciId: ALICI, kimlik: KART, adet: 20, fiyat: 6000 }).ok, false, 'bakiye yetmez');
    assert.equal(alimIstegiAc(db, { guildId: G, aliciId: ALICI, kimlik: KART, fiyat: 100 }).ok, false, 'taban altı');
    const r = alimIstegiAc(db, {
      guildId: G, aliciId: ALICI, kimlik: KART, adet: 3, fiyat: 7000, simdi: SIMDI,
    });
    assert.equal(r.ok, true);
    assert.equal(r.emanet, 21_000);
    assert.equal(bakiye(db, G, ALICI), 79_000);
    assert.deepEqual(kartIstekleri(db, G, KART), [{ fiyat: 7000, adet: 3, istek: 1 }]);
    assert.equal(vitrin(db, G, SIMDI)[0].enYuksekIstek, 7000);
    assert.equal(alimIstegiIptal(db, { guildId: G, kullaniciId: SATICI, id: r.istek.id }).ok, false);
    assert.equal(alimIstegiIptal(db, { guildId: G, kullaniciId: ALICI, id: r.istek.id }).iade, 21_000);
    assert.equal(bakiye(db, G, ALICI), 100_000);
    assert.equal(isteklerim(db, G, ALICI).length, 0);
  });

  it('isteğe hemen sat: en yüksek istekten, emanetten ödenir', () => {
    const db = kur();
    ekle(db, { guildId: G, kullaniciId: UCUNCU, miktar: 100_000, tur: TURLER.yonetici });
    alimIstegiAc(db, {
      guildId: G, aliciId: ALICI, kimlik: KART, adet: 2, fiyat: 7000, simdi: SIMDI,
    });
    alimIstegiAc(db, {
      guildId: G, aliciId: UCUNCU, kimlik: KART, adet: 2, fiyat: 8000, simdi: SIMDI,
    });
    assert.equal(isteklereSat(db, { guildId: G, saticiId: SATICI, kimlik: KART, adet: 3, enAz: 9000 }).ok, false, 'uyan istek yok');
    assert.equal(adet(db, G, SATICI, KART), 5, 'satılamayınca kart yerinde');
    const r = isteklereSat(db, {
      guildId: G, saticiId: SATICI, kimlik: KART, adet: 3, enAz: 7000, simdi: SIMDI + 1,
    });
    assert.equal(r.ok, true);
    assert.deepEqual(r.satilan.map((d) => [d.aliciId, d.adet, d.fiyat]), [[UCUNCU, 2, 8000], [ALICI, 1, 7000]]);
    // 16.000 + 7.000 = 23.000; %10 kesinti → 20.700.
    assert.equal(bakiye(db, G, SATICI), 20_700);
    assert.equal(adet(db, G, UCUNCU, KART), 2);
    assert.equal(adet(db, G, ALICI, KART), 1);
    assert.equal(adet(db, G, SATICI, KART), 2);
    assert.equal(bakiye(db, G, ALICI), 86_000, 'emanetten ödendi, bakiye yeniden düşmedi');
    assert.deepEqual(isteklerim(db, G, ALICI).map((i) => i.adet), [1]);
    // Panel: emanet + satış + kalan emanet → pazar kategorisi net = −(kesinti + kalan emanet).
    const o = basilanYokEdilen(donemSatirlari(db, G, { baslangic: SIMDI - 10, bitis: SIMDI + 10 }));
    assert.equal(o.yokEdilen.find((k) => k.kod === 'pazar')?.miktar, 2300 + 7000);
  });

  it('ilan açınca uyan istek hemen karşılanır; kalan ilanda bekler', () => {
    const db = kur();
    alimIstegiAc(db, {
      guildId: G, aliciId: ALICI, kimlik: KART, adet: 2, fiyat: 7500, simdi: SIMDI,
    });
    const r = ilanAc(db, {
      guildId: G, saticiId: SATICI, kimlik: KART, adet: 3, fiyat: 7000, simdi: SIMDI + 1,
    });
    assert.equal(r.ok, true);
    assert.deepEqual(r.satilan.map((d) => [d.adet, d.fiyat]), [[2, 7500]], 'isteğin fiyatından');
    assert.equal(r.ilan.adet, 1);
    assert.equal(r.ilan.durum, 'acik');
    assert.equal(adet(db, G, ALICI, KART), 2);
    assert.equal(isteklerim(db, G, ALICI).length, 0);
  });

  it('istek verince ucuz ilanlar ilanın fiyatından alınır; kalanı emanete', () => {
    const db = kur();
    ilanAc(db, {
      guildId: G, saticiId: SATICI, kimlik: KART, adet: 1, fiyat: 6200, simdi: SIMDI,
    });
    ilanAc(db, {
      guildId: G, saticiId: SATICI, kimlik: KART, adet: 1, fiyat: 9000, simdi: SIMDI,
    });
    const r = alimIstegiAc(db, {
      guildId: G, aliciId: ALICI, kimlik: KART, adet: 3, fiyat: 7000, simdi: SIMDI + 1,
    });
    assert.equal(r.ok, true);
    assert.deepEqual(r.alinan.map((d) => [d.adet, d.fiyat]), [[1, 6200]]);
    assert.equal(r.istek.adet, 2);
    assert.equal(r.emanet, 14_000);
    assert.equal(bakiye(db, G, ALICI), 100_000 - 6200 - 14_000);
    assert.equal(kartIlanlari(db, G, KART).length, 1, '9.000 ilanı alınmadı');
  });

  it('yönetici ile üye eşleşmez; yönetici isteği kaldırınca emanet döner', () => {
    const db = kur();
    alimIstegiAc(db, {
      guildId: G, aliciId: ALICI, kimlik: KART, adet: 1, fiyat: 7000, simdi: SIMDI, yoneticiler: [SATICI],
    });
    const r = ilanAc(db, {
      guildId: G, saticiId: SATICI, kimlik: KART, adet: 1, fiyat: 7000, simdi: SIMDI, yoneticiler: [SATICI],
    });
    assert.equal(r.satilan.length, 0);
    const [istek] = isteklerim(db, G, ALICI);
    const k = yoneticiIstekKaldir(db, {
      guildId: G, yoneticiId: '999', id: istek.id, sebep: 'test',
    });
    assert.equal(k.iade, 7000);
    assert.equal(bakiye(db, G, ALICI), 100_000);
    assert.equal(yonetimIstekleri(db, G, { durum: 'kaldirildi' }).toplam, 1);
    assert.equal(yonetimGunlugu(db, G)[0].eylem, 'istek-kaldir');
  });

  it('istekten gelen satış geri alınınca alıcının bakiyesine döner', () => {
    const db = kur();
    alimIstegiAc(db, {
      guildId: G, aliciId: ALICI, kimlik: KART, adet: 1, fiyat: 7000, simdi: SIMDI,
    });
    isteklereSat(db, {
      guildId: G, saticiId: SATICI, kimlik: KART, adet: 1, simdi: SIMDI + 1,
    });
    const [s] = yonetimSatislari(db, G).satirlar;
    assert.equal(s.ilanId, null);
    assert.ok(s.istekId);
    assert.equal(satisGeriAl(db, { guildId: G, yoneticiId: '999', id: s.id }).ok, true);
    assert.equal(bakiye(db, G, ALICI), 100_000);
    assert.equal(adet(db, G, SATICI, KART), 5);
  });
});

