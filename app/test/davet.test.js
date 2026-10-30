import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { AYARLAR, SISTEMLER } from '../lib/ayarlar.js';
import {
  ayrilmaIsaretle, baslangicYaz, davetEdeni, davetSayisi, davetSiralamasi, inviteManagerSatiri,
  katilimKaydet, kullanilanDavet,
} from '../lib/davet.js';
import { acVeritabani } from '../lib/db.js';
import { davetEdenSatiri } from '../commands/davet/davet.js';

const G = 'g1';
const kayit = (uses, maxUses = 0, inviterId = 'a') => ({ uses, maxUses, inviterId });

describe('kullanılan davet', () => {
  it('kullanımı artan daveti bulur', () => {
    const once = new Map([['x', kayit(3)], ['y', kayit(1)]]);
    const sonra = new Map([['x', kayit(3)], ['y', kayit(2)]]);
    assert.equal(kullanilanDavet(once, sonra), 'y');
  });

  it('önbellekte olmayan yeni davet bir kez kullanıldıysa onu bulur', () => {
    assert.equal(kullanilanDavet(new Map(), new Map([['yeni', kayit(1)]])), 'yeni');
  });

  it('iki davet birden arttıysa tahmin etmez', () => {
    const once = new Map([['x', kayit(0)], ['y', kayit(0)]]);
    const sonra = new Map([['x', kayit(1)], ['y', kayit(1)]]);
    assert.equal(kullanilanDavet(once, sonra), null);
  });

  it('sınırı dolup Discord\'un sildiği daveti bulur', () => {
    const once = new Map([['x', kayit(4, 5)], ['y', kayit(0)]]);
    const sonra = new Map([['y', kayit(0)]]);
    assert.equal(kullanilanDavet(once, sonra), 'x');
  });

  it('silinme olayı girişten önce geldiyse silinenlerden bulur', () => {
    const silinen = new Map([['x', { ...kayit(0, 1), silinme: Date.now() }]]);
    assert.equal(kullanilanDavet(new Map(), new Map(), silinen), 'x');
  });

  it('sınırı olmayan davetin silinmesini giriş saymaz', () => {
    const once = new Map([['x', kayit(4)]]);
    assert.equal(kullanilanDavet(once, new Map()), null);
  });
});

describe('davet sayımı', () => {
  let db;
  beforeEach(() => { db = acVeritabani(':memory:'); });
  afterEach(() => db.close());

  it('başlangıç + başlangıçtan sonraki bot girişleri', () => {
    baslangicYaz(db, G, 'a', 242, 1_000);
    katilimKaydet(db, G, { uyeId: 'u0', davetEdenId: 'a', zaman: 900 }); // InviteManager zaten saydı
    katilimKaydet(db, G, { uyeId: 'u1', davetEdenId: 'a', zaman: 1_100 });
    katilimKaydet(db, G, { uyeId: 'u2', davetEdenId: 'a', zaman: 1_200 });

    const sayi = davetSayisi(db, G, 'a');
    assert.deepEqual(sayi, { toplam: 244, devralinan: 242, yeni: 2, ayrilan: 0 });
  });

  it('içe aktarılan geçmiş sayıma girmez, kimin davet ettiğini gösterir', () => {
    katilimKaydet(db, G, {
      uyeId: 'u1', davetEdenId: 'a', davetEdenAd: 'alp', kaynak: 'invitemanager', kaynakMesajId: 'm1',
    });
    assert.equal(davetSayisi(db, G, 'a').toplam, 0);
    assert.equal(davetEdeni(db, G, 'u1').davet_eden_ad, 'alp');
  });

  it('aynı InviteManager mesajını iki kez yazmaz', () => {
    const satir = { uyeId: 'u1', kaynak: 'invitemanager', kaynakMesajId: 'm1' };
    katilimKaydet(db, G, satir);
    katilimKaydet(db, G, satir);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM davet_katilimlari').get().n, 1);
  });

  it('ayrılma son açık girişi kapatır ve sayımdan düşmez', () => {
    katilimKaydet(db, G, { uyeId: 'u1', davetEdenId: 'a', zaman: 10 });
    const satir = ayrilmaIsaretle(db, G, 'u1', 20);
    assert.equal(satir.davet_eden_id, 'a');
    assert.equal(ayrilmaIsaretle(db, G, 'u1', 30), null, 'ikinci çıkışta açık giriş kalmadı');
    assert.deepEqual(davetSayisi(db, G, 'a'), { toplam: 1, devralinan: 0, yeni: 1, ayrilan: 1 });
  });

  it('sıralama başlangıcı ve yeni girişleri birleştirir', () => {
    baslangicYaz(db, G, 'a', 5, 100);
    baslangicYaz(db, G, 'b', 1, 100);
    katilimKaydet(db, G, { uyeId: 'u1', davetEdenId: 'b', zaman: 200 });
    katilimKaydet(db, G, { uyeId: 'u2', davetEdenId: 'c', zaman: 200 });
    katilimKaydet(db, G, { uyeId: 'u3', davetEdenId: null, zaman: 200 });

    assert.deepEqual(davetSiralamasi(db, G).map((s) => [s.kullanici_id, s.toplam]), [['a', 5], ['b', 2], ['c', 1]]);
  });
});

describe('InviteManager satırı', () => {
  it('katılım satırını ayrıştırır', () => {
    assert.deepEqual(
      inviteManagerSatiri('<@700000000000000001> **joined**; Invited by **ornek_uye** (**242** invites)'),
      { uyeId: '700000000000000001', eylem: 'joined', davetEdenAd: 'ornek_uye', sayi: 242 },
    );
  });

  it('tekil "invite" yazımını da tanır', () => {
    assert.equal(inviteManagerSatiri('<@1> **joined**; Invited by **x** (**1** invite)').sayi, 1);
  });

  it('bulunamayan girişi davet edensiz döndürür', () => {
    assert.deepEqual(
      inviteManagerSatiri("I can't figure out how <@123> joined the server."),
      { uyeId: '123', eylem: 'joined', davetEdenAd: null, sayi: null },
    );
  });

  it('kurulum mesajlarını atlar', () => {
    assert.equal(inviteManagerSatiri('!setup'), null);
  });
});

describe('davet ayarları', () => {
  it('sistem varsayılan kapalı ve üye intent\'i ister', () => {
    assert.equal(SISTEMLER.davet.varsayilan, false);
    assert.deepEqual(SISTEMLER.davet.gerekliIntent, ['GuildMembers']);
    assert.equal(AYARLAR['davet.logKanal'].tur, 'kanal');
  });

  it('davet eden satırı eksik kaydı açıkça söyler', () => {
    assert.equal(davetEdenSatiri(null), '_kayıt yok_');
    assert.equal(davetEdenSatiri({ davet_eden_id: '5' }), '<@5>');
    assert.equal(davetEdenSatiri({ davet_eden_ad: 'eski' }), '**eski**');
    assert.equal(davetEdenSatiri({}), '_bulunamadı_');
  });
});
