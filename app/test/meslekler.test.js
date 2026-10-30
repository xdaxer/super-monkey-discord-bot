import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { acVeritabani } from '../lib/db.js';
import { bakiye } from '../lib/ekonomi.js';
import { etkinlikBaslat } from '../lib/etkinlik.js';
import { adet, esyaDus, esyaEkle, serbestEnvanter } from '../lib/envanter.js';
import { esyaGetir, esyaVer, rozetCalisBonusu } from '../lib/esyalar.js';
import { toptanSat } from '../lib/kasalar.js';
import {
  calisanMaymun, direnc, maymunBirak, maymunKilitle, maymunlar, maymunMu, seviyeHesapla, seviyeXp,
} from '../lib/maymun.js';
import {
  acikMeslekler, BEKLEME_MS, BONUS_AHSAP, BONUS_DEMIR, bonusKasa, calis, calismaDurumu, ENERJI_DOLUM_MS, ENERJI_MAKS,
  enYuksekMeslek, kalanBekleme, MESLEKLER, meslekSec, OTOMATIK, sonrakiMeslek, YORGUNLUK,
} from '../lib/meslekler.js';

const G = 'g1';
const A = '100';
const SA = 3_600_000;
const T0 = Date.parse('2026-01-05T12:00:00+03:00');

const db = () => acVeritabani(':memory:');
const seviyeAyarla = (v, seviye, kullaniciId = A) => v
  .prepare('INSERT OR REPLACE INTO seviyeler (guild_id, kullanici_id, xp, seviye) VALUES (?, ?, 0, ?)')
  .run(G, kullaniciId, seviye);
/** Sırayla verilen değerleri döner: [kazanç, bonus zarı, olay, ...]; sonuncusu tekrarlanır. */
const dizi = (...d) => { let i = 0; return () => d[Math.min(i++, d.length - 1)]; };
const calisBir = (v, ek = {}) => calis(v, { guildId: G, kullaniciId: A, simdi: T0, rastgele: () => 0.5, ...ek });

describe('meslek tablosu', () => {
  it('eşikler ve aralıklar artan, her mesleğin 4-6 olayı var', () => {
    for (let i = 1; i < MESLEKLER.length; i += 1) {
      assert.ok(MESLEKLER[i].seviye > MESLEKLER[i - 1].seviye);
      assert.ok(MESLEKLER[i].min > MESLEKLER[i - 1].min);
      assert.ok(MESLEKLER[i].max > MESLEKLER[i - 1].max);
    }
    for (const m of MESLEKLER) {
      assert.ok(m.min < m.max);
      assert.ok(m.olaylar.length >= 4 && m.olaylar.length <= 6, m.ad);
      assert.ok(m.olaylar.every((o) => o.includes('{n}')));
    }
    assert.equal(MESLEKLER[0].seviye, 0);
  });

  it('seviyeye göre açık meslek ve sıradaki', () => {
    assert.equal(enYuksekMeslek(0).kimlik, 'dart');
    assert.equal(enYuksekMeslek(2).kimlik, 'dart');
    assert.equal(enYuksekMeslek(3).kimlik, 'bumerang');
    assert.equal(enYuksekMeslek(14).kimlik, 'ninja');
    assert.equal(enYuksekMeslek(999).kimlik, 'super');
    assert.equal(acikMeslekler(5).length, 3);
    assert.equal(sonrakiMeslek(0).kimlik, 'bumerang');
    assert.equal(sonrakiMeslek(999), null);
  });
});

describe('calis', () => {
  it('ilk çalışma ödenir, defter ve bekleme yazılır', () => {
    const v = db();
    const s = calisBir(v, { rastgele: dizi(0, 0.99) }); // en düşük kazanç, kasa ve olay yok
    assert.equal(s.ok, true);
    assert.equal(s.meslek.kimlik, 'dart');
    assert.equal(s.kazanc, 16);
    assert.equal(bakiye(v, G, A), 16);
    const satir = v.prepare('SELECT tur, miktar, bakiye_sonra FROM ekonomi_hareketleri').get();
    assert.deepEqual({ ...satir }, { tur: 'calis', miktar: 16, bakiye_sonra: 16 });
    assert.equal(kalanBekleme(v, G, A, T0 + 1000), BEKLEME_MS - 1000);
  });

  it('bekleme dolmadan ikinci çalışma reddedilir ve hiçbir şey yazmaz', () => {
    const v = db();
    calisBir(v);
    const once = bakiye(v, G, A);
    const s = calisBir(v, { simdi: T0 + BEKLEME_MS - 1 });
    assert.deepEqual([s.ok, s.yorgun, s.kalanMs], [false, false, 1]);
    assert.equal(bakiye(v, G, A), once);
    assert.equal(v.prepare('SELECT COUNT(*) AS n FROM ekonomi_hareketleri').get().n, 1);
    assert.equal(calisBir(v, { simdi: T0 + BEKLEME_MS }).ok, true);
  });

  it('bekleme kişi başıdır', () => {
    const v = db();
    calisBir(v);
    assert.equal(calis(v, { guildId: G, kullaniciId: 'b', simdi: T0 }).ok, true);
  });

  it('kazanç mesleğin aralığında kalır (uç değerler)', () => {
    for (const m of MESLEKLER) {
      const v = db();
      seviyeAyarla(v, m.seviye);
      assert.equal(calisBir(v, { rastgele: dizi(0, 0.99) }).kazanc, m.min, m.ad);
      assert.equal(calisBir(v, { rastgele: dizi(0.9999, 0.99), simdi: T0 + SA }).kazanc, m.max, m.ad);
    }
  });

  it('kilitli mesleğe seçimle geçilemez, açık olana geçilir', () => {
    const v = db();
    seviyeAyarla(v, 5);
    const kilitli = meslekSec(v, { guildId: G, kullaniciId: A, kimlik: 'ninja' });
    assert.equal(kilitli.ok, false);
    assert.match(kilitli.sebep, /Sv 10/);
    assert.equal(meslekSec(v, { guildId: G, kullaniciId: A, kimlik: 'yok' }).ok, false);

    assert.equal(calisBir(v, { rastgele: () => 0 }).meslek.kimlik, 'bomba');
    assert.equal(meslekSec(v, { guildId: G, kullaniciId: A, kimlik: 'dart' }).ok, true);
    assert.equal(calisBir(v, { rastgele: () => 0, simdi: T0 + SA }).meslek.kimlik, 'dart');
    assert.equal(meslekSec(v, { guildId: G, kullaniciId: A, kimlik: OTOMATIK }).otomatik, true);
    assert.equal(calisBir(v, { rastgele: () => 0, simdi: T0 + 2 * SA }).meslek.kimlik, 'bomba');
  });

  it('seçim yapmak beklemeyi bozmaz', () => {
    const v = db();
    calisBir(v);
    meslekSec(v, { guildId: G, kullaniciId: A, kimlik: 'dart' });
    assert.equal(calisBir(v, { simdi: T0 + 1 }).ok, false);
  });

  it('olay metni mesleğe özgüdür ve {n} kalmaz', () => {
    const v = db();
    seviyeAyarla(v, 10);
    const s = calisBir(v);
    assert.ok(!s.olay.includes('{n}'));
    assert.ok(MESLEKLER.find((m) => m.kimlik === 'ninja').olaylar.some((o) => o.replace('{n}', '') === s.olay.replace(/\d+/, '')));
  });

  it('bonus kasa: eşikler ve envanter', () => {
    assert.equal(bonusKasa(() => 0), 'kasa-demir');
    assert.equal(bonusKasa(() => (BONUS_DEMIR - 0.01) / 100), 'kasa-demir');
    assert.equal(bonusKasa(() => BONUS_DEMIR / 100), 'kasa-ahsap');
    assert.equal(bonusKasa(() => (BONUS_DEMIR + BONUS_AHSAP - 0.01) / 100), 'kasa-ahsap');
    assert.equal(bonusKasa(() => (BONUS_DEMIR + BONUS_AHSAP) / 100), null);

    const v = db();
    const s = calisBir(v, { rastgele: dizi(0, 0.003, 0) });
    assert.equal(s.kasa, 'kasa-ahsap');
    assert.equal(adet(v, G, A, 'kasa-ahsap'), 1);
    const s2 = calisBir(v, { rastgele: dizi(0, 0.0001, 0), simdi: T0 + SA });
    assert.equal(s2.kasa, 'kasa-demir');
    assert.equal(adet(v, G, A, 'kasa-demir'), 1);
    assert.equal(v.prepare("SELECT COUNT(*) AS n FROM esya_hareketleri WHERE tur = 'calis'").get().n, 2);
  });

  it('bonus yoksa kasa verilmez', () => {
    const v = db();
    assert.equal(calisBir(v, { rastgele: dizi(0, 0.99, 0) }).kasa, null);
    assert.equal(adet(v, G, A, 'kasa-ahsap'), 0);
  });

  it('muz-2x etkinliği kazancı 2 katlar, bitince normale döner', () => {
    const v = db();
    etkinlikBaslat(v, { guildId: G, tur: 'muz-2x', sureMs: SA, baslatanId: 'y', simdi: T0 });
    const s = calisBir(v, { rastgele: dizi(0, 0.99) });
    assert.deepEqual([s.taban, s.kazanc, s.etkinlik], [16, 32, true]);
    assert.equal(bakiye(v, G, A), 32);
    const sonra = calisBir(v, { rastgele: dizi(0, 0.99), simdi: T0 + SA + 1 });
    assert.deepEqual([sonra.kazanc, sonra.etkinlik], [16, false]);
  });

  it('defter bakiye değişimiyle tutarlı', () => {
    const v = db();
    for (let i = 0; i < 4; i += 1) calisBir(v, { simdi: T0 + i * SA });
    const toplam = v.prepare("SELECT SUM(miktar) AS t FROM ekonomi_hareketleri WHERE tur = 'calis'").get().t;
    assert.equal(toplam, bakiye(v, G, A));
    assert.equal(BEKLEME_MS, 15_000);
  });
});

describe('enerji', () => {
  it('her çalışma 10 × (1 − direnç) harcar; bitince reddedilir, dolunca açılır', () => {
    const v = db();
    const bedel = YORGUNLUK * (1 - direnc(0, 0)); // maymunsuz %16 → 8,4
    assert.ok(Math.abs(bedel - 8.4) < 1e-9);
    let simdi = T0;
    let n = 0;
    while (calisBir(v, { simdi }).ok) { n += 1; simdi += BEKLEME_MS; }
    // Dolu enerji 11 çalışmalık; 15 sn'lik aralıklarda dolan ~1 enerji bir çalışma daha ekler.
    assert.equal(n, Math.floor(ENERJI_MAKS / bedel) + 1);
    const r = calisBir(v, { simdi });
    assert.equal(r.yorgun, true);
    // Kalan enerjiden bir çalışmalık dolum: süresi kadar bekleyince yeniden çalışılır.
    assert.equal(calisBir(v, { simdi: simdi + r.kalanMs - 1000 }).ok, false);
    assert.equal(calisBir(v, { simdi: simdi + r.kalanMs }).ok, true);
  });

  it('hiç çalışmamış üye dolu başlar; enerji zamanla en çok 100\'e dolar', () => {
    const v = db();
    assert.equal(calismaDurumu(v, G, A, T0).enerji, ENERJI_MAKS);
    calisBir(v);
    assert.ok(calismaDurumu(v, G, A, T0).enerji < ENERJI_MAKS);
    assert.equal(calismaDurumu(v, G, A, T0 + 100 * ENERJI_DOLUM_MS).enerji, ENERJI_MAKS);
  });
});

describe('çalışan maymun (OwO matematiği)', () => {
  it('direnç 0,8 × R / (100 + R), R = 25 + 2 × seviye × oran', () => {
    assert.ok(Math.abs(direnc(0, 0) - 0.16) < 1e-12);
    assert.ok(Math.abs(direnc(10, 5) - (0.8 * 125) / 225) < 1e-12);
    assert.ok(direnc(1000, 6) < 0.8);
    // OwO lvl⁴ + 1000, 100'e bölünmüş.
    assert.equal(seviyeXp(1), 10);
    assert.equal(seviyeXp(10), 110);
    assert.deepEqual(seviyeHesapla(0), { seviye: 1, mevcut: 0, gereken: 10 });
    assert.deepEqual(seviyeHesapla(10), { seviye: 2, mevcut: 0, gereken: 10 });
  });

  it('yalnız kule ve kahramanlar maymundur; balon ve bosslar değil', () => {
    assert.equal(maymunMu('kart-dart_monkey'), true);
    assert.equal(maymunMu('kart-quincy'), true);
    assert.equal(maymunMu('parlak:kart-quincy'), true);
    assert.equal(maymunMu('kart-zebra'), false);
    assert.equal(maymunMu('kart-camo'), false);
    assert.equal(maymunMu('kart-bloonarius'), false);
    assert.equal(maymunMu('kasa-ahsap'), false);
  });

  it('kilitlenen maymun çalıştıkça XP alır, direnci yorgunluğu azaltır', () => {
    const v = db();
    assert.equal(maymunKilitle(v, { guildId: G, kullaniciId: A, kimlik: 'kart-quincy' }).ok, false); // elde yok
    esyaEkle(v, G, A, 'kart-zebra', 1);
    assert.match(maymunKilitle(v, { guildId: G, kullaniciId: A, kimlik: 'kart-zebra' }).sebep, /çalışamaz/);
    esyaEkle(v, G, A, 'kart-quincy', 1);
    const k = maymunKilitle(v, { guildId: G, kullaniciId: A, kimlik: 'kart-quincy' });
    assert.equal(k.ok, true);
    assert.equal(k.maymun.oran, 5);
    const s = calisBir(v);
    assert.equal(s.maymun.kart.kimlik, 'kart-quincy');
    assert.ok(Math.abs(s.bedel - YORGUNLUK * (1 - direnc(1, 5))) < 1e-9);
    assert.equal(s.maymun.mevcut, 1);
    for (let i = 1; i < 10; i += 1) calisBir(v, { simdi: T0 + i * SA });
    assert.equal(calisanMaymun(v, G, A).seviye, 2);
    assert.equal(maymunlar(v, G, A)[0].kimlik, 'kart-quincy');
    assert.equal(maymunBirak(v, { guildId: G, kullaniciId: A }), true);
    assert.equal(calisanMaymun(v, G, A).kart, null);
  });

  it('kilitli kopya satılamaz, hediye/takas edilemez; diğer kopyalar serbest', () => {
    const v = db();
    esyaEkle(v, G, A, 'kart-quincy', 2);
    maymunKilitle(v, { guildId: G, kullaniciId: A, kimlik: 'kart-quincy' });
    assert.equal(esyaDus(v, G, A, 'kart-quincy', 2), false);
    assert.deepEqual(serbestEnvanter(v, G, A), { 'kart-quincy': 1 });
    const t = toptanSat(v, { guildId: G, kullaniciId: A });
    assert.equal(t.adet, 1);
    assert.equal(adet(v, G, A, 'kart-quincy'), 1);
    assert.equal(esyaDus(v, G, A, 'kart-quincy', 1), false);
    maymunBirak(v, { guildId: G, kullaniciId: A });
    assert.equal(esyaDus(v, G, A, 'kart-quincy', 1), true);
  });

  it('kart elden çıkınca (prestij) kilit kendiliğinden kalkar, XP kalır', () => {
    const v = db();
    esyaEkle(v, G, A, 'kart-ninja', 1);
    maymunKilitle(v, { guildId: G, kullaniciId: A, kimlik: 'kart-ninja' });
    calisBir(v);
    v.prepare("DELETE FROM envanter WHERE esya = 'kart-ninja'").run();
    assert.equal(calisanMaymun(v, G, A).kart, null);
    assert.equal(calisBir(v, { simdi: T0 + SA }).maymun, null);
    esyaEkle(v, G, A, 'kart-ninja', 1);
    assert.equal(maymunKilitle(v, { guildId: G, kullaniciId: A, kimlik: 'kart-ninja' }).maymun.xp, 1);
  });
});

describe('rozet çalışma bonusu', () => {
  it('rozetler toplanır ve /calis kazancına yüzde ekler', () => {
    const v = db();
    esyaVer(v, { guildId: G, kullaniciId: A, esya: esyaGetir('rozet-kirmizi') });
    esyaVer(v, { guildId: G, kullaniciId: A, esya: esyaGetir('rozet-bad') });
    assert.equal(rozetCalisBonusu(v, G, A), 12);
    const s = calisBir(v, { rastgele: dizi(0, 0.99, 0) }); // taban 16
    assert.equal(s.rozet, 12);
    assert.equal(s.kazanc, Math.floor(16 * 1.12 + 1e-9));
  });
});
