import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { EN_ESKI_MS, silinecekleriSec } from '../commands/moderasyon/temizle.js';
import { EN_UZUN_MS, sureDogrula } from '../commands/moderasyon/sustur.js';
import { acVeritabani } from '../lib/db.js';
import { hiyerarsiKontrol } from '../lib/izin.js';
import { uyariEkle, uyariSayisi, uyariSil, uyarilariGetir } from '../lib/moderasyon.js';

function rol(position) {
  return { position, comparePositionTo: (digeri) => position - digeri.position };
}
function uye(id, position) {
  return { id, roles: { highest: rol(position) } };
}

const guild = { ownerId: 'sahip' };
const bot = uye('bot', 5);

describe('rol hiyerarşisi', () => {
  it('normal durumda izin verir', () => {
    const sonuc = hiyerarsiKontrol({ guild, uygulayan: uye('mod', 4), hedef: uye('hedef', 2), bot });
    assert.equal(sonuc.ok, true);
  });

  it('sunucu sahibine işlem yapılamaz', () => {
    const sonuc = hiyerarsiKontrol({ guild, uygulayan: uye('mod', 4), hedef: uye('sahip', 1), bot });
    assert.equal(sonuc.ok, false);
    assert.match(sonuc.sebep, /sahibine/);
  });

  it('bot kendisine işlem yapamaz', () => {
    const sonuc = hiyerarsiKontrol({ guild, uygulayan: uye('mod', 4), hedef: uye('bot', 1), bot });
    assert.equal(sonuc.ok, false);
  });

  it('kendine işlem yapılamaz', () => {
    const sonuc = hiyerarsiKontrol({ guild, uygulayan: uye('mod', 4), hedef: uye('mod', 4), bot });
    assert.equal(sonuc.ok, false);
    assert.match(sonuc.sebep, /Kendinize/);
  });

  it('eşit rolde reddeder', () => {
    const sonuc = hiyerarsiKontrol({ guild, uygulayan: uye('mod', 3), hedef: uye('hedef', 3), bot });
    assert.equal(sonuc.ok, false);
    assert.match(sonuc.sebep, /aynı veya sizden yüksek/);
  });

  it('sunucu sahibi rol karşılaştırmasından muaftır', () => {
    const sonuc = hiyerarsiKontrol({
      guild, uygulayan: uye('sahip', 1), hedef: uye('hedef', 4), bot: uye('bot', 9),
    });
    assert.equal(sonuc.ok, true);
  });

  it('botun rolü yetersizse reddeder', () => {
    const sonuc = hiyerarsiKontrol({
      guild, uygulayan: uye('mod', 9), hedef: uye('hedef', 7), bot: uye('bot', 6),
    });
    assert.equal(sonuc.ok, false);
    assert.match(sonuc.sebep, /botun rolünden yüksek/);
  });
});

describe('susturma süresi', () => {
  it('geçerli süreleri kabul eder', () => {
    assert.equal(sureDogrula('10dk').ms, 600_000);
    assert.equal(sureDogrula('2sa').ms, 7_200_000);
    assert.equal(sureDogrula('1g').ms, 86_400_000);
  });

  it('anlaşılmayan süreyi reddeder', () => {
    assert.equal(sureDogrula('birazcık').ok, false);
    assert.equal(sureDogrula('').ok, false);
  });

  it('28 günü aşan süreyi reddeder', () => {
    const sonuc = sureDogrula('29g');
    assert.equal(sonuc.ok, false);
    assert.match(sonuc.sebep, /28 gün/);
    assert.equal(sureDogrula('28g').ms, EN_UZUN_MS);
  });
});

describe('toplu silme seçimi', () => {
  const simdi = 1_700_000_000_000;
  const mesaj = (id, yas, yazar) => ({
    id, createdTimestamp: simdi - yas, author: { id: yazar },
  });

  it('14 günden eski mesajları eler', () => {
    const secilen = silinecekleriSec(
      [mesaj('a', 1000, 'u1'), mesaj('b', EN_ESKI_MS + 1000, 'u1')],
      { simdi },
    );
    assert.deepEqual(secilen.map((m) => m.id), ['a']);
  });

  it('kullanıcı filtresi uygular', () => {
    const secilen = silinecekleriSec(
      [mesaj('a', 1000, 'u1'), mesaj('b', 2000, 'u2'), mesaj('c', 3000, 'u1')],
      { kullaniciId: 'u1', simdi },
    );
    assert.deepEqual(secilen.map((m) => m.id), ['a', 'c']);
  });

  it('adet sınırını aşmaz', () => {
    const mesajlar = Array.from({ length: 50 }, (_, i) => mesaj(`m${i}`, i * 10, 'u1'));
    assert.equal(silinecekleriSec(mesajlar, { adet: 5, simdi }).length, 5);
  });
});

describe('uyarı kayıtları', () => {
  let db;
  beforeEach(() => { db = acVeritabani(':memory:'); });
  afterEach(() => db.close());

  it('uyarı yazılır ve okunur', () => {
    const id = uyariEkle(db, { guildId: 'g', kullaniciId: 'k', moderatorId: 'm', sebep: 'spam' });
    assert.ok(id > 0);

    const uyarilar = uyarilariGetir(db, 'g', 'k');
    assert.equal(uyarilar.length, 1);
    assert.equal(uyarilar[0].sebep, 'spam');
    assert.equal(uyariSayisi(db, 'g', 'k'), 1);
  });

  it('başka sunucunun uyarısı görünmez', () => {
    uyariEkle(db, { guildId: 'g1', kullaniciId: 'k', moderatorId: 'm', sebep: 'x' });
    assert.equal(uyarilariGetir(db, 'g2', 'k').length, 0);
  });

  it('uyarı silinir, olmayan silinmez', () => {
    const id = uyariEkle(db, { guildId: 'g', kullaniciId: 'k', moderatorId: 'm', sebep: 'x' });
    assert.equal(uyariSil(db, 'g', id), true);
    assert.equal(uyariSil(db, 'g', id), false);
    assert.equal(uyarilariGetir(db, 'g', 'k').length, 0);
  });

  it('başka sunucudan silme çalışmaz', () => {
    const id = uyariEkle(db, { guildId: 'g1', kullaniciId: 'k', moderatorId: 'm', sebep: 'x' });
    assert.equal(uyariSil(db, 'g2', id), false);
  });
});
