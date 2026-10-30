import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { bakiye, ekle, TURLER } from '../lib/ekonomi.js';
import { TEST_GUILD, TEST_KULLANICI, testSunucusu } from '../web/test-yardimci.js';

const GUN = 86_400_000;

const ver = (s, miktar, kullaniciId = TEST_KULLANICI) => ekle(s.db, {
  guildId: TEST_GUILD, kullaniciId, miktar, tur: TURLER.yonetici,
});
const cuzdan = (s) => bakiye(s.db, TEST_GUILD, TEST_KULLANICI);
/** Kredi Sv 3'te açılır; kredi testleri üyeyi bu seviyeye çıkarır (limit 11.000). */
const sv3 = (s) => s.db
  .prepare('INSERT OR REPLACE INTO seviyeler (guild_id, kullanici_id, xp, seviye) VALUES (?, ?, 0, 3)')
  .run(TEST_GUILD, TEST_KULLANICI);

async function sunucuyla(fn) {
  const s = await testSunucusu();
  try {
    await fn(s);
  } finally {
    await s.kapat();
  }
}

describe('web API: banka', () => {
  it('GET boş durumu ve kuralları döner', () => sunucuyla(async (s) => {
    const { durum, veri } = await s.istek('GET', '/api/banka');
    assert.equal(durum, 200);
    assert.deepEqual(veri.aktif, []);
    assert.equal(veri.kilitli, 0);
    assert.equal(veri.tavan, 20_000);
    assert.equal(veri.aktifSiniri, 5);
    assert.equal(veri.min, 1_000);
    assert.equal(veri.erkenCezaYuzde, 10);
    assert.deepEqual(veri.vadeler.map((v) => [v.kimlik, v.yuzde]), [['12sa', 4], ['36sa', 14], ['84sa', 40], ['7g', 100]]);
  }));

  it('yatır: mevduat açılır, bakiye düşer, listede görünür', () => sunucuyla(async (s) => {
    ver(s, 20_000);
    const y = await s.istek('POST', '/api/banka/yatir', { miktar: '10k', vade: '36sa' });
    assert.equal(y.durum, 200);
    assert.equal(y.veri.faiz, 1400);
    assert.equal(y.veri.vadeSonuTutar, 11_400);
    assert.equal(y.veri.bakiye, cuzdan(s));
    assert.ok(y.veri.bakiye >= 10_000);
    assert.equal(y.veri.mevduat.faizYuzde, 14);

    const g = await s.istek('GET', '/api/banka');
    assert.equal(g.veri.aktif.length, 1);
    assert.equal(g.veri.aktif[0].anapara, 10_000);
    assert.equal(g.veri.aktif[0].vadeSonuTutar, 11_400);
    assert.equal(g.veri.kilitli, 10_000);
    assert.equal(g.veri.bakiye, cuzdan(s));
  }));

  it('yatır: geçersiz vade, anlaşılmaz miktar, alt sınır, yetersiz bakiye reddedilir', () => sunucuyla(async (s) => {
    ver(s, 5_000);
    assert.equal((await s.istek('POST', '/api/banka/yatir', { miktar: '2000', vade: '2g' })).durum, 400);
    assert.equal((await s.istek('POST', '/api/banka/yatir', { miktar: 'abc', vade: '12sa' })).durum, 400);
    assert.equal((await s.istek('POST', '/api/banka/yatir', { vade: '12sa' })).durum, 400);
    const az = await s.istek('POST', '/api/banka/yatir', { miktar: '500', vade: '12sa' });
    assert.equal(az.durum, 400);
    assert.match(az.veri.sebep, /En az/);
    const fazla = await s.istek('POST', '/api/banka/yatir', { miktar: '9000', vade: '12sa' });
    assert.equal(fazla.durum, 400);
    assert.equal(cuzdan(s), 5_000);
  }));

  it('yatır: seviyeye bağlı tavanı aşamaz', () => sunucuyla(async (s) => {
    ver(s, 100_000);
    const ilk = await s.istek('POST', '/api/banka/yatir', { miktar: '15000', vade: '84sa' });
    assert.equal(ilk.durum, 200);
    const ikinci = await s.istek('POST', '/api/banka/yatir', { miktar: '10000', vade: '84sa' });
    assert.equal(ikinci.durum, 400);
    assert.match(ikinci.veri.sebep, /en çok 20\.000/);
    // Başarım ödülü bakiyeyi biraz artırabilir; kilitli tutar değişmez.
    assert.equal((await s.istek('GET', '/api/banka')).veri.kilitli, 15_000);
  }));

  it('boz: faiz yok, %10 ceza; başkasının ya da olmayan mevduat reddedilir', () => sunucuyla(async (s) => {
    ver(s, 10_000);
    const y = await s.istek('POST', '/api/banka/yatir', { miktar: '10000', vade: '12sa' });
    const id = y.veri.mevduat.id;

    assert.equal((await s.digerIstek('POST', '/api/banka/boz', { id })).durum, 400);
    assert.equal((await s.istek('POST', '/api/banka/boz', { id: 999 })).durum, 400);
    assert.equal((await s.istek('POST', '/api/banka/boz', {})).durum, 400);

    const b = await s.istek('POST', '/api/banka/boz', { id });
    assert.equal(b.durum, 200);
    assert.equal(b.veri.iade, 9_000);
    assert.equal(b.veri.ceza, 1_000);
    assert.equal(b.veri.bakiye, cuzdan(s));
    assert.ok(b.veri.bakiye >= 9_000);
    assert.equal((await s.istek('POST', '/api/banka/boz', { id })).durum, 400);
  }));

  it('GET: vadesi gelen mevduat önce ödenir ve az önce ödenenlere yazılır', () => sunucuyla(async (s) => {
    ver(s, 10_000);
    const y = await s.istek('POST', '/api/banka/yatir', { miktar: '10000', vade: '12sa' });
    s.db.prepare('UPDATE mevduatlar SET vade = ? WHERE id = ?').run(Date.now() - 1000, y.veri.mevduat.id);

    const g = await s.istek('GET', '/api/banka');
    assert.deepEqual(g.veri.aktif, []);
    assert.deepEqual(g.veri.odenenler, [{ id: y.veri.mevduat.id, anapara: 10_000, faiz: 400 }]);
    assert.equal(g.veri.bakiye, cuzdan(s));
    assert.ok(g.veri.bakiye >= 10_400);
  }));
});

describe('web API: kredi', () => {
  it('GET kredisiz durumda limit ve vadeleri döner', () => sunucuyla(async (s) => {
    const { durum, veri } = await s.istek('GET', '/api/kredi');
    assert.equal(durum, 200);
    assert.equal(veri.kredi, null);
    assert.equal(veri.limit, 5_000);
    assert.deepEqual(veri.vadeler.map((v) => [v.kimlik, v.yuzde]), [['3g', 25], ['7g', 60], ['14g', 130]]);
    assert.equal(veri.kurallar.borcKesintiYuzde, 50);
    assert.equal(veri.minSeviye, 3);
    assert.equal(veri.seviye, 0);
  }));

  it('al: Sv 3\'ün altında reddedilir', () => sunucuyla(async (s) => {
    const r = await s.istek('POST', '/api/kredi/al', { miktar: '2000', vade: '3g' });
    assert.equal(r.durum, 400);
    assert.match(r.veri.sebep, /Sv 3/);
    assert.equal(cuzdan(s), 0);
  }));

  it('al: kredi verilir, ikinci kredi, limit aşımı ve geçersiz vade reddedilir', () => sunucuyla(async (s) => {
    sv3(s);
    const fazla = await s.istek('POST', '/api/kredi/al', { miktar: '12000', vade: '3g' });
    assert.equal(fazla.durum, 400);
    assert.match(fazla.veri.sebep, /limitin/);
    assert.equal((await s.istek('POST', '/api/kredi/al', { miktar: '2000', vade: '1g' })).durum, 400);

    const al = await s.istek('POST', '/api/kredi/al', { miktar: '4000', vade: '3g' });
    assert.equal(al.durum, 200);
    assert.equal(al.veri.faiz, 1000);
    assert.equal(al.veri.odenecek, 5000);
    assert.equal(al.veri.bakiye, cuzdan(s));
    assert.ok(al.veri.bakiye >= 4000);

    const ikinci = await s.istek('POST', '/api/kredi/al', { miktar: '1000', vade: '3g' });
    assert.equal(ikinci.durum, 400);
    assert.match(ikinci.veri.sebep, /aktif bir kredin var/);

    const g = await s.istek('GET', '/api/kredi');
    assert.equal(g.veri.kredi.anapara, 4000);
    assert.equal(g.veri.kredi.borc.gecikmis, false);
    assert.ok(g.veri.kredi.borc.kalan > 4000);
  }));

  it('öde: kısmi, fazla ve boş miktar; kapanınca kredi kalkar', () => sunucuyla(async (s) => {
    sv3(s);
    await s.istek('POST', '/api/kredi/al', { miktar: '5000', vade: '3g' });
    ver(s, 10_000);

    assert.equal((await s.istek('POST', '/api/kredi/ode', { miktar: 'abc' })).durum, 400);
    const kismi = await s.istek('POST', '/api/kredi/ode', { miktar: '1000' });
    assert.equal(kismi.durum, 200);
    assert.equal(kismi.veri.odenen, 1000);
    assert.equal(kismi.veri.kapandi, false);
    assert.equal(kismi.veri.bakiye, cuzdan(s));

    // Miktar boşsa borcun hepsi (erken ödeme: yalnız geçen güne kadar faiz).
    const hepsi = await s.istek('POST', '/api/kredi/ode', {});
    assert.equal(hepsi.durum, 200);
    assert.equal(hepsi.veri.kapandi, true);
    assert.equal(hepsi.veri.kalan, 0);
    assert.equal((await s.istek('GET', '/api/kredi')).veri.kredi, null);
    assert.equal((await s.istek('POST', '/api/kredi/ode', {})).durum, 400);
  }));

  it('öde: bakiyeden fazla tutar reddedilir', () => sunucuyla(async (s) => {
    sv3(s);
    await s.istek('POST', '/api/kredi/al', { miktar: '3000', vade: '7g' });
    const r = await s.istek('POST', '/api/kredi/ode', { miktar: '50k' });
    assert.equal(r.durum, 400);
    assert.match(r.veri.sebep, /Bakiyen yetmiyor/);
  }));

  it('borçluyken: vadesi geçen kredi gecikmiş görünür, yeni kredi ve prestij kapanır', () => sunucuyla(async (s) => {
    sv3(s);
    await s.istek('POST', '/api/kredi/al', { miktar: '4000', vade: '3g' });
    // Cüzdanı boşalt: tahsilat borcu karşılayamasın.
    s.db.prepare('UPDATE bakiyeler SET bakiye = 0 WHERE guild_id = ? AND kullanici_id = ?').run(TEST_GUILD, TEST_KULLANICI);
    s.db.prepare('UPDATE krediler SET baslangic = ?, vade = ?').run(Date.now() - 5 * GUN, Date.now() - 2 * GUN);

    const g = await s.istek('GET', '/api/kredi');
    assert.equal(g.veri.kredi.durum, 'gecikmis');
    assert.equal(g.veri.kredi.borc.gecikmis, true);
    assert.ok(g.veri.kredi.borc.ceza > 0);
    assert.equal(g.veri.kredi.borc.kalan, 4000 + 1000 + g.veri.kredi.borc.ceza);

    const yeni = await s.istek('POST', '/api/kredi/al', { miktar: '1000', vade: '3g' });
    assert.equal(yeni.durum, 400);
    assert.match(yeni.veri.sebep, /Vadesi geçmiş/);

    const p = await s.istek('GET', '/api/prestij');
    assert.ok(p.veri.engeller.some((e) => /kredin var/.test(e)));
  }));
});

describe('web API: piyango', () => {
  it('GET havuzu, çekiliş zamanını ve kuralları döner', () => sunucuyla(async (s) => {
    const { durum, veri } = await s.istek('GET', '/api/piyango');
    assert.equal(durum, 200);
    assert.equal(veri.havuz, 5_000);
    assert.equal(veri.toplamBilet, 0);
    assert.equal(veri.benim, 0);
    assert.equal(veri.olasilik, 0);
    assert.equal(veri.biletFiyati, 500);
    assert.equal(veri.kisiBasi, 40);
    assert.ok(veri.cekilis > Date.now());
    assert.equal(veri.sonKazanan, null);
  }));

  it('bilet: bakiye düşer, havuz ve olasılık güncellenir', () => sunucuyla(async (s) => {
    ver(s, 10_000);
    ver(s, 10_000, '100000000000000002');
    const diger = await s.digerIstek('POST', '/api/piyango/bilet', { adet: 1 });
    assert.equal(diger.durum, 200);

    const r = await s.istek('POST', '/api/piyango/bilet', { adet: 3 });
    assert.equal(r.durum, 200);
    assert.equal(r.veri.adet, 3);
    assert.equal(r.veri.tutar, 1500);
    assert.equal(r.veri.benim, 3);
    assert.equal(r.veri.toplamBilet, 4);
    assert.equal(r.veri.olasilik, 75);
    assert.equal(r.veri.havuz, 5_000 + Math.floor((4 * 500 * 90) / 100));
    assert.equal(r.veri.bakiye, cuzdan(s));
    assert.ok(r.veri.bakiye >= 8_500);

    const g = await s.istek('GET', '/api/piyango');
    assert.equal(g.veri.benim, 3);
    assert.equal(g.veri.toplamBilet, 4);
  }));

  it('bilet: varsayılan 1 adet, kişi başı sınır ve yetersiz bakiye reddedilir', () => sunucuyla(async (s) => {
    ver(s, 40_000);
    const bir = await s.istek('POST', '/api/piyango/bilet', {});
    assert.equal(bir.veri.adet, 1);

    assert.equal((await s.istek('POST', '/api/piyango/bilet', { adet: 41 })).durum, 400);
    assert.equal((await s.istek('POST', '/api/piyango/bilet', { adet: 0 })).durum, 400);
    assert.equal((await s.istek('POST', '/api/piyango/bilet', { adet: 'x' })).durum, 400);

    const dolu = await s.istek('POST', '/api/piyango/bilet', { adet: 39 });
    assert.equal(dolu.durum, 200);
    assert.equal(dolu.veri.benim, 40);
    const asan = await s.istek('POST', '/api/piyango/bilet', { adet: 1 });
    assert.equal(asan.durum, 400);
    assert.match(asan.veri.sebep, /sınırına ulaştın/);

    const yoksul = await s.digerIstek('POST', '/api/piyango/bilet', { adet: 2 });
    assert.equal(yoksul.durum, 400);
    assert.match(yoksul.veri.sebep, /Bakiyen yetmiyor/);
  }));

  it('GET son kazananı üye özetiyle döner', () => sunucuyla(async (s) => {
    s.db.prepare(
      `INSERT INTO piyango_cekilisleri (guild_id, cekilis, durum, bilet_toplam, gelir, taban, havuz, kazanan_id, zaman, duyuruldu)
       VALUES (?, ?, 'bitti', 2, 1000, 5000, 5900, ?, ?, 1)`,
    ).run(TEST_GUILD, Date.now() - 1000, '100000000000000002', Date.now());
    const g = await s.istek('GET', '/api/piyango');
    assert.equal(g.veri.sonKazanan.uye.id, '100000000000000002');
    assert.equal(g.veri.sonKazanan.uye.ad, 'Diger');
    assert.equal(g.veri.sonKazanan.havuz, 5900);
  }));
});

describe('web API: hisse', () => {
  it('GET şirketleri, 48 saatlik fiyat noktalarını ve boş portföyü döner', () => sunucuyla(async (s) => {
    const { durum, veri } = await s.istek('GET', '/api/hisse');
    assert.equal(durum, 200);
    assert.equal(veri.sirketler.length, 6);
    const muzc = veri.sirketler.find((x) => x.sembol === 'MUZC');
    assert.equal(muzc.ad, 'Muz Çiftliği A.Ş.');
    assert.ok(muzc.fiyat > 0);
    assert.ok(muzc.gecmis.length >= 1 && muzc.gecmis.length <= 48);
    assert.ok(muzc.gorsel.metin);
    assert.ok(muzc.oynaklik > 0);
    assert.deepEqual(veri.portfoy.pozisyonlar, []);
    assert.equal(veri.komisyonYuzde, 1);
    assert.equal(veri.beklemeMs, 30_000);
    assert.equal(veri.beklemeKalanMs, 0);
  }));

  it('al: adet ile, komisyon dahil; portföyde görünür', () => sunucuyla(async (s) => {
    ver(s, 100_000);
    const r = await s.istek('POST', '/api/hisse/al', { sembol: 'muzc', adet: 10 });
    assert.equal(r.durum, 200);
    assert.equal(r.veri.sembol, 'MUZC');
    assert.equal(r.veri.adet, 10);
    // Ortalama dolum (emir etkisi) tam sayıya yuvarlı gösterilir; toplam brüt + komisyondur.
    assert.ok(Math.abs(r.veri.toplam - r.veri.komisyon - r.veri.fiyat * 10) <= 5);
    assert.ok(r.veri.etkiYuzde > 0);
    // Başarım ödülü yanıttaki bakiyeye eklenir: cüzdanla aynı, en az bedel düşülmüş hali.
    assert.equal(r.veri.bakiye, cuzdan(s));
    assert.ok(r.veri.bakiye >= 100_000 - r.veri.toplam);

    const g = await s.istek('GET', '/api/hisse');
    assert.equal(g.veri.portfoy.pozisyonlar.length, 1);
    assert.equal(g.veri.portfoy.pozisyonlar[0].adet, 10);
    assert.equal(g.veri.sirketler.find((x) => x.sembol === 'MUZC').sahip, 10);
    assert.ok(g.veri.beklemeKalanMs > 0);
  }));

  it('al: tutar ile (komisyon dahil), adet ve tutar birlikte ya da hiçbiri reddedilir', () => sunucuyla(async (s) => {
    ver(s, 100_000);
    assert.equal((await s.istek('POST', '/api/hisse/al', { sembol: 'MUZC', adet: 1, tutar: '1k' })).durum, 400);
    assert.equal((await s.istek('POST', '/api/hisse/al', { sembol: 'MUZC' })).durum, 400);
    assert.equal((await s.istek('POST', '/api/hisse/al', { sembol: 'YOK', adet: 1 })).durum, 400);
    assert.equal((await s.istek('POST', '/api/hisse/al', { adet: 1 })).durum, 400);
    assert.equal((await s.istek('POST', '/api/hisse/al', { sembol: 'MUZC', adet: 0 })).durum, 400);
    assert.equal((await s.istek('POST', '/api/hisse/al', { sembol: 'MUZC', tutar: 'abc' })).durum, 400);
    assert.equal(cuzdan(s), 100_000);

    const r = await s.istek('POST', '/api/hisse/al', { sembol: 'MUZC', tutar: '10k' });
    assert.equal(r.durum, 200);
    assert.ok(r.veri.toplam <= 10_000 && r.veri.toplam > 9_000);
  }));

  it('al: yetersiz bakiye ve kişi başı adet sınırı reddedilir', () => sunucuyla(async (s) => {
    ver(s, 500);
    const az = await s.istek('POST', '/api/hisse/al', { sembol: 'SMTK', adet: 5 });
    assert.equal(az.durum, 400);
    assert.match(az.veri.sebep, /Bakiyen yetmiyor/);
    assert.equal((await s.istek('POST', '/api/hisse/al', { sembol: 'SMTK', adet: 10_001 })).durum, 400);
  }));

  it('30 sn işlem beklemesi: ardışık al/sat reddedilir', () => sunucuyla(async (s) => {
    ver(s, 100_000);
    assert.equal((await s.istek('POST', '/api/hisse/al', { sembol: 'MUZC', adet: 1 })).durum, 200);
    const ikinci = await s.istek('POST', '/api/hisse/al', { sembol: 'DART', adet: 1 });
    assert.equal(ikinci.durum, 400);
    assert.match(ikinci.veri.sebep, /saniye sonra tekrar dene/);
    const sat = await s.istek('POST', '/api/hisse/sat', { sembol: 'MUZC', adet: 'hepsi' });
    assert.equal(sat.durum, 400);
    assert.match(sat.veri.sebep, /saniye sonra tekrar dene/);
  }));

  it('sat: 1k, yarı, hepsi biçimleri; elde olmayan hisse reddedilir', () => sunucuyla(async (s) => {
    ver(s, 100_000);
    assert.equal((await s.istek('POST', '/api/hisse/sat', { sembol: 'MUZC', adet: 'hepsi' })).durum, 400);
    assert.equal((await s.istek('POST', '/api/hisse/sat', { sembol: 'YOK', adet: '1' })).durum, 400);

    await s.istek('POST', '/api/hisse/al', { sembol: 'MUZC', adet: 40 });
    s.db.prepare('DELETE FROM hisse_islemleri').run(); // 30 sn beklemesini atla

    assert.equal((await s.istek('POST', '/api/hisse/sat', { sembol: 'MUZC', adet: 'abc' })).durum, 400);
    const yari = await s.istek('POST', '/api/hisse/sat', { sembol: 'MUZC', adet: 'yarı' });
    assert.equal(yari.durum, 200);
    assert.equal(yari.veri.adet, 20);
    assert.ok(Math.abs(yari.veri.gelir + yari.veri.komisyon - yari.veri.fiyat * 20) <= 10);
    assert.ok(yari.veri.etkiYuzde < 0);
    s.db.prepare('DELETE FROM hisse_islemleri').run();

    const fazla = await s.istek('POST', '/api/hisse/sat', { sembol: 'MUZC', adet: '1k' });
    assert.equal(fazla.durum, 400);
    assert.match(fazla.veri.sebep, /Yalnız 20/);

    const hepsi = await s.istek('POST', '/api/hisse/sat', { sembol: 'MUZC', adet: 'hepsi' });
    assert.equal(hepsi.durum, 200);
    assert.equal(hepsi.veri.adet, 20);
    assert.equal(hepsi.veri.bakiye, cuzdan(s));
    assert.deepEqual((await s.istek('GET', '/api/hisse')).veri.portfoy.pozisyonlar, []);
  }));
});
