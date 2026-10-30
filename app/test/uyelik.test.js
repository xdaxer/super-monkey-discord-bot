import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AYARLAR, ayarYaz, SISTEMLER, sistemAyarla } from '../lib/ayarlar.js';
import { acVeritabani } from '../lib/db.js';
import { gunlukAl } from '../lib/ekonomi.js';
import { calis } from '../lib/meslekler.js';
import { prestijCarpani } from '../lib/prestij-carpan.js';
import { XP_MAX, XP_MIN, kullaniciGetir, xpVer } from '../lib/seviye.js';
import {
  bonusluXp, degisimTuru, enIyiKademe, kademeBonusAnahtari, kademeRolAnahtari, kademeSirasi,
  UYELIK_KADEMELERI, uyelikDegisimi, uyelikRoluMu, uyelikRolleri,
} from '../lib/uyelik.js';
import {
  uyelikCarpani, uyelikKademesi, uyelikleriEsitle, uyelikRolleriYaz,
} from '../lib/uyelik-carpan.js';
import { olaylar } from '../events/uyelik.js';

const rol = (id, tags = null) => ({ id, tags });

describe('üyelik rolü tanıma', () => {
  it('entegrasyon rolünü tanır, bot ve booster rolünü tanımaz', () => {
    assert.equal(uyelikRoluMu(rol('yt', { integrationId: 'i1' })), true);
    assert.equal(uyelikRoluMu(rol('bot', { integrationId: 'i2', botId: 'b' })), false);
    assert.equal(uyelikRoluMu(rol('boost', { premiumSubscriberRole: true })), false);
    assert.equal(uyelikRoluMu(rol('duz')), false);
    assert.equal(uyelikRoluMu(null), false);
  });

  it('Map ve diziden aynı rolleri seçer', () => {
    const liste = [rol('a', { integrationId: 'i' }), rol('b'), rol('c', { integrationId: 'i' })];
    assert.deepEqual(uyelikRolleri(liste).map((r) => r.id), ['a', 'c']);
    assert.deepEqual(uyelikRolleri(new Map(liste.map((r) => [r.id, r]))).map((r) => r.id), ['a', 'c']);
  });
});

describe('üyelik değişimi', () => {
  const U = ['t1', 't2'];

  it('başlangıç, bitiş ve seviye değişimini ayırır', () => {
    const basla = uyelikDegisimi(['x'], ['x', 't1'], U);
    assert.deepEqual(basla, { eklenen: ['t1'], cikan: [] });
    assert.equal(degisimTuru(basla, 1), 'basladi');

    const bitti = uyelikDegisimi(['t1', 'x'], ['x'], U);
    assert.equal(degisimTuru(bitti, 0), 'bitti');

    const yukseldi = uyelikDegisimi(['t1'], ['t2'], U);
    assert.equal(degisimTuru(yukseldi, 1), 'degisti');
  });

  it('üyelikle ilgisiz rol değişimi log üretmez', () => {
    const d = uyelikDegisimi(['x'], ['x', 'y'], U);
    assert.equal(degisimTuru(d, 0), null);
  });
});

describe('XP bonusu', () => {
  it('yüzdeyi uygular ve tam sayı döndürür', () => {
    assert.equal(bonusluXp(20, 50), 30);
    assert.equal(bonusluXp(15, 50), 23);
    assert.equal(bonusluXp(20, 0), 20);
    assert.equal(bonusluXp(20, -10), 20);
  });

  it('xpVer bonusu kazanılan XP\'ye yansıtır', () => {
    const d = acVeritabani(':memory:');
    const sonuc = xpVer(d, {
      guildId: 'g', kullaniciId: 'u', simdi: 1, rastgele: () => 0, bonus: (xp) => bonusluXp(xp, 100),
    });
    assert.equal(sonuc.kazanilan, XP_MIN * 2);
    assert.equal(kullaniciGetir(d, 'g', 'u').xp, XP_MIN * 2);

    const normal = xpVer(d, { guildId: 'g', kullaniciId: 'v', simdi: 1, rastgele: () => 0.999999 });
    assert.equal(normal.kazanilan, XP_MAX);
    d.close();
  });
});

describe('üyelik ayarları ve olaylar', () => {
  it('sistem varsayılan kapalı, GuildMembers istiyor', () => {
    assert.equal(SISTEMLER.uyelik.varsayilan, false);
    assert.deepEqual(SISTEMLER.uyelik.gerekliIntent, ['GuildMembers']);
    assert.equal(AYARLAR['uyelik.xpBonusYuzde'].varsayilan, 50);
    assert.equal(AYARLAR['uyelik.logKanal'].tur, 'kanal');
  });

  it('bütün olaylar GuildMembers intent\'ine bağlı', () => {
    for (const olay of olaylar) assert.deepEqual(olay.gerekliIntent, ['GuildMembers']);
  });
});

describe('Katıl kademesi muz çarpanı', () => {
  const G = 'g';
  const T0 = Date.UTC(2026, 9, 10, 9);
  const hazir = () => {
    const db = acVeritabani(':memory:');
    sistemAyarla(db, G, 'uyelik', true);
    sistemAyarla(db, G, 'ekonomi', true);
    ayarYaz(db, G, kademeRolAnahtari(1), 'r1');
    ayarYaz(db, G, kademeRolAnahtari(2), 'r2');
    ayarYaz(db, G, kademeRolAnahtari(4), 'r4');
    return db;
  };

  it('her kademenin ayrı ayarı ve artan varsayılanı var', () => {
    assert.equal(UYELIK_KADEMELERI.length, 6);
    let onceki = 0;
    for (const { no } of UYELIK_KADEMELERI) {
      assert.equal(AYARLAR[kademeRolAnahtari(no)].tur, 'rol');
      const bonus = AYARLAR[kademeBonusAnahtari(no)];
      assert.equal(bonus.tur, 'sayi');
      assert.ok(bonus.varsayilan > onceki);
      // uyelik-carpan.js varsayılanı ayarlar.js'ten değil buradan okur.
      assert.equal(bonus.varsayilan, UYELIK_KADEMELERI[no - 1].bonusYuzde);
      onceki = bonus.varsayilan;
    }
  });

  it('en yüksek bonuslu kademe seçilir, kademeler toplanmaz', () => {
    const ayar = { [kademeRolAnahtari(1)]: 'a', [kademeBonusAnahtari(1)]: 10, [kademeRolAnahtari(2)]: 'b', [kademeBonusAnahtari(2)]: 40 };
    const oku = (k) => ayar[k] ?? null;
    assert.deepEqual(enIyiKademe(['a', 'b', 'genel'], oku), { no: 2, rolId: 'b', yuzde: 40 });
    assert.deepEqual(enIyiKademe(['a'], oku), { no: 1, rolId: 'a', yuzde: 10 });
    assert.equal(enIyiKademe(['genel'], oku), null);
  });

  it('kurulum sırası genel rolü atlar, kimliğe göre dizer', () => {
    const roller = [
      { id: '1000000000000000244', name: 'YouTube Member: Dört' },
      { id: '1000000000000000240', name: 'YouTube Member' },
      { id: '1000000000000000241', name: 'YouTube Member: Bir' },
    ];
    assert.deepEqual(kademeSirasi(roller).map((r) => r.name), ['YouTube Member: Bir', 'YouTube Member: Dört']);
  });

  it('çarpan aynalanan rollerden okunur; sistem kapalıyken 1', () => {
    const db = hazir();
    assert.equal(uyelikCarpani(db, G, 'u'), 1);
    uyelikRolleriYaz(db, G, 'u', ['r2']);
    assert.equal(uyelikCarpani(db, G, 'u'), 1.2);
    ayarYaz(db, G, kademeBonusAnahtari(2), 45);
    assert.equal(uyelikCarpani(db, G, 'u'), 1.45);
    assert.equal(uyelikKademesi(db, G, 'u').no, 2);
    sistemAyarla(db, G, 'uyelik', false);
    assert.equal(uyelikCarpani(db, G, 'u'), 1);
    sistemAyarla(db, G, 'uyelik', true);
    uyelikRolleriYaz(db, G, 'u', []);
    assert.equal(uyelikCarpani(db, G, 'u'), 1);
  });

  it('eşitleme listede olmayanı siler', () => {
    const db = hazir();
    uyelikRolleriYaz(db, G, 'eski', ['r4']);
    uyelikleriEsitle(db, G, [{ kullaniciId: 'u', rolIdleri: ['r1'] }]);
    assert.equal(uyelikCarpani(db, G, 'eski'), 1);
    assert.equal(uyelikCarpani(db, G, 'u'), 1.1);
  });

  it('/gunluk ve /calis prestijle çarpılarak birleşir', () => {
    const db = hazir();
    uyelikRolleriYaz(db, G, 'u', ['r4']);
    db.prepare('INSERT INTO prestijler (guild_id, kullanici_id, seviye) VALUES (?, ?, 2)').run(G, 'u');
    assert.equal(prestijCarpani(db, G, 'u'), 1.4);
    const g = gunlukAl(db, { guildId: G, kullaniciId: 'u', simdi: T0, rastgele: () => 0 });
    assert.equal(g.uyelik, 1.5);
    assert.equal(g.toplam, 420); // 200 × 1,4 × 1,5

    const sade = calis(db, { guildId: G, kullaniciId: 'v', simdi: T0, rastgele: () => 0 });
    const uye = calis(db, { guildId: G, kullaniciId: 'u', simdi: T0, rastgele: () => 0 });
    assert.equal(uye.kazanc, Math.floor(sade.kazanc * 2.1 + 1e-9));
  });
});
