import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ayarYaz } from '../lib/ayarlar.js';
import { bakiye, ekle, TURLER } from '../lib/ekonomi.js';
import { aktifBoss } from '../lib/boss.js';
import { esyaSatinAl } from '../lib/esyalar.js';
import { satinAl, urunler } from '../lib/magaza.js';
import {
  sahteIstemci, sahteUye, TEST_DIGER, TEST_GUILD, TEST_KULLANICI, testSunucusu,
} from '../web/test-yardimci.js';

function yoneticiIstemci() {
  const istemci = sahteIstemci([sahteUye(TEST_KULLANICI, 'Test', { yonetici: true }), sahteUye(TEST_DIGER, 'Diger')]);
  istemci.guild.roles.cache.set('200000000000000001', {
    id: '200000000000000001', name: 'Alt rol', position: 5, color: 0xff0000, managed: false, guild: istemci.guild,
  });
  istemci.guild.roles.cache.set('200000000000000002', {
    id: '200000000000000002', name: 'Üst rol', position: 150, color: 0, managed: false, guild: istemci.guild,
  });
  return istemci;
}

async function yoneticiyle(fn) {
  const s = await testSunucusu({ istemci: yoneticiIstemci() });
  try {
    await fn(s);
  } finally {
    await s.kapat();
  }
}

describe('web: yönetim yetkisi', () => {
  it('yönetici olmayan 403 alır', async () => {
    const s = await testSunucusu();
    try {
      for (const [y, yol] of [['GET', '/api/yonetim'], ['GET', '/api/yonetim/panel'], ['GET', '/api/yonetim/hareketler'], ['GET', '/api/yonetim/satislar'], ['POST', '/api/yonetim/muz'], ['POST', '/api/yonetim/boss']]) {
        const r = await s.istek(y, yol, y === 'POST' ? {} : undefined);
        assert.equal(r.durum, 403, yol);
      }
    } finally {
      await s.kapat();
    }
  });

  it('yönetici bilgi alır; /api/ben yonetici döner', () => yoneticiyle(async (s) => {
    assert.equal((await s.istek('GET', '/api/ben')).veri.yonetici, true);
    const { durum, veri } = await s.istek('GET', '/api/yonetim');
    assert.equal(durum, 200);
    assert.equal(veri.etkinlikTurleri.length, 4);
    assert.equal(veri.bosslar.length, 6);
    assert.equal(veri.bossKanalAyarli, false);
    assert.ok(veri.ayarlar.some((a) => a.anahtar === 'ekonomi.vergiYuzde'));
    const alt = veri.roller.find((r) => r.id === '200000000000000001');
    assert.equal(alt.uygun, true);
    assert.equal(veri.roller.find((r) => r.id === '200000000000000002').uygun, false);
  }));
});

describe('web: yönetim muz', () => {
  it('ver, al, sıfırla ve deftere yönetici kimliği yazılır', () => yoneticiyle(async (s) => {
    let r = await s.istek('POST', '/api/yonetim/muz', { uyeId: TEST_DIGER, islem: 'ver', miktar: '2.5k' });
    assert.equal(r.durum, 200);
    assert.equal(bakiye(s.db, TEST_GUILD, TEST_DIGER), 2500);
    assert.equal(r.veri.uye.bakiye, 2500);

    r = await s.istek('POST', '/api/yonetim/muz', { uyeId: TEST_DIGER, islem: 'al', miktar: 100 });
    assert.equal(bakiye(s.db, TEST_GUILD, TEST_DIGER), 2400);
    // Bakiyeden fazlası alınmaz.
    await s.istek('POST', '/api/yonetim/muz', { uyeId: TEST_DIGER, islem: 'al', miktar: 99999 });
    assert.equal(bakiye(s.db, TEST_GUILD, TEST_DIGER), 0);
    assert.equal((await s.istek('POST', '/api/yonetim/muz', { uyeId: TEST_DIGER, islem: 'al', miktar: 5 })).durum, 400);

    ekle(s.db, { guildId: TEST_GUILD, kullaniciId: TEST_DIGER, miktar: 70, tur: TURLER.yonetici });
    await s.istek('POST', '/api/yonetim/muz', { uyeId: TEST_DIGER, islem: 'sifirla' });
    assert.equal(bakiye(s.db, TEST_GUILD, TEST_DIGER), 0);

    const satir = s.db.prepare('SELECT karsi_id, tur FROM ekonomi_hareketleri WHERE kullanici_id = ? ORDER BY id DESC LIMIT 1').get(TEST_DIGER);
    assert.equal(satir.karsi_id, TEST_KULLANICI);
  }));

  it('geçersiz girdiler reddedilir', () => yoneticiyle(async (s) => {
    const dene = (govde) => s.istek('POST', '/api/yonetim/muz', govde);
    assert.equal((await dene({ uyeId: TEST_DIGER, islem: 'bas', miktar: 5 })).durum, 400);
    assert.equal((await dene({ uyeId: TEST_DIGER, islem: 'ver', miktar: 'abc' })).durum, 400);
    assert.equal((await dene({ uyeId: TEST_DIGER, islem: 'ver', miktar: 0 })).durum, 400);
    assert.equal((await dene({ uyeId: '999999999999', islem: 'ver', miktar: 5 })).durum, 404);
    assert.equal((await dene({ uyeId: 'x', islem: 'ver', miktar: 5 })).durum, 400);
  }));

  it('üye ayrıntısı ve hareketler', () => yoneticiyle(async (s) => {
    await s.istek('POST', '/api/yonetim/muz', { uyeId: TEST_DIGER, islem: 'ver', miktar: 300 });
    const { durum, veri } = await s.istek('GET', `/api/yonetim/uye/${TEST_DIGER}`);
    assert.equal(durum, 200);
    assert.equal(veri.uye.bakiye, 300);
    assert.equal(veri.hareketler.length, 1);
    assert.equal(veri.hareketler[0].bakiyeSonra, 300);
    assert.equal(veri.hareketler[0].karsi.id, TEST_KULLANICI);
  }));

  it('panel özeti dönemlere göre gelir', () => yoneticiyle(async (s) => {
    // Yönetici verişi kazananlara sayılmaz; günlük ödül sayılır.
    await s.istek('POST', '/api/yonetim/muz', { uyeId: TEST_DIGER, islem: 'ver', miktar: 100 });
    ekle(s.db, { guildId: TEST_GUILD, kullaniciId: TEST_DIGER, miktar: 300, tur: TURLER.gunluk });
    const { durum, veri } = await s.istek('GET', '/api/yonetim/panel?donem=7g');
    assert.equal(durum, 200);
    assert.ok(veri.arz > 0);
    assert.ok(veri.net > 0);
    assert.equal(veri.toplamBasilan - veri.toplamYokEdilen, veri.net);
    assert.equal(veri.kazananlar[0].id, TEST_DIGER);
    assert.equal(veri.kazananlar[0].net, 300);
    assert.equal((await s.istek('GET', '/api/yonetim/panel?donem=yil')).durum, 400);
  }));
});

describe('web: yönetim hareket dökümü', () => {
  it('bütün defter: tür, üye, yön, miktar süzgeci, sıralama ve okunur karşı taraf', () => yoneticiyle(async (s) => {
    const g = TEST_GUILD;
    ekle(s.db, { guildId: g, kullaniciId: TEST_DIGER, miktar: 300, tur: TURLER.gunluk });
    ekle(s.db, { guildId: g, kullaniciId: TEST_DIGER, miktar: 50, tur: TURLER.calis });
    ekle(s.db, { guildId: g, kullaniciId: TEST_KULLANICI, miktar: 5000, tur: TURLER.kazanc, karsiId: 'kasa-elmas' });
    ekle(s.db, { guildId: g, kullaniciId: TEST_DIGER, miktar: 20, tur: TURLER.kredi, karsiId: 'kredi-7' });

    const hepsi = await s.istek('GET', '/api/yonetim/hareketler?donem=tumu');
    assert.equal(hepsi.durum, 200);
    assert.equal(hepsi.veri.toplam, 4);
    assert.equal(hepsi.veri.satirlar[0].tur, 'kredi'); // en yeni önce
    assert.equal(hepsi.veri.satirlar[0].karsi.ad, 'Kredi #7');
    assert.equal(hepsi.veri.satirlar[1].karsi.ad, 'Elmas Kasa');
    assert.equal(hepsi.veri.satirlar[1].etiket, 'Kazanç');
    assert.equal(hepsi.veri.giris, 5370);
    assert.ok(hepsi.veri.secenekler.gruplar.some((x) => x.kimlik === 'kumar'));

    const emek = await s.istek('GET', '/api/yonetim/hareketler?donem=tumu&tur=gunluk,calis&siralama=mutlak');
    assert.deepEqual(emek.veri.satirlar.map((h) => h.miktar), [300, 50]);

    const uye = await s.istek('GET', `/api/yonetim/hareketler?donem=tumu&uye=${TEST_DIGER}&min=40&siralama=kucuk`);
    assert.deepEqual(uye.veri.satirlar.map((h) => h.miktar), [50, 300]);
    assert.equal(uye.veri.satirlar[0].uye.id, TEST_DIGER);

    const yonetici = await s.istek('GET', '/api/yonetim/hareketler?donem=tumu&yon=cikis');
    assert.equal(yonetici.veri.toplam, 0);
    assert.equal((await s.istek('GET', '/api/yonetim/hareketler?donem=yil')).durum, 400);
    assert.equal((await s.istek('GET', '/api/yonetim/hareketler?uye=abc')).durum, 400);
  }));
});

describe('web: yönetim etkinlik, boss, mağaza', () => {
  it('etkinlik başlat ve bitir (kanal yoksa duyuru atlanır)', () => yoneticiyle(async (s) => {
    let r = await s.istek('POST', '/api/yonetim/etkinlik', { tur: 'muz-2x', sure: '1sa' });
    assert.equal(r.durum, 200);
    assert.equal(r.veri.duyuruldu, false);
    assert.equal((await s.istek('GET', '/api/yonetim')).veri.etkinlikler[0].tur, 'muz-2x');
    assert.equal((await s.istek('POST', '/api/yonetim/etkinlik', { tur: 'muz-2x', sure: 'xx' })).durum, 400);
    assert.equal((await s.istek('POST', '/api/yonetim/etkinlik', { tur: 'muz-2x', sure: '1dk' })).durum, 400);
    r = await s.istek('POST', '/api/yonetim/etkinlik/bitir', { tur: 'muz-2x' });
    assert.equal(r.veri.bitti, true);
    assert.equal((await s.istek('GET', '/api/yonetim')).veri.etkinlikler.length, 0);
  }));

  it('boss: kanal yoksa hata, mesaj gönderilemezse geri alınır', () => yoneticiyle(async (s) => {
    let r = await s.istek('POST', '/api/yonetim/boss', {});
    assert.equal(r.durum, 400);
    assert.match(r.veri.sebep, /boss\.kanal/);
    ayarYaz(s.db, TEST_GUILD, 'boss.kanal', '300000000000000001');
    r = await s.istek('POST', '/api/yonetim/boss', { boss: 'lych', elit: true });
    assert.equal(r.durum, 400);
    assert.match(r.veri.sebep, /geri alındı/);
    assert.ok(!aktifBoss(s.db, TEST_GUILD));
    assert.equal((await s.istek('POST', '/api/yonetim/boss', { boss: 'yok' })).durum, 400);
  }));

  it('boss mesajı gidince savaş kalır', async () => {
    const istemci = yoneticiIstemci();
    istemci.channels = {
      fetch: async () => ({
        isTextBased: () => true,
        guild: istemci.guild,
        send: async () => ({ id: '1', url: 'https://discord.test/m/1' }),
      }),
    };
    const s = await testSunucusu({ istemci });
    try {
      ayarYaz(s.db, TEST_GUILD, 'boss.kanal', '300000000000000001');
      const r = await s.istek('POST', '/api/yonetim/boss', { boss: 'lych', elit: true });
      assert.equal(r.durum, 200, JSON.stringify(r.veri));
      assert.equal(r.veri.elit, true);
      assert.ok(aktifBoss(s.db, TEST_GUILD));
      assert.equal((await s.istek('POST', '/api/yonetim/boss', {})).durum, 400);
    } catch (e) {
      await s.kapat();
      throw e;
    }
    await s.kapat();
  });

  it('mağaza rolü ekle, fiyat değiştir, kaldır', () => yoneticiyle(async (s) => {
    const alt = '200000000000000001';
    let r = await s.istek('POST', '/api/yonetim/magaza-rol', { rolId: alt, fiyat: 500 });
    assert.equal(r.durum, 200);
    assert.equal(r.veri.guncellendi, false);
    r = await s.istek('POST', '/api/yonetim/magaza-rol', { rolId: alt, fiyat: 900 });
    assert.equal(r.veri.guncellendi, true);
    assert.equal(urunler(s.db, TEST_GUILD)[0].fiyat, 900);
    assert.equal(r.veri.roller.find((x) => x.id === alt).fiyat, 900);
    assert.equal((await s.istek('POST', '/api/yonetim/magaza-rol', { rolId: '200000000000000002', fiyat: 5 })).durum, 400);
    assert.equal((await s.istek('POST', '/api/yonetim/magaza-rol', { rolId: alt, fiyat: 0 })).durum, 400);
    r = await s.istek('POST', '/api/yonetim/magaza-rol/kaldir', { rolId: alt });
    assert.equal(r.veri.kaldirildi, true);
    assert.equal(urunler(s.db, TEST_GUILD).length, 0);
  }));
});

describe('web: mağaza satışları', () => {
  it('ürün adlarıyla satışlar, alıcılar ve ürün süzgeci', () => yoneticiyle(async (s) => {
    ekle(s.db, { guildId: TEST_GUILD, kullaniciId: TEST_DIGER, miktar: 100_000, tur: TURLER.yonetici });
    assert.equal(esyaSatinAl(s.db, { guildId: TEST_GUILD, kullaniciId: TEST_DIGER, kimlik: 'kasa-ahsap', adet: 2 }).ok, true);
    const urun = { rol_id: '200000000000000001', fiyat: 500 };
    assert.equal((await satinAl(s.db, { guildId: TEST_GUILD, kullaniciId: TEST_DIGER, urun, rolVer: async () => {} })).ok, true);

    const { durum, veri } = await s.istek('GET', '/api/yonetim/satislar?donem=tumu');
    assert.equal(durum, 200);
    assert.equal(veri.ozet.alim, 2);
    assert.equal(veri.ozet.adet, 3);
    assert.equal(veri.ozet.alici, 1);
    const kasa = veri.urunler.find((u) => u.kimlik === 'kasa-ahsap');
    assert.equal(kasa.tur, 'kasa');
    assert.equal(kasa.adet, 2);
    assert.ok(kasa.ad);
    const rol = veri.urunler.find((u) => u.kimlik === '200000000000000001');
    assert.equal(rol.ad, '@Alt rol');
    assert.equal(rol.tur, 'rol');
    assert.equal(veri.alicilar[0].id, TEST_DIGER);
    assert.equal(veri.alicilar[0].ad, 'Diger');
    assert.equal(veri.satirlar[0].urun.kimlik, '200000000000000001');
    assert.equal(veri.satirlar[0].uye.id, TEST_DIGER);

    const suz = await s.istek('GET', '/api/yonetim/satislar?donem=tumu&urun=kasa-ahsap');
    assert.equal(suz.veri.ozet.alim, 1);
    assert.equal(suz.veri.secili.ad, kasa.ad);
    assert.equal(suz.veri.urunler.length, 2);
    assert.equal((await s.istek('GET', `/api/yonetim/satislar?donem=tumu&uye=${TEST_KULLANICI}`)).veri.ozet.alim, 0);
    assert.equal((await s.istek('GET', '/api/yonetim/satislar?donem=yil')).durum, 400);
    assert.equal((await s.istek('GET', '/api/yonetim/satislar?uye=abc')).durum, 400);
  }));
});

describe('web: arayüz kullanım süresi', () => {
  it('nabız herkese açık; özet yalnız yöneticiye', async () => {
    const s = await testSunucusu();
    try {
      assert.equal((await s.istek('POST', '/api/nabiz', { ekran: 'ana' })).durum, 200);
      assert.equal((await s.istek('GET', '/api/yonetim/kullanim')).durum, 403);
    } finally {
      await s.kapat();
    }
  });

  it('yönetici dönemli özeti üye adlarıyla alır', () => yoneticiyle(async (s) => {
    await s.digerIstek('POST', '/api/nabiz', { ekran: 'kumar' });
    const { durum, veri } = await s.istek('GET', '/api/yonetim/kullanim?donem=bugun');
    assert.equal(durum, 200);
    assert.equal(veri.donem, 'bugun');
    assert.equal(veri.uyeler[0].id, TEST_DIGER);
    assert.equal(veri.uyeler[0].ad, 'Diger');
    assert.equal(veri.simdiAktif[0].id, TEST_DIGER);
    assert.equal((await s.istek('GET', '/api/yonetim/kullanim?donem=yil')).durum, 400);
  }));
});
