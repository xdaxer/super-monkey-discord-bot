import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { acVeritabani } from '../lib/db.js';
import { bakiye, ekle, TURLER } from '../lib/ekonomi.js';
import {
  agirlikliSec, BILET_FIYATI, biletAl, biletSayim, cekilisYap, duyurulacaklar, duyuruldu, haftaKimligi, havuzDurumu,
  havuzPayi, kazanmaOlasiligi, KISI_BASI_BILET, sonKazanan, sonrakiCekilis, TABAN_IKRAMIYE, TABAN_TAVANI, vadesiGelenCekilisler,
} from '../lib/piyango.js';

const G = 'g1';
const A = '100';
const B = '200';
const HAFTA = 7 * 86_400_000;
// 2026-10-11 Pazar 21:00 TR = 18:00 UTC
const PAZAR = Date.UTC(2026, 9, 11, 18, 0, 0);
const CUMA = Date.UTC(2026, 9, 9, 12, 0, 0);

function hazir(...kisiler) {
  const db = acVeritabani(':memory:');
  for (const k of kisiler) ekle(db, { guildId: G, kullaniciId: k, miktar: 100_000, tur: TURLER.yonetici, simdi: 0 });
  return db;
}

const al = (db, kisi, adet, simdi = CUMA) => biletAl(db, { guildId: G, kullaniciId: kisi, adet, simdi });
const sabit = (x) => () => x;

describe('çekiliş zamanı ve hafta sınırı', () => {
  it('sonraki çekiliş Pazar 21:00 TR', () => {
    assert.equal(sonrakiCekilis(CUMA), PAZAR);
    assert.equal(sonrakiCekilis(PAZAR - 1), PAZAR);
  });

  it('tam çekiliş anı ve sonrası bir sonraki haftaya sayılır', () => {
    assert.equal(sonrakiCekilis(PAZAR), PAZAR + HAFTA);
    assert.equal(sonrakiCekilis(PAZAR + 3_600_000), PAZAR + HAFTA);
    // Pazartesi 00:00 TR (Pazar 21:00 UTC) de yeni haftada
    assert.equal(sonrakiCekilis(Date.UTC(2026, 9, 11, 21, 0, 0)), PAZAR + HAFTA);
  });

  it('bilet sınırı hafta başına: çekilişten sonra sayaç sıfırdan başlar', () => {
    const db = hazir(A);
    assert.ok(al(db, A, KISI_BASI_BILET, PAZAR - 1000).ok);
    assert.equal(al(db, A, 1, PAZAR - 500).ok, false);
    const yeni = al(db, A, 5, PAZAR + 1000);
    assert.ok(yeni.ok);
    assert.equal(yeni.cekilis, PAZAR + HAFTA);
    assert.equal(yeni.sahip, 5);
  });
});

describe('bilet alma', () => {
  it('muz düşer, defterde piyango (−) ve hafta kimliği yazılır', () => {
    const db = hazir(A);
    const s = al(db, A, 3);
    assert.ok(s.ok);
    assert.equal(s.tutar, 3 * BILET_FIYATI);
    assert.equal(bakiye(db, G, A), 100_000 - 1500);
    const h = db.prepare("SELECT * FROM ekonomi_hareketleri WHERE tur = 'piyango'").get();
    assert.equal(h.miktar, -1500);
    assert.equal(h.karsi_id, haftaKimligi(PAZAR));
    assert.equal(biletSayim(db, G, A, PAZAR), 3);
  });

  it('kişi başı sınır: toplam 40, aşan reddedilir ve bakiye değişmez', () => {
    const db = hazir(A);
    assert.equal(KISI_BASI_BILET, 40);
    assert.ok(al(db, A, 35).ok);
    const r = al(db, A, 6);
    assert.equal(r.ok, false);
    assert.match(r.sebep, /en çok 5 daha/);
    assert.ok(al(db, A, 5).ok);
    assert.equal(al(db, A, 1).ok, false);
    assert.equal(bakiye(db, G, A), 100_000 - 40 * BILET_FIYATI);
  });

  it('bakiye yetmezse reddedilir, bilet yazılmaz', () => {
    const db = hazir();
    ekle(db, { guildId: G, kullaniciId: A, miktar: 600, tur: TURLER.yonetici, simdi: 0 });
    const r = al(db, A, 2);
    assert.equal(r.ok, false);
    assert.equal(bakiye(db, G, A), 600);
    assert.equal(biletSayim(db, G, A, PAZAR), 0);
    assert.equal(al(db, A, 0).ok, false);
  });
});

describe('havuz hesabı', () => {
  it('gelirin %90\'ı + taban', () => {
    assert.equal(havuzPayi(10_000), 9000);
    assert.equal(havuzPayi(500), 450);
    const db = hazir(A, B);
    al(db, A, 10);
    al(db, B, 10);
    const d = havuzDurumu(db, G, PAZAR);
    assert.equal(d.toplam, 20);
    assert.equal(d.havuz, TABAN_IKRAMIYE + 9000);
  });
});

describe('ağırlıklı seçim', () => {
  const biletler = [{ kullanici_id: B, adet: 3 }, { kullanici_id: A, adet: 1 }];
  it('bilet sayısı oranında aralık verir (A kimliğe göre önce)', () => {
    assert.equal(agirlikliSec(biletler, sabit(0)), A);
    assert.equal(agirlikliSec(biletler, sabit(0.24)), A);
    assert.equal(agirlikliSec(biletler, sabit(0.25)), B);
    assert.equal(agirlikliSec(biletler, sabit(0.9999)), B);
  });
  it('bilet yoksa kazanan yok', () => {
    assert.equal(agirlikliSec([], sabit(0.5)), null);
  });
});

describe('çekiliş', () => {
  it('kazanan havuzu alır, defterde ödül yazılır, ikinci çekiliş ödemez', () => {
    const db = hazir(A, B);
    al(db, A, 10);
    al(db, B, 10);
    const once = bakiye(db, G, B);
    const s = cekilisYap(db, { guildId: G, cekilis: PAZAR, rastgele: sabit(0.99), simdi: PAZAR });
    assert.equal(s.kazananId, B);
    assert.equal(s.havuz, TABAN_IKRAMIYE + 9000);
    assert.equal(bakiye(db, G, B), once + s.havuz);
    const odul = db.prepare("SELECT * FROM ekonomi_hareketleri WHERE tur = 'piyango' AND miktar > 0").get();
    assert.equal(odul.karsi_id, haftaKimligi(PAZAR));

    assert.equal(cekilisYap(db, { guildId: G, cekilis: PAZAR, rastgele: sabit(0.99), simdi: PAZAR }), null);
    assert.equal(bakiye(db, G, B), once + s.havuz);
    assert.equal(sonKazanan(db, G).kazanan_id, B);
  });

  it('net muz: gelirin %10\'u yok olur, taban yaratılır', () => {
    const db = hazir(A);
    const toplamOnce = bakiye(db, G, A);
    al(db, A, 20);
    cekilisYap(db, { guildId: G, cekilis: PAZAR, simdi: PAZAR });
    assert.equal(bakiye(db, G, A), toplamOnce - 10_000 + 9000 + TABAN_IKRAMIYE);
  });

  it('bilet yoksa taban basılmaz, sonraki havuza devreder (tavanlı)', () => {
    const db = hazir(A);
    const bos = cekilisYap(db, { guildId: G, cekilis: PAZAR, simdi: PAZAR });
    assert.equal(bos.kazananId, null);
    assert.equal(bos.durum, 'devir');
    assert.equal(bakiye(db, G, A), 100_000);
    assert.equal(havuzDurumu(db, G, PAZAR + HAFTA).havuz, 2 * TABAN_IKRAMIYE);

    for (let i = 1; i <= 6; i += 1) cekilisYap(db, { guildId: G, cekilis: PAZAR + i * HAFTA, simdi: PAZAR });
    assert.equal(havuzDurumu(db, G, PAZAR + 7 * HAFTA).havuz, TABAN_TAVANI);
  });

  it('devir kazanana biletle birlikte ödenir, sonraki hafta devir sıfırlanır', () => {
    const db = hazir(A);
    cekilisYap(db, { guildId: G, cekilis: PAZAR, simdi: PAZAR });
    al(db, A, 1, PAZAR + 1000);
    const s = cekilisYap(db, { guildId: G, cekilis: PAZAR + HAFTA, simdi: PAZAR + HAFTA });
    assert.equal(s.havuz, 2 * TABAN_IKRAMIYE + 450);
    assert.equal(havuzDurumu(db, G, PAZAR + 2 * HAFTA).havuz, TABAN_IKRAMIYE);
  });
});

describe('vadesi gelen çekilişler (açılış kurtarması)', () => {
  it('bot kapalıyken geçen çekiliş açılışta yapılır, bir kez', () => {
    const db = hazir(A);
    al(db, A, 4);
    assert.deepEqual(vadesiGelenCekilisler(db, { guildId: G, simdi: PAZAR - 1 }), []);
    const sonra = PAZAR + 2 * 3_600_000;
    const yapilan = vadesiGelenCekilisler(db, { guildId: G, simdi: sonra });
    assert.equal(yapilan.length, 1);
    assert.equal(yapilan[0].kazananId, A);
    assert.deepEqual(vadesiGelenCekilisler(db, { guildId: G, simdi: sonra }), []);
  });

  it('birkaç hafta kapalı kalınca eksik haftalar sırayla kaydedilir', () => {
    const db = hazir(A);
    al(db, A, 1);
    const yapilan = vadesiGelenCekilisler(db, { guildId: G, simdi: PAZAR + 3 * HAFTA + 1000 });
    assert.deepEqual(yapilan.map((y) => y.durum), ['bitti', 'devir', 'devir', 'devir']);
    assert.equal(havuzDurumu(db, G, PAZAR + 4 * HAFTA).havuz, 4 * TABAN_IKRAMIYE);
  });

  it('hiç bilet yoksa kayıt açılmaz', () => {
    const db = hazir(A);
    assert.deepEqual(vadesiGelenCekilisler(db, { guildId: G, simdi: PAZAR + 5 * HAFTA }), []);
  });

  it('ekonomi kapalıyken yalnız biletli hafta çekilir, boş hafta kaydı açılmaz', () => {
    const db = hazir(A);
    al(db, A, 1);
    const kapali = vadesiGelenCekilisler(db, { guildId: G, ekonomiAcik: false, simdi: PAZAR + 2 * HAFTA + 1000 });
    assert.equal(kapali.length, 1);
    assert.equal(kapali[0].durum, 'bitti');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM piyango_cekilisleri').get().n, 1);
  });
});

describe('duyuru kaydı', () => {
  it('kazananlı çekiliş duyurulacaklarda çıkar, koşullu işaretlenir', () => {
    const db = hazir(A);
    al(db, A, 1);
    cekilisYap(db, { guildId: G, cekilis: PAZAR, simdi: PAZAR });
    assert.equal(duyurulacaklar(db, G, PAZAR).length, 1);
    assert.equal(duyuruldu(db, G, PAZAR), true);
    assert.equal(duyuruldu(db, G, PAZAR), false);
    assert.equal(duyurulacaklar(db, G, PAZAR).length, 0);
  });
});

describe('yöneticiler kazanamaz', () => {
  it('yöneticinin biletleri havuza girer ama kazanan hep diğeridir', () => {
    for (const x of [0, 0.5, 0.9999]) {
      const kopya = hazir(A, B);
      al(kopya, A, 20);
      al(kopya, B, 1);
      const s = cekilisYap(kopya, {
        guildId: G, cekilis: PAZAR, rastgele: sabit(x), simdi: PAZAR, haric: [A],
      });
      assert.equal(s.kazananId, B);
      assert.equal(s.havuz, TABAN_IKRAMIYE + havuzPayi(21 * BILET_FIYATI));
    }
  });
  it('yalnız yönetici bilet aldıysa kazanan çıkmaz, havuz devreder', () => {
    const db = hazir(A);
    al(db, A, 5);
    const s = cekilisYap(db, {
      guildId: G, cekilis: PAZAR, rastgele: sabit(0.3), simdi: PAZAR, haric: [A],
    });
    assert.equal(s.kazananId, null);
    assert.equal(s.durum, 'devir');
  });
  it('olasılık yöneticinin biletlerini saymaz; yöneticininki 0', () => {
    const db = hazir(A, B);
    al(db, A, 20);
    al(db, B, 2);
    assert.equal(kazanmaOlasiligi(db, G, B, PAZAR, [A]), 100);
    assert.equal(kazanmaOlasiligi(db, G, A, PAZAR, [A]), 0);
    assert.equal(kazanmaOlasiligi(db, G, B, PAZAR, []), (2 / 22) * 100);
  });
});
