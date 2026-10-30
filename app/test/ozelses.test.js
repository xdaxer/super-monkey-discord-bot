import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { OverwriteType, PermissionFlagsBits } from 'discord.js';

import { bosOdayiSil, olaylar } from '../events/ozelses.js';
import { AYARLAR, SECENEK_SINIRI, SISTEMLER } from '../lib/ayarlar.js';
import { acVeritabani } from '../lib/db.js';
import { intentAdlari, TEMEL_INTENTLER } from '../lib/intents.js';
import {
  AD_SINIRI, BOT_IZINLERI, SAHIP_IZINLERI, SES_IZINLERI, SOHBET_IZINLERI, YEDEK_AD, adSinirlayici, durumOku,
  izinListesi, limitAyristir, listeyeTasi, odaAdi, odaBosMu, odaGetir, odaKaydet, odaSil,
  paneliKullanabilirMi, sahibinOdalari, sahiplikAlinabilirMi, sahipYaz, sesGecisi, tumOdalar,
} from '../lib/ozelses.js';
import { createInteractionHandler } from '../lib/interactions.js';
import { ozelsesBilesenleri, panelMesaji } from '../lib/ozelses-bilesen.js';

const SAHIP = '1100000000000000001';
const BOT = '1100000000000000002';
const HERKES = '1100000000000000003';
const HUB = 'hub';

const bitler = (bayraklar) => bayraklar.reduce((a, b) => a | b, 0n);
const bul = (liste, id) => liste.find((iz) => iz.id === id);

describe('oda adı', () => {
  it('şablondaki {kullanici} görünen adla doluyor', () => {
    assert.equal(odaAdi('🔊 {kullanici}', 'Daxer'), '🔊 Daxer');
    assert.equal(odaAdi('{kullanici} odası', 'Ali'), 'Ali odası');
  });

  it('Discord ad sınırında kırpılıyor', () => {
    const ad = odaAdi('{kullanici}', 'x'.repeat(250));
    assert.equal(ad.length, AD_SINIRI);
  });

  it('boş sonuçta yedek ad kullanılıyor', () => {
    assert.equal(odaAdi('   ', 'Ali'), YEDEK_AD);
    assert.equal(odaAdi('{kullanici}', ''), YEDEK_AD);
    assert.equal(odaAdi(null, 'Ali'), YEDEK_AD);
  });
});

describe('ses durumu geçişi', () => {
  it('oda oluştur kanalına giriş algılanıyor', () => {
    assert.deepEqual(
      sesGecisi({ oncekiKanalId: null, sonrakiKanalId: HUB, hubId: HUB }),
      { hubaGirdi: true, ayrilanKanalId: null },
    );
  });

  it('başka kanaldan oda oluştura geçiş: hem giriş hem ayrılış', () => {
    assert.deepEqual(
      sesGecisi({ oncekiKanalId: 'oda', sonrakiKanalId: HUB, hubId: HUB }),
      { hubaGirdi: true, ayrilanKanalId: 'oda' },
    );
  });

  it('sesten çıkış yalnız ayrılış', () => {
    assert.deepEqual(
      sesGecisi({ oncekiKanalId: 'oda', sonrakiKanalId: null, hubId: HUB }),
      { hubaGirdi: false, ayrilanKanalId: 'oda' },
    );
  });

  it('aynı kanalda susturma/yayın değişimi hiçbir şey tetiklemiyor', () => {
    assert.deepEqual(
      sesGecisi({ oncekiKanalId: HUB, sonrakiKanalId: HUB, hubId: HUB }),
      { hubaGirdi: false, ayrilanKanalId: null },
    );
  });

  it('hub ayarsız (sistem kapalı) iken oda açılmıyor ama ayrılış görülüyor', () => {
    assert.deepEqual(
      sesGecisi({ oncekiKanalId: 'oda', sonrakiKanalId: HUB, hubId: null }),
      { hubaGirdi: false, ayrilanKanalId: 'oda' },
    );
  });
});

describe('izin listesi', () => {
  const ust = [
    { id: HERKES, type: OverwriteType.Role, allow: 0n, deny: PermissionFlagsBits.ViewChannel },
  ];

  it('kategori izinleri aynen devralınıyor', () => {
    const liste = izinListesi({ ustIzinler: ust, sahipId: SAHIP, botId: BOT });
    assert.equal(bul(liste, HERKES).deny, PermissionFlagsBits.ViewChannel);
  });

  it('sahip odasını yönetebiliyor ama izinleri değiştiremiyor', () => {
    const sahip = bul(izinListesi({ sahipId: SAHIP, botId: BOT }), SAHIP);
    assert.equal(sahip.type, OverwriteType.Member);
    assert.equal(sahip.allow, bitler(SAHIP_IZINLERI));
    assert.equal(sahip.allow & PermissionFlagsBits.ManageRoles, 0n);
    assert.ok(sahip.allow & PermissionFlagsBits.ManageChannels);
    assert.ok(sahip.allow & PermissionFlagsBits.MoveMembers);
  });

  it('bot odayı yönetip üye taşıyabiliyor', () => {
    const bot = bul(izinListesi({ sahipId: SAHIP, botId: BOT }), BOT);
    assert.equal(bot.allow, bitler(BOT_IZINLERI));
  });

  it('sahibe kategoride konmuş yasak, verdiğimiz izinlerde kalkıyor', () => {
    const liste = izinListesi({
      ustIzinler: [{
        id: SAHIP, type: OverwriteType.Member, allow: 0n,
        deny: PermissionFlagsBits.Connect | PermissionFlagsBits.UseSoundboard,
      }],
      sahipId: SAHIP,
      botId: BOT,
    });
    const sahip = bul(liste, SAHIP);
    assert.equal(sahip.deny & PermissionFlagsBits.Connect, 0n);
    // Bizim vermediğimiz yasak korunuyor.
    assert.equal(sahip.deny & PermissionFlagsBits.UseSoundboard, PermissionFlagsBits.UseSoundboard);
  });

  it('botta olmayan izin ne veriliyor ne yasaklanıyor', () => {
    const botYetkileri = bitler(BOT_IZINLERI) | PermissionFlagsBits.Speak;
    const liste = izinListesi({ ustIzinler: ust, sahipId: SAHIP, botId: BOT, botYetkileri });
    const sahip = bul(liste, SAHIP);
    assert.equal(sahip.allow & PermissionFlagsBits.Stream, 0n);
    assert.ok(sahip.allow & PermissionFlagsBits.Speak);
    // ViewChannel botta var: kategori yasağı korunuyor.
    assert.equal(bul(liste, HERKES).deny, PermissionFlagsBits.ViewChannel);
  });

  it('kimlikler metin olarak tutuluyor', () => {
    for (const iz of izinListesi({ sahipId: SAHIP, botId: BOT })) {
      assert.equal(typeof iz.id, 'string');
    }
  });
});

describe('oda boş mu', () => {
  it('bot olmayan kimse yoksa boş', () => {
    assert.equal(odaBosMu([]), true);
    assert.equal(odaBosMu([{ user: { bot: true } }]), true);
    assert.equal(odaBosMu(undefined), true);
  });

  it('bir üye varsa dolu', () => {
    assert.equal(odaBosMu([{ user: { bot: true } }, { user: { bot: false } }]), false);
  });
});

describe('oda kayıt tablosu', () => {
  it('kaydediliyor, okunuyor ve siliniyor', () => {
    const db = acVeritabani(':memory:');
    odaKaydet(db, { kanalId: 'k1', guildId: 'g', sahipId: SAHIP, simdi: 1 });
    assert.equal(odaGetir(db, 'k1').sahip_id, SAHIP);
    assert.equal(odaSil(db, 'k1'), true);
    assert.equal(odaGetir(db, 'k1'), null);
    assert.equal(odaSil(db, 'k1'), false);
  });

  it('sahibin odaları yeniden eskiye, sunucuya göre ayrı', () => {
    const db = acVeritabani(':memory:');
    odaKaydet(db, { kanalId: 'k1', guildId: 'g', sahipId: SAHIP, simdi: 1 });
    odaKaydet(db, { kanalId: 'k2', guildId: 'g', sahipId: SAHIP, simdi: 2 });
    odaKaydet(db, { kanalId: 'k3', guildId: 'baska', sahipId: SAHIP, simdi: 3 });
    assert.deepEqual(sahibinOdalari(db, 'g', SAHIP).map((o) => o.kanal_id), ['k2', 'k1']);
    assert.equal(tumOdalar(db, 'g').length, 2);
  });

  it('kayıtlı olmayan kanal oda sayılmıyor (elle açılmış kanala dokunulmaz)', () => {
    const db = acVeritabani(':memory:');
    assert.equal(odaGetir(db, HUB), null);
  });
});

/** Olay dosyasını sahte guild ile sürmek için en küçük düzen. */
function sahteGuild({ kanallar = {}, silinen = [] } = {}) {
  const cache = new Map(Object.entries(kanallar).map(([id, uyeler]) => [id, {
    id,
    members: new Map(uyeler.map((u, i) => [String(i), u])),
    delete: async () => { silinen.push(id); },
  }]));
  return {
    id: 'g-test',
    channels: { cache, fetch: async (id) => cache.get(id) ?? null },
  };
}

describe('ses olayı', () => {
  const sesOlayi = olaylar.find((o) => o.name === 'voiceStateUpdate');

  it('GuildVoiceStates olmadan bağlanmıyor; intent istemcide açık', () => {
    assert.deepEqual(sesOlayi.gerekliIntent, ['GuildVoiceStates']);
    assert.ok(intentAdlari(TEMEL_INTENTLER).includes('GuildVoiceStates'));
  });

  it('ayar kaydı: sistem kapalı gelir, anahtarlar tanımlı, sistem sınırı aşılmıyor', () => {
    assert.equal(SISTEMLER.ozelses.varsayilan, false);
    assert.equal(AYARLAR['ozelses.kanal'].tur, 'kanal');
    assert.equal(AYARLAR['ozelses.ad'].varsayilan, '🔊 {kullanici}');
    assert.equal(AYARLAR['ozelses.limit'].varsayilan, 0);
    assert.equal(AYARLAR['ozelses.limit'].max, 99);
    assert.ok(Object.keys(SISTEMLER).length <= SECENEK_SINIRI);
  });

});

describe('boş oda silme', () => {
  const uye = { user: { bot: false } };
  const bot = { user: { bot: true } };

  it('kayıtlı ve boş oda siliniyor, kaydı kalkıyor', async () => {
    const db = acVeritabani(':memory:');
    const silinen = [];
    odaKaydet(db, { kanalId: 'oda', guildId: 'g-test', sahipId: SAHIP });
    await bosOdayiSil(sahteGuild({ kanallar: { oda: [bot] }, silinen }), db, 'oda');
    assert.deepEqual(silinen, ['oda']);
    assert.equal(odaGetir(db, 'oda'), null);
  });

  it('içinde üye kalan oda silinmiyor', async () => {
    const db = acVeritabani(':memory:');
    const silinen = [];
    odaKaydet(db, { kanalId: 'oda', guildId: 'g-test', sahipId: SAHIP });
    await bosOdayiSil(sahteGuild({ kanallar: { oda: [uye] }, silinen }), db, 'oda');
    assert.deepEqual(silinen, []);
    assert.ok(odaGetir(db, 'oda'));
  });

  it('kayıtlı olmayan boş kanala (oda oluştur, elle açılmış) dokunulmuyor', async () => {
    const db = acVeritabani(':memory:');
    const silinen = [];
    await bosOdayiSil(sahteGuild({ kanallar: { [HUB]: [], elle: [] }, silinen }), db, HUB);
    await bosOdayiSil(sahteGuild({ kanallar: { [HUB]: [], elle: [] }, silinen }), db, 'elle');
    assert.deepEqual(silinen, []);
  });

  it('artık olmayan odanın kaydı temizleniyor', async () => {
    const db = acVeritabani(':memory:');
    odaKaydet(db, { kanalId: 'yok', guildId: 'g-test', sahipId: SAHIP });
    await bosOdayiSil(sahteGuild(), db, 'yok');
    assert.equal(odaGetir(db, 'yok'), null);
  });

  it('zaten silinmiş kanal hatası kaydı temizliyor, başka hata kaydı koruyor', async () => {
    const db = acVeritabani(':memory:');
    odaKaydet(db, { kanalId: 'a', guildId: 'g-test', sahipId: SAHIP });
    odaKaydet(db, { kanalId: 'b', guildId: 'g-test', sahipId: SAHIP });
    const guild = sahteGuild({ kanallar: { a: [], b: [] } });
    guild.channels.cache.get('a').delete = async () => { throw Object.assign(new Error('Unknown Channel'), { code: 10003 }); };
    guild.channels.cache.get('b').delete = async () => { throw new Error('Missing Permissions'); };
    const uyari = console.warn;
    console.warn = () => {};
    try {
      await bosOdayiSil(guild, db, 'a');
      await bosOdayiSil(guild, db, 'b');
    } finally {
      console.warn = uyari;
    }
    assert.equal(odaGetir(db, 'a'), null);
    assert.ok(odaGetir(db, 'b'));
  });
});

describe('ses kanalı sohbeti', () => {
  it('@everyone odada yazabiliyor ve geçmişi okuyabiliyor', () => {
    const liste = izinListesi({ sahipId: SAHIP, botId: BOT, everyoneId: HERKES });
    const herkes = bul(liste, HERKES);
    assert.equal(herkes.type, OverwriteType.Role);
    assert.equal(herkes.allow & bitler(SOHBET_IZINLERI), bitler(SOHBET_IZINLERI));
  });

  it('@everyone ve sahip ses etkinliğini kullanabiliyor (yalnız bas-konuş değil)', () => {
    const liste = izinListesi({ sahipId: SAHIP, botId: BOT, everyoneId: HERKES });
    assert.deepEqual(SES_IZINLERI, [PermissionFlagsBits.UseVAD]);
    assert.ok(bul(liste, HERKES).allow & PermissionFlagsBits.UseVAD);
    assert.ok(bul(liste, SAHIP).allow & PermissionFlagsBits.UseVAD);
  });

  it('kilitli odada da ses etkinliği açık kalıyor', () => {
    const liste = izinListesi({
      sahipId: SAHIP, botId: BOT, everyoneId: HERKES,
      durum: { kilitli: true, gizli: true, izinliler: [], engelliler: [] },
    });
    assert.ok(bul(liste, HERKES).allow & PermissionFlagsBits.UseVAD);
  });

  it('kategorinin @everyone izinleri korunarak sohbet ekleniyor', () => {
    const ust = [{
      id: HERKES, type: OverwriteType.Role,
      allow: PermissionFlagsBits.Connect | PermissionFlagsBits.Speak, deny: 0n,
    }];
    const herkes = bul(izinListesi({ ustIzinler: ust, sahipId: SAHIP, botId: BOT, everyoneId: HERKES }), HERKES);
    assert.ok(herkes.allow & PermissionFlagsBits.Connect);
    assert.ok(herkes.allow & PermissionFlagsBits.SendMessages);
  });

  it('bot panel mesajını yazabiliyor', () => {
    const bot = bul(izinListesi({ sahipId: SAHIP, botId: BOT }), BOT);
    assert.ok(bot.allow & PermissionFlagsBits.SendMessages);
    assert.ok(bot.allow & PermissionFlagsBits.EmbedLinks);
  });
});

describe('kilit, gizlilik, izinli ve engelli', () => {
  const MOD = '1100000000000000009';
  const DOST = '1100000000000000010';
  const KOTU = '1100000000000000011';
  const ust = [
    { id: HERKES, type: OverwriteType.Role, allow: PermissionFlagsBits.Connect, deny: 0n },
    { id: MOD, type: OverwriteType.Role, allow: PermissionFlagsBits.Connect | PermissionFlagsBits.ViewChannel, deny: 0n },
  ];
  const hesapla = (durum) => izinListesi({
    ustIzinler: ust, sahipId: SAHIP, botId: BOT, everyoneId: HERKES, durum,
  });
  const tam = { kilitli: false, gizli: false, izinliler: [], engelliler: [] };

  it('kilit @everyone ve kategori rollerinde Connect yasaklıyor', () => {
    const liste = hesapla({ ...tam, kilitli: true });
    for (const id of [HERKES, MOD]) {
      assert.ok(bul(liste, id).deny & PermissionFlagsBits.Connect, id);
      assert.equal(bul(liste, id).allow & PermissionFlagsBits.Connect, 0n, id);
    }
    // Sahip ve bot üye izniyle yine girer.
    assert.ok(bul(liste, SAHIP).allow & PermissionFlagsBits.Connect);
    assert.ok(bul(liste, BOT).allow & PermissionFlagsBits.Connect);
  });

  it('gizleme ViewChannel yasaklıyor, kilit kapalıysa Connect dokunulmuyor', () => {
    const herkes = bul(hesapla({ ...tam, gizli: true }), HERKES);
    assert.ok(herkes.deny & PermissionFlagsBits.ViewChannel);
    assert.ok(herkes.allow & PermissionFlagsBits.Connect);
  });

  it('kilidi açmak kategorinin özgün iznine dönüyor', () => {
    const acik = hesapla(tam);
    assert.ok(bul(acik, MOD).allow & PermissionFlagsBits.Connect);
    assert.equal(bul(acik, HERKES).deny & PermissionFlagsBits.Connect, 0n);
  });

  it('izinli üye kilitli ve gizli odaya girebiliyor, engelli giremiyor', () => {
    const liste = hesapla({ kilitli: true, gizli: true, izinliler: [DOST], engelliler: [KOTU] });
    assert.equal(bul(liste, DOST).allow & bitler([PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel]),
      bitler([PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel]));
    assert.ok(bul(liste, KOTU).deny & PermissionFlagsBits.Connect);
  });

  it('sahip ve bot engellenemiyor, izinli listesine de düşmüyor', () => {
    const liste = hesapla({ ...tam, engelliler: [SAHIP, BOT] });
    assert.equal(bul(liste, SAHIP).deny & PermissionFlagsBits.Connect, 0n);
    assert.equal(bul(liste, BOT).deny & PermissionFlagsBits.Connect, 0n);
  });

  it('durum izinlerden geri okunuyor (yaz → oku aynı)', () => {
    const durum = { kilitli: true, gizli: false, izinliler: [DOST], engelliler: [KOTU] };
    const okunan = durumOku(hesapla(durum), { everyoneId: HERKES, sahipId: SAHIP, botId: BOT });
    assert.deepEqual(okunan, durum);
    assert.deepEqual(
      durumOku(hesapla(tam), { everyoneId: HERKES, sahipId: SAHIP, botId: BOT }), tam,
    );
  });

  it('sahiplik devrinde eski sahip izinli sayılmıyor, yeni sahip yetki alıyor', () => {
    const eski = hesapla({ ...tam, kilitli: true });
    const durum = durumOku(eski, { everyoneId: HERKES, sahipId: SAHIP, botId: BOT });
    assert.deepEqual(durum.izinliler, []);
    const yeni = izinListesi({ ustIzinler: ust, sahipId: DOST, botId: BOT, everyoneId: HERKES, durum });
    assert.equal(bul(yeni, SAHIP), undefined);
    assert.ok(bul(yeni, DOST).allow & PermissionFlagsBits.ManageChannels);
    assert.ok(bul(yeni, HERKES).deny & PermissionFlagsBits.Connect);
  });

  it('izinli ↔ engelli taşınınca öbür listeden çıkıyor', () => {
    const d1 = listeyeTasi(tam, [DOST], 'izinliler');
    const d2 = listeyeTasi(d1, [DOST, KOTU], 'engelliler');
    assert.deepEqual(d2.izinliler, []);
    assert.deepEqual(d2.engelliler, [DOST, KOTU]);
    assert.deepEqual(listeyeTasi(d2, [DOST], 'izinliler').engelliler, [KOTU]);
  });
});

describe('panel girdileri ve yetki', () => {
  it('kişi sınırı 0-99 tam sayı', () => {
    assert.deepEqual(limitAyristir('0'), { ok: true, deger: 0 });
    assert.deepEqual(limitAyristir(' 12 '), { ok: true, deger: 12 });
    for (const kotu of ['100', '-1', '2.5', 'beş', '']) assert.equal(limitAyristir(kotu).ok, false, kotu);
  });

  it('ad değişimi kanal başına 10 dakikada 2 kez', () => {
    const s = adSinirlayici();
    assert.equal(s.dene('k', 0).ok, true);
    assert.equal(s.dene('k', 1000).ok, true);
    const red = s.dene('k', 2000);
    assert.equal(red.ok, false);
    assert.equal(red.kalanMs, 10 * 60_000 - 2000);
    assert.equal(s.dene('baska', 2000).ok, true);
    assert.equal(s.dene('k', 10 * 60_000).ok, true);
  });

  it('paneli sahip ve yetkili kullanabiliyor, başkası kullanamıyor', () => {
    const kayit = { sahip_id: SAHIP };
    assert.equal(paneliKullanabilirMi(kayit, SAHIP), true);
    assert.equal(paneliKullanabilirMi(kayit, BOT), false);
    assert.equal(paneliKullanabilirMi(kayit, BOT, true), true);
    assert.equal(paneliKullanabilirMi(null, SAHIP, true), false);
  });

  it('sahiplik yalnız sahip odada yokken odadakine geçiyor', () => {
    const kayit = { sahip_id: SAHIP };
    assert.equal(sahiplikAlinabilirMi(kayit, BOT, [BOT]), true);
    assert.equal(sahiplikAlinabilirMi(kayit, BOT, [BOT, SAHIP]), false);
    assert.equal(sahiplikAlinabilirMi(kayit, BOT, []), false);
    assert.equal(sahiplikAlinabilirMi(kayit, SAHIP, [SAHIP]), false);
  });

  it('sahiplik kayda yazılıyor', () => {
    const db = acVeritabani(':memory:');
    odaKaydet(db, { kanalId: 'k', guildId: 'g', sahipId: SAHIP });
    sahipYaz(db, 'k', BOT);
    assert.equal(odaGetir(db, 'k').sahip_id, BOT);
  });
});

describe('kontrol paneli', () => {
  const idler = panelMesaji(SAHIP).components
    .flatMap((satir) => satir.components.map((b) => b.data.custom_id));

  it('yedi tuş var, kimlikleri benzersiz', () => {
    assert.equal(idler.length, 7);
    assert.equal(new Set(idler).size, 7);
  });

  it('her tuşun bir işleyicisi var', () => {
    const bilesenler = ozelsesBilesenleri();
    for (const id of idler) {
      const eslesen = bilesenler.filter((b) => b.eslesir({ isButton: () => true, customId: id }));
      assert.equal(eslesen.length, 1, id);
    }
  });

  it('kullanıcı seçimi etkileşimi yönlendiriciye ulaşıyor', async () => {
    let calisan = null;
    const handler = createInteractionHandler(new Map(), { error() {} }, {
      bilesenler: [{ eslesir: (i) => i.isUserSelectMenu?.(), calistir: (i) => { calisan = i.customId; } }],
    });
    await handler({
      isChatInputCommand: () => false, isAutocomplete: () => false, isButton: () => false,
      isModalSubmit: () => false, isUserSelectMenu: () => true, customId: 'ozelses:sec:izin',
    });
    assert.equal(calisan, 'ozelses:sec:izin');
  });

  it('panel kimseyi etiketlemiyor', () => {
    assert.deepEqual(panelMesaji(SAHIP).allowedMentions, { parse: [] });
  });
});
