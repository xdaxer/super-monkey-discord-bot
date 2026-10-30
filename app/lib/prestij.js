/**
 * Prestij: yeterince emek geliri kazandıysan ekonomi ilerlemeni sıfırla,
 * karşılığında kalıcı bir muz kazanç çarpanı ve bir ödül kasası al. Sayılar
 * docs/para.md ile birebir aynıdır.
 *
 * Neyin sıfırlanacağı tek tabloda (`SIFIRLANACAKLAR`), neyin prestiji
 * engelleyeceği tek tabloda (`ENGELLER`) durur; hisse, kredi gibi sonradan
 * gelen sistemler yalnız bu listelere bir satır ekler. Çarpanın kendisi
 * prestij-carpan.js'tedir (gelir yerleri döngüsüz içe aktarabilsin diye).
 *
 * Denge kararları:
 *  - Çarpan yalnız "emekle gelen" muza uygulanır: /gunluk, sohbet, /calis,
 *    görev ve sefer muzu; maymun çiftliğinde üretim hızı. Kumar (bahse
 *    çarpan = sömürü: pozitif beklentili hale gelir), mağaza/kart satışı
 *    (envanter değeri şişer), banka faizi (anapara zaten bakiyeden gelir;
 *    çifte çarpan), kasa ve set ödülleri ile düello/piyango çarpansızdır.
 *  - Bedel yok, eşik var (2026-10-26): son prestijden beri o emek
 *    gelirlerinden `prestijEsigi` kadar kazanmış olmak gerekir. Eskiden
 *    100K × (n+1) bedel ödenip üstüne her şey siliniyordu; +%10 için sıradan
 *    üye 20–50 haftada ancak başa baş geliyordu. Sıfırlamanın kendisi bedeldir.
 *  - Cüzdan sıfırlanır (yok edilen muz); çiftlikler ise satılıp satış değeri
 *    ve depodaki muz yeni cüzdana aktarılır. Çiftlik ekonominin ana
 *    yatırımıdır; silinseydi en çok yatırım yapan en çok cezalandırılırdı.
 *  - Kilitli varlık (aktif mevduat, açık blackjack/mines/düello/XOX) varken
 *    prestij yapılamaz; yoksa o varlık sıfırlamayı atlatır ya da yok olurdu.
 *  - Piyango bileti engel değildir (2026-10-23, kullanıcı isteğiyle): bilet
 *    prestijden sonra da geçerli kalır, kazanırsa ikramiye yeni cüzdana
 *    gider. Taşınabilecek değer kişi başı haftalık bilet sınırıyla
 *    (40 × 500) küçük kalır ve beklentisi negatife yakındır.
 */

import { kilitliToplam } from './banka.js';
import {
  bakiye, bicimle, dus, islem, TURLER,
} from './ekonomi.js';
import { ciftlikDevirToplami, ciftlikleriDevret } from './ciftlik.js';
import { esyaEkle, esyaHareketi } from './envanter.js';
import { kartMi, kasaMi } from './kasalar.js';
import { seferleriSil } from './sefer.js';
import {
  MAKS_PRESTIJ, prestijSeviyesi, seviyeCarpani,
} from './prestij-carpan.js';

export {
  CARPAN_YUZDE, MAKS_PRESTIJ, prestijCarpani, prestijSeviyesi, seviyeCarpani,
} from './prestij-carpan.js';

/** Eşik = ESIK_TABAN × (mevcut prestij + 1): 100K, 200K, ... 1M emek geliri. */
export const ESIK_TABAN = 100_000;

/** Eşiğe sayılan defter türleri: prestij çarpanının uygulandığı emek gelirleri. */
export const EMEK_TURLERI = Object.freeze([TURLER.gunluk, TURLER.mesaj, TURLER.calis, TURLER.gorev, TURLER.sefer]);

/** Bir sonraki prestijin eşiği; en üst seviyedeyse null. */
export function prestijEsigi(seviye) {
  return seviye >= MAKS_PRESTIJ ? null : ESIK_TABAN * (Math.max(0, Math.floor(seviye)) + 1);
}

/** Son prestijden (hiç yapmadıysa baştan) beri kazanılan emek geliri. */
export function emekGeliri(db, guildId, kullaniciId) {
  const son = db
    .prepare('SELECT son_prestij FROM prestijler WHERE guild_id = ? AND kullanici_id = ?')
    .get(String(guildId), String(kullaniciId))?.son_prestij ?? 0;
  return db
    .prepare(`SELECT COALESCE(SUM(miktar), 0) AS toplam FROM ekonomi_hareketleri
      WHERE guild_id = ? AND kullanici_id = ? AND tur IN (${EMEK_TURLERI.map(() => '?').join(', ')}) AND zaman > ?`)
    .get(String(guildId), String(kullaniciId), ...EMEK_TURLERI, son).toplam;
}

/** Prestijle gelen ödül kasası: 1–4 Demir, 5–9 Altın, 10 Elmas. */
export function prestijKasasi(seviye) {
  if (seviye >= MAKS_PRESTIJ) return 'kasa-elmas';
  return seviye >= 5 ? 'kasa-altin' : 'kasa-demir';
}

function envanterSil(db, guildId, kullaniciId, uygun) {
  const satirlar = db
    .prepare('SELECT esya, adet FROM envanter WHERE guild_id = ? AND kullanici_id = ? AND adet > 0')
    .all(String(guildId), String(kullaniciId))
    .filter((s) => uygun(s.esya));
  const sil = db.prepare('DELETE FROM envanter WHERE guild_id = ? AND kullanici_id = ? AND esya = ?');
  for (const s of satirlar) sil.run(String(guildId), String(kullaniciId), s.esya);
  return satirlar.reduce((t, s) => t + s.adet, 0);
}

/**
 * Prestijde sıfırlananlar. `sifirla` işlem içinde çalışır ve sıfırlanan
 * miktarı/adedi döner. `birim` özet satırında adedin yanına yazılır.
 * Not: envanterde rozetler (`rozet-…`) korunur; aşağıdaki süzgeçler rozetle
 * hiç eşleşmez.
 */
export const SIFIRLANACAKLAR = Object.freeze([
  {
    kod: 'bakiye', ad: 'Cüzdandaki muz', birim: 'muz',
    sifirla: (db, g, u, simdi) => {
      const kalan = bakiye(db, g, u);
      if (kalan > 0) dus(db, { guildId: g, kullaniciId: u, miktar: kalan, tur: TURLER.prestij, karsiId: 'sifirlama', simdi });
      return kalan;
    },
  },
  {
    kod: 'kartlar', ad: 'Kartlar (normal ve parlak)', birim: 'kart',
    sifirla: (db, g, u) => envanterSil(db, g, u, kartMi),
  },
  {
    kod: 'kasalar', ad: 'Açılmamış kasalar', birim: 'kasa',
    sifirla: (db, g, u) => envanterSil(db, g, u, kasaMi),
  },
  {
    kod: 'stok', ad: 'Stoklu eşyalar (Seri Koruyucu)', birim: 'adet',
    sifirla: (db, g, u) => envanterSil(db, g, u, (esya) => esya === 'seri-koruyucu'),
  },
  {
    kod: 'setler', ad: 'Koleksiyon seti ödül kaydı (setler yeniden kazanılır)', birim: 'set',
    sifirla: (db, g, u) => Number(db
      .prepare('DELETE FROM set_oduller WHERE guild_id = ? AND kullanici_id = ?').run(String(g), String(u)).changes),
  },
  {
    kod: 'seferler', ad: 'Dönmemiş ve toplanmamış seferler (kartlarla birlikte)', birim: 'sefer',
    sifirla: (db, g, u) => seferleriSil(db, g, u),
  },
]);

/** Prestijde silinmeyip muza çevrilenler (yalnız bilgi metni; devri prestijYap yapar). */
export const DEVREDILENLER = Object.freeze([
  'Maymun çiftlikleri satılır: satış değeri (%70, Muz Kurtarma ile %90) ve depodaki muz yeni cüzdanına geçer',
]);

/** Prestijde korunanlar (yalnız bilgi metni; bunlara hiçbir kod dokunmaz). */
export const KORUNANLAR = Object.freeze([
  'Seviye, XP ve seviye rolleri',
  'Rozetler ve rozet rolleri',
  'Özel renk rolü',
  'Başarımlar (alınmış başarım ödülleri tekrar verilmez)',
  'Görev ilerlemesi ve prestij seviyen',
  'Maymun deneyimleri ve yükseltmeleri (kart yeniden kazanılınca seviyesi ve yollarıyla döner)',
  'Günlük seri',
  'Etkin takviyeler (XP İksiri, Muz Çiftliği süreleri)',
]);

/**
 * Prestijin önündeki engeller; her `kontrol` engel varsa kullanıcıya gösterilecek
 * metni, yoksa null döner.
 */
export const ENGELLER = Object.freeze([
  {
    kod: 'mevduat',
    kontrol: (db, g, u) => {
      const kilitli = kilitliToplam(db, g, u);
      return kilitli > 0
        ? `Bankada ${bicimle(kilitli)} muz kilitli mevduatın var. Önce **Banka → Mevduat** ekranından boz ya da vadesini bekle.`
        : null;
    },
  },
  {
    kod: 'blackjack',
    kontrol: (db, g, u) => (db
      .prepare('SELECT 1 AS var FROM blackjack_oyunlari WHERE guild_id = ? AND kullanici_id = ?').get(String(g), String(u))
      ? 'Sürmekte olan bir blackjack elin var. Önce eli bitir.'
      : null),
  },
  {
    kod: 'mines',
    kontrol: (db, g, u) => (db
      .prepare('SELECT 1 AS var FROM mines_oyunlari WHERE guild_id = ? AND kullanici_id = ?').get(String(g), String(u))
      ? 'Sürmekte olan bir mines oyunun var. Önce çek ya da bitir.'
      : null),
  },
  {
    kod: 'xox',
    kontrol: (db, g, u) => (db
      .prepare('SELECT 1 AS var FROM xox_oyunlari WHERE guild_id = ? AND (x_id = ? OR o_id = ?)')
      .get(String(g), String(u), String(u))
      ? 'Sürmekte olan bir XOX düellon var. Önce oyunu bitir.'
      : null),
  },
  {
    // Borç cüzdanla birlikte sıfırlanıp kaybolmasın: önce kapatılmalı.
    kod: 'kredi',
    kontrol: (db, g, u) => (db
      .prepare("SELECT 1 AS var FROM krediler WHERE guild_id = ? AND kullanici_id = ? AND durum IN ('aktif', 'gecikmis')")
      .get(String(g), String(u))
      ? 'Açık bir kredin var. Önce **Banka → Kredi** ekranından kapat.'
      : null),
  },
  {
    // Hisseler sıfırlamadan kaçmasın: önce satılır (satış muzu da sıfırlanır).
    kod: 'hisse',
    kontrol: (db, g, u) => (db
      .prepare('SELECT 1 AS var FROM hisse_pozisyonlari WHERE guild_id = ? AND kullanici_id = ? AND adet > 0')
      .get(String(g), String(u))
      ? 'Elinde hisse var. Önce **Borsa** ekranından hepsini sat.'
      : null),
  },
  {
    kod: 'duello',
    kontrol: (db, g, u) => (db
      .prepare('SELECT 1 AS var FROM duello_meydanlari WHERE guild_id = ? AND meydan_id = ?').get(String(g), String(u))
      ? 'Bekleyen bir düello meydan okuman var (bahsin emanette). Önce sonuçlansın.'
      : null),
  },
]);

/** Üyenin prestij durumu: seviye, çarpan, eşik ve ilerleme, ödül, engeller. */
export function prestijDurumu(db, guildId, kullaniciId, simdi = Date.now()) {
  const seviye = prestijSeviyesi(db, guildId, kullaniciId);
  const esik = prestijEsigi(seviye);
  const engeller = ENGELLER.map((e) => e.kontrol(db, guildId, kullaniciId, simdi)).filter(Boolean);
  return {
    seviye,
    carpan: seviyeCarpani(seviye),
    enUst: esik === null,
    esik,
    emek: emekGeliri(db, guildId, kullaniciId),
    sonrakiCarpan: esik === null ? null : seviyeCarpani(seviye + 1),
    odulKasa: esik === null ? null : prestijKasasi(seviye + 1),
    bakiye: bakiye(db, guildId, kullaniciId),
    ciftlikDevri: ciftlikDevirToplami(db, guildId, kullaniciId, simdi),
    engeller,
  };
}

/**
 * Prestij yapar: engelleri ve eşiği denetler, listeyi sıfırlar, çiftlikleri
 * yeni cüzdana devreder, ödül kasasını verir, seviyeyi artırır; hepsi tek
 * işlemde (herhangi bir adım hata verirse hiçbiri yazılmaz).
 * `beklenenSeviye` verilirse (onay butonu) seviye bu değilse reddeder: eski
 * bir onay mesajı ikinci kez prestij yaptıramaz.
 *
 * @returns {{ok: false, sebep: string}
 *   | {ok: true, seviye: number, carpan: number, kasa: string,
 *      devir: {ciftlik: number, muz: number},
 *      ozet: Array<{kod: string, ad: string, birim: string, miktar: number}>}}
 */
export function prestijYap(db, {
  guildId, kullaniciId, beklenenSeviye = null, simdi = Date.now(),
}) {
  return islem(db, () => {
    const mevcut = prestijSeviyesi(db, guildId, kullaniciId);
    if (beklenenSeviye !== null && beklenenSeviye !== mevcut) {
      return { ok: false, sebep: 'Prestij durumun değişmiş; bu onay artık geçerli değil. **Prestij** ekranından yeniden başla.' };
    }
    const esik = prestijEsigi(mevcut);
    if (esik === null) return { ok: false, sebep: `En üst prestijdesin (${MAKS_PRESTIJ}).` };

    for (const engel of ENGELLER) {
      const sebep = engel.kontrol(db, guildId, kullaniciId, simdi);
      if (sebep) return { ok: false, sebep };
    }

    const emek = emekGeliri(db, guildId, kullaniciId);
    if (emek < esik) {
      return { ok: false, sebep: `Henüz hazır değilsin: son prestijinden beri ${bicimle(emek)} / ${bicimle(esik)} muz emek geliri kazandın.` };
    }

    const ozet = SIFIRLANACAKLAR.map((s) => ({
      kod: s.kod, ad: s.ad, birim: s.birim, miktar: s.sifirla(db, guildId, kullaniciId, simdi),
    }));
    // Cüzdan sıfırlandıktan sonra: devredilen muz ve ödül kasası yeni başlangıçtır.
    const devir = ciftlikleriDevret(db, guildId, kullaniciId, simdi);
    const seviye = mevcut + 1;
    const kasa = prestijKasasi(seviye);
    esyaEkle(db, guildId, kullaniciId, kasa, 1);
    esyaHareketi(db, {
      guildId, kullaniciId, esya: kasa, adet: 1, tur: 'prestij', karsiId: String(seviye), simdi,
    });

    db.prepare(
      `INSERT INTO prestijler (guild_id, kullanici_id, seviye, son_prestij) VALUES (?, ?, ?, ?)
       ON CONFLICT(guild_id, kullanici_id) DO UPDATE SET seviye = excluded.seviye, son_prestij = excluded.son_prestij`,
    ).run(String(guildId), String(kullaniciId), seviye, simdi);

    return {
      ok: true, seviye, carpan: seviyeCarpani(seviye), kasa, devir, ozet,
    };
  });
}

/** "⭐×3" gibi kısa gösterge; prestijsizse boş metin. */
export function prestijRozeti(seviye) {
  return seviye > 0 ? `⭐×${seviye}` : '';
}
