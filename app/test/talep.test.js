import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AYARLAR, SISTEMLER } from '../lib/ayarlar.js';
import { acVeritabani } from '../lib/db.js';
import {
  DURUMLAR, PANEL_BUTON, acikTalep, acikTalepler, acilisMetni, kanalAdi, kanaldanTalep,
  kapatButonAyristir, kapatButonId, kapatabilirMi, talepEkle, talepGetir, talepKapat,
  transkriptMetni,
} from '../lib/talep.js';
import { panelButonu, panelGomusu, yazismayiTopla } from '../lib/talep-bilesen.js';

const G = 'g1';
const ROL = 'yetkili-rol';

function db() {
  return acVeritabani(':memory:');
}

function talepAc(d, ustler = {}) {
  return talepEkle(d, {
    guildId: G, kanalId: 'kanal-1', kullaniciId: 'u1', konu: 'Destek talebi',
    simdi: 1000, ...ustler,
  });
}

/** Rolleri sahte bir üye nesnesiyle taklit eder. */
function uye(id, roller = [], yonet = false) {
  return {
    id,
    roles: { cache: new Set(roller) },
    permissions: { has: () => yonet },
  };
}

describe('talep kanal adı', () => {
  it('Türkçe harfler ve boşluklar sadeleştiriliyor', () => {
    assert.equal(kanalAdi('DaXer Şığ', 4), 'talep-daxer-sig-4');
    assert.equal(kanalAdi('AAA.BBB', 1), 'talep-aaa-bbb-1');
  });

  it('ad tamamen elenirse numara tek başına yetiyor', () => {
    assert.equal(kanalAdi('🔮🔮', 9), 'talep-9');
    assert.equal(kanalAdi('', 2), 'talep-2');
    assert.equal(kanalAdi(null, 3), 'talep-3');
  });

  it('uzun ad kırpılıyor ve Discord sınırında kalıyor', () => {
    const ad = kanalAdi('a'.repeat(100), 5);
    assert.ok(ad.length <= 100);
    assert.equal(ad, `talep-${'a'.repeat(20)}-5`);
  });
});

describe('buton kimlikleri', () => {
  it('panel butonu sabit: bot yeniden başlasa da aynı', () => {
    assert.equal(PANEL_BUTON, 'talep:ac');
    assert.equal(panelButonu().toJSON().components[0].custom_id, PANEL_BUTON);
  });

  it('kapat butonu yalnız kendi kimliğini eşliyor', () => {
    assert.equal(kapatButonAyristir(kapatButonId(12)), 12);
    assert.equal(kapatButonAyristir('talep:ac'), null);
    assert.equal(kapatButonAyristir('cekilis:katil:12'), null);
    assert.equal(kapatButonAyristir('talep:kapat:0'), null);
  });

  it('panel gömüsü tek talep kuralını yazıyor', () => {
    const json = panelGomusu().toJSON();
    assert.match(JSON.stringify(json), /bir açık talebin/);
  });
});

describe('mükerrer talep engeli', () => {
  it('açık talebi olan kullanıcı ikinci kez açamıyor', () => {
    const d = db();
    const id = talepAc(d);

    const mevcut = acikTalep(d, G, 'u1');
    assert.ok(mevcut);
    assert.equal(mevcut.id, id);
  });

  it('talep kapanınca yeni talep açılabiliyor', () => {
    const d = db();
    const id = talepAc(d);
    assert.equal(talepKapat(d, id, 'mod-1', 2000), true);
    assert.equal(acikTalep(d, G, 'u1'), null);
  });

  it('başka kullanıcının açık talebi engel değil', () => {
    const d = db();
    talepAc(d);
    assert.equal(acikTalep(d, G, 'u2'), null);
  });

  it('başka sunucudaki talep engel değil', () => {
    const d = db();
    talepAc(d);
    assert.equal(acikTalep(d, 'baska-sunucu', 'u1'), null);
  });
});

describe('durum geçişleri', () => {
  it('kapatma kaydı kapatan ve zamanı yazıyor', () => {
    const d = db();
    const id = talepAc(d);
    talepKapat(d, id, 'mod-1', 5000);

    const kayit = talepGetir(d, id);
    assert.equal(kayit.durum, DURUMLAR.kapali);
    assert.equal(kayit.kapatan_id, 'mod-1');
    assert.equal(kayit.kapanis, 5000);
  });

  it('ikinci kapatma kayda yazılmıyor', () => {
    const d = db();
    const id = talepAc(d);

    assert.equal(talepKapat(d, id, 'mod-1', 5000), true);
    assert.equal(talepKapat(d, id, 'mod-2', 9000), false);
    // İlk kapatan korunur; ikinci deneme kaydı ezmiyor.
    assert.equal(talepGetir(d, id).kapatan_id, 'mod-1');
  });

  it('kanaldan talep bulunabiliyor', () => {
    const d = db();
    const id = talepAc(d, { kanalId: 'kanal-7' });
    assert.equal(kanaldanTalep(d, 'kanal-7').id, id);
    assert.equal(kanaldanTalep(d, 'yok'), null);
  });

  it('açık talep listesi yalnız açıkları veriyor', () => {
    const d = db();
    talepAc(d, { kullaniciId: 'u1', kanalId: 'k1' });
    const ikinci = talepAc(d, { kullaniciId: 'u2', kanalId: 'k2' });
    talepKapat(d, ikinci, 'mod-1', 3000);

    const acik = acikTalepler(d, G);
    assert.equal(acik.length, 1);
    assert.equal(acik[0].kullanici_id, 'u1');
  });
});

describe('kapatma yetkisi', () => {
  const talep = { id: 1, kullanici_id: 'u1' };

  it('talebin sahibi kapatabiliyor', () => {
    assert.equal(kapatabilirMi(uye('u1'), talep, ROL).ok, true);
  });

  it('yetkili rol kapatabiliyor', () => {
    assert.equal(kapatabilirMi(uye('mod-1', [ROL]), talep, ROL).ok, true);
  });

  it('Sunucuyu Yönet yetkisi kapatabiliyor', () => {
    assert.equal(kapatabilirMi(uye('admin', [], true), talep, ROL, true).ok, true);
  });

  it('ilgisiz üye kapatamıyor', () => {
    const sonuc = kapatabilirMi(uye('u2'), talep, ROL);
    assert.equal(sonuc.ok, false);
    assert.match(sonuc.sebep, /yalnız sahibi veya yetkili rol/);
  });

  it('rol ayarlanmamışken yalnız sahibi ve yönetici kapatabiliyor', () => {
    assert.equal(kapatabilirMi(uye('u2'), talep, null).ok, false);
    assert.equal(kapatabilirMi(uye('u1'), talep, null).ok, true);
  });
});

describe('transkript', () => {
  const mesaj = (yazar, icerik, ms, ekler = []) => ({
    author: { tag: yazar },
    content: icerik,
    createdTimestamp: ms,
    attachments: new Map(ekler.map((u, i) => [String(i), { url: u }])),
  });

  it('başlık talebin künyesini taşıyor', () => {
    const d = db();
    const id = talepAc(d);
    talepKapat(d, id, 'mod-1', 2000);

    const metin = transkriptMetni(talepGetir(d, id), [], { sunucuAdi: 'Test Sunucu' });
    assert.match(metin, /Talep #1/);
    assert.match(metin, /Sunucu: Test Sunucu/);
    assert.match(metin, /Açan: u1/);
    assert.match(metin, /Kapatan: mod-1/);
    assert.match(metin, /Mesaj sayısı: 0/);
  });

  it('mesajlar yazar, zaman ve içerikle yazılıyor', () => {
    const d = db();
    const id = talepAc(d);
    const metin = transkriptMetni(talepGetir(d, id), [
      mesaj('uye#1', 'merhaba', 1_700_000_000_000),
      mesaj('mod#2', 'buyurun', 1_700_000_060_000),
    ]);

    assert.match(metin, /uye#1: merhaba/);
    assert.match(metin, /mod#2: buyurun/);
    assert.match(metin, /Mesaj sayısı: 2/);
  });

  it('boş mesaj ve ekler kayboluyor değil, işaretleniyor', () => {
    const d = db();
    const id = talepAc(d);
    const metin = transkriptMetni(talepGetir(d, id), [
      mesaj('uye#1', '', 1_700_000_000_000, ['https://cdn/dosya.png']),
    ]);

    assert.match(metin, /\(boş mesaj\)/);
    assert.match(metin, /\[ek\] https:\/\/cdn\/dosya\.png/);
  });

  it('kapanmamış talepte kapanış alanı boş kalıyor', () => {
    const d = db();
    const metin = transkriptMetni(talepGetir(d, talepAc(d)), []);
    assert.match(metin, /Kapanış: -/);
    assert.match(metin, /Kapatan: -/);
  });
});

describe('yazışma toplama', () => {
  /** Sayfalı fetch'i taklit eder: yeniden eskiye 100'lük yığınlar. */
  function sahteKanal(adet) {
    const hepsi = Array.from({ length: adet }, (_, i) => ({
      id: String(adet - i), content: `m${adet - i}`, createdTimestamp: adet - i,
      author: { tag: 'u' }, attachments: new Map(),
    }));

    return {
      messages: {
        fetch: async ({ limit, before }) => {
          const baslangic = before ? hepsi.findIndex((m) => m.id === before) + 1 : 0;
          return hepsi.slice(baslangic, baslangic + limit);
        },
      },
    };
  }

  it('sayfalı çekim eskiden yeniye sıralı dönüyor', async () => {
    const mesajlar = await yazismayiTopla(sahteKanal(250));
    assert.equal(mesajlar.length, 250);
    assert.equal(mesajlar[0].content, 'm1');
    assert.equal(mesajlar.at(-1).content, 'm250');
  });

  it('sınır aşılmıyor', async () => {
    assert.equal((await yazismayiTopla(sahteKanal(500), 120)).length, 120);
  });

  it('boş kanalda boş liste', async () => {
    assert.deepEqual(await yazismayiTopla(sahteKanal(0)), []);
  });
});

describe('talep ayarları', () => {
  it('sistem ve anahtarlar tanımlı', () => {
    assert.equal(SISTEMLER.talep.varsayilan, false);
    for (const anahtar of ['talep.panelKanal', 'talep.kategori', 'talep.logKanal', 'talep.rol']) {
      assert.ok(AYARLAR[anahtar], `eksik anahtar: ${anahtar}`);
      assert.equal(AYARLAR[anahtar].varsayilan, null);
    }
    assert.equal(AYARLAR['talep.rol'].tur, 'rol');
  });

  it('açılış mesajı yer tutucusu doluyor', () => {
    assert.equal(acilisMetni('Merhaba {kullanici}!', { kullaniciId: 'u1' }), 'Merhaba <@u1>!');
    assert.equal(acilisMetni(null, { kullaniciId: 'u1' }), '');
  });
});
