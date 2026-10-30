import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { acVeritabani } from '../lib/db.js';
import { ekle, TURLER } from '../lib/ekonomi.js';
import { uzaklastirma, uzakMi } from '../lib/ekonomi-uzak.js';
import { esyaHareketi } from '../lib/envanter.js';
import { DEGER_ESIGI, esyaDegeri, supheliTara } from '../lib/supheli.js';
import { gunuTara } from '../servisler/supheli.js';

const G = 'g1';
const YAN = '100000000000000001';
const ANA = '100000000000000002';
const ESKI = '100000000000000003';
const BOT = '100000000000000009';
const GUN = 86_400_000;
const TR = 3 * 3_600_000;
const BUGUN = Date.UTC(2026, 9, 28) - TR; // 28 Ekim 00:00 TR
const DUN = BUGUN - GUN;

const muzYaz = (k, tur, miktar, zaman, karsiId = null) => (db) => ekle(db, {
  guildId: G, kullaniciId: k, miktar, tur, karsiId, simdi: zaman,
});

/** Deftere ham satır (bahis gibi eksi kayıtlar için; bakiye bu testte önemsiz). */
const satir = (db, k, tur, miktar, zaman, karsiId = null) => db.prepare(
  `INSERT INTO ekonomi_hareketleri (guild_id, kullanici_id, tur, miktar, bakiye_sonra, karsi_id, zaman)
   VALUES (?, ?, ?, ?, 0, ?, ?)`,
).run(G, k, tur, miktar, karsiId, zaman);

/** Yan hesap dün açılır, düelloda kaybeder ve Altın Kasa'yı ana hesaba takaslar. */
function yanHesapGecesi(db, { yanIlk = DUN + 3_600_000 } = {}) {
  muzYaz(YAN, TURLER.gunluk, 400, yanIlk)(db);
  muzYaz(ANA, TURLER.gunluk, 400, DUN - 30 * GUN)(db);
  ekle(db, { guildId: G, kullaniciId: YAN, miktar: 4000, tur: TURLER.basarim, simdi: DUN + 3_700_000 });
  for (let i = 0; i < 2; i += 1) {
    satir(db, YAN, 'bahis', -2000, DUN + 3_800_000 + i, ANA);
    satir(db, ANA, 'bahis', -2000, DUN + 3_800_000 + i, YAN);
    satir(db, ANA, 'kazanc', 3800, DUN + 3_800_000 + i, YAN);
  }
  esyaHareketi(db, { guildId: G, kullaniciId: YAN, esya: 'kasa-altin', adet: -1, tur: 'takas-ver', karsiId: ANA, simdi: DUN + 3_900_000 });
  esyaHareketi(db, { guildId: G, kullaniciId: ANA, esya: 'kasa-altin', adet: 1, tur: 'takas-al', karsiId: YAN, simdi: DUN + 3_900_000 });
}

describe('şüpheli taraması', () => {
  it('yeni hesaptan ana hesaba akışı bulur ve değeri doğru hesaplar', () => {
    const db = acVeritabani(':memory:');
    yanHesapGecesi(db);
    const r = supheliTara(db, G, { baslangic: DUN, bitis: BUGUN, haric: [] });
    assert.equal(r.length, 1);
    assert.equal(r[0].veren, YAN);
    assert.equal(r[0].alan, ANA);
    // Düello: YAN 4.000 kaybetti, ANA 3.600 kazandı (kesinti); ortalama + Altın Kasa (12.000).
    assert.equal(r[0].deger, 3_800 + esyaDegeri('kasa-altin'));
    assert.ok(r[0].deger >= DEGER_ESIGI);
  });

  it('eski hesaplar arasındaki aynı akışı, gidip gelen takası ve sohbette olan hesabı şüpheli saymaz', () => {
    const db = acVeritabani(':memory:');
    yanHesapGecesi(db, { yanIlk: DUN - 30 * GUN });
    assert.deepEqual(supheliTara(db, G, { baslangic: DUN, bitis: BUGUN, haric: [] }), [], 'yeni olmayan hesap');

    const db2 = acVeritabani(':memory:');
    yanHesapGecesi(db2);
    db2.prepare('INSERT INTO seviyeler (guild_id, kullanici_id, xp, seviye, mesaj_sayisi) VALUES (?, ?, 5000, 10, 200)').run(G, YAN);
    assert.deepEqual(supheliTara(db2, G, { baslangic: DUN, bitis: BUGUN, haric: [] }), [], 'sohbette aktif');

    const db3 = acVeritabani(':memory:');
    muzYaz(ESKI, TURLER.gunluk, 400, DUN + 1000)(db3);
    for (const [k, karsi, adet] of [[ESKI, ANA, -1], [ANA, ESKI, 1], [ANA, ESKI, -1], [ESKI, ANA, 1]]) {
      esyaHareketi(db3, { guildId: G, kullaniciId: k, esya: 'kasa-elmas', adet, tur: adet < 0 ? 'takas-ver' : 'takas-al', karsiId: karsi, simdi: DUN + 2000 });
    }
    assert.deepEqual(supheliTara(db3, G, { baslangic: DUN, bitis: BUGUN, haric: [] }), [], 'gidip gelen kasa net sıfır');
  });

  it('gece taraması iki tarafı uzaklaştırır, aynı günü iki kez taramaz, yetkiliyi atlar', () => {
    const db = acVeritabani(':memory:');
    yanHesapGecesi(db);
    const sonuc = gunuTara(db, { guildId: G, yetkiliId: BOT, simdi: BUGUN + 60_000 });
    assert.equal(sonuc.gun, DUN);
    assert.equal(sonuc.ciftler.length, 1);
    assert.equal(uzakMi(db, G, YAN), true);
    assert.equal(uzakMi(db, G, ANA), true);
    assert.match(uzaklastirma(db, G, YAN).sebep, /Otomatik denetim/);
    assert.equal(uzaklastirma(db, G, ANA).yetkiliId, BOT);
    assert.equal(gunuTara(db, { guildId: G, yetkiliId: BOT, simdi: BUGUN + 120_000 }), null);
  });
});
