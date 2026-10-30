import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AYARLAR, SISTEMLER, sistemAyarla } from '../lib/ayarlar.js';
import {
  DURUMLAR, EN_COK_KAZANAN, EN_KISA_MS, acikCekilisler, butonAyristir, cekilisEkle,
  cekilisGetir, gecerliMi, iptalEt, katilButonId, katilimDegistir, katilimSayisi,
  katilimcilar, kazananMetni, kazananSec, mesajBagla, sonuclandir, uzat, yenidenCek,
} from '../lib/cekilis.js';
import { cekilisGomusu, katilButonu } from '../lib/cekilis-bilesen.js';
import { acVeritabani } from '../lib/db.js';
import { birTur } from '../servisler/cekilis.js';

const G = 'g1';
const K = 'kanal-1';

function kurulum() {
  const db = acVeritabani(':memory:');
  sistemAyarla(db, G, 'cekilis', true);
  return db;
}

function cekilisAc(db, ustler = {}) {
  const id = cekilisEkle(db, {
    guildId: G, kanalId: K, odul: 'Nitro', kazananSayisi: 1,
    bitis: Date.now() + 60_000, olusturanId: 'mod-1', ...ustler,
  });
  mesajBagla(db, id, `mesaj-${id}`);
  return id;
}

/** Gönderilenleri kaydeden sahte istemci. */
function sahteClient() {
  const gonderilen = [];
  const duzenlenen = [];
  const kanal = {
    id: K,
    isTextBased: () => true,
    send: async (yuk) => { gonderilen.push(yuk); return { id: 'yeni' }; },
    messages: {
      fetch: async () => ({
        edit: async (yuk) => { duzenlenen.push(yuk); },
      }),
    },
  };

  return {
    gonderilen,
    duzenlenen,
    channels: { fetch: async (id) => (id === K ? kanal : null) },
  };
}

describe('çekiliş parametre doğrulaması', () => {
  it('çok kısa, çok uzun ve geçersiz süre reddediliyor', () => {
    assert.equal(gecerliMi({ sureMs: 5000, kazananSayisi: 1, odul: 'x' }).ok, false);
    assert.equal(gecerliMi({ sureMs: null, kazananSayisi: 1, odul: 'x' }).ok, false);
    assert.equal(gecerliMi({ sureMs: 40 * 86_400_000, kazananSayisi: 1, odul: 'x' }).ok, false);
    assert.equal(gecerliMi({ sureMs: EN_KISA_MS, kazananSayisi: 1, odul: 'x' }).ok, true);
  });

  it('kazanan sayısı sınırları uygulanıyor', () => {
    assert.equal(gecerliMi({ sureMs: 60_000, kazananSayisi: 0, odul: 'x' }).ok, false);
    assert.equal(gecerliMi({ sureMs: 60_000, kazananSayisi: EN_COK_KAZANAN + 1, odul: 'x' }).ok, false);
    assert.equal(gecerliMi({ sureMs: 60_000, kazananSayisi: 1.5, odul: 'x' }).ok, false);
  });

  it('boş ödül reddediliyor', () => {
    assert.equal(gecerliMi({ sureMs: 60_000, kazananSayisi: 1, odul: '   ' }).ok, false);
  });

  it('buton kimliği yalnız kendi çekilişimizi eşliyor', () => {
    assert.equal(butonAyristir(katilButonId(9)), 9);
    assert.equal(butonAyristir('basvuru:onay:9'), null);
    assert.equal(butonAyristir('talep:kapat:9'), null);
    assert.equal(butonAyristir('cekilis:katil:sifir'), null);
  });
});

describe('kazanan seçimi', () => {
  it('tekrarsız ve istenen sayıda', () => {
    const kazananlar = kazananSec(['a', 'b', 'c', 'd', 'e'], 3);
    assert.equal(kazananlar.length, 3);
    assert.equal(new Set(kazananlar).size, 3);
    for (const k of kazananlar) assert.ok(['a', 'b', 'c', 'd', 'e'].includes(k));
  });

  it('katılımcıdan fazla kazanan istenirse olan kadarı çekiliyor', () => {
    assert.deepEqual(kazananSec(['a'], 5), ['a']);
    assert.deepEqual(kazananSec([], 3), []);
  });

  it('bütün katılımcılar seçilebiliyor (havuz kayması yok)', () => {
    const gorulen = new Set();
    for (let i = 0; i < 300; i += 1) {
      for (const k of kazananSec(['a', 'b', 'c', 'd'], 1)) gorulen.add(k);
    }
    assert.deepEqual([...gorulen].sort(), ['a', 'b', 'c', 'd']);
  });
});

describe('katılım', () => {
  it('katıl / ayrıl geçişi ve sayım', () => {
    const db = kurulum();
    const id = cekilisAc(db);

    assert.deepEqual(katilimDegistir(db, id, 'u1'), { katildi: true, adet: 1 });
    assert.deepEqual(katilimDegistir(db, id, 'u2'), { katildi: true, adet: 2 });
    assert.deepEqual(katilimDegistir(db, id, 'u1'), { katildi: false, adet: 1 });
    assert.deepEqual(katilimcilar(db, id), ['u2']);
  });

  it('aynı kullanıcı iki kez katılamıyor', () => {
    const db = kurulum();
    const id = cekilisAc(db);
    katilimDegistir(db, id, 'u1');
    katilimDegistir(db, id, 'u1');
    katilimDegistir(db, id, 'u1');
    assert.equal(katilimSayisi(db, id), 1);
  });

  it('iki çekilişin katılımı karışmıyor', () => {
    const db = kurulum();
    const a = cekilisAc(db);
    const b = cekilisAc(db);
    katilimDegistir(db, a, 'u1');
    assert.equal(katilimSayisi(db, a), 1);
    assert.equal(katilimSayisi(db, b), 0);
  });
});

describe('sonuçlandırma', () => {
  it('kazanan çekiliyor ve kayda yazılıyor', () => {
    const db = kurulum();
    const id = cekilisAc(db, { kazananSayisi: 2 });
    for (const u of ['u1', 'u2', 'u3']) katilimDegistir(db, id, u);

    const sonuc = sonuclandir(db, id);
    assert.equal(sonuc.ok, true);
    assert.equal(sonuc.kazananlar.length, 2);
    assert.equal(sonuc.katilimci, 3);

    const kayit = cekilisGetir(db, id);
    assert.equal(kayit.durum, DURUMLAR.bitti);
    assert.deepEqual(kayit.kazananlar, sonuc.kazananlar);
  });

  it('aynı çekiliş ikinci kez çekilmiyor', () => {
    const db = kurulum();
    const id = cekilisAc(db);
    katilimDegistir(db, id, 'u1');

    assert.equal(sonuclandir(db, id).ok, true);
    const ikinci = sonuclandir(db, id);
    assert.equal(ikinci.ok, false);
    assert.equal(ikinci.sebep, 'zaten-sonuclandi');
  });

  it('katılımcısız çekiliş kazanansız kapanıyor', () => {
    const db = kurulum();
    const id = cekilisAc(db);
    const sonuc = sonuclandir(db, id);

    assert.equal(sonuc.ok, true);
    assert.deepEqual(sonuc.kazananlar, []);
    assert.equal(cekilisGetir(db, id).durum, DURUMLAR.bitti);
    assert.equal(kazananMetni([]), '_katılan olmadı_');
  });

  it('iptal edilen çekiliş sonuçlandırılamıyor', () => {
    const db = kurulum();
    const id = cekilisAc(db);
    assert.equal(iptalEt(db, id), true);
    assert.equal(iptalEt(db, id), false);
    assert.equal(sonuclandir(db, id).ok, false);
  });

  it('yeniden çekiliş eski kazananı vermiyor', () => {
    const db = kurulum();
    const id = cekilisAc(db);
    for (const u of ['u1', 'u2']) katilimDegistir(db, id, u);

    const ilk = sonuclandir(db, id);
    const yeni = yenidenCek(db, id, { adet: 1 });

    assert.equal(yeni.ok, true);
    assert.equal(yeni.kazananlar.length, 1);
    assert.notEqual(yeni.kazananlar[0], ilk.kazananlar[0]);
    // İki kazanan da kayıtta birikir.
    assert.deepEqual(cekilisGetir(db, id).kazananlar.sort(), ['u1', 'u2']);
  });

  it('aday kalmayınca yeniden çekiliş reddediliyor', () => {
    const db = kurulum();
    const id = cekilisAc(db);
    katilimDegistir(db, id, 'u1');
    sonuclandir(db, id);

    assert.equal(yenidenCek(db, id).sebep, 'aday-yok');
  });

  it('sonuçlanmamış çekilişte yeniden çekiliş reddediliyor', () => {
    const db = kurulum();
    assert.equal(yenidenCek(db, cekilisAc(db)).sebep, 'sonuclanmamis');
  });
});

describe('uzatma', () => {
  it('açık çekilişin bitişi ek süre kadar ileri gidiyor', () => {
    const db = kurulum();
    const id = cekilisAc(db, { bitis: 100_000 });

    const sonuc = uzat(db, id, 300_000, { simdi: 50_000 });
    assert.equal(sonuc.ok, true);
    assert.equal(sonuc.eskiBitis, 100_000);
    assert.equal(sonuc.bitis, 400_000);
    assert.equal(cekilisGetir(db, id).bitis, 400_000);
  });

  it('bitişi geçmiş ama çekilmemiş çekilişte ek süre şimdiden sayılıyor', () => {
    const db = kurulum();
    const id = cekilisAc(db, { bitis: 1000 });

    const sonuc = uzat(db, id, 300_000, { simdi: 5000 });
    assert.equal(sonuc.bitis, 305_000);
  });

  it('kapanmış çekiliş uzatılamıyor', () => {
    const db = kurulum();
    const biten = cekilisAc(db);
    sonuclandir(db, biten);
    const iptal = cekilisAc(db);
    iptalEt(db, iptal);

    assert.equal(uzat(db, biten, 60_000).sebep, 'kapali');
    assert.equal(uzat(db, iptal, 60_000).sebep, 'kapali');
    assert.equal(uzat(db, 999, 60_000).sebep, 'bulunamadi');
  });

  it('geçersiz ve 30 günü aşan süre reddediliyor', () => {
    const db = kurulum();
    const id = cekilisAc(db, { bitis: 10 * 86_400_000 });

    assert.equal(uzat(db, id, null).sebep, 'gecersiz-sure');
    assert.equal(uzat(db, id, 0).sebep, 'gecersiz-sure');
    assert.equal(uzat(db, id, 21 * 86_400_000, { simdi: 0 }).sebep, 'cok-uzun');
    assert.equal(cekilisGetir(db, id).bitis, 10 * 86_400_000);
  });

  it('servis turu taze bitişe bakıyor: uzatılan çekiliş eski süresiyle çekilmiyor', () => {
    const db = kurulum();
    const id = cekilisAc(db, { bitis: 1000 });
    uzat(db, id, 60_000, { simdi: 2000 });

    // Tur, uzatmadan önce okuduğu listeyle simdi=2000'de sonuçlandırmaya kalkar.
    assert.equal(sonuclandir(db, id, { simdi: 2000 }).sebep, 'vadesi-gelmedi');
    assert.equal(cekilisGetir(db, id).durum, DURUMLAR.acik);
    assert.equal(sonuclandir(db, id, { simdi: 62_000 }).ok, true);
  });
});

describe('servis turu ve yeniden başlatma kurtarması', () => {
  it('süresi dolan çekiliş sonuçlanıp duyuruluyor', async () => {
    const db = kurulum();
    const id = cekilisAc(db, { bitis: 1000 });
    katilimDegistir(db, id, 'u1');

    const client = sahteClient();
    const sonuc = await birTur(client, { db, simdi: 2000 });

    assert.equal(sonuc.sonuclanan, 1);
    assert.equal(cekilisGetir(db, id).durum, DURUMLAR.bitti);
    assert.equal(client.gonderilen.length, 1);
    assert.match(client.gonderilen[0].content, /kazanan/i);
    // Kazanan etiketlenir, ödül metnindeki başka etiketler geçmez.
    assert.deepEqual(client.gonderilen[0].allowedMentions, { users: ['u1'] });
    assert.equal(client.duzenlenen.length, 1);
  });

  it('bot kapalıyken geçen süre açılışta yakalanıyor', async () => {
    const db = kurulum();
    // Bitişi çoktan geçmiş: bot kapalıyken süre dolmuş demektir.
    const id = cekilisAc(db, { bitis: Date.now() - 86_400_000 });
    katilimDegistir(db, id, 'u1');

    const sonuc = await birTur(sahteClient(), { db });
    assert.equal(sonuc.sonuclanan, 1);
    assert.equal(cekilisGetir(db, id).durum, DURUMLAR.bitti);
  });

  it('süresi dolmamış çekilişe dokunulmuyor', async () => {
    const db = kurulum();
    const id = cekilisAc(db, { bitis: Date.now() + 3_600_000 });

    const sonuc = await birTur(sahteClient(), { db });
    assert.equal(sonuc.sonuclanan, 0);
    assert.equal(cekilisGetir(db, id).durum, DURUMLAR.acik);
  });

  it('ikinci tur aynı çekilişi tekrar çekmiyor', async () => {
    const db = kurulum();
    cekilisAc(db, { bitis: 1000 });

    const client = sahteClient();
    await birTur(client, { db, simdi: 2000 });
    const ikinci = await birTur(client, { db, simdi: 3000 });

    assert.equal(ikinci.sonuclanan, 0);
    assert.equal(client.gonderilen.length, 1);
  });

  it('sistem kapalıyken çekiliş sonuçlandırılmıyor', async () => {
    const db = kurulum();
    sistemAyarla(db, G, 'cekilis', false);
    const id = cekilisAc(db, { bitis: 1000 });

    const sonuc = await birTur(sahteClient(), { db, simdi: 2000 });
    assert.equal(sonuc.atlanan, 1);
    assert.equal(cekilisGetir(db, id).durum, DURUMLAR.acik);
  });

  it('kanalı bulunamayan çekiliş turu düşürmüyor', async () => {
    const db = kurulum();
    const a = cekilisAc(db, { bitis: 1000, kanalId: 'yok-kanal' });
    const b = cekilisAc(db, { bitis: 1000 });

    const sonuc = await birTur(sahteClient(), { db, simdi: 2000 });
    // İkisi de kayıtta sonuçlanır; yalnız duyuru gönderilemeyeni sessiz kalır.
    assert.equal(cekilisGetir(db, a).durum, DURUMLAR.bitti);
    assert.equal(cekilisGetir(db, b).durum, DURUMLAR.bitti);
    assert.equal(sonuc.sonuclanan, 2);
  });

  it('açık çekiliş listesi sunucuya göre süzülüyor', () => {
    const db = kurulum();
    cekilisAc(db);
    cekilisAc(db, { guildId: 'baska' });

    assert.equal(acikCekilisler(db, G).length, 1);
    assert.equal(acikCekilisler(db).length, 2);
  });
});

describe('çekiliş görünümü ve ayarları', () => {
  it('açık çekilişte katılım butonu etkin, bitince kapalı', () => {
    assert.equal(katilButonu(1, 3).toJSON().components[0].disabled, false);
    assert.equal(katilButonu(1, 3, true).toJSON().components[0].disabled, true);
  });

  it('gömü açık ve bitmiş durumda farklı alan gösteriyor', () => {
    const db = kurulum();
    const id = cekilisAc(db);
    const acik = cekilisGomusu(cekilisGetir(db, id), 2).toJSON();
    assert.ok(acik.fields.some((f) => f.name === 'Kazanan sayısı'));

    katilimDegistir(db, id, 'u1');
    sonuclandir(db, id);
    const bitti = cekilisGomusu(cekilisGetir(db, id), 1).toJSON();
    assert.ok(bitti.fields.some((f) => f.name === 'Kazanan'));
  });

  it('sistem ve ayar anahtarı tanımlı', () => {
    assert.equal(SISTEMLER.cekilis.varsayilan, false);
    assert.equal(AYARLAR['cekilis.kanal'].tur, 'kanal');
  });
});
