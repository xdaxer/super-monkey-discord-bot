import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { AYARLAR, SISTEMLER } from '../lib/ayarlar.js';
import { botSahibi, gelistiriciler, sahipKontrol, yetkiliKimlikler } from '../lib/izin.js';
import { data as yedekData, execute as yedekExecute } from '../commands/yedek/yedek.js';
import { acVeritabani } from '../lib/db.js';
import {
  boyutBicimle, rotasyon, yedekAdi, yedekAl, yedekDongusuBaslat, yedekleriListele,
} from '../servisler/yedek.js';

const gecici = [];

function dizin() {
  const yol = mkdtempSync(path.join(tmpdir(), 'yedek-test-'));
  gecici.push(yol);
  return yol;
}

/** İçinde veri olan bellek içi veritabanı. */
function doluDb() {
  const db = acVeritabani(':memory:');
  db.prepare('INSERT INTO ayarlar (guild_id, anahtar, deger, guncelleme) VALUES (?, ?, ?, ?)')
    .run('g1', 'talep.kanal', '"kanal-1"', 1000);
  db.prepare('INSERT INTO seviyeler (guild_id, kullanici_id, xp, seviye, mesaj_sayisi, son_kazanma) VALUES (?, ?, ?, ?, ?, ?)')
    .run('g1', 'u1', 500, 4, 30, 1000);
  return db;
}

after(() => {
  for (const yol of gecici) rmSync(yol, { recursive: true, force: true });
});

describe('yedek adı', () => {
  it('zaman damgalı ve sıralanabilir', () => {
    const ad = yedekAdi(new Date(2026, 8, 22, 19, 5, 3));
    assert.equal(ad, 'bot-20260922-190503.sqlite');
  });

  it('adlar alfabetik sıralandığında kronolojik sırada', () => {
    const erken = yedekAdi(new Date(2026, 0, 2, 3, 4, 5));
    const gec = yedekAdi(new Date(2026, 8, 22, 19, 5, 3));
    assert.ok(erken < gec);
  });
});

describe('yedek alma', () => {
  it('yedek alınıyor ve dosya oluşuyor', () => {
    const d = dizin();
    const sonuc = yedekAl({ db: doluDb(), dizin: d });

    assert.equal(sonuc.ok, true);
    assert.ok(sonuc.boyut > 0);
    assert.ok(Number.isFinite(sonuc.sureMs));
    assert.equal(yedekleriListele(d).length, 1);
  });

  it('alınan yedek açılıp okunabiliyor (VACUUM INTO tutarlı kopya)', () => {
    const sonuc = yedekAl({ db: doluDb(), dizin: dizin() });
    const kopya = acVeritabani(sonuc.yol);

    const ayar = kopya.prepare('SELECT deger FROM ayarlar WHERE guild_id = ? AND anahtar = ?')
      .get('g1', 'talep.kanal');
    assert.equal(ayar.deger, '"kanal-1"');

    // node:sqlite satırları null prototipli döner; alan alan karşılaştırıyoruz.
    const seviye = kopya.prepare('SELECT xp, seviye FROM seviyeler WHERE kullanici_id = ?').get('u1');
    assert.equal(seviye.xp, 500);
    assert.equal(seviye.seviye, 4);

    // Bütün tablolar kopyaya geçmeli: yedek eksik tablo bırakmamalı.
    const tablolar = kopya.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
      .map((s) => s.name);
    for (const t of ['ayarlar', 'talepler', 'cekilisler', 'cekilis_katilimlari', 'seviyeler',
      'uyarilar', 'basvurular', 'youtube_abonelikleri']) {
      assert.ok(tablolar.includes(t), `yedekte eksik tablo: ${t}`);
    }
  });

  it('yazılamayan hedefte hata döner, fırlatmaz', () => {
    const d = dizin();
    // Dizin yerine dosya koyarsak mkdir/VACUUM başarısız olur.
    const engel = path.join(d, 'engel');
    writeFileSync(engel, 'x');

    const sonuc = yedekAl({ db: doluDb(), dizin: engel });
    assert.equal(sonuc.ok, false);
    assert.match(sonuc.sebep, /Yedek/);
  });
});

describe('rotasyon', () => {
  /** Verilen sayıda yedek üretir; adlar saniye saniye ilerler. */
  function yedekler(d, adet) {
    const db = doluDb();
    for (let i = 0; i < adet; i += 1) {
      yedekAl({ db, dizin: d, tarih: new Date(2026, 8, 22, 12, 0, i) });
    }
  }

  it('sınırdan eski yedekler siliniyor', () => {
    const d = dizin();
    yedekler(d, 5);
    assert.equal(yedekleriListele(d).length, 5);

    const silinen = rotasyon(3, d);
    assert.equal(silinen.length, 2);
    assert.equal(yedekleriListele(d).length, 3);
  });

  it('en yeniler korunuyor', () => {
    const d = dizin();
    yedekler(d, 4);
    rotasyon(2, d);

    const kalan = yedekleriListele(d).map((y) => y.ad);
    assert.deepEqual(kalan, ['bot-20260922-120003.sqlite', 'bot-20260922-120002.sqlite']);
  });

  it('sınır yedek sayısından büyükse hiçbir şey silinmiyor', () => {
    const d = dizin();
    yedekler(d, 2);
    assert.deepEqual(rotasyon(10, d), []);
    assert.equal(yedekleriListele(d).length, 2);
  });

  it('sınır en az 1 olarak uygulanıyor', () => {
    const d = dizin();
    yedekler(d, 3);
    rotasyon(0, d);
    assert.equal(yedekleriListele(d).length, 1);
  });

  it('yedek alırken rotasyon birlikte çalışıyor', () => {
    const d = dizin();
    const db = doluDb();
    for (let i = 0; i < 4; i += 1) {
      yedekAl({ db, dizin: d, saklanan: 2, tarih: new Date(2026, 8, 22, 12, 0, i) });
    }
    assert.equal(yedekleriListele(d).length, 2);
  });

  it('olmayan dizin boş liste veriyor, çökmüyor', () => {
    assert.deepEqual(yedekleriListele(path.join(dizin(), 'yok')), []);
  });

  it('yedek olmayan dosyalar listeye girmiyor', () => {
    const d = dizin();
    yedekler(d, 1);
    writeFileSync(path.join(d, 'notlar.txt'), 'x');
    writeFileSync(path.join(d, 'bot-bozuk.sqlite'), 'x');

    assert.equal(yedekleriListele(d).length, 1);
  });
});

describe('yedek döngüsü', () => {
  it('açılışta hemen bir yedek alıyor', () => {
    const d = dizin();
    const durdur = yedekDongusuBaslat({
      db: doluDb(), dizin: d, periyotMs: 3_600_000, logger: { log() {}, error() {} },
    });
    durdur();

    assert.equal(yedekleriListele(d).length, 1);
  });

  it('hata botu düşürmüyor, loglanıyor', () => {
    const d = dizin();
    const engel = path.join(d, 'engel');
    writeFileSync(engel, 'x');

    const hatalar = [];
    const durdur = yedekDongusuBaslat({
      db: doluDb(), dizin: engel, periyotMs: 3_600_000,
      logger: { log() {}, error: (...a) => hatalar.push(a.join(' ')) },
    });
    durdur();

    assert.equal(hatalar.length, 1);
    assert.match(hatalar[0], /Yedek/);
  });

  it('sistem kapalıyken yedek alınmıyor', () => {
    const d = dizin();
    const db = doluDb();
    db.prepare('INSERT INTO ayarlar (guild_id, anahtar, deger, guncelleme) VALUES (?, ?, ?, ?)')
      .run('g1', 'sistem.yedek', 'false', 1000);

    const durdur = yedekDongusuBaslat({
      db, dizin: d, guildId: 'g1', periyotMs: 3_600_000, logger: { log() {}, error() {} },
    });
    durdur();

    assert.equal(yedekleriListele(d).length, 0);
  });
});

describe('biçimleme ve ayarlar', () => {
  it('boyut okunur birime çevriliyor', () => {
    assert.equal(boyutBicimle(0), '0 B');
    assert.equal(boyutBicimle(512), '512 B');
    assert.equal(boyutBicimle(1024), '1.0 KB');
    assert.equal(boyutBicimle(1536), '1.5 KB');
    assert.equal(boyutBicimle(1024 * 1024 * 5), '5.0 MB');
    assert.equal(boyutBicimle(-1), 'bilinmiyor');
  });

  it('sistem varsayılan açık, ayar sınırları tanımlı', () => {
    // Yedekleme tek gerçek veri kaybı savunması; varsayılanı açık olmalı.
    assert.equal(SISTEMLER.yedek.varsayilan, true);
    assert.equal(AYARLAR['yedek.periyotSaat'].varsayilan, 12);
    assert.equal(AYARLAR['yedek.periyotSaat'].min, 1);
    assert.equal(AYARLAR['yedek.saklanan'].varsayilan, 14);
    assert.equal(AYARLAR['yedek.saklanan'].tur, 'sayi');
  });
});

describe('sahip kısıtı', () => {
  const SAHIP = '111000000000000001';

  const GELISTIRICI = '111000000000000002';

  it('sahip geçiyor ve rolü sahip olarak dönüyor', () => {
    assert.deepEqual(sahipKontrol(SAHIP, SAHIP, []), { ok: true, rol: 'sahip' });
  });

  it('listedeki geliştirici geçiyor ve rolü ayırt ediliyor', () => {
    assert.deepEqual(sahipKontrol(GELISTIRICI, SAHIP, [GELISTIRICI]),
      { ok: true, rol: 'gelistirici' });
    // Geliştirici listesi boşken aynı kişi geçememeli.
    assert.equal(sahipKontrol(GELISTIRICI, SAHIP, []).ok, false);
  });

  it('listede olmayan kullanıcı geçemiyor', () => {
    const baskasi = sahipKontrol('999999999999999999', SAHIP, [GELISTIRICI]);
    assert.equal(baskasi.ok, false);
    assert.match(baskasi.sebep, /yalnız bot sahibi ve yetkili geliştiriciler/);
  });

  it('geliştirici listesi virgülle ayrışıyor, bozuk girdi eleniyor', () => {
    assert.deepEqual(gelistiriciler('111111111111111111,222222222222222222'),
      ['111111111111111111', '222222222222222222']);
    // Boşluklar kırpılır; rakam olmayan parçalar listeyi geçersiz kılmaz, elenir.
    assert.deepEqual(gelistiriciler(' 111111111111111111 , bozuk ,, 222222222222222222 '),
      ['111111111111111111', '222222222222222222']);
    assert.deepEqual(gelistiriciler(null), []);
    assert.deepEqual(gelistiriciler(''), []);
  });

  it('sahip listede de geçse tek kez sayılıyor', () => {
    assert.deepEqual(yetkiliKimlikler(SAHIP, [SAHIP, GELISTIRICI]), [SAHIP, GELISTIRICI]);
  });

  it('snowflake karşılaştırması metin üzerinden yapılmalı', () => {
    // Discord kimlikleri Number.MAX_SAFE_INTEGER'ı aşıyor: Number'dan geçen bir
    // snowflake sessizce bozuluyor (…265 → …200). Bu yüzden kimlikler hiçbir
    // yerde sayıya çevrilmemeli; sahipKontrol String ile karşılaştırıyor.
    assert.notEqual(String(Number(SAHIP)), SAHIP);
    assert.ok(Number(SAHIP) > Number.MAX_SAFE_INTEGER);
    // Bozulmuş kimlik sahibi geçirmemeli.
    assert.equal(sahipKontrol(Number(SAHIP), SAHIP).ok, false);
  });

  it('authorUserID ayarlanmamışsa kimse geçemiyor (kapalı tarafa düşüyor)', () => {
    // En kötü sonuç: kimlik eksik diye komutun bütün yöneticilere açılması.
    // undefined burada yok: ikinci argüman atlandığında varsayılan devreye
    // girip .env'den okuması bilinçli — komutlar sahipKontrol(id) diye çağırıyor.
    for (const eksik of [null, '']) {
      const sonuc = sahipKontrol(SAHIP, eksik, []);
      assert.equal(sonuc.ok, false, `${JSON.stringify(eksik)} için açık kaldı`);
      assert.match(sonuc.sebep, /authorUserID/);
    }
  });

  /** .env değerlerini yalnız `fn` süresince değiştirir (temiz klonda .env yok). */
  function ortamla(degerler, fn) {
    const eski = Object.fromEntries(Object.keys(degerler).map((k) => [k, process.env[k]]));
    Object.assign(process.env, degerler);
    try {
      return fn();
    } finally {
      for (const [k, v] of Object.entries(eski)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  }

  it('ikinci argüman atlanınca .env kimliği kullanılıyor', () => {
    ortamla({ authorUserID: SAHIP }, () => {
      assert.equal(sahipKontrol(botSahibi()).ok, true);
      assert.equal(sahipKontrol('999999999999999999').ok, false);
    });
  });

  // Yapılandırma denetimi: canlı kurulumda authorUserID boş kalmasın. .env'siz klonda atlanır.
  it('.env üzerinden gerçek sahip kimliği okunuyor', { skip: !botSahibi() && 'app/.env içinde authorUserID yok' }, () => {
    const sahip = botSahibi();
    assert.ok(sahip && sahip.length > 0, 'authorUserID .env içinde boş');
    // Snowflake: yalnız rakam.
    assert.match(sahip, /^\d+$/);
  });

  it('.env yapılandırmasında sahip ve geliştirici birlikte yetkili', () => {
    ortamla({ authorUserID: SAHIP, developerUserIDs: GELISTIRICI }, () => {
      const yetkili = yetkiliKimlikler();
      assert.ok(yetkili.includes(botSahibi()), 'sahip yetkili listesinde yok');
      assert.deepEqual(gelistiriciler(), [GELISTIRICI]);
      for (const kimlik of gelistiriciler()) {
        assert.ok(yetkili.includes(kimlik), `geliştirici yetkili değil: ${kimlik}`);
        assert.equal(sahipKontrol(kimlik).ok, true);
      }
    });
  });
});

describe('/yedek komutu sahip kısıtı', () => {
  /** Yanıtları toplayan sahte etkileşim. */
  function sahteEtkilesim(kullaniciId, alt = 'liste') {
    return {
      user: { id: kullaniciId },
      guildId: 'g1',
      yanitlar: [],
      ertelendi: false,
      options: { getSubcommand: () => alt },
      reply: async function reply(yuk) { this.yanitlar.push(yuk); },
      deferReply: async function deferReply() { this.ertelendi = true; },
      editReply: async function editReply(yuk) { this.yanitlar.push(yuk); },
    };
  }

  it('sahip olmayan kullanıcı reddediliyor ve yedek alınmıyor', async () => {
    const etkilesim = sahteEtkilesim('999999999999999999', 'al');
    await yedekExecute(etkilesim);

    assert.equal(etkilesim.yanitlar.length, 1);
    assert.match(etkilesim.yanitlar[0].content, /yalnız bot sahibi/);
    // Red, yedek alma işine hiç girmeden olmalı: deferReply bile çağrılmamalı.
    assert.equal(etkilesim.ertelendi, false);
  });

  it('liste alt komutu da sahip kısıtına tabi', async () => {
    const etkilesim = sahteEtkilesim('999999999999999999', 'liste');
    await yedekExecute(etkilesim);
    assert.match(etkilesim.yanitlar[0].content, /yalnız bot sahibi/);
  });

  it('komut açıklaması kısıtı söylüyor ve Yönetici kısıtı duruyor', () => {
    const json = yedekData.toJSON();
    assert.match(json.description, /sahip ve yetkili geliştiriciler/);
    // Discord tarafındaki kısıt ikinci savunma olarak korunuyor.
    assert.equal(json.default_member_permissions, '8');
  });
});
