import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AYARLAR, SISTEMLER } from '../lib/ayarlar.js';
import {
  acikElleriIadeEt, baslat, blackjackMi, bolunebilirMi, elDegeri, elGetir, hamle, sonucHesapla, zamanAsimiMi, ZAMAN_ASIMI_MS,
} from '../lib/blackjack.js';
import { acVeritabani } from '../lib/db.js';
import {
  bakiye, bugunGonderilen, dus, ekle, emojiMetni, GUNLUK_MAX, GUNLUK_MIN, gonder, gunlukAl, gunlukLimit, gunlukOdul,
  MESAJ_BEKLEME_MS, mesajOdulu, miktarAyristir, muz, paraSimgesi, paraSimgesiAyarla, SERI_TAVANI, seviyeOdulu, sifirla, trGunBaslangici, trGunu,
  TURLER, vergiHesapla, zenginler, zenginlikSirasi,
} from '../lib/ekonomi.js';
import { bjButonAyristir, bjButonId } from '../lib/ekonomi-bilesen.js';
import {
  ATLAR, atBeklenen, atYarisi, bahisKontrol, bahisOyna, bahisTavani, odemeHesapla, ruletBeklenen, ruletCarpani, ruletSecimi, slotBeklenen,
  slotCarpani, SLOT_SEMBOLLERI, yaziTura, yaziTuraBeklenen, zarBeklenen, zarOyna,
} from '../lib/kumar.js';
import {
  rolSatilabilirMi, satinAl, urunEkle, urunGetir, urunKaldir, urunler, URUN_SINIRI,
} from '../lib/magaza.js';

const G = 'g1';
const A = '100';
const B = '200';

function db() {
  return acVeritabani(':memory:');
}

function hareketler(v, kullaniciId = A) {
  return v.prepare('SELECT tur, miktar, bakiye_sonra FROM ekonomi_hareketleri WHERE kullanici_id = ? ORDER BY id')
    .all(kullaniciId);
}

/** Türkiye saatiyle verilen anın UTC ms karşılığı. */
const tr = (metin) => Date.parse(`${metin}+03:00`);

/** Sırayla verilen sayıları dönen sahte rastgelelik. */
function sira(...degerler) {
  let i = 0;
  return () => degerler[i++ % degerler.length];
}

describe('sistem ve ayarlar', () => {
  it('ekonomi sistemi kayıtlı ve varsayılan kapalı', () => {
    assert.equal(SISTEMLER.ekonomi.varsayilan, false);
  });

  it('ayar varsayılanları belgedeki sayılar', () => {
    assert.equal(AYARLAR['ekonomi.maksBahis'].varsayilan, 25_000);
    assert.equal(AYARLAR['ekonomi.vergiYuzde'].varsayilan, 5);
    assert.equal(AYARLAR['ekonomi.seviyeOdulu'].varsayilan, 100);
    assert.equal(AYARLAR['ekonomi.mesajOdulu'].varsayilan, true);
  });
});

describe('para simgesi', () => {
  it('uygulama emojisi varsa onu, yoksa yedek muzu kullanıyor', () => {
    assert.equal(emojiMetni({ id: '123', name: 'muz' }), '<:muz:123>');
    assert.equal(emojiMetni({ id: '123', name: 'muz', animated: true }), '<a:muz:123>');
    assert.equal(emojiMetni(undefined), null);

    paraSimgesiAyarla('<:muz:123>');
    assert.equal(muz(12_345), '12.345 <:muz:123>');
    paraSimgesiAyarla(null);
    assert.equal(paraSimgesi(), '🍌');
    assert.equal(muz(5), '5 🍌');
  });
});

describe('Türkiye günü', () => {
  it('gün sınırı Türkiye gece yarısı', () => {
    assert.equal(trGunu(tr('2026-10-09T23:59:59')), '2026-10-09');
    assert.equal(trGunu(tr('2026-10-10T00:00:00')), '2026-10-10');
    assert.equal(trGunBaslangici(tr('2026-10-09T15:00:00')), tr('2026-10-09T00:00:00'));
  });
});

describe('bakiye', () => {
  it('ekle ve dus deftere yazılıyor', () => {
    const v = db();
    assert.equal(ekle(v, { guildId: G, kullaniciId: A, miktar: 500, tur: TURLER.yonetici }), 500);
    assert.equal(dus(v, { guildId: G, kullaniciId: A, miktar: 200, tur: TURLER.bahis }), 300);
    assert.deepEqual(hareketler(v).map((h) => [h.tur, h.miktar, h.bakiye_sonra]), [
      ['yonetici', 500, 500], ['bahis', -200, 300],
    ]);
  });

  it('yetersiz bakiyede hiçbir şey yazılmıyor ve bakiye negatife düşmüyor', () => {
    const v = db();
    ekle(v, { guildId: G, kullaniciId: A, miktar: 100, tur: TURLER.yonetici });
    assert.equal(dus(v, { guildId: G, kullaniciId: A, miktar: 101, tur: TURLER.bahis }), null);
    assert.equal(dus(v, { guildId: G, kullaniciId: B, miktar: 1, tur: TURLER.bahis }), null);
    assert.equal(bakiye(v, G, A), 100);
    assert.equal(hareketler(v).length, 1);
  });

  it('geçersiz miktar reddediliyor', () => {
    const v = db();
    for (const miktar of [0, -5, 1.5, Number.NaN]) {
      assert.throws(() => ekle(v, { guildId: G, kullaniciId: A, miktar, tur: TURLER.yonetici }), RangeError);
    }
  });

  it('veritabanı da negatif bakiyeyi reddediyor', () => {
    const v = db();
    ekle(v, { guildId: G, kullaniciId: A, miktar: 10, tur: TURLER.yonetici });
    assert.throws(() => v.prepare('UPDATE bakiyeler SET bakiye = -1').run());
  });

  it('sıfırlama düşülen tutarı deftere yazıyor', () => {
    const v = db();
    ekle(v, { guildId: G, kullaniciId: A, miktar: 750, tur: TURLER.yonetici });
    assert.equal(sifirla(v, { guildId: G, kullaniciId: A, yoneticiId: B }), 750);
    assert.equal(bakiye(v, G, A), 0);
    assert.equal(sifirla(v, { guildId: G, kullaniciId: A, yoneticiId: B }), 0);
  });

  it('zenginler sıralaması ve sıra', () => {
    const v = db();
    ekle(v, { guildId: G, kullaniciId: A, miktar: 50, tur: TURLER.yonetici });
    ekle(v, { guildId: G, kullaniciId: B, miktar: 90, tur: TURLER.yonetici });
    assert.deepEqual(zenginler(v, G).map((k) => k.kullanici_id), [B, A]);
    assert.equal(zenginlikSirasi(v, G, A), 2);
    assert.equal(zenginlikSirasi(v, G, '999'), null);
  });

  it('yetkililer zenginler sıralamasına girmez', () => {
    const v = db();
    ekle(v, { guildId: G, kullaniciId: A, miktar: 50, tur: TURLER.yonetici });
    ekle(v, { guildId: G, kullaniciId: B, miktar: 90, tur: TURLER.yonetici });
    assert.deepEqual(zenginler(v, G, 10, [B]).map((k) => k.kullanici_id), [A]);
    assert.equal(zenginlikSirasi(v, G, A, [B]), 1);
    assert.equal(zenginlikSirasi(v, G, B, [B]), null);
  });
});

describe('günlük ödül', () => {
  it('ödül hesabı: taban, seri eki, tavan ve 7. gün', () => {
    assert.equal(gunlukOdul(1, () => 0).toplam, GUNLUK_MIN);
    assert.equal(gunlukOdul(1, () => 0.9999).toplam, GUNLUK_MAX);
    assert.equal(gunlukOdul(3, () => 0).ek, 60);
    assert.equal(gunlukOdul(1000, () => 0).ek, SERI_TAVANI);
    const yedi = gunlukOdul(7, () => 0);
    assert.equal(yedi.haftalik, true);
    assert.equal(yedi.toplam, (GUNLUK_MIN + 180) * 2);
    assert.equal(gunlukOdul(8, () => 0).haftalik, false);
  });

  it('aynı Türkiye gününde bir kez veriliyor', () => {
    const v = db();
    const ilk = gunlukAl(v, { guildId: G, kullaniciId: A, simdi: tr('2026-10-09T10:00:00'), rastgele: () => 0 });
    assert.equal(ilk.verildi, true);
    assert.equal(ilk.seri, 1);
    assert.equal(ilk.bakiye, GUNLUK_MIN);

    const ikinci = gunlukAl(v, { guildId: G, kullaniciId: A, simdi: tr('2026-10-09T23:30:00') });
    assert.equal(ikinci.verildi, false);
    assert.equal(ikinci.kalanMs, 30 * 60_000);
    assert.equal(bakiye(v, G, A), GUNLUK_MIN);
  });

  it('ardışık günde seri artıyor, gün atlanınca 1\'e dönüyor', () => {
    const v = db();
    const al = (gun) => gunlukAl(v, { guildId: G, kullaniciId: A, simdi: tr(`${gun}T12:00:00`), rastgele: () => 0 });
    assert.equal(al('2026-10-01').seri, 1);
    // Gece yarısından hemen sonra da "ertesi gün" sayılır.
    assert.equal(gunlukAl(v, { guildId: G, kullaniciId: A, simdi: tr('2026-10-02T00:00:05') }).seri, 2);
    assert.equal(al('2026-10-03').seri, 3);
    assert.equal(al('2026-10-05').seri, 1);
  });
});

describe('sohbet ödülü', () => {
  it('bekleme süresi dolmadan ikinci ödül yok', () => {
    const v = db();
    assert.equal(mesajOdulu(v, { guildId: G, kullaniciId: A, simdi: 1000, rastgele: () => 0 }), 1);
    assert.equal(mesajOdulu(v, { guildId: G, kullaniciId: A, simdi: 1000 + MESAJ_BEKLEME_MS - 1 }), 0);
    assert.equal(mesajOdulu(v, { guildId: G, kullaniciId: A, simdi: 1000 + MESAJ_BEKLEME_MS, rastgele: () => 0.9999 }), 4);
    assert.equal(bakiye(v, G, A), 5);
  });

  it('seviye ödülü seviye × çarpan', () => {
    assert.equal(seviyeOdulu(5, 100), 500);
    assert.equal(seviyeOdulu(5, 0), 0);
  });
});

describe('transfer', () => {
  const simdi = tr('2026-10-09T12:00:00');
  const hazir = (miktar = 10_000) => {
    const v = db();
    ekle(v, { guildId: G, kullaniciId: A, miktar, tur: TURLER.yonetici, simdi });
    return v;
  };

  it('vergi kesilip alıcıya net tutar gidiyor', () => {
    const v = hazir();
    const s = gonder(v, { guildId: G, gonderenId: A, aliciId: B, miktar: 1000, vergiYuzde: 5, simdi });
    assert.equal(s.ok, true);
    assert.equal(s.vergi, 50);
    assert.equal(bakiye(v, G, A), 9000);
    assert.equal(bakiye(v, G, B), 950);
    assert.equal(vergiHesapla(19, 5), 0);
  });

  it('kendine, en azın altında ve bakiyeden fazla gönderim reddediliyor', () => {
    const v = hazir(100);
    assert.equal(gonder(v, { guildId: G, gonderenId: A, aliciId: A, miktar: 50, simdi }).ok, false);
    assert.equal(gonder(v, { guildId: G, gonderenId: A, aliciId: B, miktar: 9, simdi }).ok, false);
    assert.equal(gonder(v, { guildId: G, gonderenId: A, aliciId: B, miktar: 101, simdi }).ok, false);
    assert.equal(bakiye(v, G, A), 100);
    assert.equal(bakiye(v, G, B), 0);
  });

  it('günlük limit seviyeye bağlı ve defterden hesaplanıyor', () => {
    assert.equal(gunlukLimit(0), 2000);
    assert.equal(gunlukLimit(10), 7000);

    const v = hazir();
    assert.equal(gonder(v, { guildId: G, gonderenId: A, aliciId: B, miktar: 1500, seviye: 0, simdi }).ok, true);
    const fazla = gonder(v, { guildId: G, gonderenId: A, aliciId: B, miktar: 501, seviye: 0, simdi });
    assert.equal(fazla.ok, false);
    assert.equal(bugunGonderilen(v, G, A, simdi), 1500);
    // Seviye 1'de limit 2500: kalan 1000 gönderilebilir.
    assert.equal(gonder(v, { guildId: G, gonderenId: A, aliciId: B, miktar: 1000, seviye: 1, simdi }).ok, true);
    // Ertesi Türkiye gününde limit yenileniyor.
    const yarin = tr('2026-10-10T00:00:01');
    assert.equal(bugunGonderilen(v, G, A, yarin), 0);
    assert.equal(gonder(v, { guildId: G, gonderenId: A, aliciId: B, miktar: 2000, simdi: yarin }).ok, true);
  });
});

describe('tutar ayrıştırma', () => {
  const cases = [
    ['500', 500], ['10.000', 10_000], ['1,250', 1250], ['1k', 1000], ['2.5k', 2500], ['2,5k', 2500],
    ['3 bin', 3000], ['1m', 1_000_000], ['hepsi', 777], ['Tümü', 777], ['yarı', 388], ['yarısı', 388],
  ];
  for (const [girdi, beklenen] of cases) {
    it(`"${girdi}" → ${beklenen}`, () => {
      assert.deepEqual(miktarAyristir(girdi, 777), { ok: true, miktar: beklenen });
    });
  }

  it('anlamsız girdiler reddediliyor', () => {
    for (const girdi of ['', 'abc', '-5', '1.5', '12.34.5', '5x']) {
      assert.equal(miktarAyristir(girdi, 100).ok, false, girdi);
    }
  });
});

describe('kumar oyunları', () => {
  it('her oyunun beklenen geri ödemesi 1\'in altında (belgedeki değerler)', () => {
    assert.equal(slotBeklenen().toFixed(4), '0.9520');
    assert.equal(yaziTuraBeklenen(), 0.95);
    assert.equal(zarBeklenen().toFixed(4), '0.9437');
    assert.equal(ruletBeklenen({ tur: 'renk', deger: 'kirmizi' }).toFixed(4), '0.9486');
    assert.equal(ruletBeklenen({ tur: 'parite', deger: 'tek' }).toFixed(4), '0.9486');
    assert.equal(ruletBeklenen({ tur: 'sayi', deger: 17 }).toFixed(4), '0.9459');
  });

  it('at yarışı: şanslar 100, her atın beklenen geri ödemesi belgedeki gibi', () => {
    assert.equal(ATLAR.reduce((t, a) => t + a.sans, 0), 100);
    assert.deepEqual(ATLAR.map((a) => atBeklenen(a.no).toFixed(4)), ['0.9450', '0.9500', '0.9500', '0.9480', '0.9520']);
  });

  it('at yarışı: kazananı ağırlıkla seçer, yalnız seçilen at kazanırsa öder', () => {
    assert.deepEqual(atYarisi(1, () => 0), { secim: 1, kazanan: 1, carpan: 2.7 });
    assert.deepEqual(atYarisi(5, () => 0.999), { secim: 5, kazanan: 5, carpan: 11.9 });
    // 0,35 → ikinci atın aralığının başı
    assert.deepEqual(atYarisi(1, () => 0.35), { secim: 1, kazanan: 2, carpan: 0 });
  });

  it('slot ağırlıkları 100 ve çarpanlar doğru', () => {
    assert.equal(SLOT_SEMBOLLERI.reduce((t, s) => t + s.agirlik, 0), 100);
    const [kiraz, , , , , , muz] = SLOT_SEMBOLLERI;
    assert.equal(slotCarpani([muz, muz, muz]), 777);
    assert.equal(slotCarpani([kiraz, muz, kiraz]), 0.5);
    assert.equal(slotCarpani([kiraz, muz, muz]), 10);
    assert.equal(slotCarpani([kiraz, SLOT_SEMBOLLERI[1], muz]), 0);
  });

  it('yazı-tura ve zar', () => {
    assert.deepEqual(yaziTura('yazi', () => 0.1), { sonuc: 'yazi', carpan: 1.9 });
    assert.equal(yaziTura('tura', () => 0.1).carpan, 0);
    // Zar sırası: oyuncu 6+6, kasa 1+1.
    assert.equal(zarOyna(sira(0.99, 0.99, 0, 0)).carpan, 2);
    assert.equal(zarOyna(sira(0, 0, 0, 0)).carpan, 0.5);
    assert.equal(zarOyna(sira(0, 0, 0.99, 0.99)).carpan, 0);
  });

  it('rulet seçimleri ve sıfır', () => {
    assert.deepEqual(ruletSecimi('Kırmızı'), { tur: 'renk', deger: 'kirmizi' });
    assert.deepEqual(ruletSecimi('çift'), { tur: 'parite', deger: 'cift' });
    assert.deepEqual(ruletSecimi('0'), { tur: 'sayi', deger: 0 });
    assert.equal(ruletSecimi('37'), null);
    assert.equal(ruletSecimi('mavi'), null);
    assert.equal(ruletCarpani({ tur: 'renk', deger: 'kirmizi' }, 0), 0);
    assert.equal(ruletCarpani({ tur: 'parite', deger: 'cift' }, 0), 0);
    assert.equal(ruletCarpani({ tur: 'sayi', deger: 0 }, 0), 35);
    assert.equal(ruletCarpani({ tur: 'renk', deger: 'siyah' }, 2), 1.95);
  });

  it('bahis sınırları', () => {
    assert.equal(bahisKontrol(9, 1000, 500).ok, false);
    assert.equal(bahisKontrol(501, 1000, 500).ok, false);
    assert.equal(bahisKontrol(200, 100, 500).ok, false);
    assert.equal(bahisKontrol(100, 100, 500).ok, true);
    assert.equal(odemeHesapla(15, 0.5), 7);
    assert.equal(odemeHesapla(100, 4.85), 485); // 484,999… değil
  });

  it('bahis tavanı seviyeyle artar, ayarla üstten sınırlı', () => {
    assert.equal(bahisTavani(0, 25_000), 1_000);
    assert.equal(bahisTavani(10, 25_000), 6_000);
    assert.equal(bahisTavani(48, 25_000), 25_000);
    assert.equal(bahisTavani(100, 25_000), 25_000);
    assert.equal(bahisTavani(10, 3_000), 3_000);
    assert.equal(bahisTavani(undefined, 25_000), 1_000);
  });

  it('bahis ve kazanç tek işlemde deftere yazılıyor', () => {
    const v = db();
    ekle(v, { guildId: G, kullaniciId: A, miktar: 100, tur: TURLER.yonetici });
    const kazandi = bahisOyna(v, { guildId: G, kullaniciId: A, bahis: 100, oyun: () => ({ carpan: 2 }) });
    assert.equal(kazandi.net, 100);
    assert.equal(kazandi.bakiye, 200);
    const kaybetti = bahisOyna(v, { guildId: G, kullaniciId: A, bahis: 50, oyun: () => ({ carpan: 0 }) });
    assert.equal(kaybetti.bakiye, 150);
    assert.deepEqual(hareketler(v).map((h) => h.tur), ['yonetici', 'bahis', 'kazanc', 'bahis']);
  });

  it('oyun hata atarsa bahis geri alınıyor', () => {
    const v = db();
    ekle(v, { guildId: G, kullaniciId: A, miktar: 100, tur: TURLER.yonetici });
    assert.throws(() => bahisOyna(v, {
      guildId: G, kullaniciId: A, bahis: 100, oyun: () => { throw new Error('boom'); },
    }));
    assert.equal(bakiye(v, G, A), 100);
    assert.equal(hareketler(v).length, 1);
  });
});

describe('blackjack', () => {
  it('el değeri asları esnek sayıyor', () => {
    assert.equal(elDegeri(['A♠', 'K♥']), 21);
    assert.equal(elDegeri(['A♠', 'A♥', '9♦']), 21);
    assert.equal(elDegeri(['A♠', 'A♥', 'A♦', 'A♣']), 14);
    assert.equal(elDegeri(['K♠', 'Q♥', '5♦']), 25);
    assert.equal(blackjackMi(['A♠', '10♥']), true);
    assert.equal(blackjackMi(['A♠', '5♥', '5♦']), false);
  });

  it('sonuç ve çarpanlar', () => {
    assert.deepEqual(sonucHesapla(['A♠', 'K♥'], ['10♠', '9♥']), { sonuc: 'blackjack', carpan: 2.2 });
    assert.deepEqual(sonucHesapla(['A♠', 'K♥'], ['A♦', 'Q♥']), { sonuc: 'berabere', carpan: 1 });
    assert.deepEqual(sonucHesapla(['10♠', '9♥'], ['10♦', '9♣']), { sonuc: 'berabere', carpan: 1 });
    assert.deepEqual(sonucHesapla(['10♠', '9♥'], ['10♦', '7♣', '8♠']), { sonuc: 'kazandi', carpan: 2 });
    assert.deepEqual(sonucHesapla(['10♠', '9♥', '5♦'], ['10♦', '7♣']), { sonuc: 'patladi', carpan: 0 });
    assert.deepEqual(sonucHesapla(['10♠', '7♥'], ['10♦', '9♣']), { sonuc: 'kaybetti', carpan: 0 });
  });

  // Dağıtım sırası: oyuncu, oyuncu, kurpiyer, kurpiyer, sonra çekilenler.
  const hazir = (deste, para = 1000) => {
    const v = db();
    ekle(v, { guildId: G, kullaniciId: A, miktar: para, tur: TURLER.yonetici });
    const s = baslat(v, { guildId: G, kullaniciId: A, bahis: 100, deste, simdi: 0 });
    return { v, s };
  };

  it('bahis başta düşülüyor, kazanınca 2x ödeniyor', () => {
    const { v, s } = hazir(['10♠', '8♥', '10♦', '7♣', '2♠']);
    assert.equal(s.el.bitti, false);
    assert.equal(bakiye(v, G, A), 900);
    const son = hamle(v, { guildId: G, kullaniciId: A, tur: 'dur' });
    assert.equal(son.el.sonuc, 'kazandi');
    assert.equal(bakiye(v, G, A), 1100);
    assert.equal(elGetir(v, G, A), null);
  });

  it('kart çekip patlayınca el kapanıyor', () => {
    const { v } = hazir(['10♠', '8♥', '10♦', '7♣', 'K♠']);
    const son = hamle(v, { guildId: G, kullaniciId: A, tur: 'cek' });
    assert.equal(son.el.bitti, true);
    assert.equal(son.el.sonuc, 'patladi');
    assert.equal(bakiye(v, G, A), 900);
  });

  it('ikiye katlama bahsi ikiye katlayıp tek kart çekiyor', () => {
    const { v } = hazir(['5♠', '6♥', '10♦', '7♣', '10♠']);
    const son = hamle(v, { guildId: G, kullaniciId: A, tur: 'katla' });
    assert.equal(son.el.bahis, 200);
    assert.equal(son.el.oyuncu.length, 3);
    assert.equal(son.el.sonuc, 'kazandi');
    assert.equal(bakiye(v, G, A), 1200);
  });

  it('ikiye katlamaya bakiye yetmezse el sürüyor', () => {
    const { v } = hazir(['5♠', '6♥', '10♦', '7♣'], 150);
    const s = hamle(v, { guildId: G, kullaniciId: A, tur: 'katla' });
    assert.equal(s.ok, false);
    assert.notEqual(elGetir(v, G, A), null);
    assert.equal(bakiye(v, G, A), 50);
  });

  it('ilk dağıtımda blackjack el açmadan 2,2x ödüyor', () => {
    const { v, s } = hazir(['A♠', 'K♥', '10♦', '7♣']);
    assert.equal(s.el.bitti, true);
    assert.equal(s.el.sonuc, 'blackjack');
    assert.equal(bakiye(v, G, A), 1120);
    assert.equal(elGetir(v, G, A), null);
  });

  it('açık el varken yeni el açılmıyor; zaman aşımı ölçülüyor', () => {
    const { v, s } = hazir(['10♠', '8♥', '10♦', '7♣']);
    const ikinci = baslat(v, { guildId: G, kullaniciId: A, bahis: 100 });
    assert.equal(ikinci.ok, false);
    assert.equal(ikinci.sebep, 'acik-el');
    assert.equal(zamanAsimiMi(s.el, ZAMAN_ASIMI_MS - 1), false);
    assert.equal(zamanAsimiMi(s.el, ZAMAN_ASIMI_MS), true);
  });

  it('açılışta yarım eller iade ediliyor', () => {
    const { v } = hazir(['10♠', '8♥', '10♦', '7♣']);
    assert.equal(acikElleriIadeEt(v), 1);
    assert.equal(bakiye(v, G, A), 1000);
    assert.equal(elGetir(v, G, A), null);
    assert.equal(hamle(v, { guildId: G, kullaniciId: A, tur: 'dur' }).ok, false);
  });

  it('bölme: ikinci bahis düşülür, eller sırayla oynanır, her el ayrı ödenir', () => {
    // Oyuncu 8-8, kurpiyer 10-7; 1. ele 3 (11), 2. ele 10 (18); 1. el çeker 10 (21).
    const { v, s } = hazir(['8♠', '8♥', '10♦', '7♣', '3♠', '10♥', '10♣']);
    assert.equal(bolunebilirMi(s.el), true);
    const b = hamle(v, { guildId: G, kullaniciId: A, tur: 'bol' });
    assert.equal(b.ok, true, b.sebep);
    assert.equal(bakiye(v, G, A), 800);
    assert.equal(b.el.bitti, false);
    assert.equal(b.el.bahis, 200);
    assert.deepEqual(b.el.eller.map((e) => e.kartlar), [['8♠', '3♠'], ['8♥', '10♥']]);
    assert.equal(b.el.aktif, 0);
    assert.equal(hamle(v, { guildId: G, kullaniciId: A, tur: 'bol' }).ok, false, 'ikinci kez bölünmez');

    // Kayıttan okununca da bölünmüş el aynı; açılış iadesi toplam bahsi bilir.
    assert.equal(elGetir(v, G, A).bahis, 200);
    const c = hamle(v, { guildId: G, kullaniciId: A, tur: 'cek' }); // 21 → 2. ele geçer
    assert.equal(c.el.bitti, false);
    assert.equal(c.el.aktif, 1);
    const son = hamle(v, { guildId: G, kullaniciId: A, tur: 'dur' }); // 18 vs 17
    assert.equal(son.el.bitti, true);
    assert.deepEqual(son.el.eller.map((e) => [e.sonuc, e.odeme]), [['kazandi', 200], ['kazandi', 200]]);
    assert.equal(son.el.net, 200);
    assert.equal(son.el.sonuc, 'kazandi');
    assert.equal(bakiye(v, G, A), 1200);
    assert.equal(elGetir(v, G, A), null);
  });

  it('bölünmüş elde 21 blackjack sayılmaz; bölünen asa tek kart gelir', () => {
    // A-A bölünür, ellere K ve 9 gelir; ikisi de kendiliğinden durur, kurpiyer 10-8.
    const { v } = hazir(['A♠', 'A♥', '10♦', '8♣', 'K♠', '9♥']);
    const b = hamle(v, { guildId: G, kullaniciId: A, tur: 'bol' });
    assert.equal(b.el.bitti, true);
    assert.deepEqual(b.el.eller.map((e) => [e.kartlar.length, e.sonuc, e.odeme]), [[2, 'kazandi', 200], [2, 'kazandi', 200]]);
    assert.equal(bakiye(v, G, A), 1200);
  });

  it('farklı değerde bölünmez; bakiye yetmezse bölünmez; K-Q bölünür', () => {
    const { v } = hazir(['8♠', '9♥', '10♦', '7♣']);
    assert.match(hamle(v, { guildId: G, kullaniciId: A, tur: 'bol' }).sebep, /aynı değerde/);
    const az = hazir(['8♠', '8♥', '10♦', '7♣'], 150);
    assert.match(hamle(az.v, { guildId: G, kullaniciId: A, tur: 'bol' }).sebep, /bakiyen yetmiyor/);
    assert.equal(bakiye(az.v, G, A), 50);
    assert.equal(bolunebilirMi(hazir(['K♠', 'Q♥', '10♦', '7♣']).s.el), true);
  });

  it('bölünmüş elde ikiye katlanır; patlayan ve kaybeden eller ayrı', () => {
    // 6-6 bölünür; 1. ele 5 (11) → katla, 10 gelir (21); 2. ele 10 (16) → çek, K (26 patlar).
    // Kurpiyer 10-9 = 19.
    const { v } = hazir(['6♠', '6♥', '10♦', '9♣', '5♠', '10♥', '10♣', 'K♦'], 1000);
    hamle(v, { guildId: G, kullaniciId: A, tur: 'bol' });
    const k = hamle(v, { guildId: G, kullaniciId: A, tur: 'katla' });
    assert.equal(k.ok, true, k.sebep);
    assert.equal(k.el.aktif, 1);
    assert.equal(k.el.bahis, 300);
    const son = hamle(v, { guildId: G, kullaniciId: A, tur: 'cek' });
    assert.deepEqual(son.el.eller.map((e) => [e.bahis, e.sonuc, e.odeme]), [[200, 'kazandi', 400], [100, 'patladi', 0]]);
    assert.equal(son.el.net, 100);
    assert.equal(bakiye(v, G, A), 1100);
  });

  it('bölünmüş yarım el açılışta toplam bahisle iade edilir; hepsi=dur ikisini de kapatır', () => {
    const { v } = hazir(['8♠', '8♥', '10♦', '7♣', '2♠', '2♥', '2♦']);
    hamle(v, { guildId: G, kullaniciId: A, tur: 'bol' });
    assert.equal(acikElleriIadeEt(v), 1);
    assert.equal(bakiye(v, G, A), 1000);

    const ikinci = hazir(['8♠', '8♥', '10♦', '7♣', '2♠', '2♥', '2♦']);
    hamle(ikinci.v, { guildId: G, kullaniciId: A, tur: 'bol' });
    const d = hamle(ikinci.v, { guildId: G, kullaniciId: A, tur: 'dur', hepsi: true });
    assert.equal(d.el.bitti, true);
    assert.equal(d.el.eller.length, 2);
  });

  it('buton kimliği kullanıcıya bağlı', () => {
    assert.deepEqual(bjButonAyristir(bjButonId('cek', '123')), { tur: 'cek', kullaniciId: '123' });
    assert.equal(bjButonAyristir('bj:sil:123'), null);
    assert.equal(bjButonAyristir('cekilis:1'), null);
  });
});

describe('rol mağazası', () => {
  it('ekleme, fiyat güncelleme ve kaldırma', () => {
    const v = db();
    assert.deepEqual(urunEkle(v, { guildId: G, rolId: 'r1', fiyat: 500, ekleyenId: A }), { ok: true, guncellendi: false });
    assert.deepEqual(urunEkle(v, { guildId: G, rolId: 'r1', fiyat: 800, ekleyenId: A }), { ok: true, guncellendi: true });
    assert.equal(urunGetir(v, G, 'r1').fiyat, 800);
    assert.equal(urunEkle(v, { guildId: G, rolId: 'r2', fiyat: 0, ekleyenId: A }).ok, false);
    assert.equal(urunKaldir(v, G, 'r1'), true);
    assert.equal(urunKaldir(v, G, 'r1'), false);
  });

  it('sınır dolunca yeni rol eklenmiyor', () => {
    const v = db();
    for (let i = 0; i < URUN_SINIRI; i += 1) urunEkle(v, { guildId: G, rolId: `r${i}`, fiyat: 10, ekleyenId: A });
    assert.equal(urunEkle(v, { guildId: G, rolId: 'fazla', fiyat: 10, ekleyenId: A }).ok, false);
    assert.equal(urunler(v, G).length, URUN_SINIRI);
  });

  it('satılamaz roller', () => {
    const guild = { id: 'g' };
    assert.equal(rolSatilabilirMi({ id: 'g', guild, position: 0 }, 10).ok, false);
    assert.equal(rolSatilabilirMi({ id: 'r', guild, managed: true, position: 1 }, 10).ok, false);
    assert.equal(rolSatilabilirMi({ id: 'r', guild, position: 10 }, 10).ok, false);
    assert.equal(rolSatilabilirMi({ id: 'r', guild, position: 9 }, 10).ok, true);
  });

  it('satın almada para düşüyor; rol verilemezse iade ediliyor', async () => {
    const v = db();
    ekle(v, { guildId: G, kullaniciId: A, miktar: 1000, tur: TURLER.yonetici });
    urunEkle(v, { guildId: G, rolId: 'r1', fiyat: 600, ekleyenId: B });
    const urun = urunGetir(v, G, 'r1');

    const basarisiz = await satinAl(v, {
      guildId: G, kullaniciId: A, urun, rolVer: async () => { throw new Error('Missing Permissions'); },
    });
    assert.equal(basarisiz.ok, false);
    assert.equal(bakiye(v, G, A), 1000);

    let verildi = false;
    const basarili = await satinAl(v, { guildId: G, kullaniciId: A, urun, rolVer: async () => { verildi = true; } });
    assert.equal(basarili.ok, true);
    assert.equal(verildi, true);
    assert.equal(bakiye(v, G, A), 400);

    const yetmez = await satinAl(v, { guildId: G, kullaniciId: A, urun, rolVer: async () => {} });
    assert.equal(yetmez.ok, false);
    assert.equal(bakiye(v, G, A), 400);
  });
});

describe('/ekonomi-yonet', () => {
  it('yalnız Yönetici yetkisine açık', async () => {
    const { data, execute, yoneticiMi } = await import('../commands/ekonomi/ekonomi-yonet.js');
    const { PermissionFlagsBits, PermissionsBitField } = await import('discord.js');
    assert.equal(data.toJSON().default_member_permissions, String(PermissionFlagsBits.Administrator));

    const izin = (...bitler) => ({ memberPermissions: new PermissionsBitField(bitler) });
    assert.equal(yoneticiMi(izin(PermissionFlagsBits.ManageGuild)), false);
    assert.equal(yoneticiMi(izin(PermissionFlagsBits.Administrator)), true);

    let yanit;
    await execute({ ...izin(PermissionFlagsBits.ManageGuild), reply: async (y) => { yanit = y; } });
    assert.match(yanit.content, /Yönetici/);
  });
});
