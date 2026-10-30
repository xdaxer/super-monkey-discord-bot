import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ayarYaz } from '../lib/ayarlar.js';
import { bakiye, ekle, TURLER } from '../lib/ekonomi.js';
import { adet, esyaEkle } from '../lib/envanter.js';
import { borcluMu } from '../lib/kredi.js';
import {
  sahteIstemci, sahteUye, TEST_DIGER, TEST_GUILD, TEST_KULLANICI, testSunucusu,
} from '../web/test-yardimci.js';

const BOT_ID = '100000000000000009';

function para(s, miktar, kullaniciId = TEST_KULLANICI) {
  ekle(s.db, { guildId: TEST_GUILD, kullaniciId, miktar, tur: TURLER.yonetici });
}

const bak = (s, k) => bakiye(s.db, TEST_GUILD, k);

async function sunucuyla(fn, secenek) {
  const s = await testSunucusu(secenek);
  try {
    await fn(s);
  } finally {
    await s.kapat();
  }
}

/** Vadesi geçmiş, ödenmemiş kredi satırı. */
function borcluYap(s, kullaniciId) {
  s.db.prepare(
    `INSERT INTO krediler (guild_id, kullanici_id, anapara, faiz_yuzde, faiz, baslangic, vade, durum)
     VALUES (?, ?, 100, 5, 5, 0, 1, 'aktif')`,
  ).run(TEST_GUILD, kullaniciId);
}

function botluIstemci() {
  const bot = sahteUye(BOT_ID, 'Bot');
  bot.user.bot = true;
  return sahteIstemci([sahteUye(TEST_KULLANICI, 'Test'), sahteUye(TEST_DIGER, 'Diger'), bot]);
}

/** Gönderilen/düzenlenen mesajları kaydeden sahte kanal; istemciye `channels` ekler. */
function sahteKanal(s, kanalId = '900000000000000001') {
  const gonderilen = [];
  const duzenlenen = [];
  const mesajlar = new Map();
  let sayac = 0;
  const kanal = {
    id: kanalId,
    async send(icerik) {
      sayac += 1;
      const mesaj = {
        id: `80000000000000000${sayac}`,
        channelId: kanalId,
        async edit(yeni) { duzenlenen.push({ id: this.id, ...yeni }); return this; },
      };
      mesajlar.set(mesaj.id, mesaj);
      gonderilen.push({ id: mesaj.id, ...icerik });
      return mesaj;
    },
    messages: { fetch: async (id) => mesajlar.get(id) },
  };
  s.istemci.channels = { fetch: async (id) => (id === kanalId ? kanal : null) };
  ayarYaz(s.db, TEST_GUILD, 'ekonomi.kanallar', [kanalId]);
  return { gonderilen, duzenlenen };
}

describe('web: /api/sosyal', () => {
  it('boş durumda eksiksiz özet döner', () => sunucuyla(async (s) => {
    para(s, 700);
    const { durum, veri } = await s.istek('GET', '/api/sosyal');
    assert.equal(durum, 200);
    assert.equal(veri.bakiye, 700);
    assert.equal(veri.borclu, false);
    assert.deepEqual(veri.duello.gelen, []);
    assert.deepEqual(veri.duello.giden, []);
    assert.deepEqual(veri.duello.oyunlar, ['zar', 'yazitura', 'at', 'xox']);
    assert.equal(veri.duello.bahisMin, 10);
    assert.equal(veri.duello.bahisTavani, 1000);
    assert.equal(veri.duello.kasaPayiYuzde, 5);
    assert.deepEqual(veri.xoxlar, []);
    assert.deepEqual(veri.takas.gelen, []);
    assert.deepEqual(veri.takas.giden, []);
    assert.deepEqual(veri.takas.esyalarim, []);
    assert.equal(veri.takas.acikSiniri, 3);
  }));

  it('ekonomi kapalıyken 403, oturumsuz 401', async () => {
    await sunucuyla(async (s) => {
      assert.equal((await s.istek('GET', '/api/sosyal')).durum, 403);
    }, { ekonomiAcik: false });
    await sunucuyla(async (s) => {
      assert.equal((await s.istek('GET', '/api/sosyal', undefined, { belirtec: null })).durum, 401);
    });
  });
});

describe('web: düello', () => {
  it('meydan oku → rakip kabul eder → sonuç ve bakiyeler', () => sunucuyla(async (s) => {
    para(s, 1000);
    para(s, 1000, TEST_DIGER);
    const ac = await s.istek('POST', '/api/duello/ac', { rakipId: TEST_DIGER, bahis: '200', oyun: 'zar' });
    assert.equal(ac.durum, 200);
    assert.equal(ac.veri.bakiye, 800);
    assert.equal(ac.veri.duello.bahis, 200);
    assert.equal(ac.veri.duello.kazanc, 380);
    assert.equal(ac.veri.duello.discordda, false);
    const { id } = ac.veri.duello;

    // Meydan okuyan Giden'de, rakip Gelen'de görür.
    let liste = (await s.istek('GET', '/api/sosyal')).veri;
    assert.equal(liste.duello.giden.length, 1);
    assert.equal(liste.duello.gelen.length, 0);
    liste = (await s.digerIstek('GET', '/api/sosyal')).veri;
    assert.equal(liste.duello.gelen.length, 1);
    assert.equal(liste.duello.gelen[0].meydan.id, TEST_KULLANICI);

    const kabul = await s.digerIstek('POST', `/api/duello/${id}/kabul`);
    assert.equal(kabul.durum, 200);
    const sonuc = kabul.veri.sonuc;
    assert.equal(sonuc.oyun, 'zar');
    assert.equal(sonuc.zarlar.meydan.length, 2);
    assert.equal(sonuc.zarlar.rakip.length, 2);
    if (sonuc.berabere) {
      assert.equal(bak(s, TEST_KULLANICI), 1000);
      assert.equal(bak(s, TEST_DIGER), 1000);
    } else {
      assert.equal(bak(s, sonuc.kazananId), 800 + 380);
      assert.equal(bak(s, sonuc.kaybedenId), 800);
      assert.equal(sonuc.kazanc, 380);
      assert.equal(sonuc.kasa, 20);
    }
    assert.equal(kabul.veri.bakiye, bak(s, TEST_DIGER));

    // Teklif kayboldu; sonuç geçmişte.
    liste = (await s.istek('GET', '/api/sosyal')).veri;
    assert.equal(liste.duello.giden.length, 0);
    const gecmis = (await s.istek('GET', '/api/sosyal/gecmis')).veri;
    if (!sonuc.berabere) {
      assert.equal(gecmis.duellolar.length, 1);
      assert.equal(gecmis.duellolar[0].kazanan.id, sonuc.kazananId);
      assert.equal(gecmis.duellolar[0].benKazandi, sonuc.kazananId === TEST_KULLANICI);
    }
  }));

  it('yazı-tura ve at yarışı sonuç verisini döner', () => sunucuyla(async (s) => {
    para(s, 5000);
    para(s, 5000, TEST_DIGER);
    for (const [oyun, ek] of [['yazitura', { secim: 'tura' }], ['at', {}]]) {
      const { veri } = await s.istek('POST', '/api/duello/ac', {
        rakipId: TEST_DIGER, bahis: 100, oyun, ...ek,
      });
      const kabul = await s.digerIstek('POST', `/api/duello/${veri.duello.id}/kabul`);
      assert.equal(kabul.durum, 200);
      const sonuc = kabul.veri.sonuc;
      assert.equal(sonuc.oyun, oyun);
      assert.ok(['meydan', 'rakip'].includes(sonuc.kazanan));
      if (oyun === 'yazitura') {
        assert.equal(sonuc.secim, 'tura');
        assert.ok(['yazi', 'tura'].includes(sonuc.para));
      }
    }
    // Para korunur: yalnız kasa payları (2 düello × 10) çıkar.
    assert.equal(bak(s, TEST_KULLANICI) + bak(s, TEST_DIGER), 10_000 - 20);
  }));

  it('reddet ve geri çek emaneti iade eder', () => sunucuyla(async (s) => {
    para(s, 1000);
    para(s, 1000, TEST_DIGER);
    let { veri } = await s.istek('POST', '/api/duello/ac', { rakipId: TEST_DIGER, bahis: 300, oyun: 'at' });
    assert.equal(bak(s, TEST_KULLANICI), 700);
    const red = await s.digerIstek('POST', `/api/duello/${veri.duello.id}/reddet`);
    assert.equal(red.durum, 200);
    assert.equal(bak(s, TEST_KULLANICI), 1000);

    ({ veri } = await s.istek('POST', '/api/duello/ac', { rakipId: TEST_DIGER, bahis: 300, oyun: 'zar' }));
    const geri = await s.istek('POST', `/api/duello/${veri.duello.id}/geri-cek`);
    assert.equal(geri.durum, 200);
    assert.equal(geri.veri.bakiye, 1000);
    assert.equal(bak(s, TEST_DIGER), 1000);
    assert.equal((await s.istek('GET', '/api/sosyal')).veri.duello.giden.length, 0);
    // Kayıt silindi: tekrar işlem geçersiz.
    assert.equal((await s.digerIstek('POST', `/api/duello/${veri.duello.id}/kabul`)).durum, 404);
  }));

  it('yetkisiz işlemler reddedilir', () => sunucuyla(async (s) => {
    para(s, 1000);
    para(s, 1000, TEST_DIGER);
    const { veri } = await s.istek('POST', '/api/duello/ac', { rakipId: TEST_DIGER, bahis: 100, oyun: 'zar' });
    const id = veri.duello.id;
    // Meydan okuyan kendi meydan okumasını kabul/reddedemez; rakip geri çekemez.
    for (const yol of ['kabul', 'reddet']) {
      const r = await s.istek('POST', `/api/duello/${id}/${yol}`);
      assert.equal(r.durum, 400);
      assert.match(r.veri.sebep, /sana değil/);
    }
    const geri = await s.digerIstek('POST', `/api/duello/${id}/geri-cek`);
    assert.equal(geri.durum, 400);
    assert.match(geri.veri.sebep, /meydan okuyan/);
    assert.equal(bak(s, TEST_KULLANICI), 900);
  }));

  it('geçersiz rakip, bot, kendine, bahis ve ikinci meydan okuma', () => sunucuyla(async (s) => {
    para(s, 1000);
    para(s, 50, TEST_DIGER);
    const ac = (govde) => s.istek('POST', '/api/duello/ac', { rakipId: TEST_DIGER, bahis: '100', oyun: 'zar', ...govde });

    assert.equal((await ac({ rakipId: TEST_KULLANICI })).durum, 400);
    assert.match((await ac({ rakipId: TEST_KULLANICI })).veri.sebep, /Kendinle/);
    assert.match((await ac({ rakipId: '123456789012345678' })).veri.sebep, /üyesi değil/);
    assert.equal((await ac({ rakipId: 'abc' })).durum, 400);
    assert.match((await ac({ oyun: 'poker' })).veri.sebep, /Bilinmeyen oyun/);
    assert.match((await ac({ bahis: '5' })).veri.sebep, /En az/);
    assert.match((await ac({ bahis: '999999' })).veri.sebep, /En çok|yetmiyor/);
    assert.equal(bak(s, TEST_KULLANICI), 1000);

    // Kişi başı bir bekleyen meydan okuma.
    const ilk = await ac({});
    assert.equal(ilk.durum, 200);
    assert.match((await ac({})).veri.sebep, /bekleyen/);

    // Rakibin bakiyesi yetmezse kabul olmaz, kayıt bekler.
    const kabul = await s.digerIstek('POST', `/api/duello/${ilk.veri.duello.id}/kabul`);
    assert.equal(kabul.durum, 400);
    assert.match(kabul.veri.sebep, /Bakiyen yetmiyor/);
    assert.equal(bak(s, TEST_DIGER), 50);
  }));

  it('"hepsi" ve "yarı" bahis tavana kırpılır', () => sunucuyla(async (s) => {
    para(s, 5000);
    para(s, 5000, TEST_DIGER);
    const hepsi = await s.istek('POST', '/api/duello/ac', { rakipId: TEST_DIGER, bahis: 'hepsi', oyun: 'zar' });
    assert.equal(hepsi.durum, 200);
    assert.equal(hepsi.veri.duello.bahis, 1000);
    assert.equal(hepsi.veri.bakiye, 4000);
  }));

  it('bot rakibe düello açılamaz', () => sunucuyla(async (s) => {
    para(s, 1000);
    const r = await s.istek('POST', '/api/duello/ac', { rakipId: BOT_ID, bahis: '100', oyun: 'zar' });
    assert.equal(r.durum, 400);
    assert.match(r.veri.sebep, /Botlarla/);
  }, { istemci: botluIstemci() }));

  it('vadesi geçmiş borçlu düello açamaz ve kabul edemez', () => sunucuyla(async (s) => {
    para(s, 1000);
    para(s, 1000, TEST_DIGER);
    const { veri } = await s.istek('POST', '/api/duello/ac', { rakipId: TEST_DIGER, bahis: '100', oyun: 'zar' });
    borcluYap(s, TEST_DIGER);
    assert.equal(borcluMu(s.db, TEST_GUILD, TEST_DIGER), true);
    assert.equal((await s.digerIstek('GET', '/api/sosyal')).veri.borclu, true);
    const kabul = await s.digerIstek('POST', `/api/duello/${veri.duello.id}/kabul`);
    assert.equal(kabul.durum, 400);
    assert.match(kabul.veri.sebep, /kredi borcun/);
  }));

  it('süresi dolan meydan okuma liste açılırken iade edilir', () => sunucuyla(async (s) => {
    para(s, 1000);
    para(s, 1000, TEST_DIGER);
    await s.istek('POST', '/api/duello/ac', { rakipId: TEST_DIGER, bahis: '400', oyun: 'zar' });
    assert.equal(bak(s, TEST_KULLANICI), 600);
    s.db.prepare('UPDATE duello_meydanlari SET bitis = ?').run(Date.now() - 1000);
    const { veri } = await s.digerIstek('GET', '/api/sosyal');
    assert.equal(veri.duello.gelen.length, 0);
    assert.equal(bak(s, TEST_KULLANICI), 1000);
  }));

  it('süresi dolan teklifi kabul etmek iade eder', () => sunucuyla(async (s) => {
    para(s, 1000);
    para(s, 1000, TEST_DIGER);
    const { veri } = await s.istek('POST', '/api/duello/ac', { rakipId: TEST_DIGER, bahis: '400', oyun: 'zar' });
    s.db.prepare('UPDATE duello_meydanlari SET bitis = ?').run(Date.now() - 1000);
    const kabul = await s.digerIstek('POST', `/api/duello/${veri.duello.id}/kabul`);
    assert.equal(kabul.durum, 400);
    assert.match(kabul.veri.sebep, /süresi dolmuş/);
    assert.equal(bak(s, TEST_KULLANICI), 1000);
    assert.equal(bak(s, TEST_DIGER), 1000);
  }));
});

/** İki oturumla XOX düellosunu kabul edilmiş hale getirir. */
async function xoxBaslat(s, bahis = 100) {
  const ac = await s.istek('POST', '/api/duello/ac', { rakipId: TEST_DIGER, bahis, oyun: 'xox' });
  assert.equal(ac.durum, 200);
  const kabul = await s.digerIstek('POST', `/api/duello/${ac.veri.duello.id}/kabul`);
  assert.equal(kabul.durum, 200);
  const { oyun } = kabul.veri.xox;
  const istekler = { [TEST_KULLANICI]: s.istek, [TEST_DIGER]: s.digerIstek };
  return {
    oyun,
    x: istekler[oyun.x.id],
    o: istekler[oyun.o.id],
    xId: oyun.x.id,
    oId: oyun.o.id,
  };
}

describe('web: XOX', () => {
  it('kabulden sonra sırayla tam oyun; çizgi kazananı havuzu alır', () => sunucuyla(async (s) => {
    para(s, 1000);
    para(s, 1000, TEST_DIGER);
    const o = await xoxBaslat(s, 100);
    const id = o.oyun.id;
    assert.equal(o.oyun.sira, 'X');
    assert.equal(o.oyun.tahta, '.........');
    assert.equal(o.oyun.kazanc, 190);
    assert.equal(bak(s, TEST_KULLANICI), 900);
    assert.equal(bak(s, TEST_DIGER), 900);

    // Sıra X'te: O oynayamaz.
    const erken = await o.o('POST', `/api/xox/${id}/hamle`, { hucre: 4 });
    assert.equal(erken.durum, 400);
    assert.match(erken.veri.sebep, /Sıra sende değil/);

    // Listede görünür.
    assert.equal((await s.istek('GET', '/api/sosyal')).veri.xoxlar.length, 1);

    const hamle = async (taraf, hucre) => {
      const r = await taraf('POST', `/api/xox/${id}/hamle`, { hucre });
      assert.equal(r.durum, 200, JSON.stringify(r.veri));
      return r.veri;
    };
    await hamle(o.x, 0);
    // Dolu kare ve aralık dışı hücre.
    assert.match((await o.o('POST', `/api/xox/${id}/hamle`, { hucre: 0 })).veri.sebep, /dolu/);
    assert.equal((await o.o('POST', `/api/xox/${id}/hamle`, { hucre: 9 })).durum, 400);
    await hamle(o.o, 3);
    await hamle(o.x, 1);
    await hamle(o.o, 4);

    // Rakip yoklayınca tahtayı görür.
    const yoklama = (await o.o('GET', `/api/xox/${id}`)).veri;
    assert.equal(yoklama.oyun.tahta, 'XX.OO....'.replace(/X/g, 'X'));
    assert.equal(yoklama.bitti, null);
    assert.equal(yoklama.oyun.siradakiId, o.xId);

    const son = await hamle(o.x, 2);
    assert.equal(son.bitti.sebep, 'cizgi');
    assert.deepEqual(son.bitti.cizgi, [0, 1, 2]);
    assert.equal(son.bitti.kazananId, o.xId);
    assert.equal(son.bitti.kazanc, 190);
    assert.equal(son.bitti.kasa, 10);
    assert.equal(bak(s, o.xId), 900 + 190);
    assert.equal(bak(s, o.oId), 900);

    // Kaybeden yoklayınca sonucu bellekten alır; oyun listeden kalktı.
    const kaybeden = (await o.o('GET', `/api/xox/${id}`)).veri;
    assert.equal(kaybeden.bitti.kazananId, o.xId);
    assert.equal(kaybeden.bitti.benKazandi, false);
    assert.equal(kaybeden.oyun.tahta, 'XXXOO....');
    assert.equal((await s.istek('GET', '/api/sosyal')).veri.xoxlar.length, 0);
    // Oyun dışı üye sonucu göremez.
    const yok = await s.istek('GET', '/api/xox/99999');
    assert.equal(yok.durum, 200);
    assert.equal(yok.veri.yok, true);
  }));

  it('tahta dolarsa berabere: iki taraf da bahsini geri alır', () => sunucuyla(async (s) => {
    para(s, 1000);
    para(s, 1000, TEST_DIGER);
    const o = await xoxBaslat(s, 100);
    const id = o.oyun.id;
    // X O X / X O O / O X X  → kazanan çizgi yok.
    const sira = [[o.x, 0], [o.o, 1], [o.x, 2], [o.o, 4], [o.x, 3], [o.o, 5], [o.x, 7], [o.o, 6], [o.x, 8]];
    let son;
    for (const [taraf, hucre] of sira) {
      // eslint-disable-next-line no-await-in-loop
      son = await taraf('POST', `/api/xox/${id}/hamle`, { hucre });
      assert.equal(son.durum, 200, JSON.stringify(son.veri));
    }
    assert.equal(son.veri.bitti.berabere, true);
    assert.equal(bak(s, TEST_KULLANICI), 1000);
    assert.equal(bak(s, TEST_DIGER), 1000);
  }));

  it('pes eden kaybeder', () => sunucuyla(async (s) => {
    para(s, 1000);
    para(s, 1000, TEST_DIGER);
    const o = await xoxBaslat(s, 100);
    const r = await o.o('POST', `/api/xox/${o.oyun.id}/pes`);
    assert.equal(r.durum, 200);
    assert.equal(r.veri.bitti.sebep, 'pes');
    assert.equal(r.veri.bitti.kazananId, o.xId);
    assert.equal(bak(s, o.xId), 1090);
    assert.equal(bak(s, o.oId), 900);
    assert.equal(r.veri.bakiye, 900);
    // Bitmiş oyuna hamle olmaz.
    assert.equal((await o.x('POST', `/api/xox/${o.oyun.id}/hamle`, { hucre: 0 })).durum, 400);
  }));

  it('hamle süresi dolunca yoklama hükmen bitirir', () => sunucuyla(async (s) => {
    para(s, 1000);
    para(s, 1000, TEST_DIGER);
    const o = await xoxBaslat(s, 100);
    s.db.prepare('UPDATE xox_oyunlari SET son_hamle = ?').run(Date.now() - 61_000);
    // Sıra X'te; süre aşıldı → X kaybeder, O kazanır.
    const r = await o.o('GET', `/api/xox/${o.oyun.id}`);
    assert.equal(r.veri.bitti.sebep, 'sure');
    assert.equal(r.veri.bitti.kazananId, o.oId);
    assert.equal(bak(s, o.oId), 1090);
    assert.equal(bak(s, o.xId), 900);
  }));

  it('oyuncu olmayan göremez ve oynayamaz', () => sunucuyla(async (s) => {
    para(s, 1000);
    para(s, 1000, TEST_DIGER);
    const o = await xoxBaslat(s, 100);
    // Üçüncü bir oturum yok; oyunu başkasına ait gibi göstermek için X/O'yu değiştir.
    s.db.prepare("UPDATE xox_oyunlari SET x_id = '300000000000000003', o_id = '300000000000000004'").run();
    assert.equal((await s.istek('GET', `/api/xox/${o.oyun.id}`)).durum, 403);
    const hamle = await s.istek('POST', `/api/xox/${o.oyun.id}/hamle`, { hucre: 0 });
    assert.equal(hamle.durum, 400);
    assert.match(hamle.veri.sebep, /Bu oyunda değilsin/);
  }));
});

describe('web: takas', () => {
  it('teklif → kabul: eşyalar ve muz el değiştirir', () => sunucuyla(async (s) => {
    para(s, 1000);
    para(s, 1000, TEST_DIGER);
    esyaEkle(s.db, TEST_GUILD, TEST_KULLANICI, 'kasa-ahsap', 3);
    esyaEkle(s.db, TEST_GUILD, TEST_DIGER, 'kasa-demir', 2);

    // Takaslanabilir eşyalar: kendi listem ve karşının listesi.
    const benim = (await s.istek('GET', '/api/sosyal')).veri.takas.esyalarim;
    assert.deepEqual(benim.map((e) => [e.kimlik, e.adet]), [['kasa-ahsap', 3]]);
    assert.ok(benim[0].gorsel);
    const karsinin = await s.istek('GET', `/api/takas/esyalar/${TEST_DIGER}`);
    assert.deepEqual(karsinin.veri.esyalar.map((e) => [e.kimlik, e.adet]), [['kasa-demir', 2]]);

    const teklif = await s.istek('POST', '/api/takas/teklif', {
      uyeId: TEST_DIGER, ver: 'kasa-ahsap', verAdet: 2, iste: 'kasa-demir', isteAdet: 1, muzVer: 100, muzIste: 0,
    });
    assert.equal(teklif.durum, 200, JSON.stringify(teklif.veri));
    const t = teklif.veri.teklif;
    assert.equal(t.ver.esya.adet, 2);
    assert.equal(t.ver.muz, 100);
    assert.equal(t.iste.esya.kimlik, 'kasa-demir');
    assert.equal(t.iste.muz, 0);

    // Eden Giden'de, karşı Gelen'de görür.
    assert.equal((await s.istek('GET', '/api/sosyal')).veri.takas.giden.length, 1);
    const gelen = (await s.digerIstek('GET', '/api/sosyal')).veri.takas.gelen;
    assert.equal(gelen.length, 1);
    assert.equal(gelen[0].eden.id, TEST_KULLANICI);

    // Teklif edenin kendi teklifini kabul etmesi yetkisiz.
    const yetkisiz = await s.istek('POST', `/api/takas/${t.id}/kabul`);
    assert.equal(yetkisiz.durum, 400);
    assert.match(yetkisiz.veri.sebep, /karşı taraf/);

    const kabul = await s.digerIstek('POST', `/api/takas/${t.id}/kabul`);
    assert.equal(kabul.durum, 200, JSON.stringify(kabul.veri));
    assert.equal(kabul.veri.teklif.durum, 'kabul');
    assert.equal(adet(s.db, TEST_GUILD, TEST_KULLANICI, 'kasa-ahsap'), 1);
    assert.equal(adet(s.db, TEST_GUILD, TEST_KULLANICI, 'kasa-demir'), 1);
    assert.equal(adet(s.db, TEST_GUILD, TEST_DIGER, 'kasa-ahsap'), 2);
    assert.equal(adet(s.db, TEST_GUILD, TEST_DIGER, 'kasa-demir'), 1);
    // 100 muz /gonder kurallarıyla: %5 vergi (5) kesilir; "İlk Takas" başarımı 300 muz verir.
    assert.equal(kabul.veri.vergi, 5);
    assert.equal(bak(s, TEST_KULLANICI), 900);
    assert.equal(bak(s, TEST_DIGER), 1000 + 95 + 300);
    assert.ok(kabul.veri.bildirimler.some((x) => x.tur === 'basarim'));
    assert.equal(kabul.veri.bakiye, bak(s, TEST_DIGER));

    assert.equal((await s.istek('GET', '/api/sosyal')).veri.takas.giden.length, 0);
    const gecmis = (await s.istek('GET', '/api/sosyal/gecmis')).veri;
    assert.equal(gecmis.takaslar.length, 1);
    assert.equal(gecmis.takaslar[0].durum, 'kabul');
    // Kapanmış teklif tekrar kabul edilemez.
    assert.match((await s.digerIstek('POST', `/api/takas/${t.id}/kabul`)).veri.sebep, /zaten kabul/);
  }));

  it('reddet ve geri çek teklifi kapatır, hiçbir şey değişmez', () => sunucuyla(async (s) => {
    para(s, 1000);
    para(s, 1000, TEST_DIGER);
    esyaEkle(s.db, TEST_GUILD, TEST_KULLANICI, 'kasa-ahsap', 1);
    const yeni = () => s.istek('POST', '/api/takas/teklif', {
      uyeId: TEST_DIGER, ver: 'kasa-ahsap', muzIste: 50,
    });

    let { veri } = await yeni();
    const red = await s.digerIstek('POST', `/api/takas/${veri.teklif.id}/reddet`);
    assert.equal(red.veri.teklif.durum, 'red');
    // Teklif eden reddedemez.
    ({ veri } = await yeni());
    const yanlis = await s.istek('POST', `/api/takas/${veri.teklif.id}/reddet`);
    assert.equal(yanlis.durum, 400);
    // Karşı taraf geri çekemez; eden çekebilir.
    assert.equal((await s.digerIstek('POST', `/api/takas/${veri.teklif.id}/geri-cek`)).durum, 400);
    const geri = await s.istek('POST', `/api/takas/${veri.teklif.id}/geri-cek`);
    assert.equal(geri.veri.teklif.durum, 'geri');
    assert.equal(adet(s.db, TEST_GUILD, TEST_KULLANICI, 'kasa-ahsap'), 1);
    assert.equal(bak(s, TEST_KULLANICI), 1000);
    assert.equal((await s.istek('GET', '/api/sosyal')).veri.takas.giden.length, 0);
    assert.equal((await s.istek('POST', '/api/takas/9999/kabul')).durum, 404);
  }));

  it('geçersiz teklifler lib kurallarıyla reddedilir', () => sunucuyla(async (s) => {
    para(s, 1000);
    para(s, 50, TEST_DIGER);
    esyaEkle(s.db, TEST_GUILD, TEST_KULLANICI, 'kasa-ahsap', 1);
    esyaEkle(s.db, TEST_GUILD, TEST_KULLANICI, 'kasa-gunluk', 1);
    const teklif = (govde) => s.istek('POST', '/api/takas/teklif', { uyeId: TEST_DIGER, ...govde });

    assert.match((await teklif({ uyeId: TEST_KULLANICI, muzVer: 50, muzIste: 50 })).veri.sebep, /Kendinle/);
    assert.match((await teklif({ uyeId: '123456789012345678', muzVer: 50, muzIste: 50 })).veri.sebep, /üyesi değil/);
    assert.match((await teklif({})).veri.sebep, /vereceğin bir şey/);
    assert.match((await teklif({ muzVer: 50 })).veri.sebep, /istediğin bir şey/);
    assert.match((await teklif({ ver: 'kasa-gunluk', muzIste: 50 })).veri.sebep, /takas edilebilir/);
    assert.match((await teklif({ ver: 'kasa-ahsap', verAdet: 5, muzIste: 50 })).veri.sebep, /Elinde/);
    assert.equal((await teklif({ ver: 'kasa-ahsap', verAdet: 500, muzIste: 50 })).durum, 400);
    assert.match((await teklif({ muzVer: 5, muzIste: 50 })).veri.sebep, /en az/);
    assert.match((await teklif({ muzVer: 50, muzIste: 500 })).veri.sebep, /bakiyesi/);

    // Açık teklif sınırı: 3.
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      assert.equal((await teklif({ muzVer: 10, muzIste: 10 })).durum, 200);
    }
    assert.match((await teklif({ muzVer: 10, muzIste: 10 })).veri.sebep, /en çok 3 açık/);
  }));

  it('bot ile takas yapılamaz', () => sunucuyla(async (s) => {
    para(s, 1000);
    const r = await s.istek('POST', '/api/takas/teklif', { uyeId: BOT_ID, muzVer: 50, muzIste: 50 });
    assert.equal(r.durum, 400);
    assert.match(r.veri.sebep, /Botlarla/);
  }, { istemci: botluIstemci() }));

  it('kabul anında eşya yoksa hiçbir şey değişmez', () => sunucuyla(async (s) => {
    para(s, 1000);
    para(s, 1000, TEST_DIGER);
    esyaEkle(s.db, TEST_GUILD, TEST_KULLANICI, 'kasa-ahsap', 1);
    const { veri } = await s.istek('POST', '/api/takas/teklif', { uyeId: TEST_DIGER, ver: 'kasa-ahsap', muzIste: 100 });
    s.db.prepare('UPDATE envanter SET adet = 0').run();
    const kabul = await s.digerIstek('POST', `/api/takas/${veri.teklif.id}/kabul`);
    assert.equal(kabul.durum, 400);
    assert.match(kabul.veri.sebep, /Hiçbir şey değişmedi/);
    assert.equal(bak(s, TEST_DIGER), 1000);
    assert.equal((await s.digerIstek('GET', '/api/sosyal')).veri.takas.gelen.length, 1);
  }));

  it('süresi dolan teklifler liste açılırken kapanır', () => sunucuyla(async (s) => {
    para(s, 1000);
    para(s, 1000, TEST_DIGER);
    await s.istek('POST', '/api/takas/teklif', { uyeId: TEST_DIGER, muzVer: 50, muzIste: 50 });
    s.db.prepare('UPDATE takas_teklifleri SET bitis = ?').run(Date.now() - 1000);
    const { veri } = await s.digerIstek('GET', '/api/sosyal');
    assert.equal(veri.takas.gelen.length, 0);
    const gecmis = (await s.istek('GET', '/api/sosyal/gecmis')).veri;
    assert.equal(gecmis.takaslar[0].durum, 'suresi');
  }));

  it('borçlu muz içeren teklif veremez', () => sunucuyla(async (s) => {
    para(s, 1000);
    para(s, 1000, TEST_DIGER);
    borcluYap(s, TEST_KULLANICI);
    const r = await s.istek('POST', '/api/takas/teklif', { uyeId: TEST_DIGER, muzVer: 50, muzIste: 50 });
    assert.equal(r.durum, 400);
    assert.match(r.veri.sebep, /kredi borcun/);
  }));
});

describe('web: Discord mesajı', () => {
  it('kanal yoksa sessizce atlanır (önceki testlerin yolu)', () => sunucuyla(async (s) => {
    para(s, 1000);
    para(s, 1000, TEST_DIGER);
    ayarYaz(s.db, TEST_GUILD, 'ekonomi.kanallar', ['900000000000000001']);
    // channels yok → gönderme atlanır, kayıt yine açılır.
    const r = await s.istek('POST', '/api/duello/ac', { rakipId: TEST_DIGER, bahis: '100', oyun: 'zar' });
    assert.equal(r.durum, 200);
    assert.equal(r.veri.duello.discordda, false);
  }));

  it('ekonomi.kanallar boşsa düello daveti öne çıkanlar kanalına gider, rakip etiketlenir; takas gitmez', () => sunucuyla(async (s) => {
    para(s, 1000);
    para(s, 1000, TEST_DIGER);
    const kanal = sahteKanal(s);
    ayarYaz(s.db, TEST_GUILD, 'ekonomi.kanallar', []);
    ayarYaz(s.db, TEST_GUILD, 'ekonomi.akisKanal', '900000000000000001');
    const r = await s.istek('POST', '/api/duello/ac', { rakipId: TEST_DIGER, bahis: '100', oyun: 'zar' });
    assert.equal(r.durum, 200);
    assert.equal(r.veri.duello.discordda, true);
    assert.equal(kanal.gonderilen.length, 1);
    assert.equal(kanal.gonderilen[0].content, `<@${TEST_DIGER}>`);
    assert.deepEqual(kanal.gonderilen[0].allowedMentions, { users: [TEST_DIGER] });
  }));

  it('/api/davetler: rakibe açık davetler, meydan okuyana boş; kabul/red sonrası düşer', () => sunucuyla(async (s) => {
    para(s, 1000);
    para(s, 1000, TEST_DIGER);
    const r = await s.istek('POST', '/api/duello/ac', { rakipId: TEST_DIGER, bahis: '100', oyun: 'zar' });
    const gelen = await s.digerIstek('GET', '/api/davetler');
    assert.equal(gelen.durum, 200);
    assert.deepEqual(gelen.veri.duellolar.map((d) => d.id), [r.veri.duello.id]);
    assert.equal(gelen.veri.duellolar[0].meydan.id, TEST_KULLANICI);
    assert.deepEqual((await s.istek('GET', '/api/davetler')).veri.duellolar, []);
    await s.digerIstek('POST', `/api/duello/${r.veri.duello.id}/reddet`, {});
    assert.deepEqual((await s.digerIstek('GET', '/api/davetler')).veri.duellolar, []);
  }));

  it('düello aynı gömü ve düğmelerle kanala gider, kabulde mesaj güncellenir', () => sunucuyla(async (s) => {
    para(s, 1000);
    para(s, 1000, TEST_DIGER);
    const kanal = sahteKanal(s);
    const r = await s.istek('POST', '/api/duello/ac', { rakipId: TEST_DIGER, bahis: '100', oyun: 'zar' });
    assert.equal(r.durum, 200);
    assert.equal(r.veri.duello.discordda, true);
    assert.equal(kanal.gonderilen.length, 1);
    const g = kanal.gonderilen[0];
    assert.equal(g.content, `<@${TEST_DIGER}>`);
    assert.match(g.embeds[0].data.description, /seni düelloya çağırıyor/);
    const dugmeler = g.components[0].components.map((d) => d.data.custom_id);
    assert.deepEqual(dugmeler, [0, 1, 2].map((i) => `duello:${['kabul', 'red', 'geri'][i]}:${r.veri.duello.id}`));
    const satir = s.db.prepare('SELECT kanal_id, mesaj_id FROM duello_meydanlari').get();
    assert.equal(satir.kanal_id, '900000000000000001');
    assert.equal(satir.mesaj_id, g.id);

    await s.digerIstek('POST', `/api/duello/${r.veri.duello.id}/kabul`);
    assert.equal(kanal.duzenlenen.length, 1);
    assert.equal(kanal.duzenlenen[0].id, g.id);
    assert.deepEqual(kanal.duzenlenen[0].components, []);
    assert.match(kanal.duzenlenen[0].embeds[0].data.title, /Düello/);
  }));

  it('XOX tahtası kabulde mesaja çizilir, hamleler ve bitiş mesajı günceller', () => sunucuyla(async (s) => {
    para(s, 1000);
    para(s, 1000, TEST_DIGER);
    const kanal = sahteKanal(s);
    const o = await xoxBaslat(s, 100);
    assert.equal(kanal.duzenlenen.length, 1);
    assert.equal(kanal.duzenlenen[0].components.length, 4); // 3 satır tahta + pes
    assert.match(kanal.duzenlenen[0].content, /sıra sende/);

    await o.x('POST', `/api/xox/${o.oyun.id}/hamle`, { hucre: 4 });
    assert.equal(kanal.duzenlenen.length, 2);
    await o.o('POST', `/api/xox/${o.oyun.id}/pes`);
    assert.equal(kanal.duzenlenen.length, 3);
    assert.match(kanal.duzenlenen[2].embeds[0].data.description, /pes etti/);
  }));

  it('takas teklifi kanala gider; kabul mesajı günceller', () => sunucuyla(async (s) => {
    para(s, 1000);
    para(s, 1000, TEST_DIGER);
    const kanal = sahteKanal(s);
    const r = await s.istek('POST', '/api/takas/teklif', { uyeId: TEST_DIGER, muzVer: 50, muzIste: 20 });
    assert.equal(r.durum, 200);
    assert.equal(r.veri.teklif.discordda, true);
    assert.equal(kanal.gonderilen.length, 1);
    assert.match(kanal.gonderilen[0].content, /sana bir takas teklif etti/);
    assert.equal(kanal.gonderilen[0].components[0].components[0].data.custom_id, `takas:kabul:${r.veri.teklif.id}`);
    const satir = s.db.prepare('SELECT kanal_id, mesaj_id FROM takas_teklifleri').get();
    assert.equal(satir.mesaj_id, kanal.gonderilen[0].id);

    await s.digerIstek('POST', `/api/takas/${r.veri.teklif.id}/kabul`);
    assert.equal(kanal.duzenlenen.length, 1);
    assert.deepEqual(kanal.duzenlenen[0].components, []);
    assert.match(kanal.duzenlenen[0].embeds[0].data.description, /Kabul edildi/);
  }));

  it('kanal gönderimi başarısız olursa web işlemi yine de olur', () => sunucuyla(async (s) => {
    para(s, 1000);
    para(s, 1000, TEST_DIGER);
    s.istemci.channels = { fetch: async () => ({ id: '900000000000000001', send: async () => { throw new Error('Missing Access'); } }) };
    ayarYaz(s.db, TEST_GUILD, 'ekonomi.kanallar', ['900000000000000001']);
    const r = await s.istek('POST', '/api/duello/ac', { rakipId: TEST_DIGER, bahis: '100', oyun: 'at' });
    assert.equal(r.durum, 200);
    assert.equal(r.veri.duello.discordda, false);
    assert.equal(bak(s, TEST_KULLANICI), 900);
  }));
});
