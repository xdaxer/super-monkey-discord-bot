import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ayarYaz, sistemAyarla } from '../lib/ayarlar.js';
import { baslat, hamle } from '../lib/blackjack.js';
import { acVeritabani } from '../lib/db.js';
import { bakiye, ekle, TURLER } from '../lib/ekonomi.js';
import { CASHBACK_BAHIS_TAVAN_YUZDE, CASHBACK_YUZDE, cashbackHesapla } from '../lib/kumar-cashback.js';
import { bahisOyna } from '../lib/kumar.js';
import { minesAc, minesBaslat } from '../lib/mines.js';
import { kademeRolAnahtari } from '../lib/uyelik.js';
import { uyelikRolleriYaz } from '../lib/uyelik-carpan.js';

const G = 'g';
const UYE = 'uye';
const DIGER = 'diger';
const GUN = 86_400_000;
const T = Date.UTC(2026, 9, 10, 9); // TR öğlen

function hazir() {
  const db = acVeritabani(':memory:');
  sistemAyarla(db, G, 'uyelik', true);
  sistemAyarla(db, G, 'ekonomi', true);
  ayarYaz(db, G, kademeRolAnahtari(1), 'r1');
  uyelikRolleriYaz(db, G, UYE, ['r1']);
  for (const k of [UYE, DIGER]) ekle(db, { guildId: G, kullaniciId: k, miktar: 1000, tur: TURLER.yonetici });
  return db;
}

describe('Katıl kumar cashback', () => {
  it('kaybın %10\'u aşağı yuvarlanır; kazanç ve beraberlikte yok', () => {
    assert.equal(CASHBACK_YUZDE, 10);
    assert.equal(cashbackHesapla(-100), 10);
    assert.equal(cashbackHesapla(-55), 5);
    assert.equal(cashbackHesapla(-9), 0);
    assert.equal(cashbackHesapla(0), 0);
    assert.equal(cashbackHesapla(50), 0);
  });

  it('iade günün toplam bahsinin %1\'ini geçmez', () => {
    assert.equal(CASHBACK_BAHIS_TAVAN_YUZDE, 1);
    assert.equal(cashbackHesapla(-100, 100), 1); // tek kayıp: %10 değil, bahsin %1'i
    assert.equal(cashbackHesapla(-100, 5_000), 10); // çok oynanmış gün: net zararın %10'u
    assert.equal(cashbackHesapla(-1_000, 20_000), 100);
    assert.equal(cashbackHesapla(-1_000, 99), 0);
  });

  it('günde tek büyük kayıplı bahis kâr ettirmez (sigorta değil)', () => {
    const db = hazir();
    ekle(db, { guildId: G, kullaniciId: UYE, miktar: 9_000, tur: TURLER.yonetici });
    const s = bahisOyna(db, { guildId: G, kullaniciId: UYE, bahis: 10_000, oyun: () => ({ carpan: 0 }), simdi: T });
    assert.equal(s.cashback, 100); // 1.000 değil
    assert.equal(bakiye(db, G, UYE), 100);
  });

  it('bahisOyna: yalnız Katıl üyesi kayıpta iade alır', () => {
    const db = hazir();
    const kaybet = () => ({ carpan: 0 });
    const uye = bahisOyna(db, { guildId: G, kullaniciId: UYE, bahis: 100, oyun: kaybet, simdi: T });
    assert.equal(uye.cashback, 1);
    assert.equal(uye.net, -100);
    assert.equal(uye.bakiye, 901);
    assert.equal(bakiye(db, G, UYE), 901);

    const diger = bahisOyna(db, { guildId: G, kullaniciId: DIGER, bahis: 100, oyun: kaybet, simdi: T });
    assert.equal(diger.cashback, 0);
    assert.equal(bakiye(db, G, DIGER), 900);
  });

  it('iade günün net zararına göre: kazanç önceki kayıpları siler', () => {
    const db = hazir();
    const oyna = (carpan, bahis = 100) => bahisOyna(db, {
      guildId: G, kullaniciId: UYE, bahis, oyun: () => ({ carpan }), simdi: T,
    });
    // Hak = min(net zararın %10'u, toplam bahsin %1'i).
    assert.equal(oyna(2).cashback, 0); // gün +100
    assert.equal(oyna(0).cashback, 0); // gün 0
    assert.equal(oyna(0).cashback, 3); // gün −100, bahis 300 → 3
    assert.equal(oyna(0.5).cashback, 1); // gün −150, bahis 400 → 4, 3 ödendi
    assert.equal(oyna(2).cashback, 0); // gün −50, bahis 500 → 5; kazançta eksik ödenmez
    assert.equal(oyna(0).cashback, 2); // gün −150, bahis 600 → 6, 4 ödendi
    assert.equal(oyna(3).cashback, -6); // gün +50 → 0; fazla 6 geri
    assert.equal(bakiye(db, G, UYE), 1050);
  });

  it('çok oynayarak kâr edilemez: toplam iade net zararın %10\'unu aşmaz', () => {
    const db = hazir();
    ekle(db, { guildId: G, kullaniciId: UYE, miktar: 100_000, tur: TURLER.yonetici });
    const baslangic = bakiye(db, G, UYE);
    // Yazı-tura benzeri: sırayla kazan (1,95x) / kaybet.
    for (let i = 0; i < 200; i += 1) {
      bahisOyna(db, {
        guildId: G, kullaniciId: UYE, bahis: 100, oyun: () => ({ carpan: i % 2 ? 1.95 : 0 }), simdi: T,
      });
    }
    const net = bakiye(db, G, UYE) - baslangic;
    assert.ok(net < 0, `net ${net}`);
    assert.equal(net, -500 + 50); // 100 tur × −5 = −500, iadesi 50
  });

  it('yeni Türkiye gününde sayaç sıfırlanır', () => {
    const db = hazir();
    const kaybet = () => ({ carpan: 0 });
    bahisOyna(db, { guildId: G, kullaniciId: UYE, bahis: 100, oyun: kaybet, simdi: T });
    const yarin = bahisOyna(db, { guildId: G, kullaniciId: UYE, bahis: 100, oyun: kaybet, simdi: T + GUN });
    assert.equal(yarin.cashback, 1);
  });

  it('süren oyunun bahsi zarara sayılmaz', () => {
    const db = hazir();
    ekle(db, { guildId: G, kullaniciId: UYE, miktar: 10_000, tur: TURLER.yonetici });
    minesBaslat(db, { guildId: G, kullaniciId: UYE, bahis: 10_000, mayin: 1, simdi: T });
    const s = bahisOyna(db, { guildId: G, kullaniciId: UYE, bahis: 100, oyun: () => ({ carpan: 0 }), simdi: T });
    assert.equal(s.cashback, 1); // 10.000'lik açık bahis ne zarara ne bahis toplamına girer
  });

  it('üyelik sistemi kapalıyken iade yok', () => {
    const db = hazir();
    sistemAyarla(db, G, 'uyelik', false);
    const s = bahisOyna(db, { guildId: G, kullaniciId: UYE, bahis: 100, oyun: () => ({ carpan: 0 }) });
    assert.equal(s.cashback, 0);
    assert.equal(bakiye(db, G, UYE), 900);
  });

  it('blackjack: kaybedilen elde iade', () => {
    const db = hazir();
    baslat(db, { guildId: G, kullaniciId: UYE, bahis: 100, deste: ['10♠', '7♥', '10♦', '9♣'], simdi: T });
    const son = hamle(db, { guildId: G, kullaniciId: UYE, tur: 'dur', simdi: T });
    assert.equal(son.el.sonuc, 'kaybetti');
    assert.equal(son.el.cashback, 1);
    assert.equal(bakiye(db, G, UYE), 901);
  });

  it('mines: mayına basınca iade', () => {
    const db = hazir();
    const { oyun } = minesBaslat(db, { guildId: G, kullaniciId: UYE, bahis: 100, mayin: 3, simdi: T });
    const s = minesAc(db, { id: oyun.id, kullaniciId: UYE, hucre: oyun.mayinlar[0], simdi: T });
    assert.equal(s.bitti.tur, 'patladi');
    assert.equal(s.bitti.cashback, 1);
    assert.equal(s.bitti.bakiye, 901);
    assert.equal(bakiye(db, G, UYE), 901);
  });
});
