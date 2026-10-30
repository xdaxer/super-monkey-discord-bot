import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { acVeritabani } from '../lib/db.js';
import {
  abonelikCikar, abonelikEkle, abonelikler, akisCek, kanalIdAyikla,
  rssAyristir, sonVideoYaz, xmlCoz, yeniVideolar,
} from '../lib/youtube.js';
import { birTur, sonGonderilenVideolar } from '../servisler/youtube.js';
import { sistemAyarla } from '../lib/ayarlar.js';

const KANAL = 'UCdefghijklmnopqrstuvwxy';

function akis(videolar) {
  const girdiler = videolar.map((v) => `
    <entry>
      <yt:videoId>${v.id}</yt:videoId>
      <title>${v.baslik}</title>
      <author><name>Test Kanalı</name></author>
      <published>${v.tarih ?? '2026-01-01T00:00:00+00:00'}</published>
    </entry>`).join('');
  return `<?xml version="1.0"?><feed>${girdiler}</feed>`;
}

describe('kanal kimliği ayıklama', () => {
  it('ham kimliği kabul eder', () => {
    assert.equal(kanalIdAyikla(KANAL), KANAL);
    assert.equal(kanalIdAyikla(`  ${KANAL}  `), KANAL);
  });

  it('kanal bağlantısından ayıklar', () => {
    assert.equal(kanalIdAyikla(`https://www.youtube.com/channel/${KANAL}`), KANAL);
  });

  it('geçersiz girdiyi reddeder', () => {
    assert.equal(kanalIdAyikla('@birisi'), null);
    assert.equal(kanalIdAyikla('UCkisa'), null);
    assert.equal(kanalIdAyikla(''), null);
  });
});

describe('RSS ayrıştırma', () => {
  it('videoları okur', () => {
    const videolar = rssAyristir(akis([
      { id: 'v1', baslik: 'Birinci' }, { id: 'v2', baslik: 'İkinci' },
    ]));

    assert.equal(videolar.length, 2);
    assert.equal(videolar[0].videoId, 'v1');
    assert.equal(videolar[0].baslik, 'Birinci');
    assert.equal(videolar[0].url, 'https://www.youtube.com/watch?v=v1');
    assert.equal(videolar[0].kanalAdi, 'Test Kanalı');
  });

  it('XML varlıklarını çözer', () => {
    assert.equal(xmlCoz('Tom &amp; Jerry &quot;iyi&quot;'), 'Tom & Jerry "iyi"');
    const videolar = rssAyristir(akis([{ id: 'v1', baslik: 'A &amp; B' }]));
    assert.equal(videolar[0].baslik, 'A & B');
  });

  it('bozuk veya boş akışta boş dizi döner, fırlatmaz', () => {
    assert.deepEqual(rssAyristir(''), []);
    assert.deepEqual(rssAyristir('<html>hata</html>'), []);
    assert.deepEqual(rssAyristir('<feed><entry><title>id yok</title></entry></feed>'), []);
  });
});

describe('yeni video seçimi', () => {
  const videolar = rssAyristir(akis([
    { id: 'v3', baslik: 'Yeni' }, { id: 'v2', baslik: 'Orta' }, { id: 'v1', baslik: 'Eski' },
  ]));

  it('ilk yoklamada hiçbir şey göndermez', () => {
    assert.deepEqual(yeniVideolar(videolar, null), []);
  });

  it('son bildirilen sonrasını eskiden yeniye verir', () => {
    const yeniler = yeniVideolar(videolar, 'v1');
    assert.deepEqual(yeniler.map((v) => v.videoId), ['v2', 'v3']);
  });

  it('yeni video yoksa boş döner', () => {
    assert.deepEqual(yeniVideolar(videolar, 'v3'), []);
  });

  it('son video akıştan düşmüşse yalnız en yeniyi verir', () => {
    const yeniler = yeniVideolar(videolar, 'cokEski');
    assert.deepEqual(yeniler.map((v) => v.videoId), ['v3']);
  });
});

describe('abonelik tablosu', () => {
  let db;
  beforeEach(() => { db = acVeritabani(':memory:'); });
  afterEach(() => db.close());

  it('ekler, listeler ve çıkarır', () => {
    abonelikEkle(db, { guildId: 'g', kanalId: KANAL, hedefKanalId: 'h', sonVideoId: 'v1' });
    assert.equal(abonelikler(db, 'g').length, 1);
    assert.equal(abonelikCikar(db, 'g', KANAL), true);
    assert.equal(abonelikCikar(db, 'g', KANAL), false);
  });

  it('aynı kanal iki kez eklenince hedefi günceller, satır çoğalmaz', () => {
    abonelikEkle(db, { guildId: 'g', kanalId: KANAL, hedefKanalId: 'h1' });
    abonelikEkle(db, { guildId: 'g', kanalId: KANAL, hedefKanalId: 'h2' });

    const kayitlar = abonelikler(db, 'g');
    assert.equal(kayitlar.length, 1);
    assert.equal(kayitlar[0].hedef_kanal_id, 'h2');
  });
});

describe('akış çekme dayanıklılığı', () => {
  it('HTTP hatasında null döner', async () => {
    const sonuc = await akisCek(KANAL, async () => ({ ok: false, status: 404 }));
    assert.equal(sonuc, null);
  });

  it('ağ hatasında null döner, fırlatmaz', async () => {
    const sonuc = await akisCek(KANAL, async () => { throw new Error('ENOTFOUND'); });
    assert.equal(sonuc, null);
  });
});

describe('yoklama turu', () => {
  let db;
  // YouTube sistemi varsayilan olarak KAPALI (opt-in bildirim); gonderim
  // bekleyen testlerde acikca aciyoruz.
  beforeEach(() => { db = acVeritabani(':memory:'); sistemAyarla(db, 'g', 'youtube', true); });
  afterEach(() => db.close());

  function sahteClient(gonderilenler) {
    return {
      channels: {
        fetch: async () => ({
          isTextBased: () => true,
          guild: null,
          send: async (yuk) => { gonderilenler.push(yuk.content); },
        }),
      },
    };
  }

  it('yalnız yeni videoları gönderir ve işareti ilerletir', async () => {
    abonelikEkle(db, { guildId: 'g', kanalId: KANAL, hedefKanalId: 'h', sonVideoId: 'v1' });

    const gonderilenler = [];
    const getir = async () => ({
      ok: true,
      text: async () => akis([{ id: 'v2', baslik: 'Yeni video' }, { id: 'v1', baslik: 'Eski' }]),
    });

    const sonuc = await birTur(sahteClient(gonderilenler), { db, getir });

    assert.equal(sonuc.gonderilen, 1);
    assert.match(gonderilenler[0], /Yeni video/);
    assert.equal(abonelikler(db, 'g')[0].son_video_id, 'v2');
  });

  it('etiket açıksa @everyone değil Video Bildirimi rolünü etiketler, yalnız o role izin verir', async () => {
    abonelikEkle(db, {
      guildId: 'g', kanalId: KANAL, hedefKanalId: 'h', sonVideoId: 'v1', herkesiEtiketle: true,
    });

    const yukler = [];
    const roller = new Map([['55', { id: '55', name: '🎬 Video Bildirimi' }]]);
    const guild = { roles: { cache: { find: (f) => [...roller.values()].find(f) } } };
    const client = { channels: { fetch: async () => ({ isTextBased: () => true, guild, send: async (y) => { yukler.push(y); } }) } };
    const getir = async () => ({ ok: true, text: async () => akis([{ id: 'v2', baslik: 'Yeni' }, { id: 'v1', baslik: 'Eski' }]) });

    await birTur(client, { db, getir });

    assert.equal(yukler.length, 1);
    assert.ok(yukler[0].content.startsWith('<@&55> '), yukler[0].content);
    assert.ok(!yukler[0].content.includes('@everyone'));
    assert.deepEqual(yukler[0].allowedMentions, { parse: [], roles: ['55'] });
  });

  it("etiket açık ama rol sunucuda yoksa hiç etiket atmaz (@everyone'a düşmez)", async () => {
    abonelikEkle(db, {
      guildId: 'g', kanalId: KANAL, hedefKanalId: 'h', sonVideoId: 'v1', herkesiEtiketle: true,
    });
    const yukler = [];
    const client = { channels: { fetch: async () => ({ isTextBased: () => true, guild: null, send: async (y) => { yukler.push(y); } }) } };
    const getir = async () => ({ ok: true, text: async () => akis([{ id: 'v2', baslik: 'Yeni' }, { id: 'v1', baslik: 'Eski' }]) });

    await birTur(client, { db, getir });

    assert.ok(!yukler[0].content.includes('@everyone'));
    assert.deepEqual(yukler[0].allowedMentions, { parse: [] });
  });

  it('herkesi_etiketle kapalıysa @everyone eklemez ve hiçbir etiketi çözmez', async () => {
    abonelikEkle(db, { guildId: 'g', kanalId: KANAL, hedefKanalId: 'h', sonVideoId: 'v1' });

    const yukler = [];
    const client = { channels: { fetch: async () => ({ isTextBased: () => true, guild: null, send: async (y) => { yukler.push(y); } }) } };
    const getir = async () => ({ ok: true, text: async () => akis([{ id: 'v2', baslik: 'Yeni' }, { id: 'v1', baslik: 'Eski' }]) });

    await birTur(client, { db, getir });

    assert.ok(!yukler[0].content.includes('@everyone'));
    assert.deepEqual(yukler[0].allowedMentions, { parse: [] });
  });

  it('ikinci turda aynı videoyu tekrar göndermez', async () => {
    abonelikEkle(db, { guildId: 'g', kanalId: KANAL, hedefKanalId: 'h', sonVideoId: 'v1' });
    const getir = async () => ({ ok: true, text: async () => akis([{ id: 'v2', baslik: 'Yeni' }, { id: 'v1', baslik: 'Eski' }]) });

    const gonderilenler = [];
    await birTur(sahteClient(gonderilenler), { db, getir });
    await birTur(sahteClient(gonderilenler), { db, getir });

    assert.equal(gonderilenler.length, 1, 'tekilleştirme bozuk');
  });

  it('bir abonelik ağ hatası verirse tur düşmez, diğerleri işlenir', async () => {
    const KANAL2 = 'UCzzzzzzzzzzzzzzzzzzzzzz';
    abonelikEkle(db, { guildId: 'g', kanalId: KANAL, hedefKanalId: 'h', sonVideoId: 'v1' });
    abonelikEkle(db, { guildId: 'g', kanalId: KANAL2, hedefKanalId: 'h', sonVideoId: 'v1' });

    const gonderilenler = [];
    const getir = async (url) => {
      if (url.includes(KANAL)) throw new Error('ağ koptu');
      return { ok: true, text: async () => akis([{ id: 'v9', baslik: 'Sağlam' }, { id: 'v1', baslik: 'Eski' }]) };
    };

    const sonuc = await birTur(sahteClient(gonderilenler), { db, getir });

    assert.equal(sonuc.atlanan, 1);
    assert.equal(sonuc.gonderilen, 1);
    assert.match(gonderilenler[0], /Sağlam/);
  });

  it('kapalı sistemde hiçbir şey göndermez', async () => {
    abonelikEkle(db, { guildId: 'g', kanalId: KANAL, hedefKanalId: 'h', sonVideoId: 'v1' });
    sistemAyarla(db, 'g', 'youtube', false);

    const gonderilenler = [];
    const sonuc = await birTur(sahteClient(gonderilenler), {
      db, getir: async () => ({ ok: true, text: async () => akis([{ id: 'v2', baslik: 'X' }]) }),
    });

    assert.equal(gonderilenler.length, 0);
    assert.equal(sonuc.atlanan, 1);
  });

  it('ilk yoklamada eski videoları toplu göndermez', async () => {
    abonelikEkle(db, { guildId: 'g', kanalId: KANAL, hedefKanalId: 'h', sonVideoId: null });

    const gonderilenler = [];
    await birTur(sahteClient(gonderilenler), {
      db,
      getir: async () => ({
        ok: true,
        text: async () => akis([{ id: 'v3', baslik: 'A' }, { id: 'v2', baslik: 'B' }, { id: 'v1', baslik: 'C' }]),
      }),
    });

    assert.equal(gonderilenler.length, 0);
    assert.equal(abonelikler(db, 'g')[0].son_video_id, 'v3');
  });
});

describe('son gönderilerde tekrar kontrolü', () => {
  let db;
  beforeEach(() => { db = acVeritabani(':memory:'); sistemAyarla(db, 'g', 'youtube', true); });
  afterEach(() => db.close());

  const BOT = 'bot1';

  /** Gönderilenleri mesaj geçmişine de yazan, en yenisi başta dönen sahte kanal. */
  function gecmisliClient(gecmis, gonderilenler = []) {
    const kanal = {
      isTextBased: () => true,
      guild: null,
      send: async (yuk) => {
        gonderilenler.push(yuk.content);
        gecmis.unshift({ author: { id: BOT }, content: yuk.content });
      },
      messages: {
        fetch: async ({ limit }) => new Map(gecmis.slice(0, limit).map((m, i) => [String(i), m])),
      },
    };
    return { user: { id: BOT }, channels: { fetch: async () => kanal } };
  }

  const bildirim = (id, baslik = 'X') => ({
    author: { id: BOT },
    content: `📺 **Test Kanalı** yeni video yayınladı!\n**${baslik}**\nhttps://www.youtube.com/watch?v=${id}`,
  });

  it('eski akış kopyası aynı yayını ikinci kez bildirtmez', async () => {
    abonelikEkle(db, { guildId: 'g', kanalId: KANAL, hedefKanalId: 'h', sonVideoId: 'eskiVideo01' });
    // Eski video da zamanında bildirilmişti.
    const gecmis = [bildirim('eskiVideo01')];
    const gonderilenler = [];
    const client = gecmisliClient(gecmis, gonderilenler);

    const guncel = async () => ({ ok: true, text: async () => akis([{ id: 'canliYayin1', baslik: 'Canlı' }, { id: 'eskiVideo01', baslik: 'Eski' }]) });
    // Yayın açılışında YouTube'un döndürdüğü, yeni yayını içermeyen eski kopya.
    const bayat = async () => ({ ok: true, text: async () => akis([{ id: 'eskiVideo01', baslik: 'Eski' }, { id: 'dahaEski001', baslik: 'Daha eski' }]) });

    await birTur(client, { db, getir: guncel });
    await birTur(client, { db, getir: bayat, logger: { warn() {}, error() {} } });
    const sonuc = await birTur(client, { db, getir: guncel, logger: { warn() {}, error() {} } });

    // Bayat kopyada eski video, sonraki turda canlı yayın yeniden "yeni" görünür; ikisi de engellenmeli.
    assert.equal(gonderilenler.length, 1, gonderilenler.join('\n---\n'));
    assert.match(gonderilenler[0], /canliYayin1/);
    assert.equal(sonuc.tekrarEngellenen, 1);
    assert.equal(abonelikler(db, 'g')[0].son_video_id, 'canliYayin1');
  });

  it('video son 3 gönderide varsa göndermez, yalnız işareti ilerletir', async () => {
    abonelikEkle(db, { guildId: 'g', kanalId: KANAL, hedefKanalId: 'h', sonVideoId: 'v1' });
    const gecmis = [bildirim('aaaaaaaaaaa'), bildirim('yeniVideo01'), bildirim('bbbbbbbbbbb')];
    const gonderilenler = [];
    const getir = async () => ({ ok: true, text: async () => akis([{ id: 'yeniVideo01', baslik: 'Yeni' }, { id: 'v1', baslik: 'Eski' }]) });

    const sonuc = await birTur(gecmisliClient(gecmis, gonderilenler), { db, getir, logger: { warn() {} } });

    assert.equal(gonderilenler.length, 0);
    assert.equal(sonuc.tekrarEngellenen, 1);
    assert.equal(abonelikler(db, 'g')[0].son_video_id, 'yeniVideo01');
  });

  it('video yalnız 4. veya daha eski gönderideyse yine gönderir', async () => {
    abonelikEkle(db, { guildId: 'g', kanalId: KANAL, hedefKanalId: 'h', sonVideoId: 'v1' });
    const gecmis = [bildirim('aaaaaaaaaaa'), bildirim('bbbbbbbbbbb'), bildirim('ccccccccccc'), bildirim('yeniVideo01')];
    const gonderilenler = [];
    const getir = async () => ({ ok: true, text: async () => akis([{ id: 'yeniVideo01', baslik: 'Yeni' }, { id: 'v1', baslik: 'Eski' }]) });

    await birTur(gecmisliClient(gecmis, gonderilenler), { db, getir });

    assert.equal(gonderilenler.length, 1);
  });

  it('aynı başlıklı farklı yayını engellemez', async () => {
    abonelikEkle(db, { guildId: 'g', kanalId: KANAL, hedefKanalId: 'h', sonVideoId: 'v1' });
    const gecmis = [bildirim('dunkuYayin1', 'Her akşam canlı')];
    const gonderilenler = [];
    const getir = async () => ({ ok: true, text: async () => akis([{ id: 'bugunYayin1', baslik: 'Her akşam canlı' }, { id: 'v1', baslik: 'Eski' }]) });

    await birTur(gecmisliClient(gecmis, gonderilenler), { db, getir });

    assert.equal(gonderilenler.length, 1);
  });

  it('başkalarının mesajlarını saymaz; son 3 botun kendi gönderisidir', async () => {
    const gecmis = [
      { author: { id: 'uye' }, content: 'bak https://www.youtube.com/watch?v=uyeninLinki' },
      bildirim('aaaaaaaaaaa'), { author: { id: 'uye' }, content: 'selam' },
      bildirim('bbbbbbbbbbb'), bildirim('ccccccccccc'), bildirim('ddddddddddd'),
    ];
    const kanal = { messages: { fetch: async () => new Map(gecmis.map((m, i) => [String(i), m])) } };

    const kimlikler = await sonGonderilenVideolar(kanal, BOT);

    assert.deepEqual([...kimlikler], ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc']);
  });

  it('geçmiş okunamazsa bildirimi engellemez', async () => {
    abonelikEkle(db, { guildId: 'g', kanalId: KANAL, hedefKanalId: 'h', sonVideoId: 'v1' });
    const gonderilenler = [];
    const kanal = {
      isTextBased: () => true,
      guild: null,
      send: async (yuk) => { gonderilenler.push(yuk.content); },
      messages: { fetch: async () => { throw new Error('Missing Access'); } },
    };
    const getir = async () => ({ ok: true, text: async () => akis([{ id: 'yeniVideo01', baslik: 'Yeni' }, { id: 'v1', baslik: 'Eski' }]) });

    await birTur({ user: { id: BOT }, channels: { fetch: async () => kanal } }, { db, getir });

    assert.equal(gonderilenler.length, 1);
  });
});

describe('sonVideoYaz', () => {
  it('yalnız hedef sunucu ve kanalı günceller', () => {
    const db = acVeritabani(':memory:');
    abonelikEkle(db, { guildId: 'g1', kanalId: KANAL, hedefKanalId: 'h', sonVideoId: 'v1' });
    abonelikEkle(db, { guildId: 'g2', kanalId: KANAL, hedefKanalId: 'h', sonVideoId: 'v1' });

    sonVideoYaz(db, 'g1', KANAL, 'v5');

    assert.equal(abonelikler(db, 'g1')[0].son_video_id, 'v5');
    assert.equal(abonelikler(db, 'g2')[0].son_video_id, 'v1');
    db.close();
  });
});

describe('eski veritabanı geçişi', () => {
  it('herkesi_etiketle sütunu olmayan tabloya sütunu ekler, kayıtları korur', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const path = await import('node:path');
    const { DatabaseSync } = await import('node:sqlite');

    const dizin = mkdtempSync(path.join(tmpdir(), 'yt-gecis-'));
    const yol = path.join(dizin, 'eski.sqlite');
    try {
      const eski = new DatabaseSync(yol);
      eski.exec(`CREATE TABLE youtube_abonelikleri (
        guild_id TEXT NOT NULL, kanal_id TEXT NOT NULL, hedef_kanal_id TEXT NOT NULL,
        son_video_id TEXT, eklenme INTEGER NOT NULL, PRIMARY KEY (guild_id, kanal_id))`);
      eski.prepare('INSERT INTO youtube_abonelikleri VALUES (?, ?, ?, ?, ?)').run('g', KANAL, 'h', 'v1', 1);
      eski.close();

      const db = acVeritabani(yol);
      const kayit = abonelikler(db, 'g')[0];
      assert.equal(kayit.son_video_id, 'v1');
      assert.equal(kayit.herkesi_etiketle, 0);
      db.close();
    } finally {
      rmSync(dizin, { recursive: true, force: true });
    }
  });
});
