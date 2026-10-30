import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AYARLAR, SISTEMLER, ayarYaz, sistemAyarla } from '../lib/ayarlar.js';
import { acVeritabani } from '../lib/db.js';
import { gerekliIntent, name } from '../events/seviye.js';
import {
  BEKLEME_MS, XP_MAX, XP_MIN, duyuruMetni, gereken, kullaniciGetir, rastgeleXp,
  SES_XP_MAX, SES_XP_MIN, seviyeHesapla, sesXpAlanlar, sesXpBugun, sesXpVer, sira, siralama, toplamXp,
  xpKanalindaMi, xpKazandirirMi, xpVer,
} from '../lib/seviye.js';
import { ilerlemeCubugu } from '../commands/seviye/seviye.js';

const G = 'g1';

function db() {
  return acVeritabani(':memory:');
}

describe('seviye eşikleri', () => {
  it('formül docs/ekonomi.md ile aynı', () => {
    // ⌊(5n² + 50n + 100) / 2⌋
    assert.equal(gereken(0), 50);
    assert.equal(gereken(1), 77);
    assert.equal(gereken(9), 477);
  });

  it('kümülatif tablo belgedeki sayıları veriyor', () => {
    const beklenen = [50, 127, 237, 384, 574, 811, 1101, 1448, 1858, 2335];
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(toplamXp), beklenen);
  });

  it('toplam XP doğru seviyeye çevriliyor', () => {
    assert.equal(seviyeHesapla(0).seviye, 0);
    assert.equal(seviyeHesapla(49).seviye, 0);
    assert.equal(seviyeHesapla(50).seviye, 1);
    assert.equal(seviyeHesapla(126).seviye, 1);
    assert.equal(seviyeHesapla(127).seviye, 2);
    assert.equal(seviyeHesapla(2335).seviye, 10);
  });

  it('seviye içi ilerleme ve sonraki eşik birlikte dönüyor', () => {
    const { seviye, suAnki, sonraki } = seviyeHesapla(100);
    assert.equal(seviye, 1);
    assert.equal(suAnki, 50);
    assert.equal(sonraki, 77);
  });

  it('negatif ve kesirli XP çökmüyor', () => {
    assert.equal(seviyeHesapla(-5).seviye, 0);
    assert.equal(seviyeHesapla(50.9).seviye, 1);
  });
});

describe('XP kazanma kuralları', () => {
  it('rastgele XP belgelenen aralıkta kalıyor', () => {
    assert.equal(rastgeleXp(() => 0), XP_MIN);
    assert.equal(rastgeleXp(() => 0.999999), XP_MAX);
    for (let i = 0; i < 200; i += 1) {
      const xp = rastgeleXp();
      assert.ok(xp >= XP_MIN && xp <= XP_MAX, `aralık dışı: ${xp}`);
    }
  });

  it('bot mesajı, sistem mesajı ve DM XP kazandırmaz', () => {
    assert.equal(xpKazandirirMi({ guildId: G, author: { bot: true } }).ok, false);
    assert.equal(xpKazandirirMi({ guildId: G, author: { bot: false }, system: true }).ok, false);
    assert.equal(xpKazandirirMi({ author: { bot: false } }).ok, false);
    assert.equal(xpKazandirirMi({ guildId: G, author: { bot: false } }).ok, true);
  });

  it('XP kanal listesi: boşsa her yer, doluysa yalnız o kanal ve thread\'leri', () => {
    const duz = (id) => ({ channelId: id, channel: { isThread: () => false } });
    const thread = (id, ust) => ({ channelId: id, channel: { isThread: () => true, parentId: ust } });
    assert.equal(xpKanalindaMi(duz('x'), []), true);
    assert.equal(xpKanalindaMi(duz('sohbet'), ['sohbet']), true);
    assert.equal(xpKanalindaMi(duz('x'), ['sohbet']), false);
    assert.equal(xpKanalindaMi(thread('t', 'sohbet'), ['sohbet']), true);
    assert.equal(xpKanalindaMi(thread('t', 'x'), ['sohbet']), false);
  });

  it('bekleme süresi dolmadan ikinci kez XP verilmiyor', () => {
    const d = db();
    const ilk = xpVer(d, { guildId: G, kullaniciId: 'u1', simdi: 1000, rastgele: () => 0 });
    assert.equal(ilk.verildi, true);
    assert.equal(ilk.kazanilan, XP_MIN);

    const hemen = xpVer(d, { guildId: G, kullaniciId: 'u1', simdi: 1000 + BEKLEME_MS - 1 });
    assert.equal(hemen.verildi, false);
    assert.equal(hemen.kazanilan, 0);
    assert.equal(kullaniciGetir(d, G, 'u1').xp, XP_MIN);

    const sonra = xpVer(d, { guildId: G, kullaniciId: 'u1', simdi: 1000 + BEKLEME_MS, rastgele: () => 0 });
    assert.equal(sonra.verildi, true);
    assert.equal(kullaniciGetir(d, G, 'u1').xp, XP_MIN * 2);
  });

  it('bekleme dolmadan mesaj sayısı da artmıyor', () => {
    const d = db();
    xpVer(d, { guildId: G, kullaniciId: 'u1', simdi: 1000 });
    xpVer(d, { guildId: G, kullaniciId: 'u1', simdi: 1001 });
    assert.equal(kullaniciGetir(d, G, 'u1').mesaj_sayisi, 1);
  });

  it('eşik aşılınca seviye atlama bildiriliyor, aynı seviyede bildirilmiyor', () => {
    const d = db();
    let simdi = 0;
    let sonuncu;

    // 50 XP (seviye 1) için 25'lik adımlarla iki tur gerekir.
    for (let i = 0; i < 2; i += 1) {
      simdi += BEKLEME_MS;
      sonuncu = xpVer(d, { guildId: G, kullaniciId: 'u1', simdi, rastgele: () => 0.999999 });
    }

    assert.equal(sonuncu.xp, 50);
    assert.equal(sonuncu.seviye, 1);
    assert.equal(sonuncu.atladi, true);
    assert.equal(sonuncu.oncekiSeviye, 0);

    simdi += BEKLEME_MS;
    const sonraki = xpVer(d, { guildId: G, kullaniciId: 'u1', simdi, rastgele: () => 0 });
    assert.equal(sonraki.atladi, false);
    assert.equal(sonraki.seviye, 1);
  });

  it('sunucular arası yalıtım korunuyor', () => {
    const d = db();
    xpVer(d, { guildId: 'g1', kullaniciId: 'u1', simdi: 0, rastgele: () => 0 });
    xpVer(d, { guildId: 'g2', kullaniciId: 'u1', simdi: 0, rastgele: () => 0 });

    assert.equal(kullaniciGetir(d, 'g1', 'u1').xp, XP_MIN);
    assert.equal(kullaniciGetir(d, 'g2', 'u1').xp, XP_MIN);
    // Aynı kullanıcı iki sunucuda ayrı bekleme süresi taşır.
    assert.equal(kullaniciGetir(d, 'g3', 'u1').xp, 0);
  });

  it('kaydı olmayan kullanıcı sıfır değerlerle dönüyor', () => {
    assert.deepEqual(kullaniciGetir(db(), G, 'yok'),
      { xp: 0, seviye: 0, mesaj_sayisi: 0, son_kazanma: 0 });
  });
});

describe('sıralama', () => {
  it('XP\'ye göre azalan sırada ve sınırlı dönüyor', () => {
    const d = db();
    const ekle = (u, xp) => d.prepare(
      'INSERT INTO seviyeler (guild_id, kullanici_id, xp, seviye, mesaj_sayisi, son_kazanma) VALUES (?, ?, ?, ?, 0, 0)',
    ).run(G, u, xp, seviyeHesapla(xp).seviye);

    ekle('az', 50);
    ekle('cok', 5000);
    ekle('orta', 500);

    assert.deepEqual(siralama(d, G, 10).map((s) => s.kullanici_id), ['cok', 'orta', 'az']);
    assert.equal(siralama(d, G, 2).length, 2);
    assert.equal(sira(d, G, 'cok'), 1);
    assert.equal(sira(d, G, 'az'), 3);
    assert.equal(sira(d, G, 'yok'), null);

    // Yetkililer (bot sahibi, geliştiriciler) listelenmez ve sıra saymaz.
    assert.deepEqual(siralama(d, G, 10, ['cok']).map((s) => s.kullanici_id), ['orta', 'az']);
    assert.equal(sira(d, G, 'orta', ['cok']), 1);
    assert.equal(sira(d, G, 'cok', ['cok']), null);
  });

  it('seviye kayıttan değil XP\'den hesaplanır (eşik değişince eski kayıt yanıltmaz)', () => {
    const d = db();
    d.prepare('INSERT INTO seviyeler (guild_id, kullanici_id, xp, seviye) VALUES (?, ?, ?, ?)').run(G, 'u', 2335, 3);
    assert.equal(siralama(d, G, 10)[0].seviye, 10);
  });

  it('boş sunucuda sıralama boş liste', () => {
    assert.deepEqual(siralama(db(), 'bos', 10), []);
  });

  it('ilerleme çubuğu oranı doğru gösteriyor', () => {
    assert.match(ilerlemeCubugu(0, 100), /%0$/);
    assert.match(ilerlemeCubugu(100, 100), /%100$/);
    assert.match(ilerlemeCubugu(50, 100), /%50$/);
    // Sıfır eşikte bölme hatası olmamalı.
    assert.match(ilerlemeCubugu(0, 0), /%0$/);
  });
});

describe('seviye duyurusu ve ayarları', () => {
  it('yer tutucular dolduruluyor', () => {
    const metin = duyuruMetni('{kullanici} → {seviye} ({sunucu})',
      { kullaniciId: 'u1', seviye: 4, sunucuAdi: 'Test' });
    assert.equal(metin, '<@u1> → 4 (Test)');
  });

  it('şablon boşsa çökmüyor', () => {
    assert.equal(duyuruMetni(null, { kullaniciId: 'u1', seviye: 1 }), '');
  });

  it('olay GuildMessages ister, MessageContent istemez', () => {
    assert.equal(name, 'messageCreate');
    assert.deepEqual(gerekliIntent, ['GuildMessages']);
  });

  it('sistem ve ayar anahtarları tanımlı, varsayılanı kapalı', () => {
    assert.equal(SISTEMLER.seviye.varsayilan, false);
    assert.deepEqual(SISTEMLER.seviye.gerekliIntent, ['GuildMessages']);
    assert.equal(AYARLAR['seviye.kanal'].varsayilan, null);
    assert.ok(AYARLAR['seviye.mesaj'].varsayilan.includes('{seviye}'));
  });

  it('sistem kapalıyken ayar yazımı XP kaydını etkilemiyor', () => {
    const d = db();
    sistemAyarla(d, G, 'seviye', false);
    ayarYaz(d, G, 'seviye.kanal', 'k1');
    // Kapalı sistemde olay dosyası hiç xpVer çağırmaz; kayıt boş kalmalı.
    assert.equal(kullaniciGetir(d, G, 'u1').xp, 0);
  });
});

describe('ses XP\'si', () => {
  const d = (kanalId, kullaniciId, ek = {}) => ({ kanalId, kullaniciId, ...ek });

  it('kanalda en az iki insan varsa ikisi de kazanıyor', () => {
    assert.deepEqual(sesXpAlanlar([d('s1', 'a'), d('s1', 'b')]).sort(), ['a', 'b']);
  });

  it('tek başına, botla ya da AFK kanalında kazanılmıyor', () => {
    assert.deepEqual(sesXpAlanlar([d('s1', 'a')]), []);
    assert.deepEqual(sesXpAlanlar([d('s1', 'a'), d('s1', 'bot', { bot: true })]), []);
    assert.deepEqual(sesXpAlanlar([d('afk', 'a'), d('afk', 'b')], { afkKanalId: 'afk' }), []);
  });

  it('kulaklığı kapalı olan kazanmıyor ve kalabalığa sayılmıyor', () => {
    assert.deepEqual(sesXpAlanlar([d('s1', 'a'), d('s1', 'b', { sagir: true })]), []);
    assert.deepEqual(
      sesXpAlanlar([d('s1', 'a'), d('s1', 'b'), d('s1', 'c', { sagir: true })]).sort(), ['a', 'b'],
    );
  });

  it('ses durumu kanalsızsa (çıkmış) yok sayılıyor', () => {
    assert.deepEqual(sesXpAlanlar([d(null, 'a'), d(null, 'b')]), []);
  });

  it('herkes susturulmuşsa kimse kazanmıyor; bir kişi konuşuyorsa hepsi kazanıyor', () => {
    const sus = { susturulmus: true };
    assert.deepEqual(sesXpAlanlar([d('s1', 'a', sus), d('s1', 'b', sus)]), []);
    assert.deepEqual(sesXpAlanlar([d('s1', 'a', sus), d('s1', 'b')]).sort(), ['a', 'b']);
  });

  it('dakika başı 5–10 XP; günlük tavan kırpar, dolunca XP yok, ertesi gün sıfırlanır', () => {
    const v = db();
    const T = Date.UTC(2026, 9, 11, 9); // TR öğlen
    const ver = (simdi, ek = {}) => sesXpVer(v, { guildId: G, kullaniciId: 'u1', simdi, rastgele: () => 0.999, tavan: 25, ...ek });
    assert.equal(ver(T, { rastgele: () => 0 }).kazanilan, SES_XP_MIN);
    assert.equal(ver(T + 60_000).kazanilan, SES_XP_MAX); // bugün 15
    const kirpik = ver(T + 120_000); // 10 değil, tavana kalan 10
    assert.equal(kirpik.kazanilan, 10);
    assert.equal(kirpik.bugun, 25);
    const dolu = ver(T + 180_000);
    assert.equal(dolu.verildi, false);
    assert.equal(sesXpBugun(v, G, 'u1', T + 180_000), 25);
    assert.equal(kullaniciGetir(v, G, 'u1').xp, 25);
    // Tavan dolunca mesaj XP'si yine geliyor (bekleme tavanla başlamadı).
    assert.equal(xpVer(v, { guildId: G, kullaniciId: 'u1', simdi: T + 181_000 }).verildi, true);
    // Ertesi Türkiye günü sayaç sıfır.
    assert.equal(sesXpBugun(v, G, 'u1', T + 86_400_000), 0);
    assert.equal(ver(T + 86_400_000).kazanilan, SES_XP_MAX);
    assert.equal(sesXpBugun(v, G, 'u1', T + 86_400_000), 10);
  });

  it('tavan bonuslu (iksir/üyelik) XP\'yi de kırpar', () => {
    const v = db();
    const s = sesXpVer(v, { guildId: G, kullaniciId: 'u1', simdi: 1, rastgele: () => 0, bonus: (x) => x * 4, tavan: 12 });
    assert.equal(s.kazanilan, 12);
  });

  it('günlük tavan ayarı varsayılan 1.000', () => {
    assert.equal(AYARLAR['seviye.sesXpGunluk'].varsayilan, 1_000);
  });

  it('ses XP\'si mesaj sayacını artırmıyor ve beklemeyi mesajla paylaşıyor', () => {
    const v = db();
    xpVer(v, { guildId: G, kullaniciId: 'u1', simdi: 1000, rastgele: () => 0, mesaj: false });
    assert.equal(kullaniciGetir(v, G, 'u1').mesaj_sayisi, 0);
    assert.equal(kullaniciGetir(v, G, 'u1').xp, XP_MIN);

    // Aynı dakikada mesaj atınca ikinci XP gelmiyor.
    assert.equal(xpVer(v, { guildId: G, kullaniciId: 'u1', simdi: 2000 }).verildi, false);
  });
});
