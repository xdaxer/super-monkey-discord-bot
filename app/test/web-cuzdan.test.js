import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { bakiye, ekle, TURLER } from '../lib/ekonomi.js';
import { esyaEkle } from '../lib/envanter.js';
import {
  sahteIstemci, sahteUye, TEST_DIGER, TEST_GUILD, TEST_KULLANICI, testSunucusu,
} from '../web/test-yardimci.js';

function para(s, miktar, kullaniciId = TEST_KULLANICI) {
  ekle(s.db, { guildId: TEST_GUILD, kullaniciId, miktar, tur: TURLER.yonetici });
}

async function sunucuyla(fn, secenek) {
  const s = await testSunucusu(secenek);
  try {
    await fn(s);
  } finally {
    await s.kapat();
  }
}

describe('web: /api/ozet', () => {
  it('boş hesapta bile eksiksiz özet döner', () => sunucuyla(async (s) => {
    const { durum, veri } = await s.istek('GET', '/api/ozet');
    assert.equal(durum, 200);
    assert.equal(veri.bakiye, 0);
    assert.equal(veri.kullanici.ad, 'Test');
    assert.equal(veri.sira, null);
    assert.equal(veri.gunlukAlindi, false);
    assert.ok(veri.sonrakiGunMs > Date.now());
    assert.equal(veri.borc, null);
    assert.deepEqual(veri.rozetler, []);
    assert.equal(veri.prestij.seviye, 0);
    assert.equal(veri.prestij.carpan, 1);
    assert.equal(veri.uyelik, null);
    assert.equal(veri.yonetici, null);
    assert.equal(veri.gonderim.limit, 2000);
    assert.equal(veri.gonderim.kalan, 2000);
    assert.equal(veri.calis.meslekler.length, 8);
    assert.equal(veri.calis.aktif, 'dart');
    assert.equal(veri.profil.seviye, 0);
    assert.deepEqual(veri.profil.enDegerliKartlar, []);
  }));

  it('bakiye, sıra ve günlük sonrası durum yansır', () => sunucuyla(async (s) => {
    para(s, 5000);
    para(s, 9000, TEST_DIGER);
    let { veri } = await s.istek('GET', '/api/ozet');
    assert.equal(veri.bakiye, 5000);
    assert.equal(veri.sira, 2);

    await s.istek('POST', '/api/gunluk');
    ({ veri } = await s.istek('GET', '/api/ozet'));
    assert.equal(veri.gunlukAlindi, true);
    assert.equal(veri.seri, 1);
  }));

  it('ekonomi kapalıyken 403', () => sunucuyla(async (s) => {
    assert.equal((await s.istek('GET', '/api/ozet')).durum, 403);
  }, { ekonomiAcik: false }));

  it('oturumsuz 401', () => sunucuyla(async (s) => {
    assert.equal((await s.istek('GET', '/api/ozet', undefined, { belirtec: null })).durum, 401);
  }));
});

describe('web: /api/gunluk', () => {
  it('ilk çağrıda ödül verir, ikincide verildi:false', () => sunucuyla(async (s) => {
    const ilk = await s.istek('POST', '/api/gunluk');
    assert.equal(ilk.durum, 200);
    assert.equal(ilk.veri.verildi, true);
    assert.equal(ilk.veri.seri, 1);
    assert.ok(ilk.veri.toplam >= 200);
    // Günün görevlerinden biri "/gunluk al" ise ödülü de cüzdana geçer (görev seçimi tarihe bağlı).
    assert.ok(ilk.veri.bakiye >= ilk.veri.toplam);
    assert.equal(ilk.veri.bakiye, bakiye(s.db, TEST_GUILD, TEST_KULLANICI));
    assert.equal(ilk.veri.kasalar[0].kimlik, 'kasa-gunluk');
    assert.equal(ilk.veri.yonetici, 1);
    assert.equal(ilk.veri.borcKesilen, 0);

    const ikinci = await s.istek('POST', '/api/gunluk');
    assert.equal(ikinci.durum, 200);
    assert.equal(ikinci.veri.verildi, false);
    assert.ok(ikinci.veri.kalanMs > 0);
    assert.equal(ikinci.veri.bakiye, ilk.veri.bakiye);
  }));

  it('görev ilerletir (günlük görev bildirimi/ilerleme)', () => sunucuyla(async (s) => {
    await s.istek('POST', '/api/gunluk');
    const { veri } = await s.istek('GET', '/api/gorevler');
    const gunlukGorev = [...veri.gunluk.gorevler, ...veri.haftalik.gorevler].filter((g) => g.tur === 'gunluk');
    for (const g of gunlukGorev) assert.ok(g.ilerleme >= 1);
  }));
});

describe('web: /api/calis', () => {
  it('bilgi: açık/kilitli meslekler ve seçim', () => sunucuyla(async (s) => {
    const { durum, veri } = await s.istek('GET', '/api/calis');
    assert.equal(durum, 200);
    assert.equal(veri.secim, 'otomatik');
    assert.equal(veri.kalanMs, 0);
    assert.equal(veri.meslekler.filter((m) => m.acik).length, 1);
    assert.equal(veri.sonraki.kimlik, 'bumerang');
    assert.equal(veri.bonus.ahsap, 0.4);
    assert.equal(veri.enerji, 100);
    assert.equal(veri.enerjiMaks, 100);
    assert.equal(veri.maymun.kart, null);
    assert.ok(Math.abs(veri.maymun.direnc - 0.16) < 1e-9);
    assert.equal(veri.rozetBonus, 0);
  }));

  it('çalışır, sonra bekleme döner', () => sunucuyla(async (s) => {
    const ilk = await s.istek('POST', '/api/calis');
    assert.equal(ilk.durum, 200);
    assert.equal(ilk.veri.calisti, true);
    assert.ok(ilk.veri.kazanc >= 16 && ilk.veri.kazanc <= 24);
    // Muz Molası olayı (%12 olay şansı) harcanan enerjiyi geri doldurabilir.
    if (!ilk.veri.olayEtkisi?.enerji) assert.ok(ilk.veri.bilgi.enerji < 100);
    assert.equal(ilk.veri.meslek.kimlik, 'dart');
    assert.equal(ilk.veri.bakiye, bakiye(s.db, TEST_GUILD, TEST_KULLANICI));

    const ikinci = await s.istek('POST', '/api/calis');
    assert.equal(ikinci.durum, 200);
    assert.equal(ikinci.veri.calisti, false);
    assert.ok(ikinci.veri.kalanMs > 0);

    const bilgi = await s.istek('GET', '/api/calis');
    assert.ok(bilgi.veri.kalanMs > 0);
  }));

  it('maymun: listelenir, kilitlenir, çalışınca XP alır, bırakılır', () => sunucuyla(async (s) => {
    esyaEkle(s.db, TEST_GUILD, TEST_KULLANICI, 'kart-quincy', 1);
    esyaEkle(s.db, TEST_GUILD, TEST_KULLANICI, 'kart-zebra', 1);
    const liste = await s.istek('GET', '/api/calis/maymunlar');
    assert.deepEqual(liste.veri.maymunlar.map((m) => m.kart.kimlik), ['kart-quincy']);

    assert.equal((await s.istek('POST', '/api/calis/maymun', { kimlik: 'kart-zebra' })).durum, 400);
    const kilit = await s.istek('POST', '/api/calis/maymun', { kimlik: 'kart-quincy' });
    assert.equal(kilit.durum, 200);
    assert.equal(kilit.veri.bilgi.maymun.kart.kimlik, 'kart-quincy');

    const c = await s.istek('POST', '/api/calis');
    // Antrenman olayı çıkarsa maymun +5 XP daha alır.
    assert.equal(c.veri.maymun.xp, c.veri.olayEtkisi?.kimlik === 'antrenman' ? 6 : 1);
    assert.ok(c.veri.bedel < 8.4);

    const birak = await s.istek('POST', '/api/calis/maymun', { kimlik: null });
    assert.equal(birak.veri.bilgi.maymun.kart, null);
  }));

  it('meslek seçimi: seviye yetmeyen reddedilir, otomatik kabul edilir', () => sunucuyla(async (s) => {
    const red = await s.istek('POST', '/api/calis/meslek', { kimlik: 'super' });
    assert.equal(red.durum, 400);
    assert.match(red.veri.sebep, /Sv 50/);

    assert.equal((await s.istek('POST', '/api/calis/meslek', { kimlik: 'yok' })).durum, 400);
    assert.equal((await s.istek('POST', '/api/calis/meslek', {})).durum, 400);

  }));

  it('seviye yetince manuel seçilir, otomatiğe dönülür', () => sunucuyla(async (s) => {
    // Meslekler `seviyeler.seviye` sütununa bakar.
    s.db.prepare('INSERT INTO seviyeler (guild_id, kullanici_id, xp, seviye) VALUES (?, ?, 0, 5)')
      .run(TEST_GUILD, TEST_KULLANICI);
    const ok = await s.istek('POST', '/api/calis/meslek', { kimlik: 'bomba' });
    assert.equal(ok.durum, 200);
    assert.equal(ok.veri.otomatik, false);
    assert.equal(ok.veri.meslek.kimlik, 'bomba');
    assert.equal(ok.veri.bilgi.secim, 'manuel');
    assert.equal(ok.veri.bilgi.aktif, 'bomba');

    const oto = await s.istek('POST', '/api/calis/meslek', { kimlik: 'otomatik' });
    assert.equal(oto.veri.otomatik, true);
    assert.equal(oto.veri.bilgi.secim, 'otomatik');
  }));
});

describe('web: /api/gonder', () => {
  it('muz gönderir, vergi keser, limiti düşürür', () => sunucuyla(async (s) => {
    para(s, 1000);
    const { durum, veri } = await s.istek('POST', '/api/gonder', { aliciId: TEST_DIGER, miktar: '500' });
    assert.equal(durum, 200);
    assert.equal(veri.miktar, 500);
    assert.equal(veri.vergi, 25);
    assert.equal(veri.net, 475);
    assert.equal(veri.alici.id, TEST_DIGER);
    assert.equal(veri.alici.ad, 'Diger');
    // Günün görevleri arasında "muz gönder" varsa ödülü de gelir; yanıt cüzdanla aynı olmalı.
    assert.equal(veri.bakiye, bakiye(s.db, TEST_GUILD, TEST_KULLANICI));
    assert.ok(veri.bakiye >= 500);
    assert.equal(bakiye(s.db, TEST_GUILD, TEST_DIGER), 475);
    assert.equal(veri.kalanLimit, 1500);
  }));

  it('yarı ve kısaltmalar çalışır', () => sunucuyla(async (s) => {
    para(s, 4000);
    const yari = await s.istek('POST', '/api/gonder', { aliciId: TEST_DIGER, miktar: 'yarı' });
    assert.equal(yari.veri.miktar, 2000);
    const bir = await s.istek('POST', '/api/gonder', { aliciId: TEST_DIGER, miktar: '1k' });
    // Günlük limit (2000) dolduğu için reddedilir.
    assert.equal(bir.durum, 400);
    assert.match(bir.veri.sebep, /limit/i);
  }));

  it('hatalar: kendine, bot, üye olmayan, yetersiz bakiye, kötü tutar', () => sunucuyla(async (s) => {
    para(s, 1000);
    const kendine = await s.istek('POST', '/api/gonder', { aliciId: TEST_KULLANICI, miktar: '100' });
    assert.equal(kendine.durum, 400);
    assert.match(kendine.veri.sebep, /Kendine/);

    const yok = await s.istek('POST', '/api/gonder', { aliciId: '999999999999', miktar: '100' });
    assert.equal(yok.durum, 400);
    assert.match(yok.veri.sebep, /üyesi değil/);

    assert.equal((await s.istek('POST', '/api/gonder', { aliciId: 'abc', miktar: '100' })).durum, 400);
    assert.equal((await s.istek('POST', '/api/gonder', { miktar: '100' })).durum, 400);
    assert.equal((await s.istek('POST', '/api/gonder', { aliciId: TEST_DIGER })).durum, 400);

    const kotu = await s.istek('POST', '/api/gonder', { aliciId: TEST_DIGER, miktar: 'bir sürü' });
    assert.equal(kotu.durum, 400);
    assert.match(kotu.veri.sebep, /anlayamadım/);

    const fazla = await s.istek('POST', '/api/gonder', { aliciId: TEST_DIGER, miktar: '1500' });
    assert.equal(fazla.durum, 400);
    assert.match(fazla.veri.sebep, /yetmiyor/);

    assert.equal(bakiye(s.db, TEST_GUILD, TEST_KULLANICI), 1000);
  }));

  it('bota gönderilemez', async () => {
    const bot = sahteUye('100000000000000009', 'Bot');
    bot.user.bot = true;
    const istemci = sahteIstemci([sahteUye(TEST_KULLANICI, 'Test'), sahteUye(TEST_DIGER, 'Diger'), bot]);
    await sunucuyla(async (s) => {
      para(s, 1000);
      const r = await s.istek('POST', '/api/gonder', { aliciId: bot.id, miktar: '100' });
      assert.equal(r.durum, 400);
      assert.match(r.veri.sebep, /Botlara/);
      assert.equal(bakiye(s.db, TEST_GUILD, TEST_KULLANICI), 1000);
    }, { istemci });
  });

  it('gönder görevi ilerler', () => sunucuyla(async (s) => {
    para(s, 1000);
    await s.istek('POST', '/api/gonder', { aliciId: TEST_DIGER, miktar: '200' });
    const { veri } = await s.istek('GET', '/api/gorevler');
    const g = [...veri.gunluk.gorevler, ...veri.haftalik.gorevler].filter((x) => x.tur === 'gonder');
    for (const x of g) assert.equal(x.ilerleme, Math.min(x.hedef, 200));
  }));
});

describe('web: /api/gorevler', () => {
  it('günlük 3, haftalık 2 görev ve bonus bilgisi', () => sunucuyla(async (s) => {
    const { durum, veri } = await s.istek('GET', '/api/gorevler');
    assert.equal(durum, 200);
    assert.equal(veri.gunluk.gorevler.length, 3);
    assert.equal(veri.haftalik.gorevler.length, 2);
    assert.ok(veri.gunluk.bitis > Date.now());
    assert.ok(veri.haftalik.bitis > veri.gunluk.bitis - 1);
    assert.equal(veri.gunluk.bonus.alindi, false);
    assert.equal(veri.gunluk.bonus.toplam, 3);
    assert.equal(veri.gunluk.bonus.odul.kasa.kimlik, 'kasa-ahsap');
    for (const g of [...veri.gunluk.gorevler, ...veri.haftalik.gorevler]) {
      assert.equal(g.ilerleme, 0);
      assert.equal(g.bitti, false);
      assert.ok(g.odul.muz || g.odul.kasa);
      assert.ok(typeof g.odulMetni === 'string');
    }
  }));
});

describe('web: /api/basarimlar', () => {
  it('kategorilere göre durum ve özet döner', () => sunucuyla(async (s) => {
    const { durum, veri } = await s.istek('GET', '/api/basarimlar');
    assert.equal(durum, 200);
    assert.equal(veri.kategoriler.length, 5);
    assert.equal(veri.kademeler.length, 3);
    const toplam = veri.kategoriler.reduce((t, k) => t + k.toplam, 0);
    assert.equal(toplam, veri.ozet.toplam);
    const ilk = veri.kategoriler[0].basarimlar[0];
    assert.ok(ilk.ad && ilk.hedef > 0 && ilk.kademeSimge);
    assert.equal(ilk.kazanildi, undefined);
  }));

  it('koşulu sağlanan başarım kazanılır ve ödül verilir', () => sunucuyla(async (s) => {
    // 50.000 muz biriktirmek "Muz Tasarrufu" başarımını açar.
    para(s, 60_000);
    const { veri } = await s.istek('GET', '/api/basarimlar');
    const b = veri.kategoriler.flatMap((k) => k.basarimlar).find((x) => x.kimlik === 'servet-50k');
    assert.ok(b.zaman);
    assert.equal(b.deger, b.hedef);
    assert.ok(veri.ozet.adet >= 1);
    assert.equal(bakiye(s.db, TEST_GUILD, TEST_KULLANICI), 61_000);
    const ozet = await s.istek('GET', '/api/ozet');
    assert.equal(ozet.veri.bakiye, 61_000);
  }));
});

describe('web: /api/siralama', () => {
  it('muz sıralaması, kendi sıran ve türler', () => sunucuyla(async (s) => {
    para(s, 100);
    para(s, 700, TEST_DIGER);
    const { durum, veri } = await s.istek('GET', '/api/siralama');
    assert.equal(durum, 200);
    assert.equal(veri.tur, 'muz');
    assert.deepEqual(veri.turler.map((t) => t.kimlik), ['muz', 'toplam', 'seviye', 'koleksiyon', 'seri', 'prestij', 'kumar']);
    assert.equal(veri.satirlar.length, 2);
    assert.equal(veri.satirlar[0].sira, 1);
    assert.equal(veri.satirlar[0].uye.id, TEST_DIGER);
    assert.equal(veri.satirlar[0].deger, 700);
    assert.equal(veri.satirlar[0].ben, false);
    assert.match(veri.satirlar[0].degerMetni, /700/);
    assert.equal(veri.kendi.sira, 2);
    assert.equal(veri.kendi.ben, true);
    assert.equal(veri.satirlar[1].ben, true);
  }));

  it('boş liste ve bilinmeyen tür', () => sunucuyla(async (s) => {
    const bos = await s.istek('GET', '/api/siralama?tur=seri');
    assert.equal(bos.durum, 200);
    assert.deepEqual(bos.veri.satirlar, []);
    assert.equal(bos.veri.kendi, null);
    assert.ok(bos.veri.bos.length > 0);

    const kumar = await s.istek('GET', '/api/siralama?tur=kumar');
    assert.ok(kumar.veri.haftaBaslangic > 0);

    assert.equal((await s.istek('GET', '/api/siralama?tur=yok')).durum, 400);
  }));

  it('ilk 10 ile sınırlı, kendi sıran listede yoksa ayrıca gelir', async () => {
    const uyeler = [sahteUye(TEST_KULLANICI, 'Test'), sahteUye(TEST_DIGER, 'Diger')];
    for (let i = 10; i < 22; i += 1) uyeler.push(sahteUye(`1000000000000000${i}`, `U${i}`));
    await sunucuyla(async (s) => {
      para(s, 1);
      uyeler.slice(2).forEach((u, i) => para(s, 1000 + i, u.id));
      const { veri } = await s.istek('GET', '/api/siralama?tur=muz');
      assert.equal(veri.satirlar.length, 10);
      assert.equal(veri.kendi.sira, 13);
      assert.equal(veri.satirlar.some((x) => x.ben), false);
    }, { istemci: sahteIstemci(uyeler) });
  });
});
