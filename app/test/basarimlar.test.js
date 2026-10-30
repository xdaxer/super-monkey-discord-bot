import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { sistemAyarla } from '../lib/ayarlar.js';
import { vadesiGelenleriOde, yatir } from '../lib/banka.js';
import {
  basarimDurumlari, basarimGetir, basarimlariKontrolEt, BASARIMLAR, basarimOzeti, KADEMELER, KATEGORILER, odulMetni,
  toplamPuan,
} from '../lib/basarimlar.js';
import { acVeritabani } from '../lib/db.js';
import {
  bakiye, dus, ekle, muz, TURLER,
} from '../lib/ekonomi.js';
import { adet, esyaEkle, esyaHareketi } from '../lib/envanter.js';
import { KARTLAR } from '../lib/kasalar.js';
import { setGetir } from '../lib/setler.js';

const G = 'g1';
const A = '100';
const B = '200';

/** Ekonomi sistemi açık bir veritabanı. */
function yeniDb() {
  const db = acVeritabani(':memory:');
  sistemAyarla(db, G, 'ekonomi', true);
  return db;
}

const kazanilan = (db, kisi = A) => new Set(basarimDurumlari(db, G, kisi).filter((d) => d.zaman).map((d) => d.tanim.kimlik));
const ilerleme = (db, kimlik, kisi = A) => basarimDurumlari(db, G, kisi).find((d) => d.tanim.kimlik === kimlik).deger;
const kontrol = (db, kisi = A, simdi = 1000) => basarimlariKontrolEt(db, G, kisi, simdi).map((y) => y.tanim.kimlik);

describe('başarım tanımları', () => {
  it('sayı, kimlik benzersizliği, kategori/kademe/ölçüt geçerliliği', () => {
    assert.ok(BASARIMLAR.length >= 20 && BASARIMLAR.length <= 30);
    assert.equal(new Set(BASARIMLAR.map((b) => b.kimlik)).size, BASARIMLAR.length);
    const db = yeniDb();
    for (const b of BASARIMLAR) {
      assert.ok(KATEGORILER[b.kategori], b.kimlik);
      assert.ok(KADEMELER[b.kademe], b.kimlik);
      assert.ok(b.hedef > 0 && b.odul.muz > 0, b.kimlik);
      assert.ok(basarimGetir(b.kimlik));
      // Ölçüt işlevi var ve boş kullanıcıda 0 döner.
      assert.equal(basarimDurumlari(db, G, 'yok').find((d) => d.tanim === b).deger, 0, b.kimlik);
    }
    assert.equal(toplamPuan(), BASARIMLAR.reduce((t, b) => t + KADEMELER[b.kademe].puan, 0));
  });

  it('ödül metni muz ve kasa adını yazar', () => {
    assert.equal(odulMetni({ muz: 3_000, kasa: 'kasa-ahsap' }, muz), `${muz(3_000)} + Ahşap Kasa`);
    assert.equal(odulMetni({ muz: 500 }, muz), muz(500));
  });
});

describe('ölçütler', () => {
  it('koleksiyon: farklı kart sayısı, mitik kart', () => {
    const db = yeniDb();
    KARTLAR.filter((k) => k.nadirlik !== 'mitik').slice(0, 15).forEach((k) => esyaEkle(db, G, A, k.kimlik));
    assert.deepEqual(kontrol(db), ['koleksiyon-15']);
    esyaEkle(db, G, A, KARTLAR.find((k) => k.nadirlik === 'mitik').kimlik, 3);
    assert.ok(kontrol(db).includes('ilk-mitik'));
    // Aynı karttan çok kopya "farklı" sayılmaz.
    assert.equal(ilerleme(db, 'koleksiyon-30'), 16);
  });

  it('tüm kahramanlar, kartlar satılsa da set ödülü alındıysa tamam', () => {
    const db = yeniDb();
    const set = setGetir('kahramanlar');
    set.kartlar.slice(0, -1).forEach((k) => esyaEkle(db, G, A, k));
    assert.equal(ilerleme(db, 'tum-kahramanlar'), set.kartlar.length - 1);
    assert.equal(kontrol(db).includes('tum-kahramanlar'), false);
    esyaEkle(db, G, A, set.kartlar.at(-1));
    assert.ok(kontrol(db).includes('tum-kahramanlar'));

    const db2 = yeniDb();
    db2.prepare('INSERT INTO set_oduller VALUES (?, ?, ?, ?)').run(G, A, 'kahramanlar', 5);
    assert.deepEqual(kontrol(db2).sort(), ['set-1', 'tum-kahramanlar']);
  });

  it('kasa açma ve kart satma sayısı eşya defterinden', () => {
    const db = yeniDb();
    esyaHareketi(db, { guildId: G, kullaniciId: A, esya: 'kasa-ahsap', adet: -1, tur: 'kasa-ac' });
    for (let i = 0; i < 9; i += 1) esyaHareketi(db, { guildId: G, kullaniciId: A, esya: 'kasa-ahsap', adet: -1, tur: 'kasa-ac' });
    esyaHareketi(db, { guildId: G, kullaniciId: A, esya: 'kart-ace', adet: -50, tur: 'sat' });
    assert.deepEqual(kontrol(db).sort(), ['kart-sat-50', 'kasa-10']);
    assert.equal(ilerleme(db, 'kasa-100'), 10);
    // Başkasının hareketi sayılmaz.
    assert.equal(ilerleme(db, 'kasa-10', B), 0);
  });

  it('takas: ver ve al aynı takasta tek sayılır', () => {
    const db = yeniDb();
    const ortak = { guildId: G, esya: 'kart-ace', adet: 1, zaman: 0 };
    esyaHareketi(db, { ...ortak, kullaniciId: A, tur: 'takas-ver', karsiId: B, simdi: 500 });
    esyaHareketi(db, { ...ortak, kullaniciId: A, tur: 'takas-al', karsiId: B, simdi: 500 });
    assert.deepEqual(kontrol(db), ['takas-1']);
    assert.equal(ilerleme(db, 'takas-10'), 1);
  });

  it('servet: bakiye zirvesi, sonradan harcansa da', () => {
    const db = yeniDb();
    ekle(db, { guildId: G, kullaniciId: A, miktar: 60_000, tur: TURLER.yonetici });
    dus(db, { guildId: G, kullaniciId: A, miktar: 59_000, tur: TURLER.magaza });
    assert.deepEqual(kontrol(db), ['servet-50k']);
    assert.equal(ilerleme(db, 'servet-1m'), 60_000);
  });

  it('banka: tamamlanan mevduat; 14 gün ve daha kısası ayrı', () => {
    const db = yeniDb();
    const gun = 86_400_000;
    ekle(db, { guildId: G, kullaniciId: A, miktar: 10_000, tur: TURLER.yonetici, simdi: 0 });
    assert.equal(yatir(db, { guildId: G, kullaniciId: A, miktar: 1_000, vade: '84sa', simdi: 0 }).ok, true);
    vadesiGelenleriOde(db, { simdi: 8 * gun });
    assert.ok(kontrol(db).includes('mevduat-1'));
    assert.equal(kazanilan(db).has('mevduat-14g'), false);
    assert.equal(yatir(db, { guildId: G, kullaniciId: A, miktar: 1_000, vade: '7g', simdi: 9 * gun }).ok, true);
    // Vade dolmadan (aktif) sayılmaz.
    assert.equal(ilerleme(db, 'mevduat-14g'), 0);
    vadesiGelenleriOde(db, { simdi: 30 * gun });
    assert.ok(kontrol(db).includes('mevduat-14g'));
  });

  it('kumar: oyun sayısı yalnız karsi_id boş, en az 100 muzluk bahisler; tek ödeme', () => {
    const db = yeniDb();
    ekle(db, { guildId: G, kullaniciId: A, miktar: 5_000, tur: TURLER.yonetici });
    for (let i = 0; i < 24; i += 1) dus(db, { guildId: G, kullaniciId: A, miktar: 100, tur: TURLER.bahis });
    // Düello bahsi (karsi_id dolu) ve 100'den küçük bahis kumar sayılmaz.
    dus(db, { guildId: G, kullaniciId: A, miktar: 100, tur: TURLER.bahis, karsiId: B });
    dus(db, { guildId: G, kullaniciId: A, miktar: 99, tur: TURLER.bahis });
    assert.equal(ilerleme(db, 'kumar-25'), 24);
    dus(db, { guildId: G, kullaniciId: A, miktar: 100, tur: TURLER.bahis });
    ekle(db, { guildId: G, kullaniciId: A, miktar: 9_999, tur: TURLER.kazanc });
    // Kasa ödülü (karsi_id kasa) tek ödeme sayılmaz.
    ekle(db, { guildId: G, kullaniciId: A, miktar: 25_000, tur: TURLER.kazanc, karsiId: 'kasa-altin' });
    assert.deepEqual(kontrol(db), ['kumar-25']);
    ekle(db, { guildId: G, kullaniciId: A, miktar: 10_000, tur: TURLER.kazanc });
    assert.ok(kontrol(db).includes('kumar-buyuk'));
  });

  it('düello: kazanç karsi_id kullanıcı kimliği; kasa ve kumar kazancı sayılmaz', () => {
    const db = yeniDb();
    for (let i = 0; i < 9; i += 1) ekle(db, { guildId: G, kullaniciId: A, miktar: 95, tur: TURLER.kazanc, karsiId: B });
    ekle(db, { guildId: G, kullaniciId: A, miktar: 500, tur: TURLER.kazanc, karsiId: 'kasa-demir' });
    ekle(db, { guildId: G, kullaniciId: A, miktar: 500, tur: TURLER.kazanc });
    assert.equal(ilerleme(db, 'duello-10'), 9);
    ekle(db, { guildId: G, kullaniciId: A, miktar: 95, tur: TURLER.kazanc, karsiId: B });
    assert.ok(kontrol(db).includes('duello-10'));
    // Kaybeden tarafın bahsi galibiyet yazmaz.
    assert.equal(ilerleme(db, 'duello-10', B), 0);
  });

  it('seri ve seviye mevcut kayıttan', () => {
    const db = yeniDb();
    db.prepare('INSERT INTO bakiyeler (guild_id, kullanici_id, gunluk_seri) VALUES (?, ?, 30)').run(G, A);
    db.prepare('INSERT INTO seviyeler (guild_id, kullanici_id, xp, seviye) VALUES (?, ?, 1, 25)').run(G, A);
    assert.deepEqual(kontrol(db).sort(), ['seri-30', 'seri-7', 'seviye-10', 'seviye-25']);
  });
});

describe('ödül ve kayıt', () => {
  it('kazanınca muz ve kasa bir kez verilir, tarih kaydedilir, defter başarım türünde', () => {
    const db = yeniDb();
    db.prepare('INSERT INTO seviyeler (guild_id, kullanici_id, xp, seviye) VALUES (?, ?, 1, 25)').run(G, A);
    assert.deepEqual(kontrol(db, A, 777).sort(), ['seviye-10', 'seviye-25']);
    // seviye-10: 500 muz; seviye-25: 3.000 muz + Ahşap Kasa
    assert.equal(bakiye(db, G, A), 3_500);
    assert.equal(adet(db, G, A, 'kasa-ahsap'), 1);
    assert.equal(basarimDurumlari(db, G, A).find((d) => d.tanim.kimlik === 'seviye-25').zaman, 777);
    const defter = db.prepare('SELECT tur, karsi_id FROM ekonomi_hareketleri WHERE tur = ? ORDER BY id').all(TURLER.basarim);
    assert.deepEqual(defter.map((d) => d.karsi_id), ['seviye-10', 'seviye-25']);
    const esya = db.prepare("SELECT adet FROM esya_hareketleri WHERE tur = 'basarim'").all();
    assert.equal(esya.length, 1);

    // İkinci kontrolde ödül yok.
    assert.deepEqual(kontrol(db, A, 2000), []);
    assert.equal(bakiye(db, G, A), 3_500);
    assert.equal(adet(db, G, A, 'kasa-ahsap'), 1);
  });

  it('kazanılan başarım, koşul bozulsa da kalır', () => {
    const db = yeniDb();
    esyaHareketi(db, { guildId: G, kullaniciId: A, esya: 'kart-ace', adet: -50, tur: 'sat' });
    assert.deepEqual(kontrol(db), ['kart-sat-50']);
    db.prepare("DELETE FROM esya_hareketleri WHERE tur = 'sat'").run();
    assert.equal(kontrol(db).length, 0);
    assert.ok(kazanilan(db).has('kart-sat-50'));
    assert.equal(ilerleme(db, 'kart-sat-50'), 50);
  });

  it('kullanıcılar birbirinden bağımsız; hareketsiz kullanıcıya hiçbir şey yazılmaz', () => {
    const db = yeniDb();
    db.prepare('INSERT INTO seviyeler (guild_id, kullanici_id, xp, seviye) VALUES (?, ?, 1, 10)').run(G, A);
    assert.deepEqual(kontrol(db, B), []);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM bakiyeler WHERE kullanici_id = ?').get(B).n, 0);
    assert.deepEqual(kontrol(db, A), ['seviye-10']);
  });

  it('ilerleme hedefe kırpılır; özet sayı ve puanı verir', () => {
    const db = yeniDb();
    db.prepare('INSERT INTO seviyeler (guild_id, kullanici_id, xp, seviye) VALUES (?, ?, 1, 80)').run(G, A);
    assert.equal(ilerleme(db, 'seviye-50'), 50);
    assert.deepEqual(basarimOzeti(db, G, A), {
      adet: 0, toplam: BASARIMLAR.length, puan: 0, toplamPuan: toplamPuan(),
    });
    kontrol(db);
    // Bronz 1 + gümüş 2 + altın 3
    assert.deepEqual(basarimOzeti(db, G, A), {
      adet: 3, toplam: BASARIMLAR.length, puan: 6, toplamPuan: toplamPuan(),
    });
    assert.equal(ilerleme(db, 'seri-7'), 0);
  });

  it('ekonomi sistemi kapalıyken hiçbir şey yazılmaz', () => {
    const db = acVeritabani(':memory:'); // varsayılan: kapalı
    db.prepare('INSERT INTO seviyeler (guild_id, kullanici_id, xp, seviye) VALUES (?, ?, 1, 50)').run(G, A);
    assert.deepEqual(kontrol(db), []);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM basarimlar').get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ekonomi_hareketleri').get().n, 0);
    assert.equal(bakiye(db, G, A), 0);

    sistemAyarla(db, G, 'ekonomi', true);
    assert.equal(kontrol(db).length, 3);
    sistemAyarla(db, G, 'ekonomi', false);
    db.prepare('UPDATE seviyeler SET seviye = 80').run();
    assert.deepEqual(kontrol(db, A, 5000), []);
  });

  it('hata olursa atmaz, boş döner', () => {
    assert.deepEqual(basarimlariKontrolEt({ prepare() { throw new Error('bozuk'); } }, G, A), []);
  });
});

describe('başarımlar ve parlak kartlar', () => {
  it('yalnız parlak sürüme sahip olmak da kartı sayar', async () => {
    const { acVeritabani } = await import('../lib/db.js');
    const { sistemAyarla } = await import('../lib/ayarlar.js');
    const { esyaEkle } = await import('../lib/envanter.js');
    const { basarimDurumlari } = await import('../lib/basarimlar.js');
    const db = acVeritabani(':memory:');
    sistemAyarla(db, 'g', 'ekonomi', true);
    esyaEkle(db, 'g', 'u', 'parlak:kart-lych_elite', 1);
    const mitik = basarimDurumlari(db, 'g', 'u').find((d) => d.tanim.kimlik === 'ilk-mitik');
    assert.equal(mitik.deger, 1);
  });
});
