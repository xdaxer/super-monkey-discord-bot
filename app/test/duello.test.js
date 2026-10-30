import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { acVeritabani } from '../lib/db.js';
import {
  acikDuellolariIadeEt, atDuellosu, butonYetkisi, DUELLO_SURE_MS, duelloAc, duelloBahisKontrol, duelloButonAyristir,
  duelloButonId, duelloGetir, duelloIptal, duelloKabul, havuzHesapla, rakipKontrol, secimBelirle,
  suresiDolaniIadeEt, yaziTuraDuellosu, zarDuellosu,
} from '../lib/duello.js';
import { bakiye, ekle, TURLER } from '../lib/ekonomi.js';

const G = 'g1';
const A = '100';
const B = '200';
const C = '300';
const T0 = 1_000_000;

/** Sırayla verilen sayıları dönen sahte rastgelelik. */
function sira(...degerler) {
  let i = 0;
  return () => degerler[i++ % degerler.length];
}

// zar = 1 + floor(r*6): 0 -> 1, 0.99 -> 6
const ZAR_MEYDAN_KAZANIR = sira(0.99, 0.99, 0, 0); // 12 - 2
const ZAR_RAKIP_KAZANIR = sira(0, 0, 0.99, 0.99); // 2 - 12
const ZAR_BERABERE = sira(0.5, 0.5, 0.5, 0.5);

function hazir(bakiyeA = 1000, bakiyeB = 1000) {
  const v = acVeritabani(':memory:');
  if (bakiyeA) ekle(v, { guildId: G, kullaniciId: A, miktar: bakiyeA, tur: TURLER.yonetici });
  if (bakiyeB) ekle(v, { guildId: G, kullaniciId: B, miktar: bakiyeB, tur: TURLER.yonetici });
  return v;
}

function ac(v, ek = {}) {
  return duelloAc(v, {
    guildId: G, kanalId: 'k1', meydanId: A, rakipId: B, bahis: 100, oyun: 'zar', simdi: T0, ...ek,
  });
}

function defter(v, kullaniciId) {
  return v.prepare('SELECT tur, miktar, karsi_id FROM ekonomi_hareketleri WHERE kullanici_id = ? ORDER BY id')
    .all(kullaniciId);
}

describe('saf mantık', () => {
  it('havuz ve %5 kasa payı', () => {
    assert.deepEqual(havuzHesapla(100), { havuz: 200, kasa: 10, kazanc: 190 });
    // En küçük bahiste kasa payı aşağı yuvarlanır: 20 muzun %5'i 1.
    assert.deepEqual(havuzHesapla(10), { havuz: 20, kasa: 1, kazanc: 19 });
    assert.deepEqual(havuzHesapla(15), { havuz: 30, kasa: 1, kazanc: 29 });
  });

  it('zar: büyük toplam kazanır, eşitlik berabere', () => {
    assert.equal(zarDuellosu(ZAR_MEYDAN_KAZANIR).kazanan, 'meydan');
    assert.equal(zarDuellosu(ZAR_RAKIP_KAZANIR).kazanan, 'rakip');
    assert.equal(zarDuellosu(ZAR_BERABERE).kazanan, null);
    assert.deepEqual(zarDuellosu(ZAR_MEYDAN_KAZANIR).meydan, [6, 6]);
  });

  it('yazı-tura: seçim tutarsa meydan okuyan kazanır, beraberlik yok', () => {
    assert.deepEqual(yaziTuraDuellosu('yazi', () => 0.1), { sonuc: 'yazi', kazanan: 'meydan' });
    assert.deepEqual(yaziTuraDuellosu('yazi', () => 0.9), { sonuc: 'tura', kazanan: 'rakip' });
    assert.equal(yaziTuraDuellosu('tura', () => 0.9).kazanan, 'meydan');
  });

  it('at yarışı: yarı yarıya, beraberlik yok', () => {
    assert.deepEqual(atDuellosu(() => 0.49), { kazanan: 'meydan' });
    assert.deepEqual(atDuellosu(() => 0.5), { kazanan: 'rakip' });
  });

  it('seçim verilmezse rastgele belirlenir', () => {
    assert.equal(secimBelirle('tura', () => 0.1), 'tura');
    assert.equal(secimBelirle(null, () => 0.1), 'yazi');
    assert.equal(secimBelirle(null, () => 0.9), 'tura');
  });

  it('kendine ve botlara düello yok', () => {
    assert.equal(rakipKontrol(A, { id: A, bot: false }).ok, false);
    assert.equal(rakipKontrol(A, { id: B, bot: true }).ok, false);
    assert.equal(rakipKontrol(A, { id: B, bot: false }).ok, true);
  });

  it('bahis kumarla aynı sınırlara uyar', () => {
    assert.equal(duelloBahisKontrol(9, 1000, 25_000).ok, false);
    assert.equal(duelloBahisKontrol(10, 1000, 25_000).ok, true);
    assert.equal(duelloBahisKontrol(30_000, 100_000, 25_000).ok, false);
    assert.equal(duelloBahisKontrol(500, 100, 25_000).ok, false);
  });
});

describe('düğme kimliği ve yetki', () => {
  it('kimlik gidiş dönüş', () => {
    assert.deepEqual(duelloButonAyristir(duelloButonId('kabul', 42)), { tur: 'kabul', id: 42 });
    assert.deepEqual(duelloButonAyristir('duello:geri:7'), { tur: 'geri', id: 7 });
  });

  it('yabancı ya da bozuk kimlik reddedilir', () => {
    assert.equal(duelloButonAyristir('bj:cek:1'), null);
    assert.equal(duelloButonAyristir('duello:sil:1'), null);
    assert.equal(duelloButonAyristir('duello:kabul:abc'), null);
    assert.equal(duelloButonAyristir('duello:kabul'), null);
    assert.equal(duelloButonAyristir(undefined), null);
  });

  it('kabul / reddet yalnız rakip, geri çek yalnız meydan okuyan', () => {
    const d = { meydanId: A, rakipId: B };
    assert.equal(butonYetkisi('kabul', d, B).ok, true);
    assert.equal(butonYetkisi('kabul', d, A).ok, false);
    assert.equal(butonYetkisi('kabul', d, C).ok, false);
    assert.equal(butonYetkisi('red', d, B).ok, true);
    assert.equal(butonYetkisi('red', d, A).ok, false);
    assert.equal(butonYetkisi('geri', d, A).ok, true);
    assert.equal(butonYetkisi('geri', d, B).ok, false);
    assert.equal(butonYetkisi('geri', d, C).ok, false);
  });
});

describe('meydan okuma (emanet)', () => {
  it('açılışta meydan okuyanın bahsi düşülür, defterde karşı taraf rakip', () => {
    const v = hazir();
    const s = ac(v);
    assert.equal(s.ok, true);
    assert.equal(s.bakiye, 900);
    assert.equal(bakiye(v, G, A), 900);
    assert.equal(bakiye(v, G, B), 1000);
    assert.equal(s.duello.bitis, T0 + DUELLO_SURE_MS);
    const son = defter(v, A).at(-1);
    assert.deepEqual({ ...son }, { tur: 'bahis', miktar: -100, karsi_id: B });
  });

  it('yetersiz bakiyede hiçbir şey yazılmaz', () => {
    const v = hazir(50);
    const s = ac(v);
    assert.equal(s.ok, false);
    assert.equal(bakiye(v, G, A), 50);
    assert.equal(v.prepare('SELECT COUNT(*) AS n FROM duello_meydanlari').get().n, 0);
  });

  it('kişi başı tek bekleyen meydan okuma', () => {
    const v = hazir();
    assert.equal(ac(v).ok, true);
    const ikinci = ac(v, { rakipId: C, simdi: T0 + 1000 });
    assert.equal(ikinci.ok, false);
    assert.equal(bakiye(v, G, A), 900);
    // Başka kişi kendi meydan okumasını açabilir.
    ekle(v, { guildId: G, kullaniciId: C, miktar: 500, tur: TURLER.yonetici });
    assert.equal(ac(v, { meydanId: C, rakipId: A }).ok, true);
  });

  it('süresi dolmuş eski meydan okuma yenisi açılırken iade edilir', () => {
    const v = hazir();
    ac(v);
    const yeni = ac(v, { simdi: T0 + DUELLO_SURE_MS + 1 });
    assert.equal(yeni.ok, true);
    // 1000 - 100 (eski) + 100 (iade) - 100 (yeni)
    assert.equal(bakiye(v, G, A), 900);
    assert.equal(v.prepare('SELECT COUNT(*) AS n FROM duello_meydanlari').get().n, 1);
  });

  it('bilinmeyen oyun reddedilir', () => {
    const v = hazir();
    assert.equal(ac(v, { oyun: 'poker' }).ok, false);
    assert.equal(bakiye(v, G, A), 1000);
  });
});

describe('kabul', () => {
  it('meydan okuyan kazanır: toplam havuzdan %5 kesilir', () => {
    const v = hazir();
    const { duello } = ac(v);
    const s = duelloKabul(v, { id: duello.id, kullaniciId: B, simdi: T0 + 1000, rastgele: ZAR_MEYDAN_KAZANIR });
    assert.equal(s.ok, true);
    assert.equal(s.kazananId, A);
    assert.equal(s.kazanc, 190);
    assert.equal(s.kasa, 10);
    assert.equal(bakiye(v, G, A), 900 + 190);
    assert.equal(bakiye(v, G, B), 900);
    assert.equal(duelloGetir(v, duello.id), null);
    // Defter: rakip bahis (karşı: meydan okuyan), kazanan kazanç (karşı: kaybeden).
    assert.deepEqual({ ...defter(v, B).at(-1) }, { tur: 'bahis', miktar: -100, karsi_id: A });
    assert.deepEqual({ ...defter(v, A).at(-1) }, { tur: 'kazanc', miktar: 190, karsi_id: B });
  });

  it('rakip kazanır', () => {
    const v = hazir();
    const { duello } = ac(v);
    const s = duelloKabul(v, { id: duello.id, kullaniciId: B, simdi: T0 + 1, rastgele: ZAR_RAKIP_KAZANIR });
    assert.equal(s.kazananId, B);
    assert.equal(s.kaybedenId, A);
    assert.equal(bakiye(v, G, A), 900);
    assert.equal(bakiye(v, G, B), 900 + 190);
  });

  it('muz toplamı kasa payı kadar azalır', () => {
    const v = hazir();
    const { duello } = ac(v);
    duelloKabul(v, { id: duello.id, kullaniciId: B, simdi: T0 + 1, rastgele: ZAR_MEYDAN_KAZANIR });
    assert.equal(bakiye(v, G, A) + bakiye(v, G, B), 2000 - 10);
  });

  it('beraberlikte ikisine de bahis iade, kasa payı yok', () => {
    const v = hazir();
    const { duello } = ac(v);
    const s = duelloKabul(v, { id: duello.id, kullaniciId: B, simdi: T0 + 1, rastgele: ZAR_BERABERE });
    assert.equal(s.ok, true);
    assert.equal(s.kazananId, null);
    assert.equal(bakiye(v, G, A), 1000);
    assert.equal(bakiye(v, G, B), 1000);
    assert.equal(defter(v, A).at(-1).tur, 'iade');
    assert.equal(defter(v, B).at(-1).tur, 'iade');
  });

  it('yazı-tura düellosu seçime göre ödenir', () => {
    const v = hazir();
    const { duello } = ac(v, { oyun: 'yazitura', secim: 'yazi' });
    assert.equal(duello.secim, 'yazi');
    const s = duelloKabul(v, { id: duello.id, kullaniciId: B, simdi: T0 + 1, rastgele: () => 0.9 }); // tura
    assert.equal(s.kazananId, B);
    assert.equal(bakiye(v, G, B), 900 + 190);
  });

  it('at yarışı düellosu: seçim tutulmaz, kazanana havuz ödenir', () => {
    const v = hazir();
    const { duello } = ac(v, { oyun: 'at', secim: 'yazi' });
    assert.equal(duello.oyun, 'at');
    assert.equal(duello.secim, null);
    const s = duelloKabul(v, { id: duello.id, kullaniciId: B, simdi: T0 + 1, rastgele: () => 0.2 });
    assert.equal(s.kazananId, A);
    assert.equal(bakiye(v, G, A), 900 + 190);
    assert.equal(bakiye(v, G, B), 900);
  });

  it('rakibin bakiyesi yetmezse reddedilir, hiçbir şey değişmez', () => {
    const v = hazir(1000, 50);
    const { duello } = ac(v);
    const s = duelloKabul(v, { id: duello.id, kullaniciId: B, simdi: T0 + 1, rastgele: ZAR_MEYDAN_KAZANIR });
    assert.equal(s.ok, false);
    assert.equal(bakiye(v, G, B), 50);
    assert.equal(bakiye(v, G, A), 900);
    assert.notEqual(duelloGetir(v, duello.id), null);
    assert.equal(defter(v, B).length, 1); // yalnız ilk yükleme
    // Bakiye tamamlanınca aynı meydan okuma kabul edilebilir.
    ekle(v, { guildId: G, kullaniciId: B, miktar: 100, tur: TURLER.yonetici });
    assert.equal(duelloKabul(v, { id: duello.id, kullaniciId: B, simdi: T0 + 2, rastgele: ZAR_RAKIP_KAZANIR }).ok, true);
  });

  it('meydan okuyan ya da üçüncü kişi kabul edemez', () => {
    const v = hazir();
    const { duello } = ac(v);
    assert.equal(duelloKabul(v, { id: duello.id, kullaniciId: A, simdi: T0 + 1 }).ok, false);
    assert.equal(duelloKabul(v, { id: duello.id, kullaniciId: C, simdi: T0 + 1 }).ok, false);
    assert.equal(bakiye(v, G, A), 900);
    assert.equal(bakiye(v, G, B), 1000);
    assert.notEqual(duelloGetir(v, duello.id), null);
  });

  it('süre dolduktan sonra kabul edilemez, emanet iade olur', () => {
    const v = hazir();
    const { duello } = ac(v);
    const s = duelloKabul(v, { id: duello.id, kullaniciId: B, simdi: T0 + DUELLO_SURE_MS });
    assert.equal(s.ok, false);
    assert.equal(s.gecersiz, true);
    assert.equal(bakiye(v, G, A), 1000);
    assert.equal(bakiye(v, G, B), 1000);
    assert.equal(duelloGetir(v, duello.id), null);
  });

  it('aynı meydan okuma iki kez kabul edilemez', () => {
    const v = hazir();
    const { duello } = ac(v);
    duelloKabul(v, { id: duello.id, kullaniciId: B, simdi: T0 + 1, rastgele: ZAR_MEYDAN_KAZANIR });
    const ikinci = duelloKabul(v, { id: duello.id, kullaniciId: B, simdi: T0 + 2, rastgele: ZAR_MEYDAN_KAZANIR });
    assert.equal(ikinci.ok, false);
    assert.equal(ikinci.gecersiz, true);
    assert.equal(bakiye(v, G, B), 900);
  });
});

describe('ret, geri çekme, süre aşımı, açılış', () => {
  it('rakip reddedince meydan okuyana iade', () => {
    const v = hazir();
    const { duello } = ac(v);
    assert.equal(duelloIptal(v, { id: duello.id, kullaniciId: A, tur: 'red' }).ok, false);
    const s = duelloIptal(v, { id: duello.id, kullaniciId: B, tur: 'red', simdi: T0 + 5 });
    assert.equal(s.ok, true);
    assert.equal(bakiye(v, G, A), 1000);
    assert.equal(bakiye(v, G, B), 1000);
    assert.equal(duelloGetir(v, duello.id), null);
    assert.deepEqual({ ...defter(v, A).at(-1) }, { tur: 'iade', miktar: 100, karsi_id: B });
  });

  it('meydan okuyan geri çekince iade; rakip geri çekemez', () => {
    const v = hazir();
    const { duello } = ac(v);
    assert.equal(duelloIptal(v, { id: duello.id, kullaniciId: B, tur: 'geri' }).ok, false);
    assert.equal(bakiye(v, G, A), 900);
    assert.equal(duelloIptal(v, { id: duello.id, kullaniciId: A, tur: 'geri' }).ok, true);
    assert.equal(bakiye(v, G, A), 1000);
  });

  it('iptal edilmiş meydan okuma ikinci kez iade etmez', () => {
    const v = hazir();
    const { duello } = ac(v);
    duelloIptal(v, { id: duello.id, kullaniciId: A, tur: 'geri' });
    const tekrar = duelloIptal(v, { id: duello.id, kullaniciId: A, tur: 'geri' });
    assert.equal(tekrar.ok, false);
    assert.equal(bakiye(v, G, A), 1000);
  });

  it('süre aşımı: dolmadan iade etmez, dolunca iade eder', () => {
    const v = hazir();
    const { duello } = ac(v);
    assert.equal(suresiDolaniIadeEt(v, duello.id, T0 + DUELLO_SURE_MS - 1), null);
    assert.equal(bakiye(v, G, A), 900);
    const iade = suresiDolaniIadeEt(v, duello.id, T0 + DUELLO_SURE_MS);
    assert.equal(iade.id, duello.id);
    assert.equal(bakiye(v, G, A), 1000);
    assert.equal(suresiDolaniIadeEt(v, duello.id, T0 + DUELLO_SURE_MS + 1), null);
    assert.equal(bakiye(v, G, A), 1000);
  });

  it('açılışta bekleyen bütün meydan okumalar iade edilir', () => {
    const v = hazir();
    ekle(v, { guildId: G, kullaniciId: C, miktar: 500, tur: TURLER.yonetici });
    const d1 = ac(v).duello;
    const d2 = ac(v, { meydanId: C, rakipId: A, bahis: 200 }).duello;
    assert.equal(bakiye(v, G, A), 900);
    assert.equal(bakiye(v, G, C), 300);

    assert.equal(acikDuellolariIadeEt(v, T0 + 10), 2);
    assert.equal(bakiye(v, G, A), 1000);
    assert.equal(bakiye(v, G, C), 500);
    assert.equal(duelloGetir(v, d1.id), null);
    assert.equal(duelloGetir(v, d2.id), null);
    // Eski mesajdaki Kabul düğmesi artık geçersiz.
    assert.equal(duelloKabul(v, { id: d1.id, kullaniciId: B }).gecersiz, true);
    assert.equal(acikDuellolariIadeEt(v), 0);
  });
});
