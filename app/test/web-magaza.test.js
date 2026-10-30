import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ayarYaz } from '../lib/ayarlar.js';
import { bakiye, ekle, TURLER } from '../lib/ekonomi.js';
import { adet, envanter, esyaEkle } from '../lib/envanter.js';
import { rozetRolAnahtari } from '../lib/rozet-rol.js';
import { RENK_FIYAT } from '../lib/esyalar.js';
import { KARTLAR, kasaVer, NADIRLIKLER } from '../lib/kasalar.js';
import { urunEkle } from '../lib/magaza.js';
import {
  sahteIstemci, sahteUye, TEST_DIGER, TEST_GUILD, TEST_KULLANICI, testSunucusu,
} from '../web/test-yardimci.js';

const para = (s, miktar) => ekle(s.db, {
  guildId: TEST_GUILD, kullaniciId: TEST_KULLANICI, miktar, tur: TURLER.yonetici,
});
const cuzdan = (s) => bakiye(s.db, TEST_GUILD, TEST_KULLANICI);
const kart = (i) => KARTLAR[i].kimlik;
const kartVer = (s, kimlik, n) => esyaEkle(s.db, TEST_GUILD, TEST_KULLANICI, kimlik, n);
const sahip = (s, kimlik) => adet(s.db, TEST_GUILD, TEST_KULLANICI, kimlik);

/** Rol nesnesi: guild.roles.cache'e konur. */
function sahteRol(id, ad, position = 5, color = 0x336699) {
  return {
    id, name: ad, position, color, managed: false, guild: { id: TEST_GUILD }, editable: true,
  };
}

describe('web mağaza', () => {
  it('liste kategorileri, indirim, sahip olunan ve bakiye', async () => {
    const s = await testSunucusu();
    try {
      para(s, 5000);
      const { durum, veri } = await s.istek('GET', '/api/magaza');
      assert.equal(durum, 200);
      assert.deepEqual(veri.kategoriler.map((k) => k.kimlik), ['kasa', 'takviye', 'rozet']);
      const ahsap = veri.kategoriler[0].esyalar.find((e) => e.kimlik === 'kasa-ahsap');
      assert.equal(ahsap.fiyat, 1200);
      assert.equal(ahsap.indirimli, false);
      assert.equal(veri.bakiye, 5000);
      assert.equal(veri.altinRozet.kimlik, 'rozet-altin');
      assert.equal(veri.renkRolu.fiyat, RENK_FIYAT);
      assert.equal(veri.renkRolu.mevcut, null);
      // Altın Balon satılmaz: rozet listesinde yok.
      assert.ok(!veri.kategoriler[2].esyalar.some((e) => e.kimlik === 'rozet-altin'));
    } finally {
      await s.kapat();
    }
  });

  it('kasa satın alma: adet, bakiye, yetersiz bakiye', async () => {
    const s = await testSunucusu();
    try {
      const yetmez = await s.istek('POST', '/api/magaza/al', { kimlik: 'kasa-ahsap' });
      assert.equal(yetmez.durum, 400);
      assert.match(yetmez.veri.sebep, /yetmiyor/);

      para(s, 10_000);
      const { durum, veri } = await s.istek('POST', '/api/magaza/al', { kimlik: 'kasa-ahsap', adet: 3 });
      assert.equal(durum, 200);
      assert.equal(veri.odenen, 3600);
      // Görev ödülü (Mağazadan bir şey al) yanıttaki bakiyeye de yansır.
      assert.equal(veri.bakiye, cuzdan(s));
      assert.ok(veri.bakiye >= 6400);
      assert.equal(veri.sahip, 3);
      assert.equal(sahip(s, 'kasa-ahsap'), 3);

      assert.equal((await s.istek('POST', '/api/magaza/al', { kimlik: 'kasa-ahsap', adet: 11 })).durum, 400);
      assert.equal((await s.istek('POST', '/api/magaza/al', { kimlik: 'yok' })).durum, 400);
      assert.equal((await s.istek('POST', '/api/magaza/al', { kimlik: 'rozet-altin' })).durum, 400);
    } finally {
      await s.kapat();
    }
  });

  it('takviye alınır, bitiş mağaza listesinde görünür', async () => {
    const s = await testSunucusu();
    try {
      para(s, 10_000);
      const al = await s.istek('POST', '/api/magaza/al', { kimlik: 'xp-iksiri' });
      assert.equal(al.durum, 200);
      assert.ok(al.veri.bitis > Date.now());
      const liste = await s.istek('GET', '/api/magaza');
      const iksir = liste.veri.kategoriler[1].esyalar.find((e) => e.kimlik === 'xp-iksiri');
      assert.equal(iksir.bitis, al.veri.bitis);
    } finally {
      await s.kapat();
    }
  });

  it('rozet satın alma: rol ayarı varsa üyeye rol eklenir, yoksa eklenmez', async () => {
    const s = await testSunucusu();
    try {
      para(s, 5000);
      const rolsuz = await s.istek('POST', '/api/magaza/al', { kimlik: 'rozet-kirmizi' });
      assert.equal(rolsuz.durum, 200);
      assert.equal(rolsuz.veri.rozetRolu, null);
      assert.equal(sahip(s, 'rozet-kirmizi'), 1);
      // İkinci kez alınamaz.
      assert.equal((await s.istek('POST', '/api/magaza/al', { kimlik: 'rozet-kirmizi' })).durum, 400);

      const rol = sahteRol('555000000000000001', 'Mavi Balon');
      s.istemci.guild.roles.cache.set(rol.id, rol);
      // Sahte üyede guild yok; rozetRoluVer rolü uye.guild üzerinden arar.
      s.istemci.guild.members.cache.get(TEST_KULLANICI).guild = s.istemci.guild;
      ayarYaz(s.db, TEST_GUILD, rozetRolAnahtari('rozet-mavi'), rol.id);
      const rollu = await s.istek('POST', '/api/magaza/al', { kimlik: 'rozet-mavi' });
      assert.equal(rollu.durum, 200);
      assert.equal(rollu.veri.rozetRolu.id, rol.id);
      assert.ok(s.istemci.guild.members.cache.get(TEST_KULLANICI).roles.cache.has(rol.id));
    } finally {
      await s.kapat();
    }
  });

  it('rol satın alma: satışta olmayan, hiyerarşi, başarı, zaten sahip', async () => {
    const s = await testSunucusu();
    try {
      const rol = sahteRol('555000000000000002', 'VIP', 5);
      const yuksek = sahteRol('555000000000000003', 'Üst', 100);
      s.istemci.guild.roles.cache.set(rol.id, rol);
      s.istemci.guild.roles.cache.set(yuksek.id, yuksek);
      urunEkle(s.db, { guildId: TEST_GUILD, rolId: rol.id, fiyat: 800, ekleyenId: TEST_DIGER });
      urunEkle(s.db, { guildId: TEST_GUILD, rolId: yuksek.id, fiyat: 100, ekleyenId: TEST_DIGER });
      para(s, 1000);

      assert.equal((await s.istek('POST', '/api/magaza/rol', { rolId: '555000000000000009' })).durum, 400);
      const ust = await s.istek('POST', '/api/magaza/rol', { rolId: yuksek.id });
      assert.equal(ust.durum, 400);
      assert.match(ust.veri.sebep, /verilemiyor/);
      assert.equal(cuzdan(s), 1000);

      const liste = await s.istek('GET', '/api/magaza');
      assert.equal(liste.veri.roller.length, 2);
      assert.equal(liste.veri.roller.find((r) => r.rolId === rol.id).verilebilir, true);
      assert.equal(liste.veri.roller.find((r) => r.rolId === yuksek.id).verilebilir, false);

      const al = await s.istek('POST', '/api/magaza/rol', { rolId: rol.id });
      assert.equal(al.durum, 200);
      assert.equal(al.veri.bakiye, cuzdan(s));
      assert.ok(al.veri.bakiye >= 200);
      assert.ok(s.istemci.guild.members.cache.get(TEST_KULLANICI).roles.cache.has(rol.id));

      const tekrar = await s.istek('POST', '/api/magaza/rol', { rolId: rol.id });
      assert.equal(tekrar.durum, 400);
      assert.match(tekrar.veri.sebep, /zaten sende/);
    } finally {
      await s.kapat();
    }
  });

  it('renk rolü: oluşturur, yetersiz bakiye, aynı renk reddi, değişim ucuz', async () => {
    const s = await testSunucusu();
    try {
      const g = s.istemci.guild;
      const roller = new Map();
      g.roles.create = async ({ colors }) => {
        const rol = {
          id: '777000000000000001', name: 'renk', color: colors.primaryColor, position: 3,
          setPosition: async () => rol, edit: async ({ colors: c }) => { rol.color = c.primaryColor; },
        };
        roller.set(rol.id, rol);
        g.roles.cache.set(rol.id, rol);
        return rol;
      };
      g.roles.fetch = async (id) => roller.get(id) ?? null;

      assert.equal((await s.istek('POST', '/api/magaza/renk', { renk: '#ff8800' })).durum, 400);
      assert.equal((await s.istek('POST', '/api/magaza/renk', { renk: 'mor' })).durum, 400);
      assert.equal((await s.istek('POST', '/api/magaza/renk', { renk: '#000000' })).durum, 400);

      para(s, 30_000);
      const ilk = await s.istek('POST', '/api/magaza/renk', { renk: '#ff8800' });
      assert.equal(ilk.durum, 200);
      assert.equal(ilk.veri.yeni, true);
      assert.equal(ilk.veri.bakiye, cuzdan(s));
      assert.ok(ilk.veri.bakiye >= 30_000 - RENK_FIYAT);
      assert.equal(roller.get(ilk.veri.rolId).color, 0xff8800);

      assert.equal((await s.istek('POST', '/api/magaza/renk', { renk: '#ff8800' })).durum, 400);
      const degisim = await s.istek('POST', '/api/magaza/renk', { renk: '3fa' });
      assert.equal(degisim.durum, 200);
      assert.equal(degisim.veri.yeni, false);
      assert.equal(degisim.veri.renk, '#33ffaa');

      const liste = await s.istek('GET', '/api/magaza');
      assert.equal(liste.veri.renkRolu.mevcut.renk, '#33ffaa');
      assert.equal(liste.veri.renkRolu.mevcut.var, true);
    } finally {
      await s.kapat();
    }
  });
});

describe('web kasa', () => {
  it('kasa bilgisi olasılıkları yüzde olarak verir', async () => {
    const s = await testSunucusu();
    try {
      const { durum, veri } = await s.istek('GET', '/api/kasa/kasa-demir');
      assert.equal(durum, 200);
      assert.equal(veri.fiyat, 4000);
      const toplam = veri.icerik.reduce((t, o) => t + o.yuzde, 0);
      assert.ok(Math.abs(toplam - 100) < 1e-9);
      assert.ok(veri.icerik.some((o) => o.tur === 'muz' && o.min === 1500 && o.max === 3500));
      assert.equal(veri.garanti, null, 'Demir Kasa garantisiz');
      const ahsap = (await s.istek('GET', '/api/kasa/kasa-ahsap')).veri.garanti;
      assert.deepEqual(ahsap, {
        nadirlik: 'destansi', nadirlikAd: 'Destansı', esik: 20, kalan: 20,
      });
      assert.ok(veri.icerik.some((o) => o.tur === 'kart' && o.nadirlik === 'nadir'));
      assert.equal((await s.istek('GET', '/api/kasa/kasa-yok')).durum, 404);
    } finally {
      await s.kapat();
    }
  });

  it('envanterde yoksa açılmaz', async () => {
    const s = await testSunucusu();
    try {
      const r = await s.istek('POST', '/api/kasa/ac', { kasa: 'kasa-ahsap' });
      assert.equal(r.durum, 400);
      assert.match(r.veri.sebep, /yok/);
      assert.equal((await s.istek('POST', '/api/kasa/ac', { kasa: 'kasa-yok' })).durum, 400);
      assert.equal((await s.istek('POST', '/api/kasa/ac', { kasa: 'kasa-ahsap', adet: 11 })).durum, 400);
    } finally {
      await s.kapat();
    }
  });

  it('tek açılış şerit ve ödül verir', async () => {
    const s = await testSunucusu();
    try {
      kasaVer(s.db, { guildId: TEST_GUILD, kullaniciId: TEST_KULLANICI, kasa: 'kasa-demir', tur: 'test' });
      const r = await s.istek('POST', '/api/kasa/ac', { kasa: 'kasa-demir' });
      assert.equal(r.durum, 200);
      assert.equal(r.veri.sonuclar.length, 1);
      assert.equal(r.veri.kalan, 0);
      assert.ok(Array.isArray(r.veri.serit) && r.veri.serit.length >= 30);
      assert.ok(r.veri.serit.every((o) => o.tur === 'para' || o.kimlik));
      assert.ok(NADIRLIKLER[r.veri.sonuclar[0].nadirlik]);
      assert.equal(sahip(s, 'kasa-demir'), 0);
      // Ödül ya muz ya da envantere girdi.
      const o = r.veri.sonuclar[0];
      if (o.tur === 'muz') assert.equal(cuzdan(s), o.miktar);
      assert.equal(r.veri.bakiye, cuzdan(s));
    } finally {
      await s.kapat();
    }
  });

  it('çoklu açılış sonuçları en iyi önce verir, şerit yok, görev ilerler', async () => {
    const s = await testSunucusu();
    try {
      for (let i = 0; i < 5; i += 1) kasaVer(s.db, { guildId: TEST_GUILD, kullaniciId: TEST_KULLANICI, kasa: 'kasa-altin', tur: 'test' });
      const r = await s.istek('POST', '/api/kasa/ac', { kasa: 'kasa-altin', adet: 8 });
      assert.equal(r.durum, 200);
      // 5 kasa var, 8 istendi: 5'i açılır.
      assert.equal(r.veri.sonuclar.length, 5);
      assert.equal(r.veri.serit, null);
      assert.equal(r.veri.kalan, 0);
      const sira = Object.keys(NADIRLIKLER);
      const indisler = r.veri.sonuclar.map((o) => sira.indexOf(o.nadirlik));
      assert.deepEqual(indisler, [...indisler].sort((a, b) => b - a));
    } finally {
      await s.kapat();
    }
  });
});

describe('web envanter', () => {
  it('özet kasa, kart, koleksiyon, toptan önizleme ve hediye hakkı', async () => {
    const s = await testSunucusu();
    try {
      kasaVer(s.db, { guildId: TEST_GUILD, kullaniciId: TEST_KULLANICI, kasa: 'kasa-demir', tur: 'test' });
      kartVer(s, kart(0), 7);
      kartVer(s, kart(20), 1);
      const { durum, veri } = await s.istek('GET', '/api/envanter');
      assert.equal(durum, 200);
      assert.equal(veri.kasalar.find((k) => k.kimlik === 'kasa-demir').adet, 1);
      assert.equal(veri.kartlar[kart(0)], 7);
      assert.equal(veri.koleksiyon.farkli, 2);
      assert.equal(veri.koleksiyon.toplam, 126 / 2);
      assert.equal(veri.toptan.hepsi.adet, 8);
      assert.equal(veri.toptan.nadirlikler.siradan.adet, 7);
      assert.equal(veri.toptan.nadirlikler.siradan.tutar, 7 * 400);
      assert.equal(veri.kopyalar.adet, 6);
      assert.equal(veri.birlestirme.kartlar[kart(0)].kez, 1);
      assert.equal(veri.birlestirme.birlestirme, 1);
      assert.deepEqual(veri.hediye, { gunluk: 10, kalan: 10 });
    } finally {
      await s.kapat();
    }
  });

  it('kart satma: adet, tumu, eksik kopya', async () => {
    const s = await testSunucusu();
    try {
      kartVer(s, kart(0), 4);
      const bir = await s.istek('POST', '/api/envanter/sat', { kimlik: kart(0) });
      assert.equal(bir.durum, 200);
      assert.equal(bir.veri.tutar, 400);
      assert.equal(bir.veri.bakiye, cuzdan(s));
      assert.ok(bir.veri.bakiye >= 400);
      assert.equal((await s.istek('POST', '/api/envanter/sat', { kimlik: kart(0), adet: 9 })).durum, 400);
      const hepsi = await s.istek('POST', '/api/envanter/sat', { kimlik: kart(0), tumu: true });
      assert.equal(hepsi.veri.adet, 3);
      assert.equal(hepsi.veri.bakiye, cuzdan(s));
      assert.ok(hepsi.veri.bakiye >= 400 + 1200);
      assert.equal(sahip(s, kart(0)), 0);
      assert.equal((await s.istek('POST', '/api/envanter/sat', { kimlik: 'kasa-ahsap' })).durum, 400);
    } finally {
      await s.kapat();
    }
  });

  it('kopyaları sat bir tane bırakır', async () => {
    const s = await testSunucusu();
    try {
      assert.equal((await s.istek('POST', '/api/envanter/kopyalari-sat')).durum, 400);
      kartVer(s, kart(0), 3);
      kartVer(s, kart(1), 1);
      const r = await s.istek('POST', '/api/envanter/kopyalari-sat');
      assert.equal(r.durum, 200);
      assert.equal(r.veri.adet, 2);
      assert.equal(r.veri.tutar, 800);
      assert.equal(sahip(s, kart(0)), 1);
      assert.equal(sahip(s, kart(1)), 1);
    } finally {
      await s.kapat();
    }
  });

  it('toptan satış: nadirlik seçimi, hepsi, boşsa hata', async () => {
    const s = await testSunucusu();
    try {
      assert.equal((await s.istek('POST', '/api/envanter/toptan-sat', { nadirlik: null })).durum, 400);
      kartVer(s, kart(0), 2);
      const nadirKart = KARTLAR.find((k) => k.nadirlik === 'nadir').kimlik;
      kartVer(s, nadirKart, 1);
      assert.equal((await s.istek('POST', '/api/envanter/toptan-sat', { nadirlik: 'yok' })).durum, 400);

      const siradan = await s.istek('POST', '/api/envanter/toptan-sat', { nadirlik: 'siradan' });
      assert.equal(siradan.durum, 200);
      assert.equal(siradan.veri.adet, 2);
      assert.equal(siradan.veri.tutar, 800);
      assert.equal(sahip(s, nadirKart), 1);

      const hepsi = await s.istek('POST', '/api/envanter/toptan-sat', {});
      assert.equal(hepsi.veri.adet, 1);
      assert.equal(hepsi.veri.tutar, NADIRLIKLER.nadir.deger);
      assert.equal(hepsi.veri.bakiye, cuzdan(s));
      assert.ok(hepsi.veri.bakiye >= 800 + NADIRLIKLER.nadir.deger);
      assert.deepEqual(Object.keys(envanter(s.db, TEST_GUILD, TEST_KULLANICI)).filter((k) => k.startsWith('kart')), []);
    } finally {
      await s.kapat();
    }
  });

  it('birleştirme: tek kart, yetersiz kopya, hepsi, parlak/mitik reddi', async () => {
    const s = await testSunucusu();
    try {
      kartVer(s, kart(0), 3);
      const az = await s.istek('POST', '/api/envanter/birlestir', { kimlik: kart(0) });
      assert.equal(az.durum, 400);

      kartVer(s, kart(0), 8); // 11 kopya: 2 birleştirme, 1 kalır.
      const r = await s.istek('POST', '/api/envanter/birlestir', { kimlik: kart(0), adet: 2 });
      assert.equal(r.durum, 200);
      assert.equal(r.veri.harcanan, 10);
      assert.equal(r.veri.birlestirme, 2);
      assert.equal(r.veri.ustNadirlik.ad, 'Nadir');
      assert.equal(r.veri.sonuclar.reduce((t, g) => t + g.adet, 0), 2);
      assert.equal(sahip(s, kart(0)), 1);

      kartVer(s, kart(1), 6);
      const hepsi = await s.istek('POST', '/api/envanter/birlestir', { kimlik: 'hepsi' });
      assert.equal(hepsi.durum, 200);
      assert.equal(hepsi.veri.harcanan, 5);
      assert.equal((await s.istek('POST', '/api/envanter/birlestir', { kimlik: 'hepsi' })).durum, 400);

      const mitik = KARTLAR.find((k) => k.nadirlik === 'mitik').kimlik;
      kartVer(s, mitik, 20);
      assert.equal((await s.istek('POST', '/api/envanter/birlestir', { kimlik: mitik })).durum, 400);
      kartVer(s, `parlak:${kart(2)}`, 20);
      assert.equal((await s.istek('POST', '/api/envanter/birlestir', { kimlik: `parlak:${kart(2)}` })).durum, 400);
    } finally {
      await s.kapat();
    }
  });

  it('hediye: başarı, kendine, bot, üye olmayan, günlük kasa, günlük sınır', async () => {
    const bot = sahteUye('100000000000000009', 'Bot');
    bot.user.bot = true;
    const s = await testSunucusu({
      istemci: sahteIstemci([sahteUye(TEST_KULLANICI, 'Test'), sahteUye(TEST_DIGER, 'Diger'), bot]),
    });
    try {
      kartVer(s, kart(0), 12);
      kasaVer(s.db, { guildId: TEST_GUILD, kullaniciId: TEST_KULLANICI, kasa: 'kasa-gunluk', tur: 'test' });

      assert.equal((await s.istek('POST', '/api/envanter/hediye', { aliciId: TEST_KULLANICI, kimlik: kart(0) })).durum, 400);
      assert.equal((await s.istek('POST', '/api/envanter/hediye', { aliciId: bot.id, kimlik: kart(0) })).durum, 400);
      assert.equal((await s.istek('POST', '/api/envanter/hediye', { aliciId: '999999999999', kimlik: kart(0) })).durum, 400);
      assert.equal((await s.istek('POST', '/api/envanter/hediye', { aliciId: TEST_DIGER, kimlik: 'kasa-gunluk' })).durum, 400);

      const r = await s.istek('POST', '/api/envanter/hediye', { aliciId: TEST_DIGER, kimlik: kart(0), adet: 4 });
      assert.equal(r.durum, 200);
      assert.equal(r.veri.kalanHak, 6);
      assert.equal(r.veri.alici.ad, 'Diger');
      assert.equal(sahip(s, kart(0)), 8);
      assert.equal(adet(s.db, TEST_GUILD, TEST_DIGER, kart(0)), 4);

      const liste = await s.istek('GET', '/api/envanter');
      assert.deepEqual(liste.veri.hediye, { gunluk: 10, kalan: 6 });

      const sinir = await s.istek('POST', '/api/envanter/hediye', { aliciId: TEST_DIGER, kimlik: kart(0), adet: 7 });
      assert.equal(sinir.durum, 400);
    } finally {
      await s.kapat();
    }
  });
});

describe('web setler', () => {
  it('ilerleme, eksik set reddi, tamamlanınca ödül bir kez', async () => {
    const s = await testSunucusu();
    try {
      const bos = await s.istek('GET', '/api/setler');
      assert.equal(bos.durum, 200);
      assert.equal(bos.veri.setler.length, 12);
      const askeri = bos.veri.setler.find((x) => x.kimlik === 'askeri-kuleler');
      assert.equal(askeri.sahip, 0);
      assert.equal(askeri.alinabilir, false);
      assert.equal(askeri.odul.muz, 1000);
      assert.equal(askeri.odul.kasalar[0].kimlik, 'kasa-ahsap');

      const eksik = await s.istek('POST', '/api/setler/odul', { set: 'askeri-kuleler' });
      assert.equal(eksik.durum, 400);
      assert.match(eksik.veri.sebep, /henüz tamam değil/);
      assert.equal((await s.istek('POST', '/api/setler/odul', { set: 'yok' })).durum, 400);

      for (const k of askeri.kartlar) kartVer(s, k.kimlik, 1);
      const hazir = await s.istek('GET', '/api/setler');
      const a = hazir.veri.setler.find((x) => x.kimlik === 'askeri-kuleler');
      assert.equal(a.alinabilir, true);
      assert.ok(a.kartlar.every((k) => k.sahip));

      const odul = await s.istek('POST', '/api/setler/odul', { set: 'askeri-kuleler' });
      assert.equal(odul.durum, 200);
      assert.equal(odul.veri.bakiye, cuzdan(s));
      assert.ok(odul.veri.bakiye >= 1000);
      assert.equal(sahip(s, 'kasa-ahsap'), 1);

      const tekrar = await s.istek('POST', '/api/setler/odul', { set: 'askeri-kuleler' });
      assert.equal(tekrar.durum, 400);
      const son = await s.istek('GET', '/api/setler');
      assert.equal(son.veri.alinan, 1);
      assert.equal(son.veri.setler.find((x) => x.kimlik === 'askeri-kuleler').alindi, true);
    } finally {
      await s.kapat();
    }
  });
});
