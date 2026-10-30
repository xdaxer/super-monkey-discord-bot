import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { acVeritabani } from '../lib/db.js';
import {
  bakiye, bugunGonderilen, ekle, gunlukLimit, LIMIT_TABAN, TRANSFER_MIN, TURLER,
} from '../lib/ekonomi.js';
import { adet, esyaEkle } from '../lib/envanter.js';
import {
  ACIK_SINIRI, acikTeklifSayisi, ADET_SINIRI, geriCek, kabulEt, reddet, SURE_MS, suresiDolanlariKapat,
  takasEsyalari, teklifGetir, teklifOlustur,
} from '../lib/takas.js';
import { takasButonAyristir, takasButonId } from '../lib/takas-bilesen.js';

const G = 'g1';
const A = '100';
const B = '200';
const KART1 = 'kart-dart_monkey';
const KART2 = 'kart-boomerang';
const KASA = 'kasa-ahsap';
const T0 = 1_800_000_000_000;

function hazir() {
  const db = acVeritabani(':memory:');
  esyaEkle(db, G, A, KART1, 3);
  esyaEkle(db, G, B, KART2, 2);
  return db;
}

function para(db, kim, miktar) {
  ekle(db, { guildId: G, kullaniciId: kim, miktar, tur: TURLER.yonetici });
}

function teklif(db, ek = {}) {
  return teklifOlustur(db, {
    guildId: G, tekliEdenId: A, karsiId: B, verEsya: KART1, isteEsya: KART2, simdi: T0, ...ek,
  });
}

describe('takas: teklif oluşturma', () => {
  it('geçerli teklif kaydedilir ve 10 dakika sonra biter', () => {
    const db = hazir();
    const s = teklif(db, { verAdet: 2 });
    assert.equal(s.ok, true);
    assert.equal(s.teklif.durum, 'acik');
    assert.equal(s.teklif.bitis, T0 + SURE_MS);
    assert.equal(teklifGetir(db, s.teklif.id).verAdet, 2);
    // Eşyalar kilitlenmez.
    assert.equal(adet(db, G, A, KART1), 3);
  });

  it('kendine teklif ve boş taraf reddedilir', () => {
    const db = hazir();
    assert.equal(teklif(db, { karsiId: A }).ok, false);
    assert.equal(teklif(db, { verEsya: null }).ok, false);
    assert.equal(teklif(db, { isteEsya: null }).ok, false);
    assert.equal(teklif(db, { verEsya: null, isteEsya: null, muzVer: 50, muzIste: 50 }).ok, false);
  });

  it('yalnız kart ve kasa (Günlük Kasa hariç) takas edilir', () => {
    const db = hazir();
    esyaEkle(db, G, A, 'kasa-gunluk');
    esyaEkle(db, G, A, 'seri-koruyucu');
    esyaEkle(db, G, A, KASA);
    assert.equal(teklif(db, { verEsya: 'kasa-gunluk' }).ok, false);
    assert.equal(teklif(db, { verEsya: 'seri-koruyucu' }).ok, false);
    assert.equal(teklif(db, { verEsya: KASA }).ok, true);
    assert.deepEqual(takasEsyalari(db, G, A).map((e) => e.kimlik).sort(), [KART1, KASA].sort());
  });

  it('sahip olunmayan eşya ve adet sınırları reddedilir', () => {
    const db = hazir();
    assert.equal(teklif(db, { verAdet: 4 }).ok, false);
    assert.equal(teklif(db, { isteAdet: 3 }).ok, false);
    assert.equal(teklif(db, { verAdet: 0 }).ok, false);
    assert.equal(teklif(db, { verAdet: ADET_SINIRI + 1 }).ok, false);
  });

  it('muz: en az tutar ve bakiye aranır', () => {
    const db = hazir();
    assert.equal(teklif(db, { muzVer: TRANSFER_MIN - 1 }).ok, false);
    assert.equal(teklif(db, { muzVer: 100 }).ok, false); // bakiye yok
    para(db, A, 100);
    assert.equal(teklif(db, { muzVer: 100 }).ok, true);
    assert.equal(teklif(db, { muzIste: 100 }).ok, false); // karşıda yok
    // Yalnız muz karşılığı muz da olur.
    para(db, B, 100);
    assert.equal(teklif(db, { verEsya: null, isteEsya: null, muzVer: 50, muzIste: 50 }).ok, true);
  });

  it('kişi başı en çok 3 açık teklif; süresi dolan sayılmaz', () => {
    const db = hazir();
    for (let i = 0; i < ACIK_SINIRI; i += 1) assert.equal(teklif(db).ok, true);
    assert.equal(acikTeklifSayisi(db, G, A, T0), ACIK_SINIRI);
    assert.equal(teklif(db).ok, false);
    assert.equal(teklif(db, { simdi: T0 + SURE_MS + 1 }).ok, true);
  });

  it('geri çekilen teklif sınırdan düşer', () => {
    const db = hazir();
    const ilk = teklif(db);
    teklif(db);
    teklif(db);
    assert.equal(geriCek(db, { id: ilk.teklif.id, kullaniciId: A, simdi: T0 }).ok, true);
    assert.equal(teklif(db).ok, true);
  });
});

describe('takas: kabul', () => {
  it('yönetici ile üye arasında takas yok; yöneticiler kendi arasında takas eder', () => {
    const db = hazir();
    const yoneticiler = [A, 'Y2'];
    esyaEkle(db, G, 'Y2', KART2, 1);
    assert.match(teklif(db, { yoneticiler }).sebep, /Yöneticilerle üyeler arasında/);
    assert.match(teklifOlustur(db, {
      guildId: G, tekliEdenId: B, karsiId: A, verEsya: KART2, isteEsya: KART1, simdi: T0, yoneticiler,
    }).sebep, /Yöneticilerle üyeler arasında/);
    // Kural öncesi açılmış teklif de kabul edilemez.
    const eski = teklif(db);
    assert.equal(eski.ok, true);
    assert.match(kabulEt(db, { id: eski.teklif.id, kullaniciId: B, simdi: T0, yoneticiler }).sebep, /Yöneticilerle üyeler arasında/);
    assert.equal(adet(db, G, B, KART1), 0);
    const ici = teklif(db, { karsiId: 'Y2', yoneticiler });
    assert.equal(ici.ok, true);
    assert.equal(kabulEt(db, { id: ici.teklif.id, kullaniciId: 'Y2', simdi: T0, yoneticiler }).ok, true);
  });

  it('eşyalar atomik değişir ve esya_hareketleri yazılır', () => {
    const db = hazir();
    const { teklif: t } = teklif(db, { verAdet: 2, isteAdet: 1 });
    const s = kabulEt(db, { id: t.id, kullaniciId: B, simdi: T0 + 1000 });
    assert.equal(s.ok, true);
    assert.equal(adet(db, G, A, KART1), 1);
    assert.equal(adet(db, G, B, KART1), 2);
    assert.equal(adet(db, G, A, KART2), 1);
    assert.equal(adet(db, G, B, KART2), 1);
    assert.equal(teklifGetir(db, t.id).durum, 'kabul');

    const hareketler = db.prepare('SELECT tur, kullanici_id, esya, adet FROM esya_hareketleri ORDER BY id').all();
    assert.equal(hareketler.filter((h) => h.tur === 'takas-ver').length, 2);
    assert.equal(hareketler.filter((h) => h.tur === 'takas-al').length, 2);
    assert.ok(hareketler.some((h) => h.tur === 'takas-ver' && h.kullanici_id === A && h.esya === KART1 && h.adet === -2));
    assert.ok(hareketler.some((h) => h.tur === 'takas-al' && h.kullanici_id === B && h.esya === KART1 && h.adet === 2));
  });

  it('yalnız karşı taraf kabul/ret eder, yalnız teklif eden geri çeker', () => {
    const db = hazir();
    const { teklif: t } = teklif(db);
    assert.equal(kabulEt(db, { id: t.id, kullaniciId: A, simdi: T0 }).ok, false);
    assert.equal(kabulEt(db, { id: t.id, kullaniciId: '999', simdi: T0 }).ok, false);
    assert.equal(reddet(db, { id: t.id, kullaniciId: A, simdi: T0 }).ok, false);
    assert.equal(geriCek(db, { id: t.id, kullaniciId: B, simdi: T0 }).ok, false);
    assert.equal(teklifGetir(db, t.id).durum, 'acik');
    assert.equal(reddet(db, { id: t.id, kullaniciId: B, simdi: T0 }).ok, true);
    assert.equal(teklifGetir(db, t.id).durum, 'red');
  });

  it('teklif edenin eşyası değişmişse hiçbir şey yazılmaz', () => {
    const db = hazir();
    const { teklif: t } = teklif(db, { verAdet: 3 });
    db.prepare('UPDATE envanter SET adet = 1 WHERE kullanici_id = ? AND esya = ?').run(A, KART1);
    const s = kabulEt(db, { id: t.id, kullaniciId: B, simdi: T0 });
    assert.equal(s.ok, false);
    assert.match(s.sebep, /Hiçbir şey değişmedi/);
    assert.equal(adet(db, G, A, KART1), 1);
    assert.equal(adet(db, G, B, KART1), 0);
    assert.equal(adet(db, G, B, KART2), 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM esya_hareketleri').get().n, 0);
    assert.equal(teklifGetir(db, t.id).durum, 'acik');
  });

  it('karşı tarafın eşyası elinden gitmişse hiçbir şey yazılmaz (muz da dahil)', () => {
    const db = hazir();
    para(db, A, 500);
    const { teklif: t } = teklif(db, { muzVer: 200 });
    db.prepare('UPDATE envanter SET adet = 0 WHERE kullanici_id = ? AND esya = ?').run(B, KART2);
    const s = kabulEt(db, { id: t.id, kullaniciId: B, simdi: T0 });
    assert.equal(s.ok, false);
    assert.equal(bakiye(db, G, A), 500);
    assert.equal(bakiye(db, G, B), 0);
    assert.equal(adet(db, G, A, KART1), 3);
  });

  it('muz yetmezse eşya devri de geri alınır', () => {
    const db = hazir();
    para(db, A, 300);
    para(db, B, 300);
    const { teklif: t } = teklif(db, { muzVer: 100, muzIste: 250 });
    db.prepare('UPDATE bakiyeler SET bakiye = 50 WHERE kullanici_id = ?').run(B);
    const s = kabulEt(db, { id: t.id, kullaniciId: B, simdi: T0 });
    assert.equal(s.ok, false);
    assert.match(s.sebep, /Senin muz/);
    // İlk adımdaki (A → B) muz de geri alındı.
    assert.equal(bakiye(db, G, A), 300);
    assert.equal(bakiye(db, G, B), 50);
    assert.equal(adet(db, G, A, KART1), 3);
    assert.equal(adet(db, G, B, KART2), 2);
  });

  it('süresi dolmuş teklif kabul edilmez ve kapanır', () => {
    const db = hazir();
    const { teklif: t } = teklif(db);
    const s = kabulEt(db, { id: t.id, kullaniciId: B, simdi: T0 + SURE_MS });
    assert.equal(s.ok, false);
    assert.equal(s.durum, 'suresi');
    assert.equal(teklifGetir(db, t.id).durum, 'suresi');
    assert.equal(adet(db, G, A, KART1), 3);
    // Kapanmış teklif bir daha işlem görmez.
    assert.equal(kabulEt(db, { id: t.id, kullaniciId: B, simdi: T0 }).ok, false);
  });

  it('aynı teklif iki kez kabul edilemez', () => {
    const db = hazir();
    const { teklif: t } = teklif(db);
    assert.equal(kabulEt(db, { id: t.id, kullaniciId: B, simdi: T0 }).ok, true);
    assert.equal(kabulEt(db, { id: t.id, kullaniciId: B, simdi: T0 }).ok, false);
    assert.equal(adet(db, G, B, KART1), 1);
  });

  it('suresiDolanlariKapat yalnız süresi geçen açık teklifleri kapatır', () => {
    const db = hazir();
    const eski = teklif(db).teklif;
    const yeni = teklif(db, { simdi: T0 + 5 * 60_000 }).teklif;
    const kapanan = suresiDolanlariKapat(db, T0 + SURE_MS + 1);
    assert.deepEqual(kapanan.map((k) => k.id), [eski.id]);
    assert.equal(teklifGetir(db, yeni.id).durum, 'acik');
  });
});

describe('takas: vergi ve günlük limit', () => {
  it('muz iki yönde de vergiye tabi; net alıcıya geçer', () => {
    const db = hazir();
    para(db, A, 1000);
    para(db, B, 1000);
    const { teklif: t } = teklif(db, { muzVer: 500, muzIste: 200 });
    const s = kabulEt(db, { id: t.id, kullaniciId: B, vergiYuzde: 10, simdi: T0 });
    assert.equal(s.ok, true);
    assert.equal(s.vergiVer, 50);
    assert.equal(s.vergiIste, 20);
    assert.equal(bakiye(db, G, A), 1000 - 500 + 180);
    assert.equal(bakiye(db, G, B), 1000 - 200 + 450);
  });

  it('takasla giden muz günlük gönderim limitine sayılır', () => {
    const db = hazir();
    para(db, A, 5000);
    const { teklif: t } = teklif(db, { muzVer: 700 });
    kabulEt(db, { id: t.id, kullaniciId: B, simdi: T0 });
    assert.equal(bugunGonderilen(db, G, A, T0), 700);
  });

  it('limit aşılıyorsa takas olmaz, hiçbir şey yazılmaz', () => {
    const db = hazir();
    const limit = gunlukLimit(0);
    assert.equal(limit, LIMIT_TABAN);
    para(db, A, limit + 1000);
    const { teklif: t } = teklif(db, { muzVer: limit + 1 });
    const s = kabulEt(db, { id: t.id, kullaniciId: B, seviyeler: { [A]: 0 }, simdi: T0 });
    assert.equal(s.ok, false);
    assert.match(s.sebep, /limit/i);
    assert.equal(bakiye(db, G, A), limit + 1000);
    assert.equal(adet(db, G, A, KART1), 3);

    // Seviye limiti yükseltir.
    const ok = kabulEt(db, { id: t.id, kullaniciId: B, seviyeler: { [A]: 4 }, simdi: T0 });
    assert.equal(ok.ok, true);
  });

  it('önce /gonder ile harcanan limit takası da engeller', () => {
    const db = hazir();
    para(db, A, 5000);
    ekle(db, { guildId: G, kullaniciId: B, miktar: 1, tur: TURLER.yonetici });
    db.prepare(
      `INSERT INTO ekonomi_hareketleri (guild_id, kullanici_id, tur, miktar, bakiye_sonra, zaman)
       VALUES (?, ?, 'gonder', -1900, 0, ?)`,
    ).run(G, A, T0);
    const { teklif: t } = teklif(db, { muzVer: 200 });
    assert.equal(kabulEt(db, { id: t.id, kullaniciId: B, simdi: T0 }).ok, false);
  });
});

describe('takas: buton kimliği', () => {
  it('üretilen kimlik geri ayrıştırılır', () => {
    for (const eylem of ['kabul', 'red', 'geri']) {
      assert.deepEqual(takasButonAyristir(takasButonId(eylem, 42)), { eylem, id: 42 });
    }
  });

  it('bozuk ve yabancı kimlikler null döner', () => {
    for (const kotu of [undefined, '', 'takas', 'takas:kabul', 'takas:kabul:abc', 'takas:sil:1', 'bj:cek:1',
      'kasa:ac:ahsap:1', 'takas:kabul:-1', 'takas:kabul:1234567890123456']) {
      assert.equal(takasButonAyristir(kotu), null, String(kotu));
    }
  });
});
