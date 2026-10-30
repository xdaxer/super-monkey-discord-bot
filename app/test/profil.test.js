import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { acVeritabani } from '../lib/db.js';
import { ekle, TURLER } from '../lib/ekonomi.js';
import { esyaEkle } from '../lib/envanter.js';
import { KARTLAR } from '../lib/kasalar.js';
import {
  emojiUrlCozucu, KART_ADEDI, profilGorseliUretilebilirMi, profilKarti, profilVerisi, ROZET_ADEDI,
} from '../lib/profil-gorsel.js';
import { xpVer } from '../lib/seviye.js';
import { profilGomusu } from '../commands/ekonomi/profil.js';

const G = 'g1';
const K = '100000000000000001';
const PNG_IMZASI = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function db() {
  return acVeritabani(':memory:');
}

const kart = (kisaAd) => `kart-${kisaAd}`;

describe('profilVerisi', () => {
  it('boş kullanıcı için güvenli varsayılanlar döner', () => {
    const v = profilVerisi(db(), G, K);

    assert.equal(v.seviye, 0);
    assert.equal(v.xp, 0);
    assert.equal(v.xpSirasi, null);
    assert.equal(v.kademe, null);
    assert.equal(v.bakiye, 0);
    assert.equal(v.zenginlikSirasi, null);
    assert.equal(v.bankada, 0);
    assert.equal(v.seri, 0);
    assert.equal(v.koleksiyon.farkli, 0);
    assert.equal(v.koleksiyon.toplam, KARTLAR.length);
    assert.equal(v.koleksiyon.toplam, 63);
    assert.equal(v.koleksiyon.puan, 0);
    assert.equal(v.koleksiyon.kademeler.length, 5);
    assert.deepEqual(v.enDegerliKartlar, []);
    assert.deepEqual(v.rozetler, []);
  });

  it('seviye, muz ve sıra bilgisini toplar', () => {
    const d = db();
    xpVer(d, { guildId: G, kullaniciId: K, rastgele: () => 0.99, simdi: 1000 });
    xpVer(d, { guildId: G, kullaniciId: 'baska', rastgele: () => 0, simdi: 1000 });
    ekle(d, { guildId: G, kullaniciId: K, miktar: 500, tur: TURLER.yonetici });

    const v = profilVerisi(d, G, K);
    assert.equal(v.xp, 25);
    assert.equal(v.suAnki, 25);
    assert.equal(v.sonraki, 50);
    assert.equal(v.xpSirasi, 1);
    assert.equal(v.bakiye, 500);
    assert.equal(v.zenginlikSirasi, 1);
  });

  it('seviye rolü kademesini ve rengini verir', () => {
    const d = db();
    d.prepare('INSERT INTO seviyeler (guild_id, kullanici_id, xp, seviye) VALUES (?, ?, ?, ?)')
      .run(G, K, 811, 6); // Sv 6 toplamı

    const v = profilVerisi(d, G, K);
    assert.equal(v.seviye, 6);
    assert.equal(v.kademe.ad, 'Bomba Maymunu');
    assert.equal(typeof v.kademe.renk, 'number');
  });

  it('kartları ve rozetleri olan kullanıcıyı topluyor', () => {
    const d = db();
    esyaEkle(d, G, K, kart('dart_monkey'), 2);
    esyaEkle(d, G, K, kart('wizard'));
    esyaEkle(d, G, K, 'rozet-kirmizi');
    esyaEkle(d, G, K, 'rozet-moab');

    const v = profilVerisi(d, G, K);
    assert.equal(v.koleksiyon.farkli, 2);
    // 2 × 400 (sıradan) + 1 × 1.500 (nadir)
    assert.equal(v.koleksiyon.puan, 2300);
    assert.equal(v.rozetler.length, 2);
    assert.equal(v.rozetler[0].kimlik, 'rozet-moab', 'en değerli rozet önce');
    assert.ok(v.rozetler[0].emojiAdi);

    const sayac = Object.fromEntries(v.koleksiyon.kademeler.map((k) => [k.nadirlik, k.sahip]));
    assert.equal(sayac.siradan, 1);
    assert.equal(sayac.nadir, 1);
    assert.equal(sayac.mitik, 0);
  });

  it('en değerli 6 kartı nadirliğe, sonra adede göre sıralar', () => {
    const d = db();
    // 8 farklı kart: sıradan x3 (bir tanesi çok adetli), nadir x2, destansı, efsanevi, mitik
    esyaEkle(d, G, K, kart('dart_monkey'));
    esyaEkle(d, G, K, kart('boomerang'), 5);
    esyaEkle(d, G, K, kart('sniper'), 2);
    esyaEkle(d, G, K, kart('wizard'));
    esyaEkle(d, G, K, kart('ninja'), 3);
    esyaEkle(d, G, K, kart('quincy'));
    esyaEkle(d, G, K, kart('lych'));
    esyaEkle(d, G, K, kart('RGB_Balon'));

    const v = profilVerisi(d, G, K);
    assert.equal(v.enDegerliKartlar.length, KART_ADEDI);
    assert.deepEqual(
      v.enDegerliKartlar.map((k) => k.kimlik),
      [kart('RGB_Balon'), kart('lych'), kart('quincy'), kart('ninja'), kart('wizard'), kart('boomerang')],
    );
    assert.equal(v.enDegerliKartlar[3].adet, 3);
    assert.equal(v.enDegerliKartlar[0].nadirlik, 'mitik');
    assert.ok(v.enDegerliKartlar.every((k) => k.emojiAdi.startsWith('btd_')));
  });

  it('rozetleri en çok 13 ile sınırlar', () => {
    const d = db();
    const tumRozetler = ['kirmizi', 'mavi', 'yesil', 'sari', 'pembe', 'siyah', 'gokkusagi', 'seramik', 'altin', 'moab', 'bfb', 'zomg', 'bad'];
    for (const r of tumRozetler) esyaEkle(d, G, K, `rozet-${r}`);

    const v = profilVerisi(d, G, K);
    assert.ok(v.rozetler.length <= ROZET_ADEDI);
    assert.equal(v.rozetler[0].kimlik, 'rozet-bad');
  });
});

describe('emojiUrlCozucu', () => {
  it('sunucuda olmayan emoji için null döner', () => {
    const guild = { emojis: { cache: { find: () => undefined } } };
    assert.equal(emojiUrlCozucu(guild)('btd_yok'), null);
    assert.equal(emojiUrlCozucu(null)('btd_yok'), null);
  });

  it('bulunan emojinin png adresini verir', () => {
    const emoji = { name: 'btd_wizard', imageURL: (o) => `https://cdn/e.${o.extension}?size=${o.size}` };
    const guild = { emojis: { cache: { find: (fn) => (fn(emoji) ? emoji : undefined) } } };
    assert.equal(emojiUrlCozucu(guild)('btd_wizard'), 'https://cdn/e.png?size=64');
  });
});

describe('profilKarti', () => {
  it('emojileri ve avatarı yüklenemese de PNG üretir', async (t) => {
    if (!(await profilGorseliUretilebilirMi())) {
      t.skip('@napi-rs/canvas yüklü değil');
      return;
    }

    const d = db();
    esyaEkle(d, G, K, kart('RGB_Balon'), 2);
    esyaEkle(d, G, K, kart('dart_monkey'));
    esyaEkle(d, G, K, 'rozet-moab');
    ekle(d, { guildId: G, kullaniciId: K, miktar: 12345, tur: TURLER.yonetici });
    const veri = profilVerisi(d, G, K);

    const istenen = [];
    const png = await profilKarti({
      veri,
      gorunenAd: 'Şükrü Çağlayan İğdır',
      avatarUrl: 'https://ornek.invalid/avatar.png',
      emojiUrl: (ad) => `https://ornek.invalid/${ad}.png`,
      indir: async (url) => {
        istenen.push(url);
        return null;
      },
    });

    assert.ok(Buffer.isBuffer(png));
    assert.deepEqual(png.subarray(0, 8), PNG_IMZASI);
    assert.ok(istenen.includes('https://ornek.invalid/avatar.png'));
    assert.ok(istenen.includes('https://ornek.invalid/btd_RGB_Balon.png'));
  });

  it('indirme hata fırlatsa da kart çizilir', async (t) => {
    if (!(await profilGorseliUretilebilirMi())) {
      t.skip('@napi-rs/canvas yüklü değil');
      return;
    }

    const png = await profilKarti({
      veri: profilVerisi(db(), G, K),
      gorunenAd: 'Boş Profil',
      avatarUrl: 'x',
      indir: async () => { throw new Error('ağ yok'); },
    });
    assert.deepEqual(png.subarray(0, 8), PNG_IMZASI);
  });
});

describe('profilGomusu (yedek)', () => {
  it('görsel yokken aynı bilgileri embed olarak verir', () => {
    const d = db();
    esyaEkle(d, G, K, kart('wizard'));
    esyaEkle(d, G, K, 'rozet-moab');
    const embed = profilGomusu(profilVerisi(d, G, K), { gorunenAd: 'Deneme' }).toJSON();

    assert.match(embed.title, /Deneme/);
    const adlar = embed.fields.map((f) => f.name);
    assert.ok(adlar.includes('Koleksiyon 1/63'));
    assert.ok(adlar.some((a) => a.startsWith('Rozetler')));
    assert.ok(adlar.includes('En değerli kartlar'));
  });
});
