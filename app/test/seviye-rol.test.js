import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AYARLAR, ayarGetir, ayarYaz } from '../lib/ayarlar.js';
import { acVeritabani } from '../lib/db.js';
import {
  KADEMELER, genelSohbetIzinleri, kademeBul, kademeRolIdleri, rolAyarAnahtari, rolDegisimi,
  sonrakiKademe, toplamXpKademe, uyeyiEsitle,
} from '../lib/seviye-rol.js';
import { rolSatiri } from '../commands/seviye/seviye.js';

const ROLLER = { 3: 'r3', 5: 'r5', 10: 'r10', 15: 'r15', 25: 'r25', 40: 'r40' };

describe('seviye kademeleri', () => {
  it('tablo docs/ekonomi.md ile aynı ve küçükten büyüğe sıralı', () => {
    assert.deepEqual(KADEMELER.map((k) => [k.seviye, k.ad]), [
      [3, 'Bumerang Maymunu'], [5, 'Bomba Maymunu'], [10, 'Ninja Maymun'],
      [15, 'Büyücü Maymun'], [25, 'Medyum Maymun'], [40, 'Simyacı Maymun'],
    ]);
    assert.deepEqual(KADEMELER.map(toplamXpKademe), [237, 574, 2335, 5909, 20994, 72840]);
  });

  it('seviyeye göre ulaşılan ve sıradaki kademe', () => {
    assert.equal(kademeBul(0), null);
    assert.equal(kademeBul(2), null);
    assert.equal(kademeBul(3).ad, 'Bumerang Maymunu');
    assert.equal(kademeBul(9).ad, 'Bomba Maymunu');
    assert.equal(kademeBul(99).ad, 'Simyacı Maymun');
    assert.equal(sonrakiKademe(0).seviye, 3);
    assert.equal(sonrakiKademe(13).seviye, 15);
    assert.equal(sonrakiKademe(40), null);
  });

  it('genel-sohbet izinleri kümülatif', () => {
    const bul = (s) => KADEMELER.find((k) => k.seviye === s);
    assert.deepEqual(genelSohbetIzinleri(bul(3)), ['UseExternalStickers']);
    assert.deepEqual(genelSohbetIzinleri(bul(5)), ['UseExternalStickers', 'AttachFiles']);
    assert.ok(genelSohbetIzinleri(bul(40)).includes('AttachFiles'));
    assert.ok(genelSohbetIzinleri(bul(40)).includes('CreatePublicThreads'));
  });
});

describe('rol değişimi', () => {
  it('rolü olmayan üyeye kademe rolünü ekler', () => {
    assert.deepEqual(rolDegisimi(['okcu'], 5, ROLLER), {
      ekle: ['r5'], cikar: [], kademe: KADEMELER[1],
    });
  });

  it('üst kademeye geçince alt kademenin rolünü alır', () => {
    const { ekle, cikar } = rolDegisimi(['okcu', 'r3', 'r5'], 10, ROLLER);
    assert.deepEqual(ekle, ['r10']);
    assert.deepEqual(cikar.sort(), ['r3', 'r5']);
  });

  it('doğru rolü taşıyana dokunmaz, başka rollere hiç bakmaz', () => {
    assert.deepEqual(rolDegisimi(['okcu', 'yt', 'r10'], 12, ROLLER).ekle, []);
    assert.deepEqual(rolDegisimi(['okcu', 'yt', 'r10'], 12, ROLLER).cikar, []);
  });

  it('kademenin altına düşen üyeden rolü alır', () => {
    assert.deepEqual(rolDegisimi(['r3'], 1, ROLLER), { ekle: [], cikar: ['r3'], kademe: null });
  });

  it('kademe rolü kurulmamışsa üye kurulu en yüksek alt kademede kalır', () => {
    const { ekle, cikar, kademe } = rolDegisimi(['r5'], 10, { ...ROLLER, 10: null });
    assert.deepEqual(ekle, []);
    assert.deepEqual(cikar, []);
    assert.equal(kademe.seviye, 5);
  });

  it('hiç rol kurulmamışsa hiçbir şey yapılmaz', () => {
    assert.deepEqual(rolDegisimi(['okcu'], 20, {}), { ekle: [], cikar: [], kademe: null });
  });
});

describe('üye eşitleme', () => {
  function sahteUye(rolIdleri, yonetilemeyen = []) {
    const cagri = [];
    const roller = new Map(rolIdleri.map((id) => [id, {}]));
    return {
      cagri,
      guild: { roles: { cache: { get: (id) => ({ editable: !yonetilemeyen.includes(id) }) } } },
      roles: {
        cache: roller,
        add: async (ids) => cagri.push(['ekle', ids]),
        remove: async (ids) => cagri.push(['cikar', ids]),
      },
    };
  }

  it('fark yoksa Discord çağrısı yapmaz', async () => {
    const uye = sahteUye(['r5']);
    await uyeyiEsitle(uye, 6, ROLLER);
    assert.deepEqual(uye.cagri, []);
  });

  it('önce eskiyi çıkarır sonra yeniyi ekler', async () => {
    const uye = sahteUye(['r3']);
    const sonuc = await uyeyiEsitle(uye, 5, ROLLER);
    assert.deepEqual(uye.cagri, [['cikar', ['r3']], ['ekle', ['r5']]]);
    assert.deepEqual(sonuc.ekle, ['r5']);
  });

  it('botun yönetemediği rolü denemez', async () => {
    const uye = sahteUye([], ['r5']);
    const sonuc = await uyeyiEsitle(uye, 5, ROLLER);
    assert.deepEqual(uye.cagri, []);
    assert.deepEqual(sonuc.ekle, []);
  });
});

describe('seviye rolü ayarları', () => {
  it('her kademenin rol türünde bir ayarı var', () => {
    for (const k of KADEMELER) assert.equal(AYARLAR[rolAyarAnahtari(k.seviye)].tur, 'rol');
  });

  it('ayarlardan kademe → rol tablosu okunur', () => {
    const db = acVeritabani(':memory:');
    ayarYaz(db, 'g1', 'seviye.rol.5', 'r5');
    const tablo = kademeRolIdleri((a) => ayarGetir(db, 'g1', a));
    assert.equal(tablo[5], 'r5');
    assert.equal(tablo[3], null);
  });
});

describe('/seviye bilgi rol satırı', () => {
  it('sıradaki kademeye kalan XP gösterilir', () => {
    assert.match(rolSatiri(4, 400), /Bumerang Maymunu.*\n.*Bomba Maymunu \(Sv 5, 174 XP kaldı\)/);
    assert.match(rolSatiri(0, 0), /henüz yok/);
    assert.match(rolSatiri(40, 72840), /En üst kademe/);
  });
});
