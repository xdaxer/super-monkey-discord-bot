import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { data } from '../commands/hatirlatici/hatirlat.js';
import { SISTEMLER, sistemAyarla } from '../lib/ayarlar.js';
import { acVeritabani } from '../lib/db.js';
import {
  bekleyenler, DURUMLAR, EN_KISA_MS, hatirlaticiEkle, hatirlaticiGetir, hatirlatmaIcerigi,
  iptalEt, mesajBagla, teslimAl, zamanAyristir, zamaniGelenler,
} from '../lib/hatirlatici.js';
import { birTur } from '../servisler/hatirlatici.js';

const G = 'g1';
const K = 'kanal-1';
const U = 'uye-1';

// 2026-10-02 12:00 Türkiye saati (UTC 09:00).
const SIMDI = Date.UTC(2026, 9, 2, 9, 0);
const tr = (yil, ay, gun, saat, dk) => Date.UTC(yil, ay - 1, gun, saat - 3, dk);

describe('zamanAyristir', () => {
  it('göreli ve bileşik süreleri okur', () => {
    assert.deepEqual(zamanAyristir('30dk', SIMDI), { ok: true, zaman: SIMDI + 30 * 60_000 });
    assert.deepEqual(zamanAyristir('1sa30dk', SIMDI), { ok: true, zaman: SIMDI + 90 * 60_000 });
    assert.deepEqual(zamanAyristir('2g 3sa', SIMDI), { ok: true, zaman: SIMDI + 51 * 3_600_000 });
    assert.deepEqual(zamanAyristir('1hf', SIMDI), { ok: true, zaman: SIMDI + 7 * 86_400_000 });
  });

  it('saati Türkiye saatiyle okur; geçtiyse yarına atar', () => {
    assert.deepEqual(zamanAyristir('21:30', SIMDI), { ok: true, zaman: tr(2026, 10, 2, 21, 30) });
    assert.deepEqual(zamanAyristir('09:00', SIMDI), { ok: true, zaman: tr(2026, 10, 3, 9, 0) });
    assert.deepEqual(zamanAyristir('Yarın 13.15', SIMDI), { ok: true, zaman: tr(2026, 10, 3, 13, 15) });
  });

  it('Türkiye gece yarısını UTC tarihinden ayırır', () => {
    // UTC 22:30 = TR 01:30 ertesi gün; "02:00" aynı TR gününün 02:00'ı olmalı.
    const gece = Date.UTC(2026, 9, 2, 22, 30);
    assert.deepEqual(zamanAyristir('02:00', gece), { ok: true, zaman: tr(2026, 10, 3, 2, 0) });
  });

  it('tarihli zamanı okur; yılsız geçmiş tarih gelecek yıla gider', () => {
    assert.deepEqual(zamanAyristir('05.10 21:30', SIMDI), { ok: true, zaman: tr(2026, 10, 5, 21, 30) });
    assert.deepEqual(zamanAyristir('01/01/2027 00:00', SIMDI), { ok: true, zaman: tr(2027, 1, 1, 0, 0) });
    assert.deepEqual(zamanAyristir('01.10 10:00', SIMDI), { ok: true, zaman: tr(2027, 10, 1, 10, 0) });
  });

  it('geçersiz, geçmiş ve sınır dışı zamanları reddeder', () => {
    for (const girdi of ['', 'saçma', '25:00', '31.02 10:00', '01.10.2026 10:00', '30sn', '400g', '0dk']) {
      assert.equal(zamanAyristir(girdi, SIMDI).ok, false, girdi);
    }
    assert.equal(zamanAyristir('1dk', SIMDI).ok, true);
    assert.equal(EN_KISA_MS, 60_000);
  });
});

describe('hatırlatma içeriği', () => {
  const temel = { id: 1, guild_id: G, kanal_id: K, kullanici_id: U, mesaj: 'toplantı\nsaat 3' };

  it('kurucuyu etiketler, mesajı alıntılar, başka kimseyi çağırmaz', () => {
    const icerik = hatirlatmaIcerigi({ ...temel, mesaj: '@everyone toplantı\nsaat 3' });
    assert.equal(icerik.content, `⏰ <@${U}> hatırlatma:\n> @everyone toplantı\n> saat 3`);
    assert.deepEqual(icerik.allowedMentions, { parse: [], users: [U], roles: [] });
  });

  it('seçilen rolü ve kişiyi ekler; @everyone yalnız açıkça seçilince çağrılır', () => {
    const rol = hatirlatmaIcerigi({ ...temel, etiket_id: 'r1', etiket_tur: 'rol' });
    assert.match(rol.content, /^⏰ <@uye-1> <@&r1> hatırlatma:/);
    assert.deepEqual(rol.allowedMentions, { parse: [], users: [U], roles: ['r1'] });

    const herkes = hatirlatmaIcerigi({ ...temel, etiket_id: G, etiket_tur: 'rol' });
    assert.match(herkes.content, /^⏰ <@uye-1> @everyone hatırlatma:/);
    assert.deepEqual(herkes.allowedMentions, { parse: ['everyone'], users: [U], roles: [] });

    const kisi = hatirlatmaIcerigi({ ...temel, etiket_id: 'u2', etiket_tur: 'kullanici' });
    assert.deepEqual(kisi.allowedMentions.users, [U, 'u2']);

    const kendisi = hatirlatmaIcerigi({ ...temel, etiket_id: U, etiket_tur: 'kullanici' });
    assert.match(kendisi.content, /^⏰ <@uye-1> hatırlatma:/);
  });
});

function kurulum() {
  return acVeritabani(':memory:');
}

function ekle(db, ustler = {}) {
  return hatirlaticiEkle(db, {
    guildId: G, kanalId: K, kullaniciId: U, mesaj: 'su iç', zaman: SIMDI + 60_000, simdi: SIMDI,
    ...ustler,
  });
}

describe('hatırlatma kaydı', () => {
  it('bekleyenleri yakından uzağa listeler, zamanı geleni ayırır', () => {
    const db = kurulum();
    const uzak = ekle(db, { zaman: SIMDI + 600_000 });
    const yakin = ekle(db, { zaman: SIMDI + 60_000 });
    ekle(db, { kullaniciId: 'baska' });

    assert.deepEqual(bekleyenler(db, G, U).map((k) => k.id), [yakin, uzak]);
    assert.deepEqual(zamaniGelenler(db, SIMDI + 60_000).map((k) => k.id).sort(), [yakin, 3].sort());
  });

  it('teslim ve iptal yalnız bekleyen kayıtta bir kez olur', () => {
    const db = kurulum();
    const id = ekle(db);
    assert.equal(teslimAl(db, id), true);
    assert.equal(teslimAl(db, id), false);
    assert.equal(iptalEt(db, id), false);
    assert.equal(hatirlaticiGetir(db, id).durum, DURUMLAR.gonderildi);

    const ikinci = ekle(db);
    assert.equal(iptalEt(db, ikinci), true);
    assert.equal(bekleyenler(db, G, U).length, 0);
  });
});

function sahteClient({ kanalVar = true, kanalHata = false } = {}) {
  const kanalaGiden = [];
  const dmGiden = [];
  const kanal = {
    isTextBased: () => true,
    send: async (yuk) => {
      if (kanalHata) throw new Error('Missing Access');
      kanalaGiden.push(yuk);
    },
  };
  return {
    kanalaGiden,
    dmGiden,
    channels: { fetch: async (id) => (kanalVar && id === K ? kanal : null) },
    users: { fetch: async () => ({ send: async (yuk) => { dmGiden.push(yuk); } }) },
  };
}

const sessiz = { error: () => {} };

describe('hatırlatma servisi', () => {
  it('zamanı geleni onay mesajına yanıt olarak bir kez gönderir', async () => {
    const db = kurulum();
    const id = ekle(db, { etiketId: 'r1', etiketTur: 'rol' });
    mesajBagla(db, id, 'onay-1');
    ekle(db, { zaman: SIMDI + 3_600_000 });
    const client = sahteClient();

    const sonuc = await birTur(client, { db, simdi: SIMDI + 60_000, logger: sessiz });
    assert.deepEqual(sonuc, { bakilan: 1, gonderilen: 1, atlanan: 0 });
    assert.equal(client.kanalaGiden.length, 1);
    assert.equal(client.kanalaGiden[0].reply.messageReference, 'onay-1');
    assert.deepEqual(client.kanalaGiden[0].allowedMentions.roles, ['r1']);

    const tekrar = await birTur(client, { db, simdi: SIMDI + 120_000, logger: sessiz });
    assert.equal(tekrar.bakilan, 0);
    assert.equal(client.kanalaGiden.length, 1);
  });

  it('kanala yazılamazsa kurucuya DM atar', async () => {
    const db = kurulum();
    ekle(db);
    const client = sahteClient({ kanalHata: true });

    const sonuc = await birTur(client, { db, simdi: SIMDI + 60_000, logger: sessiz });
    assert.equal(sonuc.gonderilen, 1);
    assert.equal(client.dmGiden.length, 1);
    assert.match(client.dmGiden[0].content, /DM ile geldi/);
  });

  it('sistem kapalıyken bekletir, açılınca gönderir', async () => {
    const db = kurulum();
    const id = ekle(db);
    sistemAyarla(db, G, 'hatirlatici', false);
    const client = sahteClient();

    assert.equal((await birTur(client, { db, simdi: SIMDI + 60_000, logger: sessiz })).atlanan, 1);
    assert.equal(hatirlaticiGetir(db, id).durum, DURUMLAR.bekliyor);

    sistemAyarla(db, G, 'hatirlatici', true);
    assert.equal((await birTur(client, { db, simdi: SIMDI + 60_000, logger: sessiz })).gonderilen, 1);
  });
});

describe('/hatirlat komutu', () => {
  it('kur, liste, sil alt komutları var ve sistem varsayılan açık', () => {
    const json = data.toJSON();
    assert.equal(json.name, 'hatirlat');
    assert.deepEqual(json.options.map((o) => o.name), ['kur', 'liste', 'sil']);
    assert.equal(json.default_member_permissions ?? null, null);
    assert.equal(SISTEMLER.hatirlatici.varsayilan, true);
  });
});
