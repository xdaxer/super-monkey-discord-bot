import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PermissionFlagsBits } from 'discord.js';

import { yoneticiMi } from '../commands/ekonomi/ekonomi-yonet.js';
import { execute as bossKomutu } from '../commands/ekonomi/boss.js';
import {
  aktifBoss, aktifUyeSayisi, beklenenKatilimci, BOSSLAR, bossCikar, canHesapla, DURUMLAR, ELIT_CAN_CARPANI,
  hasarHesapla, hasarSirasi, HASAR_MUZ, HASAR_TABAN, kartGucu, KATILIM_MUZ, odulHesapla,
  MIN_CAN, saldir, SALDIRI_BEKLEME_MS, SON_VURUS_MUZ, sonCikis, sonrakiCikis, sonuclandir, suresiDolanlar,
  SURE_MS, KISI_CAN, TELAFI_MS, TESELLI_MUZ, vadesiGelenBoss,
} from '../lib/boss.js';
import { canCubugu, saldirButonuMu, SALDIR_BUTON_ID } from '../lib/boss-bilesen.js';
import { acVeritabani } from '../lib/db.js';
import { bakiye, ekle, TURLER } from '../lib/ekonomi.js';
import { kategoriBul } from '../lib/ekonomi-panel.js';
import { adet } from '../lib/envanter.js';

const G = 'g1';
const SAAT = 3_600_000;
const GUN = 86_400_000;
// 2026-10-10 Cumartesi 20:00 TR = 17:00 UTC
const CUMARTESI = Date.UTC(2026, 9, 10, 17, 0, 0);
const sabit = (...d) => {
  let i = 0;
  return () => d[Math.min(i++, d.length - 1)];
};

function hazir(...kisiler) {
  const db = acVeritabani(':memory:');
  for (const k of kisiler) ekle(db, { guildId: G, kullaniciId: k, miktar: 1000, tur: TURLER.yonetici, simdi: CUMARTESI });
  return db;
}

describe('çıkış zamanı ve telafi', () => {
  it('Cumartesi 20:00 TR; tam an sonrakine sayılır', () => {
    assert.equal(sonrakiCikis(CUMARTESI - 1), CUMARTESI);
    assert.equal(sonrakiCikis(CUMARTESI), CUMARTESI + 7 * GUN);
    assert.equal(sonCikis(CUMARTESI), CUMARTESI);
    assert.equal(sonCikis(CUMARTESI + 2 * GUN), CUMARTESI);
  });

  it('vakit gelmeden çıkmaz, gelince bir kez çıkar', () => {
    const db = hazir('1');
    assert.equal(vadesiGelenBoss(db, { guildId: G, simdi: CUMARTESI - 1 }), null);
    const b = vadesiGelenBoss(db, { guildId: G, simdi: CUMARTESI + 1000 });
    assert.ok(b);
    assert.equal(b.cikis, CUMARTESI);
    assert.equal(b.bitis, CUMARTESI + 1000 + SURE_MS);
    assert.equal(vadesiGelenBoss(db, { guildId: G, simdi: CUMARTESI + 2000 }), null);
  });

  it('bot kapalıyken kaçan çıkış telafi penceresinde açılışta çıkar, sonra çıkmaz', () => {
    const db = hazir('1');
    assert.ok(vadesiGelenBoss(db, { guildId: G, simdi: CUMARTESI + TELAFI_MS - 1 }));
    const db2 = hazir('1');
    assert.equal(vadesiGelenBoss(db2, { guildId: G, simdi: CUMARTESI + TELAFI_MS + 1 }), null);
  });

  it('aktif boss varken ikincisi çıkmaz', () => {
    const db = hazir('1');
    assert.ok(bossCikar(db, { guildId: G, simdi: CUMARTESI }));
    assert.equal(bossCikar(db, { guildId: G, simdi: CUMARTESI }), null);
  });
});

describe('can ölçekleme ve elit', () => {
  it('aktif üye sayısı yalnız son 7 günü sayar', () => {
    const db = hazir('1', '2');
    ekle(db, { guildId: G, kullaniciId: '3', miktar: 5, tur: TURLER.yonetici, simdi: CUMARTESI - 8 * GUN });
    assert.equal(aktifUyeSayisi(db, G, CUMARTESI), 2);
  });

  it('can beklenen katılımcı × kişi canı, alt sınırlı; boss ve elit çarpanıyla', () => {
    assert.equal(canHesapla(1, 'bloonarius', false), MIN_CAN);
    assert.equal(canHesapla(100, 'bloonarius', false), 100 * KISI_CAN);
    assert.equal(canHesapla(100, 'blastapopoulos', false), Math.round(100 * KISI_CAN * 1.5));
    assert.equal(canHesapla(100, 'bloonarius', true), Math.round(100 * KISI_CAN * ELIT_CAN_CARPANI));
  });

  it('ilk boss: beklenen katılımcı aktif üyenin %30\'u (en az 5)', () => {
    const db = hazir(...Array.from({ length: 40 }, (_, i) => String(i + 1)));
    assert.equal(beklenenKatilimci(db, G, CUMARTESI), 12);
    const b = bossCikar(db, { guildId: G, kimlik: 'bloonarius', elit: false, simdi: CUMARTESI });
    assert.equal(b.max_can, 12 * KISI_CAN);
    assert.equal(b.can, b.max_can);
    assert.equal(b.aktif_uye, 40);
    assert.equal(b.beklenen, 12);
    assert.equal(beklenenKatilimci(hazir('1'), G, CUMARTESI), 5);
  });

  it('sonraki bosslar: son 3 sonuçlanmış bossun ortalama katılımcısı', () => {
    const db = hazir('1');
    let cikis = 0;
    const savas = (katilimci, durum = 'kacti') => {
      const { lastInsertRowid: id } = db.prepare(
        `INSERT INTO boss_savaslari (guild_id, boss, max_can, can, baslangic, bitis, durum, cikis)
         VALUES (?, 'lych', 1, 1, 0, 1, ?, ?)`,
      ).run(G, durum, cikis += 1);
      for (let i = 0; i < katilimci; i += 1) {
        db.prepare('INSERT INTO boss_hasarlari (savas_id, kullanici_id, hasar) VALUES (?, ?, 1)').run(id, `u${i}`);
      }
    };
    savas(100); savas(20); savas(24); savas(27, 'yenildi');
    assert.equal(beklenenKatilimci(db, G, CUMARTESI), 24); // (20 + 24 + 27) / 3 = 23,7; ilk savaş bakılmaz
  });

  it('%15 elit: rastgele < 0,15 elit, değilse normal; altı boss var', () => {
    assert.equal(BOSSLAR.length, 6);
    const e = bossCikar(hazir('1'), { guildId: G, rastgele: sabit(0, 0.1), simdi: CUMARTESI });
    assert.equal(e.boss, 'bloonarius');
    assert.equal(e.elit, 1);
    assert.equal(bossCikar(hazir('1'), { guildId: G, rastgele: sabit(0.99, 0.15), simdi: CUMARTESI }).elit, 0);
    assert.equal(bossCikar(hazir('1'), { guildId: G, rastgele: sabit(0.99, 0.5), simdi: CUMARTESI }).boss, 'blastapopoulos');
  });
});

describe('hasar hesabı', () => {
  it('kart gücü en değerli 5 karttan; parlak 2 kat', () => {
    const sahip = {
      'kart-dart_monkey': 1, // 10
      'kart-wizard': 1, // 25
      'parlak:kart-dart_monkey': 1, // 20
    };
    assert.equal(kartGucu(sahip), 10 + 25 + 20);
    assert.equal(kartGucu({}), 0);
    const cok = {};
    for (const k of ['dart_monkey', 'boomerang', 'bomb_shooter', 'tack_shooter', 'ice_monkey', 'glue_gunner', 'sniper']) cok[`kart-${k}`] = 1;
    assert.equal(kartGucu(cok), 50); // yalnız 5 kart sayılır
  });

  it('orta değerde taban hasar, uçlarda ±%15, kritik 2 kat', () => {
    assert.equal(hasarHesapla(0, sabit(0.5, 0.99)).hasar, HASAR_TABAN);
    assert.equal(hasarHesapla(0, sabit(0.5, 0.99)).kritik, false);
    assert.equal(hasarHesapla(0, sabit(0, 0.99)).hasar, 85);
    assert.equal(hasarHesapla(0, sabit(1, 0.99)).hasar, 115);
    const k = hasarHesapla(50, sabit(0.5, 0.05));
    assert.equal(k.kritik, true);
    assert.equal(k.hasar, 300);
  });
});

describe('saldırı ve bekleme', () => {
  it('hasar yazılır, bekleme dolmadan ikinci saldırı reddedilir, sonra yeniden', () => {
    const db = hazir('1');
    bossCikar(db, { guildId: G, kimlik: 'bloonarius', elit: false, simdi: CUMARTESI });
    const s1 = saldir(db, { guildId: G, kullaniciId: '1', rastgele: sabit(0.5, 0.99), simdi: CUMARTESI + 1000 });
    assert.equal(s1.ok, true);
    assert.equal(s1.hasar, HASAR_TABAN);
    assert.equal(s1.sonrakiSaldiri, CUMARTESI + 1000 + SALDIRI_BEKLEME_MS);
    assert.equal(aktifBoss(db, G).can, MIN_CAN - HASAR_TABAN);

    const s2 = saldir(db, { guildId: G, kullaniciId: '1', rastgele: sabit(0.5, 0.99), simdi: CUMARTESI + 2000 });
    assert.equal(s2.ok, false);
    assert.equal(s2.kalanMs, SALDIRI_BEKLEME_MS - 1000);
    assert.equal(aktifBoss(db, G).can, MIN_CAN - HASAR_TABAN);

    const s3 = saldir(db, {
      guildId: G, kullaniciId: '1', rastgele: sabit(0.5, 0.99), simdi: CUMARTESI + 1000 + SALDIRI_BEKLEME_MS,
    });
    assert.equal(s3.ok, true);
    assert.equal(hasarSirasi(db, 1)[0].saldiri, 2);
  });

  it('boss yokken ve süre dolunca saldırı olmaz', () => {
    const db = hazir('1');
    assert.equal(saldir(db, { guildId: G, kullaniciId: '1', simdi: CUMARTESI }).ok, false);
    bossCikar(db, { guildId: G, simdi: CUMARTESI });
    const s = saldir(db, { guildId: G, kullaniciId: '1', simdi: CUMARTESI + SURE_MS });
    assert.equal(s.ok, false);
    assert.equal(s.bitti.durum, DURUMLAR.kacti);
  });

  it('taşan hasar sayılmaz, can sıfırın altına inmez', () => {
    const db = hazir('1');
    const b = bossCikar(db, { guildId: G, kimlik: 'bloonarius', elit: false, simdi: CUMARTESI });
    db.prepare('UPDATE boss_savaslari SET can = 40 WHERE id = ?').run(b.id);
    const s = saldir(db, { guildId: G, kullaniciId: '1', rastgele: sabit(0.5, 0.99), simdi: CUMARTESI });
    assert.equal(s.hasar, 40);
    assert.equal(s.sonVurus, true);
    assert.equal(hasarSirasi(db, b.id)[0].hasar, 40);
  });
});

/** Üç savaşçı: 1 -> 300, 2 -> 100 hasar yazılı, kalan can 100 (3. kişi son vuruşu yapacak). */
function yenilmeyeHazir({ elit = false } = {}) {
  const db = hazir('1', '2', '3');
  const b = bossCikar(db, { guildId: G, kimlik: 'bloonarius', elit, simdi: CUMARTESI });
  const ekleHasar = db.prepare(
    'INSERT INTO boss_hasarlari (savas_id, kullanici_id, hasar, saldiri, son_saldiri) VALUES (?, ?, ?, 1, ?)',
  );
  ekleHasar.run(b.id, '1', 300, CUMARTESI);
  ekleHasar.run(b.id, '2', 100, CUMARTESI);
  db.prepare('UPDATE boss_savaslari SET can = 100 WHERE id = ?').run(b.id);
  return { db, b };
}

const sonVurusYap = (db) => saldir(db, {
  guildId: G, kullaniciId: '3', rastgele: sabit(0.5, 0.99), simdi: CUMARTESI + SAAT,
});

describe('yenilme ödülü', () => {
  it('herkese 1.000 + 2 × hasar, herkese Ahşap, top 3 Altın, son vuruşa ek; durum güncellenir', () => {
    const { db, b } = yenilmeyeHazir();
    const onceki = { 1: bakiye(db, G, '1'), 2: bakiye(db, G, '2'), 3: bakiye(db, G, '3') };
    const s = sonVurusYap(db);
    assert.equal(s.sonVurus, true);
    assert.equal(s.sonuc.durum, DURUMLAR.yenildi);

    // Hasarlar 300, 100 ve son vuruşun 100'ü.
    const pay = (h) => KATILIM_MUZ + HASAR_MUZ * h;
    assert.equal(pay(300), 1_600);
    assert.equal(s.sonuc.dagitilan, pay(300) + 2 * pay(100));
    assert.equal(bakiye(db, G, '1') - onceki[1], pay(300));
    assert.equal(bakiye(db, G, '2') - onceki[2], pay(100));
    assert.equal(bakiye(db, G, '3') - onceki[3], pay(100) + SON_VURUS_MUZ);
    for (const k of ['1', '2', '3']) {
      assert.equal(adet(db, G, k, 'kasa-ahsap'), 1);
      assert.equal(adet(db, G, k, 'kasa-altin'), 1); // üç kişi de ilk 3
    }
    assert.equal(adet(db, G, '3', 'kasa-demir'), 1);
    assert.equal(adet(db, G, '1', 'kasa-demir'), 0);
    assert.equal(db.prepare('SELECT durum FROM boss_savaslari WHERE id = ?').get(b.id).durum, DURUMLAR.yenildi);
  });

  it('dördüncü ve sonrası Altın almaz', () => {
    const { db, b } = yenilmeyeHazir();
    db.prepare('INSERT INTO boss_hasarlari (savas_id, kullanici_id, hasar, saldiri, son_saldiri) VALUES (?, ?, 1, 1, ?)').run(b.id, '4', CUMARTESI);
    sonVurusYap(db);
    assert.equal(adet(db, G, '4', 'kasa-altin'), 0);
    assert.equal(adet(db, G, '4', 'kasa-ahsap'), 1);
    assert.equal(bakiye(db, G, '4'), KATILIM_MUZ + HASAR_MUZ); // hesabı yok: 1 hasar
  });

  it('ödeme bir kez yapılır', () => {
    const { db, b } = yenilmeyeHazir();
    sonVurusYap(db);
    const once = bakiye(db, G, '1');
    assert.equal(sonuclandir(db, { savasId: b.id, simdi: CUMARTESI + 2 * SAAT }), null);
    assert.equal(suresiDolanlar(db, G, CUMARTESI + 3 * SURE_MS).length, 0);
    assert.equal(bakiye(db, G, '1'), once);
    assert.equal(adet(db, G, '1', 'kasa-ahsap'), 1);
  });

  it('elit: birinci kasa Elmas; muz yine 1.000 + 2 × hasar', () => {
    const { db } = yenilmeyeHazir({ elit: true });
    const once = bakiye(db, G, '2');
    sonVurusYap(db);
    assert.equal(bakiye(db, G, '2') - once, KATILIM_MUZ + HASAR_MUZ * 100);
    assert.equal(adet(db, G, '1', 'kasa-elmas'), 1);
    assert.equal(adet(db, G, '2', 'kasa-elmas'), 0);
  });

  it('muz boss türüyle defterde; panel kategorisi boss', () => {
    const { db } = yenilmeyeHazir();
    sonVurusYap(db);
    const n = db.prepare("SELECT COUNT(*) AS n FROM ekonomi_hareketleri WHERE tur = 'boss' AND karsi_id = 'boss-1'").get().n;
    assert.equal(n, 3);
    assert.equal(kategoriBul('boss', 'diger'), 'boss');
  });

  it('ödül formülü: 1.000 + 2 × hasar (ortalama katılımcı ~900 hasar → 2.800)', () => {
    assert.equal(odulHesapla(0), 1_000);
    assert.equal(odulHesapla(900), 2_800);
  });
});

describe('kaçma tesellisi', () => {
  it('süre dolunca katılan herkese sabit teselli, bir kez; katılmayana yok', () => {
    const db = hazir('1', '2', '3');
    const b = bossCikar(db, { guildId: G, simdi: CUMARTESI });
    saldir(db, { guildId: G, kullaniciId: '1', rastgele: sabit(0.5, 0.99), simdi: CUMARTESI + 1000 });
    saldir(db, { guildId: G, kullaniciId: '2', rastgele: sabit(0.5, 0.99), simdi: CUMARTESI + 1000 });
    const once = bakiye(db, G, '1');
    assert.equal(suresiDolanlar(db, G, CUMARTESI + SURE_MS - 1).length, 0);
    const [s] = suresiDolanlar(db, G, CUMARTESI + SURE_MS);
    assert.equal(s.durum, DURUMLAR.kacti);
    assert.equal(bakiye(db, G, '1') - once, TESELLI_MUZ);
    assert.equal(bakiye(db, G, '3'), 1000);
    assert.equal(adet(db, G, '1', 'kasa-ahsap'), 0);
    assert.equal(suresiDolanlar(db, G, CUMARTESI + SURE_MS + 1).length, 0);
    assert.equal(sonuclandir(db, { savasId: b.id, simdi: CUMARTESI + SURE_MS + 5 }), null);
    assert.equal(bakiye(db, G, '1') - once, TESELLI_MUZ);
  });
});

describe('yönetici denetimi ve buton', () => {
  const kullanici = (izin) => ({
    memberPermissions: { has: (b) => izin && b === PermissionFlagsBits.Administrator },
  });

  it('yoneticiMi yalnız Yönetici yetkisini kabul eder', () => {
    assert.equal(yoneticiMi(kullanici(true)), true);
    assert.equal(yoneticiMi(kullanici(false)), false);
  });

  it('/boss cagir Yönetici olmayana reddedilir', async () => {
    const yanitlar = [];
    await bossKomutu({
      guildId: G,
      options: { getSubcommand: () => 'cagir' },
      ...kullanici(false),
      reply: async (x) => yanitlar.push(x),
    }, acVeritabani(':memory:'));
    assert.equal(yanitlar.length, 1);
    assert.match(yanitlar[0].content, /Yönetici/);
  });

  it('buton kimliği tanınır, başkası tanınmaz', () => {
    assert.equal(saldirButonuMu(SALDIR_BUTON_ID), true);
    assert.equal(saldirButonuMu('kasa:ac:ahsap:1'), false);
    assert.equal(saldirButonuMu(undefined), false);
  });

  it('can çubuğu: dolu/boş blok ve sayı', () => {
    assert.match(canCubugu(1000, 1000), /^█{20} 1\.000 \/ 1\.000$/);
    assert.match(canCubugu(0, 1000), /^░{20} 0 \/ 1\.000$/);
    assert.match(canCubugu(999, 1000), /^█{19}░ /);
    assert.match(canCubugu(1, 1000), /^█░{19} /);
  });
});
