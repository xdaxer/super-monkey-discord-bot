import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cevapla, CEVAPLAR } from '../commands/eglence/8ball.js';
import { sec, seceneklerAyristir } from '../commands/eglence/sec.js';
import { zarAt } from '../commands/eglence/zar.js';
import { at } from '../commands/eglence/yazitura.js';
import { avatarBaglantilari } from '../commands/resim/avatar.js';
import { gorselBaglantisi } from '../commands/resim/sunucugorsel.js';
import { bilgiAlanlari as kullaniciAlanlari } from '../commands/kullanici/kullanici.js';
import { bilgiAlanlari as sunucuAlanlari, kanallariSay } from '../commands/sunucu/sunucu.js';
import { degerGoster, degerSec } from '../commands/yapilandirma/ayar.js';
import { AYARLAR } from '../lib/ayarlar.js';
import { etiketsiz, sureAyristir, sureBicimle } from '../lib/bicim.js';
import { sablonDoldur } from '../lib/gorsel.js';

describe('zar', () => {
  it('sonuç 1 ile yüz sayısı arasında kalır', () => {
    for (const r of [0, 0.5, 0.999999]) {
      const { toplam } = zarAt(6, 1, () => r);
      assert.ok(toplam >= 1 && toplam <= 6, `aralık dışı: ${toplam}`);
    }
  });

  it('çoklu zar toplamı doğru', () => {
    const { sonuclar, toplam } = zarAt(6, 3, () => 0.5);
    assert.equal(sonuclar.length, 3);
    assert.equal(toplam, sonuclar.reduce((a, b) => a + b, 0));
  });
});

describe('yazı tura', () => {
  it('iki sonuçtan birini verir', () => {
    assert.equal(at(() => 0.1), 'Yazı');
    assert.equal(at(() => 0.9), 'Tura');
  });
});

describe('seçim', () => {
  it('virgülle ayrılmış listeyi ayrıştırır', () => {
    assert.deepEqual(seceneklerAyristir('a, b ,c'), ['a', 'b', 'c']);
  });

  it('boş parçaları atar', () => {
    assert.deepEqual(seceneklerAyristir('a,,  ,b'), ['a', 'b']);
    assert.deepEqual(seceneklerAyristir('   '), []);
  });

  it('boş listede null döner', () => {
    assert.equal(sec([]), null);
  });

  it('listeden seçer', () => {
    assert.equal(sec(['a', 'b', 'c'], () => 0), 'a');
    assert.equal(sec(['a', 'b', 'c'], () => 0.999), 'c');
  });
});

describe('8ball', () => {
  it('tanımlı cevaplardan birini verir', () => {
    assert.ok(CEVAPLAR.includes(cevapla(() => 0)));
    assert.ok(CEVAPLAR.includes(cevapla(() => 0.999)));
  });
});

describe('etiket kaçışı', () => {
  it('kullanıcı metnindeki @ zararsızlaştırılır', () => {
    assert.notEqual(etiketsiz('@everyone'), '@everyone');
    assert.ok(etiketsiz('@everyone').includes('​'));
  });
});

describe('süre biçimleme', () => {
  it('okunur süre üretir', () => {
    assert.equal(sureBicimle(90_000), '1 dakika 30 saniye');
    assert.equal(sureBicimle(500), '1 saniyeden az');
    assert.equal(sureBicimle(-5), 'bilinmiyor');
  });

  it('süre ayrıştırır', () => {
    assert.equal(sureAyristir('10dk'), 600_000);
    assert.equal(sureAyristir('3sa'), 10_800_000);
    assert.equal(sureAyristir('0dk'), null);
    assert.equal(sureAyristir('abc'), null);
  });
});

describe('kullanıcı bilgisi', () => {
  const kullanici = {
    id: '1', tag: 'ali#0', username: 'ali', bot: false, createdTimestamp: 1_600_000_000_000,
  };

  it('sunucuda olmayan kullanıcı için çökmez', () => {
    const alanlar = kullaniciAlanlari(kullanici, null);
    assert.ok(alanlar.some((a) => /sunucuda değil/.test(a.value)));
    assert.ok(!alanlar.some((a) => a.name.startsWith('Roller')));
  });

  it('üye varsa rolleri ve katılma tarihini gösterir', () => {
    const uye = {
      joinedTimestamp: 1_700_000_000_000,
      roles: { cache: new Map([['r1', { id: 'r1', name: 'Üye', position: 1 }]]).values() },
    };
    const alanlar = kullaniciAlanlari(kullanici, {
      ...uye, roles: { cache: { values: () => [{ id: 'r1', name: 'Üye', position: 1 }] } },
    });

    assert.ok(alanlar.some((a) => a.name === 'Sunucuya katıldı'));
    assert.ok(alanlar.some((a) => a.name.startsWith('Roller')));
  });
});

describe('sunucu bilgisi', () => {
  it('kanal türlerini sayar ve sıfırları gizler', () => {
    const sayim = kanallariSay([{ type: 0 }, { type: 0 }, { type: 2 }]);
    assert.deepEqual(sayim, [{ etiket: 'Metin', adet: 2 }, { etiket: 'Ses', adet: 1 }]);
  });

  it('GuildMembers kapalıyken bile üye sayısını gösterir', () => {
    const guild = {
      id: 'g', name: 'Test', ownerId: 'o', createdTimestamp: 1_600_000_000_000,
      memberCount: 1234, premiumTier: 1, premiumSubscriptionCount: 2,
      roles: { cache: { size: 5 } },
      channels: { cache: { size: 3, values: () => [{ type: 0 }, { type: 0 }, { type: 2 }] } },
    };

    const alanlar = sunucuAlanlari(guild);
    const uye = alanlar.find((a) => a.name === 'Üye sayısı');
    assert.equal(uye.value, '1234');
  });
});

describe('avatar', () => {
  const kullanici = { displayAvatarURL: () => 'https://cdn/global.png' };

  it('sunucuya özel avatar yoksa globali gösterir', () => {
    const b = avatarBaglantilari(kullanici, null);
    assert.equal(b.gosterilecek, 'https://cdn/global.png');
    assert.equal(b.farkliMi, false);
  });

  it('sunucuya özel avatarı ayırt eder', () => {
    const uye = { avatar: 'hash', avatarURL: () => 'https://cdn/sunucu.png' };
    const b = avatarBaglantilari(kullanici, uye);
    assert.equal(b.gosterilecek, 'https://cdn/sunucu.png');
    assert.equal(b.farkliMi, true);
  });
});

describe('sunucu görselleri', () => {
  it('olmayan görselde null döner', () => {
    const guild = { iconURL: () => null, bannerURL: () => null, splashURL: () => null };
    assert.equal(gorselBaglantisi(guild, 'banner').url, null);
  });

  it('var olan görselin bağlantısını verir', () => {
    const guild = { iconURL: () => 'https://cdn/i.png' };
    assert.equal(gorselBaglantisi(guild, 'ikon').url, 'https://cdn/i.png');
  });
});

describe('karşılama şablonu', () => {
  it('yer tutucuları doldurur', () => {
    const sonuc = sablonDoldur('Hoş geldin {kullanici}! {sunucu} · {uyeSayisi}', {
      kullanici: '<@1>', sunucu: 'Test', uyeSayisi: 42,
    });
    assert.equal(sonuc, 'Hoş geldin <@1>! Test · 42');
  });

  it('bilinmeyen yer tutucuyu olduğu gibi bırakır', () => {
    assert.equal(sablonDoldur('{yokboyle}', { a: 1 }), '{yokboyle}');
  });
});

describe('ayar değeri seçimi', () => {
  it('kanal türü için kanal bekler', () => {
    const olumsuz = degerSec('log.kanal', { kanal: null, rol: null, metin: 'x', acik: null });
    assert.equal(olumsuz.ok, false);
    assert.match(olumsuz.sebep, /kanal/);

    const olumlu = degerSec('log.kanal', { kanal: '123', rol: null, metin: null, acik: null });
    assert.deepEqual(olumlu, { ok: true, deger: '123' });
  });

  it('aç/kapa türünde false değeri kabul edilir', () => {
    const sonuc = degerSec('log.olay.mesajSil', { kanal: null, rol: null, metin: null, acik: false });
    assert.deepEqual(sonuc, { ok: true, deger: false });
  });

  it('bilinmeyen anahtarı reddeder', () => {
    assert.equal(degerSec('yok.boyle', {}).ok, false);
  });

  it('değerleri okunur gösterir', () => {
    assert.equal(degerGoster(AYARLAR['log.kanal'], '123'), '<#123>');
    assert.equal(degerGoster(AYARLAR['basvuru.rol'], '9'), '<@&9>');
    assert.equal(degerGoster(AYARLAR['log.olay.mesajSil'], true), 'açık');
    assert.equal(degerGoster(AYARLAR['log.kanal'], null), '_ayarlanmamış_');
    assert.equal(degerGoster(AYARLAR['yedek.saklanan'], 14), '**14**');
  });
});

describe('sayı türü ayarlar', () => {
  it('sayı seçeneği verilmezse açık uyarı dönüyor', () => {
    const sonuc = degerSec('yedek.periyotSaat', { kanal: null, rol: null, metin: null, acik: null, sayi: null });
    assert.equal(sonuc.ok, false);
    assert.match(sonuc.sebep, /`sayi:`/);
  });

  it('sınır içindeki değer kabul ediliyor', () => {
    assert.deepEqual(degerSec('yedek.periyotSaat', { sayi: 6 }), { ok: true, deger: 6 });
    assert.deepEqual(degerSec('yedek.saklanan', { sayi: 200 }), { ok: true, deger: 200 });
  });

  it('sınır dışı ve kesirli değer reddediliyor', () => {
    // 0 saatlik yedek aralığı sonsuz döngü, negatif saklama sayısı anlamsız.
    assert.equal(degerSec('yedek.periyotSaat', { sayi: 0 }).ok, false);
    assert.equal(degerSec('yedek.periyotSaat', { sayi: 169 }).ok, false);
    assert.equal(degerSec('yedek.saklanan', { sayi: -1 }).ok, false);
    assert.equal(degerSec('yedek.saklanan', { sayi: 2.5 }).ok, false);
  });

  it('red gerekçesi izin verilen aralığı söylüyor', () => {
    assert.match(degerSec('yedek.saklanan', { sayi: 999 }).sebep, /1 ile 200 arasında/);
  });

  it('her sayı ayarının sınırı tanımlı', () => {
    for (const [anahtar, tanim] of Object.entries(AYARLAR)) {
      if (tanim.tur !== 'sayi') continue;
      assert.equal(typeof tanim.min, 'number', `${anahtar}: min eksik`);
      assert.equal(typeof tanim.max, 'number', `${anahtar}: max eksik`);
      assert.ok(tanim.varsayilan >= tanim.min && tanim.varsayilan <= tanim.max,
        `${anahtar}: varsayılan sınır dışı`);
    }
  });
});
