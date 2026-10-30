import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { yatir } from '../lib/banka.js';
import { acVeritabani } from '../lib/db.js';
import {
  dus, ekle, gunlukAl, TURLER,
} from '../lib/ekonomi.js';
import { esyaEkle } from '../lib/envanter.js';
import { kasaAc } from '../lib/kasalar.js';
import {
  degerMetni, haftaBaslangici, kendiSirasi, SIRALAMA_KIMLIKLERI, siralama,
} from '../lib/siralamalar.js';

const G = 'g1';
const [A, B, C] = ['100', '200', '300'];

const para = (db, k, miktar, simdi) => ekle(db, { guildId: G, kullaniciId: k, miktar, tur: TURLER.yonetici, simdi });

describe('haftaBaslangici', () => {
  it('Pazartesi 00:00 TR (UTC+3)', () => {
    // Cuma 2026-10-09 15:00 UTC -> Pazartesi 2026-10-05 00:00 TR = 2026-10-04 21:00 UTC
    assert.equal(haftaBaslangici(Date.UTC(2026, 9, 9, 15)), Date.UTC(2026, 9, 4, 21));
    // Pazartesi 00:30 TR (Pazar 21:30 UTC): aynı hafta başlangıcı
    assert.equal(haftaBaslangici(Date.UTC(2026, 9, 4, 21, 30)), Date.UTC(2026, 9, 4, 21));
    // Pazar 23:59 TR (20:59 UTC) hâlâ önceki hafta: 2026-09-28 00:00 TR
    assert.equal(haftaBaslangici(Date.UTC(2026, 9, 4, 20, 59)), Date.UTC(2026, 8, 27, 21));
  });
});

describe('muz ve toplam', () => {
  it('muz bakiyeye göre, eşitlikte kimliğe göre sıralar', () => {
    const db = acVeritabani(':memory:');
    para(db, B, 500); para(db, A, 500); para(db, C, 900);
    assert.deepEqual(siralama(db, G, 'muz').map((s) => s.kullanici_id), [C, A, B]);
    assert.deepEqual(kendiSirasi(db, G, 'muz', B), { sira: 3, deger: 500, ek: 0, kullanici_id: B });
    assert.equal(kendiSirasi(db, G, 'muz', 'yok'), null);
  });

  it('toplam bankadaki kilitli mevduatı ekler, bakiyesi sıfır olan da girer', () => {
    const db = acVeritabani(':memory:');
    para(db, A, 5_000); para(db, B, 4_000);
    assert.equal(yatir(db, { guildId: G, kullaniciId: B, miktar: 3_000, vade: '84sa' }).ok, true);
    // B: bakiye 1.000 + kilitli 3.000 = 4.000
    assert.deepEqual(siralama(db, G, 'muz').map((s) => s.kullanici_id), [A, B]);
    assert.deepEqual(siralama(db, G, 'toplam').map((s) => [s.kullanici_id, s.deger]), [[A, 5_000], [B, 4_000]]);

    para(db, C, 1_000);
    assert.equal(yatir(db, { guildId: G, kullaniciId: C, miktar: 1_000, vade: '84sa' }).ok, true);
    assert.equal(siralama(db, G, 'muz').some((s) => s.kullanici_id === C), false);
    assert.equal(kendiSirasi(db, G, 'toplam', C).deger, 1_000);
  });
});

describe('koleksiyon', () => {
  it('puan kartların satış değeri; kasa sayılmaz; farklı kart sayısı ek', () => {
    const db = acVeritabani(':memory:');
    esyaEkle(db, G, A, 'kart-quincy', 2); // 12.000
    esyaEkle(db, G, A, 'kart-ace', 3); // 1.200
    esyaEkle(db, G, A, 'kasa-altin', 5);
    esyaEkle(db, G, B, 'kart-lych_elite'); // 100.000
    const s = siralama(db, G, 'koleksiyon');
    assert.deepEqual(s.map((x) => [x.kullanici_id, x.deger, x.ek]), [[B, 100_000, 1], [A, 13_200, 2]]);
    assert.equal(kendiSirasi(db, G, 'koleksiyon', A).sira, 2);
    assert.match(degerMetni('koleksiyon', s[1], String, 63), /13\.200.*2\/63/);
  });
});

describe('seri', () => {
  it('günlük seriye göre sıralar', () => {
    const db = acVeritabani(':memory:');
    const gun = 86_400_000;
    const t = Date.UTC(2026, 9, 1, 12);
    for (let i = 0; i < 3; i += 1) gunlukAl(db, { guildId: G, kullaniciId: A, simdi: t + i * gun });
    gunlukAl(db, { guildId: G, kullaniciId: B, simdi: t });
    assert.deepEqual(siralama(db, G, 'seri').map((x) => [x.kullanici_id, x.deger]), [[A, 3], [B, 1]]);
  });
});

describe('seviye', () => {
  it("toplam XP'ye göre sıralar, seviyeyi XP'den yazar; yetkililer hariç", () => {
    const db = acVeritabani(':memory:');
    const xp = db.prepare('INSERT INTO seviyeler (guild_id, kullanici_id, xp, seviye) VALUES (?, ?, ?, 0)');
    xp.run(G, A, 50); xp.run(G, B, 5000); xp.run(G, C, 0);
    const liste = siralama(db, G, 'seviye', { haric: [] });
    assert.deepEqual(liste.map((x) => [x.kullanici_id, x.deger]), [[B, 5000], [A, 50]]);
    assert.equal(kendiSirasi(db, G, 'seviye', A, { haric: [] }).sira, 2);
    assert.equal(kendiSirasi(db, G, 'seviye', C, { haric: [] }), null);
    assert.deepEqual(siralama(db, G, 'seviye', { haric: [B] }).map((x) => x.kullanici_id), [A]);
    assert.match(degerMetni('seviye', liste[0], String), /^\*\*Sv \d+\*\* · 5\.000 XP$/);
  });

  it('prestij metni güncel çarpanı yazar', () => {
    assert.equal(degerMetni('prestij', { deger: 2 }, String), '**⭐×2** (+%40 muz kazancı)');
  });
});

describe('haftalık kumar', () => {
  const simdi = Date.UTC(2026, 9, 9, 12); // Cuma
  const hafta = haftaBaslangici(simdi);

  it('bahis - kazanç; kasa/eşya kazançları, eski haftalar ve zarardakiler sayılmaz', () => {
    const db = acVeritabani(':memory:');
    para(db, A, 100_000, hafta - 1000); para(db, B, 100_000, hafta - 1000); para(db, C, 5_000, hafta - 1000);
    // A: 1.000 bahis, 3.000 kumar kazancı => +2.000
    dus(db, { guildId: G, kullaniciId: A, miktar: 1_000, tur: TURLER.bahis, simdi: hafta + 10 });
    ekle(db, { guildId: G, kullaniciId: A, miktar: 3_000, tur: TURLER.kazanc, simdi: hafta + 20 });
    // Kasadan çıkan muz (karsi_id var) kumar değil
    ekle(db, { guildId: G, kullaniciId: A, miktar: 50_000, tur: TURLER.kazanc, karsiId: 'kasa-elmas', simdi: hafta + 30 });
    // Geçen haftanın kazancı sayılmaz
    ekle(db, { guildId: G, kullaniciId: A, miktar: 9_000, tur: TURLER.kazanc, simdi: hafta - 5 });
    // B: kaybetti; mağaza iadesi (karsi_id var) kumar sayılmaz
    dus(db, { guildId: G, kullaniciId: B, miktar: 500, tur: TURLER.bahis, simdi: hafta + 40 });
    ekle(db, { guildId: G, kullaniciId: B, miktar: 5_000, tur: TURLER.iade, karsiId: 'renk-rolu', simdi: hafta + 70 });
    // C: yarım kalan blackjack bahsi iade edildi => net 0, listede yok
    dus(db, { guildId: G, kullaniciId: C, miktar: 700, tur: TURLER.bahis, simdi: hafta + 50 });
    ekle(db, { guildId: G, kullaniciId: C, miktar: 700, tur: TURLER.iade, simdi: hafta + 60 });

    assert.deepEqual(siralama(db, G, 'kumar', { simdi }).map((x) => [x.kullanici_id, x.deger]), [[A, 2_000]]);
    assert.equal(kendiSirasi(db, G, 'kumar', B, { simdi }), null);
    assert.equal(kendiSirasi(db, G, 'kumar', A, { simdi }).sira, 1);
  });

  it('gerçek kasa açılışındaki muz kazancı kumar sayılmaz', () => {
    const db = acVeritabani(':memory:');
    esyaEkle(db, G, A, 'kasa-elmas');
    const r = kasaAc(db, { guildId: G, kullaniciId: A, kasa: 'kasa-elmas', rastgele: () => 0, simdi });
    assert.equal(r.sonuc.tur, 'muz');
    assert.deepEqual(siralama(db, G, 'kumar', { simdi }), []);
  });
});

describe('genel', () => {
  it('bütün türler boş veritabanında hata vermez', () => {
    const db = acVeritabani(':memory:');
    for (const tur of SIRALAMA_KIMLIKLERI) {
      assert.deepEqual(siralama(db, G, tur), []);
      assert.equal(kendiSirasi(db, G, tur, A), null);
    }
  });

  it('bilinmeyen tür hata verir; limit uygulanır', () => {
    const db = acVeritabani(':memory:');
    assert.throws(() => siralama(db, G, 'yok'), RangeError);
    for (let i = 1; i <= 12; i += 1) para(db, String(i), i * 10);
    assert.equal(siralama(db, G, 'muz', { limit: 10 }).length, 10);
    assert.equal(kendiSirasi(db, G, 'muz', '1').sira, 12);
  });
});

describe('kumar sıralaması ve düello', () => {
  it('düello bahsi, kazancı ve iadesi kumar kazancına girmiyor', async () => {
    const { acVeritabani } = await import('../lib/db.js');
    const { ekle, TURLER } = await import('../lib/ekonomi.js');
    const { duelloAc, duelloKabul } = await import('../lib/duello.js');
    const { siralama } = await import('../lib/siralamalar.js');
    const db = acVeritabani(':memory:');
    const simdi = Date.now();
    for (const k of ['1', '2']) ekle(db, { guildId: 'g', kullaniciId: k, miktar: 1_000, tur: TURLER.yonetici, simdi });
    const { duello } = duelloAc(db, {
      guildId: 'g', kanalId: 'k', meydanId: '1', rakipId: '2', bahis: 500, oyun: 'yazitura', secim: 'yazi', simdi,
    });
    // rastgele 0 → yazı: meydan okuyan (1) kazanır.
    assert.equal(duelloKabul(db, { id: duello.id, kullaniciId: '2', simdi, rastgele: () => 0 }).kazananId, '1');
    assert.deepEqual(siralama(db, 'g', 'kumar', { simdi }), []);
  });
});

describe('yetkililer', () => {
  it('her sıralamadan ve kendi sırasından çıkarılır', () => {
    const db = acVeritabani(':memory:');
    para(db, A, 100);
    para(db, B, 300);
    para(db, C, 200);
    for (const tur of ['muz', 'toplam']) {
      assert.deepEqual(siralama(db, G, tur, { haric: [B] }).map((s) => s.kullanici_id), [C, A]);
      assert.equal(kendiSirasi(db, G, tur, A, { haric: [B] }).sira, 2);
      assert.equal(kendiSirasi(db, G, tur, B, { haric: [B] }), null);
    }
    assert.deepEqual(siralama(db, G, 'muz', { haric: [] }).map((s) => s.kullanici_id), [B, C, A]);
  });
});
