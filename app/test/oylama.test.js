import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AYARLAR, SECENEK_SINIRI, SISTEMLER, ayarSecenekleri } from '../lib/ayarlar.js';
import { alanlaraBol } from '../lib/bicim.js';
import { createInteractionHandler } from '../lib/interactions.js';
import {
  ASAGI, TEPKILER, YUKARI, eksikTepkiler, gecmisiOyla, kendiOylariniTemizle, kendiOyuMu,
  oylanirMi, sadeEmoji, tepkileriEkle,
} from '../lib/oylama.js';
import { gerekliIntent, name } from '../events/oylama.js';
import {
  gerekliIntent as tepkiIntent, name as tepkiOlayi,
} from '../events/oylama-tepki.js';
import { TEMEL_INTENTLER, intentAdlari } from '../lib/intents.js';
import { ozetMetni } from '../commands/oylama/oylama.js';

const BOT = 'bot-1';

/** Tepki eklemeyi kaydeden sahte mesaj; discord.js Message'ın kullandığımız yüzeyi. */
function sahteMesaj(ustler = {}) {
  const mesaj = {
    id: ustler.id ?? 'm1',
    guildId: 'g1',
    system: false,
    author: { id: 'uye-1' },
    eklenen: [],
    reactions: { cache: new Map() },
    ...ustler,
  };

  mesaj.react = async (emoji) => {
    mesaj.eklenen.push(emoji);
    mesaj.reactions.cache.set(emoji, { me: true, emoji: { name: emoji } });
  };

  return mesaj;
}

/** Botun zaten tepki bıraktığı bir mesaj kurar. */
function tepkili(emojiler, ustler = {}) {
  const mesaj = sahteMesaj(ustler);
  for (const emoji of emojiler) {
    mesaj.reactions.cache.set(emoji, { me: true, emoji: { name: emoji } });
  }
  return mesaj;
}

describe('oylama tepkileri', () => {
  it('yukarı ve aşağı ok, bu sırayla', () => {
    assert.deepEqual([...TEPKILER], [YUKARI, ASAGI]);
    assert.equal(YUKARI, '⬆️');
    assert.equal(ASAGI, '⬇️');
  });

  it('varyasyon seçici farkı aynı emoji sayılır', () => {
    assert.equal(sadeEmoji('⬆️'), sadeEmoji('⬆'));
  });

  it('üye mesajına iki tepki de eklenir', async () => {
    const mesaj = sahteMesaj();
    assert.equal(await tepkileriEkle(mesaj), 2);
    assert.deepEqual(mesaj.eklenen, [YUKARI, ASAGI]);
  });

  it('zaten eklenmiş tepki ikinci kez eklenmez', async () => {
    const mesaj = tepkili(['⬆']); // Discord seçicisiz döndürdü
    assert.deepEqual(eksikTepkiler(mesaj), [ASAGI]);
    assert.equal(await tepkileriEkle(mesaj), 1);
    assert.deepEqual(mesaj.eklenen, [ASAGI]);
  });

  it('başkasının tepkisi botunki sayılmaz', () => {
    const mesaj = sahteMesaj();
    mesaj.reactions.cache.set(YUKARI, { me: false, emoji: { name: YUKARI } });
    assert.deepEqual(eksikTepkiler(mesaj), [YUKARI, ASAGI]);
  });
});

describe('hangi mesaj oylanır', () => {
  it('sunucudaki üye mesajı oylanır', () => {
    assert.equal(oylanirMi(sahteMesaj(), BOT).ok, true);
  });

  it('botun kendi mesajı oylanmaz', () => {
    const sonuc = oylanirMi(sahteMesaj({ author: { id: BOT } }), BOT);
    assert.equal(sonuc.ok, false);
    assert.equal(sonuc.sebep, 'botun-kendi-mesaji');
  });

  it('başka botun mesajı oylanır (tüm mesajlar isteniyor)', () => {
    assert.equal(oylanirMi(sahteMesaj({ author: { id: 'baska-bot', bot: true } }), BOT).ok, true);
  });

  it('sistem mesajı oylanmaz', () => {
    assert.equal(oylanirMi(sahteMesaj({ system: true }), BOT).sebep, 'sistem-mesaji');
  });

  it('DM oylanmaz', () => {
    assert.equal(oylanirMi(sahteMesaj({ guildId: null }), BOT).sebep, 'sunucu-disi');
  });
});

/** Sayfalı `messages.fetch` sunan sahte kanal. */
function sahteKanal(mesajlar) {
  const istekler = [];
  return {
    istekler,
    messages: {
      fetch: async ({ limit, before }) => {
        istekler.push({ limit, before });
        const baslangic = before ? mesajlar.findIndex((m) => m.id === before) + 1 : 0;
        return new Map(mesajlar.slice(baslangic, baslangic + limit).map((m) => [m.id, m]));
      },
    },
  };
}

describe('geçmiş taraması', () => {
  const uretim = (adet, ustler = () => ({})) => Array.from({ length: adet }, (_, i) => sahteMesaj({ id: `m${i}`, ...ustler(i) }));

  it('bütün geçmişi sayfalayarak tarar', async () => {
    const mesajlar = uretim(250);
    const kanal = sahteKanal(mesajlar);

    const sayac = await gecmisiOyla(kanal, { botId: BOT, adet: 1000 });

    assert.equal(sayac.taranan, 250);
    assert.equal(sayac.islenen, 250);
    assert.equal(sayac.eklenen, 500);
    assert.equal(kanal.istekler.length, 3);
    assert.equal(kanal.istekler[1].before, 'm99');
    assert.ok(mesajlar.every((m) => m.eklenen.length === 2));
  });

  it('adet sınırını aşmaz', async () => {
    const kanal = sahteKanal(uretim(250));
    const sayac = await gecmisiOyla(kanal, { botId: BOT, adet: 120 });

    assert.equal(sayac.taranan, 120);
    assert.deepEqual(kanal.istekler.map((i) => i.limit), [100, 20]);
  });

  it('bot ve sistem mesajlarını atlar', async () => {
    const kanal = sahteKanal([
      sahteMesaj({ id: 'a' }),
      sahteMesaj({ id: 'b', author: { id: BOT } }),
      sahteMesaj({ id: 'c', system: true }),
    ]);

    const sayac = await gecmisiOyla(kanal, { botId: BOT, adet: 100 });

    assert.deepEqual(
      { taranan: sayac.taranan, islenen: sayac.islenen, atlanan: sayac.atlanan },
      { taranan: 3, islenen: 1, atlanan: 2 },
    );
  });

  it('ikinci çalıştırma yalnız eksik tepkileri tamamlar', async () => {
    const kanal = sahteKanal([tepkili(TEPKILER, { id: 'a' }), tepkili([YUKARI], { id: 'b' })]);

    const sayac = await gecmisiOyla(kanal, { botId: BOT, adet: 100 });

    assert.equal(sayac.eklenen, 1);
    assert.equal(sayac.islenen, 1);
  });

  it('tek mesajın hatası taramayı durdurmaz', async () => {
    const patlak = sahteMesaj({ id: 'b' });
    patlak.react = async () => { throw new Error('Missing Permissions'); };
    const kanal = sahteKanal([sahteMesaj({ id: 'a' }), patlak, sahteMesaj({ id: 'c' })]);

    const sayac = await gecmisiOyla(kanal, { botId: BOT, adet: 100 });

    assert.equal(sayac.hata, 1);
    assert.equal(sayac.islenen, 2);
  });

  it('ilerleme geri çağrısı her yığında çalışır', async () => {
    const kanal = sahteKanal(uretim(150));
    const adimlar = [];

    await gecmisiOyla(kanal, { botId: BOT, adet: 1000, ilerleme: (d) => adimlar.push(d.taranan) });

    assert.deepEqual(adimlar, [100, 150]);
  });

  it('özet metni sayıları ve atlananları anlatır', () => {
    assert.match(
      ozetMetni({ taranan: 10, islenen: 4, eklenen: 8, atlanan: 6, hata: 0 }),
      /10 mesaj tarandı, 4 mesaja 8 tepki eklendi, 6 mesaj atlandı/,
    );
  });
});

describe('oylama olayı ve ayarları', () => {
  it('MessageCreate olayına yalnız GuildMessages ile bağlanır', () => {
    assert.equal(name, 'messageCreate');
    assert.deepEqual(gerekliIntent, ['GuildMessages']);
  });

  it('sistem kapalı gelir ve kanal ayarı boştur', () => {
    assert.equal(SISTEMLER.oylama.varsayilan, false);
    assert.deepEqual(SISTEMLER.oylama.gerekliIntent, ['GuildMessages']);
    assert.equal(AYARLAR['oylama.kanal'].varsayilan, null);
    assert.equal(AYARLAR['oylama.kanal'].tur, 'kanal');
  });
});

describe('ayar anahtarı otomatik tamamlaması', () => {
  it('boş sorguda Discord sınırı kadar seçenek döner', () => {
    const secenekler = ayarSecenekleri('');
    assert.equal(secenekler.length, Math.min(Object.keys(AYARLAR).length, SECENEK_SINIRI));
    assert.ok(secenekler.every((s) => s.name.length <= 100));
  });

  it('sorgu anahtara ve etikete göre süzer', () => {
    assert.deepEqual(ayarSecenekleri('oylama.').map((s) => s.value), ['oylama.kanal']);
    assert.deepEqual(ayarSecenekleri('OYLAMA').map((s) => s.value), ['oylama.kanal']);
    assert.ok(ayarSecenekleri('log.olay').length >= 7);
    assert.deepEqual(ayarSecenekleri('böyle-bir-ayar-yok'), []);
  });

  it('sınırın üstüne çıkmaz', () => {
    assert.equal(ayarSecenekleri('', 3).length, 3);
  });

  it('her seçeneğin değeri gerçek bir anahtar', () => {
    for (const secenek of ayarSecenekleri('')) assert.ok(AYARLAR[secenek.value]);
  });
});

describe('otomatik tamamlama yönlendirmesi', () => {
  const tamamlama = (ustler = {}) => ({
    commandName: 'ayar',
    yanitlar: [],
    isChatInputCommand: () => false,
    isAutocomplete: () => true,
    respond: async function respond(secenekler) { this.yanitlar.push(secenekler); },
    ...ustler,
  });

  it('komutun autocomplete işleyicisine gider', async () => {
    const interaction = tamamlama();
    const commands = new Map([['ayar', {
      execute: async () => assert.fail('execute çağrılmamalı'),
      autocomplete: async (i) => i.respond([{ name: 'a', value: 'a' }]),
    }]]);

    await createInteractionHandler(commands)(interaction);

    assert.deepEqual(interaction.yanitlar, [[{ name: 'a', value: 'a' }]]);
  });

  it('işleyicisi olmayan komutta sessiz kalır', async () => {
    const interaction = tamamlama();
    const commands = new Map([['ayar', { execute: async () => {} }]]);

    await createInteractionHandler(commands)(interaction);

    assert.equal(interaction.yanitlar.length, 0);
  });

  it('hata verirse boş liste döner ve loglanır', async () => {
    const interaction = tamamlama();
    const hatalar = [];
    const commands = new Map([['ayar', {
      execute: async () => {},
      autocomplete: async () => { throw new Error('patladı'); },
    }]]);

    await createInteractionHandler(commands, { error: (...a) => hatalar.push(a) })(interaction);

    assert.deepEqual(interaction.yanitlar, [[]]);
    assert.equal(hatalar.length, 1);
  });
});

describe('embed alan bölme', () => {
  it('sınırı aşan liste ikinci alana taşar, satır kırpılmaz', () => {
    const satirlar = ['a'.repeat(600), 'b'.repeat(600), 'c'.repeat(600)];
    const alanlar = alanlaraBol('Ayarlar', satirlar);

    assert.equal(alanlar.length, 3);
    assert.deepEqual(alanlar.map((a) => a.name), ['Ayarlar', 'Ayarlar (devam)', 'Ayarlar (devam)']);
    assert.deepEqual(alanlar.map((a) => a.value), satirlar);
  });

  it('sığan liste tek alanda kalır', () => {
    const alanlar = alanlaraBol('Sistemler', ['bir', 'iki']);
    assert.deepEqual(alanlar, [{ name: 'Sistemler', value: 'bir\niki' }]);
  });

  it('gerçek ayar listesi hiçbir alanda kırpılmıyor', () => {
    const satirlar = Object.keys(AYARLAR).map((a) => `• \`${a}\` — <#123456789012345678>`);
    const alanlar = alanlaraBol('Ayarlar', satirlar);

    assert.equal(alanlar.reduce((t, a) => t + a.value.split('\n').length, 0), satirlar.length);
    assert.ok(alanlar.every((a) => a.value.length <= 1024));
  });
});

describe('kendine oy engeli', () => {
  const UYE = '111000000000000001';
  const BASKASI = '111000000000000002';

  it('kendi mesajına verilen yukarı ve aşağı oy yakalanıyor', () => {
    for (const emoji of [YUKARI, ASAGI]) {
      assert.equal(
        kendiOyuMu({ emoji, tepkiVeren: UYE, mesajYazari: UYE }), true,
        `${emoji} yakalanmadı`,
      );
    }
  });

  it('başkasının oyu serbest', () => {
    assert.equal(kendiOyuMu({ emoji: YUKARI, tepkiVeren: BASKASI, mesajYazari: UYE }), false);
  });

  it('botun kendi bıraktığı oy düğmesi kaldırılmıyor', () => {
    assert.equal(
      kendiOyuMu({ emoji: YUKARI, tepkiVeren: BOT, mesajYazari: BOT, botId: BOT }), false,
    );
  });

  it('bizim olmayan emojilere karışılmıyor', () => {
    for (const emoji of ['🔥', '❤️', '👍']) {
      assert.equal(kendiOyuMu({ emoji, tepkiVeren: UYE, mesajYazari: UYE }), false, emoji);
    }
  });

  it('varyasyon seçici farkı engeli atlatmıyor', () => {
    // Discord tepkiyi bazen "⬆" olarak veriyor; ikisi aynı sayılmazsa
    // kendine oy engeli sessizce boşa düşer.
    assert.equal(kendiOyuMu({ emoji: '⬆', tepkiVeren: UYE, mesajYazari: UYE }), true);
  });

  it('kimlikler metin olarak karşılaştırılıyor (snowflake bozulmasın)', () => {
    assert.ok(Number(UYE) > Number.MAX_SAFE_INTEGER);
    // Sayıya çevrilmiş kimlik aynı kişi değildir; engel onu kendi oyu saymamalı.
    assert.equal(kendiOyuMu({ emoji: YUKARI, tepkiVeren: Number(UYE), mesajYazari: UYE }), false);
  });

  it('eksik alanlarda çökmüyor', () => {
    assert.equal(kendiOyuMu({ emoji: YUKARI, tepkiVeren: UYE, mesajYazari: null }), false);
    assert.equal(kendiOyuMu({ emoji: null, tepkiVeren: UYE, mesajYazari: UYE }), false);
    assert.equal(kendiOyuMu({}), false);
  });

  it('olay doğru intent ile bağlanıyor ve intent açık', () => {
    assert.equal(tepkiOlayi, 'messageReactionAdd');
    assert.deepEqual(tepkiIntent, ['GuildMessageReactions']);
    // Olay, istemcinin gerçekten açtığı intent'lerde yoksa hiç bağlanmaz.
    assert.ok(intentAdlari(TEMEL_INTENTLER).includes('GuildMessageReactions'));
  });
});

describe('eski kendi oylarının temizliği', () => {
  const YAZAR = 'uye-1';

  /** Kaldırma çağrılarını kaydeden sahte tepki. */
  function sahteTepki(emoji, kullanicilar, { me = true } = {}) {
    const kume = new Set(kullanicilar);
    const kaldirilan = [];

    return {
      emoji: { name: emoji },
      me,
      // Bot her zaman bir tepki bırakıyor, sayıya o da dahil.
      count: kume.size + (me ? 1 : 0),
      users: {
        kaldirilan,
        fetch: async () => kume,
        remove: async (id) => { kaldirilan.push(id); kume.delete(id); },
      },
    };
  }

  function mesajla(tepkiler, yazarId = YAZAR) {
    return {
      author: { id: yazarId },
      reactions: { cache: new Map(tepkiler.map((t, i) => [String(i), t])) },
    };
  }

  it('yazarın kendi oyu kaldırılıyor', async () => {
    const yukari = sahteTepki(YUKARI, [YAZAR, 'uye-2']);
    const mesaj = mesajla([yukari]);

    assert.equal(await kendiOylariniTemizle(mesaj), 1);
    assert.deepEqual(yukari.users.kaldirilan, [YAZAR]);
  });

  it('başkalarının oyuna dokunulmuyor', async () => {
    const yukari = sahteTepki(YUKARI, ['uye-2', 'uye-3']);
    const mesaj = mesajla([yukari]);

    assert.equal(await kendiOylariniTemizle(mesaj), 0);
    assert.deepEqual(yukari.users.kaldirilan, []);
  });

  it('yalnız botun tepkisi varsa kullanıcı listesi hiç çekilmiyor', async () => {
    const yukari = sahteTepki(YUKARI, []);
    let cekildi = false;
    yukari.users.fetch = async () => { cekildi = true; return new Set(); };

    assert.equal(await kendiOylariniTemizle(mesajla([yukari])), 0);
    assert.equal(cekildi, false, 'gereksiz istek atıldı');
  });

  it('iki yönde de kendi oyu temizleniyor', async () => {
    const yukari = sahteTepki(YUKARI, [YAZAR]);
    const asagi = sahteTepki(ASAGI, [YAZAR]);

    assert.equal(await kendiOylariniTemizle(mesajla([yukari, asagi])), 2);
  });

  it('bizim olmayan emojiler atlanıyor', async () => {
    const kalp = sahteTepki('❤️', [YAZAR]);
    assert.equal(await kendiOylariniTemizle(mesajla([kalp])), 0);
    assert.deepEqual(kalp.users.kaldirilan, []);
  });

  it('yazarı okunamayan mesajda çökmüyor', async () => {
    assert.equal(await kendiOylariniTemizle({ reactions: { cache: new Map() } }), 0);
    assert.equal(await kendiOylariniTemizle(null), 0);
  });

  it('geçmiş taraması kendi oylarını sayıp bildiriyor', async () => {
    const yukari = sahteTepki(YUKARI, [YAZAR]);
    const mesaj = {
      id: 'm1', guildId: 'g1', system: false, author: { id: YAZAR },
      reactions: yukari ? { cache: new Map([['0', yukari]]) } : null,
      react: async () => {},
    };
    // Bot iki tepkiyi de bırakmış sayılsın ki "eklenen" karışmasın.
    mesaj.reactions.cache.set('1', sahteTepki(ASAGI, []));

    const kanal = { messages: { fetch: async () => [mesaj] } };
    const sayac = await gecmisiOyla(kanal, { botId: BOT, adet: 1 });

    assert.equal(sayac.kendiOyu, 1);
    assert.deepEqual(yukari.users.kaldirilan, [YAZAR]);
  });

  it('temizlik kapatılabiliyor', async () => {
    const yukari = sahteTepki(YUKARI, [YAZAR]);
    const mesaj = {
      id: 'm1', guildId: 'g1', system: false, author: { id: YAZAR },
      reactions: { cache: new Map([['0', yukari], ['1', sahteTepki(ASAGI, [])]]) },
      react: async () => {},
    };

    const kanal = { messages: { fetch: async () => [mesaj] } };
    const sayac = await gecmisiOyla(kanal, { botId: BOT, adet: 1, kendiOylariniAyikla: false });

    assert.equal(sayac.kendiOyu, 0);
    assert.deepEqual(yukari.users.kaldirilan, []);
  });
});
