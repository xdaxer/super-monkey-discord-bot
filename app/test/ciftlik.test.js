import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ayarYaz, sistemAyarla } from '../lib/ayarlar.js';
import {
  ARSALAR, birikmisHesapla, ciftlikAdi, ciftlikDurumu, ciftlikEtkisi, ciftlikKur, ciftlikSat, ciftlikTopla, ciftlikYukselt,
  eskiSeviyeleriIadeEt, gorselKodu, KILIT_SEVIYESI, sonrakiKademe, TABAN_DEPO_SAAT, TABAN_HIZ, UYE_ARSA_NO, UYE_ARSASI, YOLLAR,
} from '../lib/ciftlik.js';
import { acVeritabani } from '../lib/db.js';
import { bakiye, ekle, TURLER } from '../lib/ekonomi.js';
import { prestijYap } from '../lib/prestij.js';
import { kademeRolAnahtari } from '../lib/uyelik.js';
import { uyelikRolleriYaz } from '../lib/uyelik-carpan.js';

const G = 'g1';
const A = '100';
const SN = 1000;
const SAAT = 3_600_000;
const T0 = 1_000_000_000_000;

function hazir({ seviye = 5, para = 1_000_000 } = {}) {
  const db = acVeritabani(':memory:');
  db.prepare('INSERT INTO seviyeler (guild_id, kullanici_id, xp, seviye) VALUES (?, ?, 1, ?)').run(G, A, seviye);
  if (para) ekle(db, { guildId: G, kullaniciId: A, miktar: para, tur: TURLER.yonetici, simdi: 0 });
  return db;
}
const k = (ek = {}) => ({ guildId: G, kullaniciId: A, simdi: T0, ...ek });
const seviyeYaz = (db, s) => db.prepare('UPDATE seviyeler SET seviye = ? WHERE guild_id = ? AND kullanici_id = ?').run(s, G, A);
const yollarYaz = (db, arsa, yollar) => db.prepare('UPDATE ciftlikler SET yollar = ? WHERE arsa = ?').run(yollar, arsa);
const uyeYap = (db) => {
  sistemAyarla(db, G, 'uyelik', true);
  ayarYaz(db, G, kademeRolAnahtari(1), 'r1');
  uyelikRolleriYaz(db, G, A, ['r1']);
};
const yakin = (a, b) => Math.abs(a - b) < 1e-9;

describe('çiftlik sayıları', () => {
  it('yollar 5 kademe, artan bedel ve çarpan; arsalar artan bedel ve seviye', () => {
    assert.equal(YOLLAR.length, 3);
    for (const y of YOLLAR) {
      assert.equal(y.kademeler.length, 5);
      for (let i = 1; i < 5; i += 1) {
        assert.ok(y.kademeler[i].bedel > y.kademeler[i - 1].bedel, y.kimlik);
        assert.ok(y.kademeler[i].carpan >= y.kademeler[i - 1].carpan, y.kimlik);
      }
    }
    for (let i = 1; i < ARSALAR.length; i += 1) {
      assert.ok(ARSALAR[i].bedel > ARSALAR[i - 1].bedel);
      assert.ok(ARSALAR[i].seviye > ARSALAR[i - 1].seviye);
    }
    assert.equal(ARSALAR.length + 1, 8, 'haritada 8 arsa');
    assert.equal(ARSALAR[0].seviye, KILIT_SEVIYESI);
    assert.equal(UYE_ARSASI.seviye, KILIT_SEVIYESI);
  });

  it('etki: çarpanlar çarpılır, depo Depo yoluyla uzar, Pazar ile kısalır', () => {
    const t = ciftlikEtkisi([0, 0, 0]);
    assert.ok(yakin(t.hiz, TABAN_HIZ));
    assert.equal(t.depoSaat, TABAN_DEPO_SAAT);
    assert.ok(yakin(t.kapasite, TABAN_HIZ * 12 * 3600));
    assert.equal(t.satisOrani, 0.7);
    const u = ciftlikEtkisi([5, 2, 0]);
    assert.ok(yakin(u.carpan, 8 * 1.3));
    assert.equal(u.depoSaat, 24);
    const p = ciftlikEtkisi([2, 0, 5]);
    assert.ok(yakin(p.carpan, 1.6 * 9));
    assert.equal(p.depoSaat, 4);
    assert.equal(p.satisOrani, 0.9);
    assert.equal(ciftlikEtkisi([0, 2, 5]).depoSaat, 8);
    assert.equal(ciftlikEtkisi([0, 5, 2]).depoSaat, 72);
  });

  it('görsel ve ad en yüksek yoldan', () => {
    assert.equal(gorselKodu([0, 0, 0]), '000');
    assert.equal(gorselKodu([5, 2, 0]), '500');
    assert.equal(gorselKodu([2, 0, 4]), '004');
    assert.equal(gorselKodu([0, 3, 2]), '030');
    assert.equal(ciftlikAdi([0, 0, 0]), 'Muz Çiftliği');
    assert.equal(ciftlikAdi([2, 5, 0]), 'Maymunomi');
  });

  it('çapraz yol kuralı: bir yol 5, ikincisi en çok 2, üçüncüsü kapalı', () => {
    assert.equal(sonrakiKademe([2, 2, 0], 0).engel, null);
    assert.equal(sonrakiKademe([2, 2, 0], 2).engel, 'capraz');
    assert.equal(sonrakiKademe([3, 2, 0], 1).engel, 'capraz');
    assert.equal(sonrakiKademe([5, 0, 0], 0).engel, 'tavan');
    assert.equal(sonrakiKademe([0, 0, 0], 1).ad, 'Uzun Ömürlü Muzlar');
  });

  it('birikmiş saniye saniye artar, depoda durur', () => {
    const c = { yollar: [0, 0, 0], sonToplama: 0 };
    assert.ok(yakin(birikmisHesapla(c, SN), TABAN_HIZ));
    assert.ok(yakin(birikmisHesapla(c, SAAT), TABAN_HIZ * 3600));
    assert.ok(yakin(birikmisHesapla(c, 100 * SAAT), TABAN_HIZ * 12 * 3600));
  });
});

describe('kilit ve kurma', () => {
  it(`Sv ${KILIT_SEVIYESI} altında kilitli; hiçbir şey yazılmaz`, () => {
    const db = hazir({ seviye: 4 });
    const d = ciftlikDurumu(db, G, A, T0);
    assert.equal(d.kilitli, true);
    assert.equal(d.oyuncuSeviyesi, 4);
    assert.match(ciftlikKur(db, k({ arsa: 0 })).sebep, /Sv 5/);
    assert.equal(bakiye(db, G, A), 1_000_000);
  });

  it('kurar: bedel düşülür, arsa dolar, ikinci kez kurulmaz', () => {
    const db = hazir();
    assert.equal(ciftlikKur(db, k({ arsa: 0 })).ok, true);
    assert.equal(bakiye(db, G, A), 1_000_000 - ARSALAR[0].bedel);
    const d = ciftlikDurumu(db, G, A, T0);
    const c = d.arsalar[0].ciftlik;
    assert.deepEqual(c.yollar, [0, 0, 0]);
    assert.equal(c.gorsel, '000');
    assert.equal(c.harcanan, ARSALAR[0].bedel);
    assert.equal(c.satisDegeri, 2_100);
    assert.equal(c.yolDurumu[0].sonraki.ad, 'Artan Üretim');
    assert.equal(c.yolDurumu[0].sonraki.simge, 'u1');
    assert.ok(yakin(d.hiz, TABAN_HIZ));
    assert.match(ciftlikKur(db, k({ arsa: 0 })).sebep, /zaten/);
    const satir = db.prepare("SELECT miktar, karsi_id FROM ekonomi_hareketleri WHERE tur = 'ciftlik'").get();
    assert.deepEqual({ ...satir }, { miktar: -ARSALAR[0].bedel, karsi_id: 'kur-0' });
  });

  it('arsanın seviyesi ve bakiye yetmezse kurulmaz', () => {
    const db = hazir();
    assert.match(ciftlikKur(db, k({ arsa: 1 })).sebep, /Sv 8/);
    seviyeYaz(db, 8);
    assert.equal(ciftlikKur(db, k({ arsa: 1 })).ok, true);
    assert.equal(ciftlikKur(db, k({ arsa: 99 })).ok, false);
    const fakir = hazir({ para: 1_000 });
    assert.match(ciftlikKur(fakir, k({ arsa: 0 })).sebep, /yetmiyor/);
  });

  it('üye arsası yalnız üyeye açık; üyelik bitince çiftlik durur ama satılabilir', () => {
    const db = hazir();
    assert.match(ciftlikKur(db, k({ arsa: UYE_ARSA_NO })).sebep, /üyelerine özel/);
    uyeYap(db);
    assert.equal(ciftlikKur(db, k({ arsa: UYE_ARSA_NO })).ok, true);
    assert.equal(ciftlikTopla(db, k({ simdi: T0 + SAAT })).toplam, 28);

    uyelikRolleriYaz(db, G, A, []);
    const d = ciftlikDurumu(db, G, A, T0 + 2 * SAAT);
    assert.equal(d.arsalar[UYE_ARSA_NO].ciftlik.durdu, true);
    assert.equal(d.hiz, 0);
    assert.match(ciftlikTopla(db, k({ simdi: T0 + 2 * SAAT })).sebep, /durdu/);
    assert.match(ciftlikYukselt(db, k({ arsa: UYE_ARSA_NO, yol: 0 })).sebep, /durdu/);
    const s = ciftlikSat(db, k({ arsa: UYE_ARSA_NO, simdi: T0 + 2 * SAAT }));
    assert.deepEqual([s.ok, s.toplanan, s.iade], [true, 0, 3_500]);
  });
});

describe('toplama, yükseltme ve satış', () => {
  it('toplar: tam kısım bakiyeye geçer, kesir sonraya kalır', () => {
    const db = hazir();
    ciftlikKur(db, k({ arsa: 0 }));
    const once = bakiye(db, G, A);
    assert.match(ciftlikTopla(db, k({ simdi: T0 + 60 * SN })).sebep, /1 muz/); // 0,48 muz
    assert.equal(ciftlikTopla(db, k({ simdi: T0 + 1.5 * SAAT })).toplam, 43); // 43,2
    assert.equal(bakiye(db, G, A), once + 43);
    // Kalan 0,2 muz kaybolmaz: 1,5 saat daha → 43,2 + 0,2 = 43.
    assert.equal(ciftlikTopla(db, k({ simdi: T0 + 3 * SAAT })).toplam, 43);
    assert.ok(ciftlikDurumu(db, G, A, T0 + 3 * SAAT).birikmis < 1);
  });

  it('depo dolunca üretim durur; hepsini toplar', () => {
    const db = hazir({ seviye: 8 });
    ciftlikKur(db, k({ arsa: 0 }));
    ciftlikKur(db, k({ arsa: 1 }));
    const s = ciftlikTopla(db, k({ simdi: T0 + 100 * SAAT }));
    assert.equal(s.toplam, 2 * Math.floor(TABAN_HIZ * 12 * 3600));
    assert.deepEqual(s.toplanan.map((t) => t.arsa), [0, 1]);
  });

  it('yükseltir: önce birikmiş toplanır, bedel düşülür, hız artar, görsel değişir', () => {
    const db = hazir();
    ciftlikKur(db, k({ arsa: 0 }));
    const once = bakiye(db, G, A);
    const s = ciftlikYukselt(db, k({ arsa: 0, yol: 0, simdi: T0 + 2 * SAAT }));
    assert.equal(s.ok, true, s.sebep);
    assert.deepEqual([s.kademe, s.ad, s.toplanan], [1, 'Artan Üretim', 57]);
    assert.equal(bakiye(db, G, A), once + 57 - 1_500);
    const c = ciftlikDurumu(db, G, A, T0 + 2 * SAAT).arsalar[0].ciftlik;
    assert.deepEqual(c.yollar, [1, 0, 0]);
    assert.equal(c.gorsel, '100');
    assert.ok(yakin(c.hiz, TABAN_HIZ * 1.3));
    assert.equal(c.harcanan, 3_000 + 1_500);
    assert.equal(ciftlikYukselt(db, k({ arsa: 0, yol: 7 })).ok, false);
  });

  it('çapraz yol ve tavan reddedilir; bakiye yetmezse yükseltilmez', () => {
    const db = hazir();
    ciftlikKur(db, k({ arsa: 0 }));
    yollarYaz(db, 0, '3-2-0');
    assert.match(ciftlikYukselt(db, k({ arsa: 0, yol: 2 })).sebep, /kapalı/);
    assert.match(ciftlikYukselt(db, k({ arsa: 0, yol: 1 })).sebep, /kapalı/);
    assert.equal(ciftlikYukselt(db, k({ arsa: 0, yol: 0 })).ok, true);
    assert.equal(ciftlikYukselt(db, k({ arsa: 0, yol: 0 })).ok, true);
    assert.match(ciftlikYukselt(db, k({ arsa: 0, yol: 0 })).sebep, /en üstte/);

    const fakir = hazir({ para: ARSALAR[0].bedel });
    ciftlikKur(fakir, k({ arsa: 0 }));
    assert.match(ciftlikYukselt(fakir, k({ arsa: 0, yol: 0 })).sebep, /yetmiyor/);
    assert.match(ciftlikYukselt(fakir, k({ arsa: 3, yol: 0 })).sebep, /çiftliğin yok/);
  });

  it('satış: birikmiş toplanır, harcananın %70\'i (Muz Kurtarma ile %90) döner, arsa boşalır', () => {
    const db = hazir();
    ciftlikKur(db, k({ arsa: 0 }));
    ciftlikYukselt(db, k({ arsa: 0, yol: 2 }));
    const once = bakiye(db, G, A);
    const s = ciftlikSat(db, k({ arsa: 0, simdi: T0 + SAAT }));
    assert.equal(s.ok, true, s.sebep);
    assert.equal(s.iade, Math.floor((3_000 + 1_500) * 0.7));
    assert.equal(s.toplanan, Math.floor(TABAN_HIZ * 1.15 * 3600));
    assert.equal(bakiye(db, G, A), once + s.iade + s.toplanan);
    assert.equal(ciftlikDurumu(db, G, A, T0).arsalar[0].ciftlik, null);

    ciftlikKur(db, k({ arsa: 0 }));
    ciftlikYukselt(db, k({ arsa: 0, yol: 2 }));
    ciftlikYukselt(db, k({ arsa: 0, yol: 2 }));
    assert.equal(ciftlikSat(db, k({ arsa: 0 })).iade, Math.floor((3_000 + 1_500 + 3_500) * 0.9));
    assert.match(ciftlikSat(db, k({ arsa: 0 })).sebep, /çiftliğin yok/);
  });

  it('prestij çiftlikleri satar, değerini yeni cüzdana devreder', () => {
    const db = hazir();
    ekle(db, { guildId: G, kullaniciId: A, miktar: 5_000_000, tur: TURLER.calis, simdi: 1 });
    ciftlikKur(db, k({ arsa: 0 }));
    const p = prestijYap(db, { guildId: G, kullaniciId: A, simdi: T0 });
    assert.equal(p.ok, true, p.sebep);
    assert.deepEqual(p.devir, { ciftlik: 1, muz: Math.floor(ARSALAR[0].bedel * 0.7) });
    assert.equal(bakiye(db, G, A), Math.floor(ARSALAR[0].bedel * 0.7));
    assert.equal(ciftlikDurumu(db, G, A, T0).arsalar[0].ciftlik, null);
  });

  it('geçiş: eski seviyelerin yükseltme harcaması bir kez iade edilir', () => {
    const db = hazir();
    ciftlikKur(db, k({ arsa: 0 }));
    db.prepare('UPDATE ciftlikler SET seviye = 4').run();
    const once = bakiye(db, G, A);
    const iadeler = eskiSeviyeleriIadeEt(db, T0);
    assert.deepEqual(iadeler.map((i) => i.iade), [2_000 + 3_500 + 5_500]);
    assert.equal(bakiye(db, G, A), once + 11_000);
    assert.deepEqual(eskiSeviyeleriIadeEt(db, T0), []);
  });
});
