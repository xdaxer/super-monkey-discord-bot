/**
 * Topluluk pazarı: üyeler kartlarını birim fiyatla ilana koyar, başkaları
 * satın alır (Steam Topluluk Pazarı gibi).
 *
 * İlana konan kopyalar envanterden düşer ve ilanda emanette durur; iptalde
 * geri döner. Çalışmaya ya da sefere kilitli kopya ilana konamaz (esyaDus).
 * Satın alma tek işlemdir: alıcı birim fiyat × adet öder, satıcıya kesinti
 * (`pazar.kesintiYuzde`) düşülerek kalan geçer; kesinti sistemden çıkar
 * (yok edilen muz). Defter türü iki tarafta da `pazar`dır.
 *
 * Fiyat kartın sistem satış değeri (kartDegeri) ile onun `pazar.tavanCarpani`
 * katı arasındadır: altına inmek kartları alt hesaplara bedavaya taşımayı
 * (hediye sınırı dışında), üstüne çıkmak muzu transfer kurallarının dışında
 * taşımayı kolaylaştırırdı. Yönetici ile üye arasında alım satım yoktur
 * (lib/yonetici-carpan.js).
 *
 * Ayarlar (lib/ayarlar.js `pazar.*`) yönetici panelinden değişir; aşağıdaki
 * sabitler varsayılanlardır. Yönetici işlemleri (ilan düzenle/kaldır, satışı
 * geri al, ayar) `pazar_yonetim_gunlugu`ne yazılır.
 */

import { ayarGetir, ayarYaz } from './ayarlar.js';
import {
  bakiye as bakiyeOku, dus, ekle, islem, muz, TURLER,
} from './ekonomi.js';
import { esyaDus, esyaEkle, esyaHareketi } from './envanter.js';
import { kartDegeri, kartGetir } from './kasalar.js';
import { yoneticiUyeArasi } from './yonetici-carpan.js';
import { uzakAktarimSebebi } from './ekonomi-uzak.js';

export const PAZAR_KESINTI_YUZDE = 10;
export const FIYAT_TAVAN_CARPANI = 10;
/** Bir üyenin aynı anda açık tutabileceği ilan sayısı. */
export const ILAN_SINIRI = 20;
/** Tek ilandaki en çok kopya. */
export const ILAN_ADET_SINIRI = 100;

export const YONETICI_PAZAR_SEBEBI = 'Yöneticilerle üyeler arasında pazar alışverişi kapalı; yöneticiler yalnız birbirinin ilanını alabilir.';
export const PAZAR_KAPALI_SEBEBI = 'Pazar şu an yönetici tarafından kapatıldı; ilan açılamaz ve satın alınamaz. İlanlarını kaldırabilirsin.';

const GUN_MS = 86_400_000;

/** İşlem içinde kuralı bozan durumu, yazılanları geri sararak bildirmek için. */
class PazarHatasi extends Error {}

/** `fn` işlemi PazarHatasi atarsa geri sarılır ve {ok: false} döner. */
function guvenli(fn) {
  try {
    return fn();
  } catch (error) {
    if (error instanceof PazarHatasi) return { ok: false, sebep: error.message };
    throw error;
  }
}

/** Sunucunun pazar ayarları. */
export function pazarAyarlari(db, guildId) {
  return {
    acik: ayarGetir(db, guildId, 'pazar.acik'),
    kesintiYuzde: ayarGetir(db, guildId, 'pazar.kesintiYuzde'),
    tavanCarpani: ayarGetir(db, guildId, 'pazar.tavanCarpani'),
    ilanSiniri: ayarGetir(db, guildId, 'pazar.ilanSiniri'),
  };
}

/** Kartın ilan fiyatı aralığı (birim); kart değilse null. */
export function fiyatAraligi(kimlik, tavanCarpani = FIYAT_TAVAN_CARPANI) {
  const kart = kartGetir(kimlik);
  if (!kart) return null;
  const deger = kartDegeri(kart);
  return { min: deger, max: deger * tavanCarpani };
}

/** Satıcının eline geçen: toplamdan kesinti düşülür (kesinti aşağı yuvarlanır). */
export function kesintiHesapla(toplam, yuzde = PAZAR_KESINTI_YUZDE) {
  const kesinti = Math.floor((toplam * yuzde) / 100);
  return { kesinti, net: toplam - kesinti };
}

function ilanAyristir(s) {
  return s ? {
    id: s.id,
    saticiId: s.satici_id,
    kart: s.kart,
    adet: s.adet,
    ilkAdet: s.ilk_adet,
    fiyat: s.fiyat,
    durum: s.durum,
    olusturma: s.olusturma,
    kapanis: s.kapanis,
  } : null;
}

export function ilanGetir(db, guildId, id) {
  return ilanAyristir(db.prepare('SELECT * FROM pazar_ilanlari WHERE guild_id = ? AND id = ?').get(String(guildId), Number(id)));
}

function acikIlanSayisi(db, guildId, kullaniciId) {
  return db
    .prepare("SELECT COUNT(*) AS n FROM pazar_ilanlari WHERE guild_id = ? AND satici_id = ? AND durum = 'acik'")
    .get(String(guildId), String(kullaniciId)).n;
}

const fiyatHatasi = (kart, { min, max }) => `**${kart.ad}** için birim fiyat ${min.toLocaleString('tr-TR')}–${max.toLocaleString('tr-TR')} muz arası olmalı.`;

// ── Devir ve eşleştirme ───────────────────────────────────────────────────

/**
 * Satışın ortak çekirdeği (işlem içinde çağrılır): kartı alıcıya geçirir,
 * satıcıya kesintili tutarı öder, satışı yazar. `alicidanDus`: alıcı şimdi
 * öder (ilandan alım); false ise ödeme alım isteğinin emanetinden gelir.
 * Alıcının bakiyesi yetmezse null döner (hiçbir şey yazılmamıştır).
 */
function devret(db, {
  guildId, saticiId, aliciId, kart, adet: kac, fiyat, kesintiYuzde, ilanId = null, istekId = null, alicidanDus, simdi,
}) {
  const toplam = fiyat * kac;
  const { kesinti, net } = kesintiHesapla(toplam, kesintiYuzde);
  let bakiye = null;
  if (alicidanDus) {
    bakiye = dus(db, {
      guildId, kullaniciId: aliciId, miktar: toplam, tur: TURLER.pazar, karsiId: saticiId, simdi,
    });
    if (bakiye === null) return null;
  }
  if (net > 0) {
    ekle(db, {
      guildId, kullaniciId: saticiId, miktar: net, tur: TURLER.pazar, karsiId: aliciId, simdi,
    });
  }
  esyaEkle(db, guildId, aliciId, kart, kac);
  esyaHareketi(db, { guildId, kullaniciId: aliciId, esya: kart, adet: kac, tur: 'pazar-al', karsiId: saticiId, simdi });
  const { lastInsertRowid } = db.prepare(
    `INSERT INTO pazar_satislari (guild_id, ilan_id, istek_id, satici_id, alici_id, kart, adet, fiyat, kesinti, zaman)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(String(guildId), ilanId ?? 0, istekId, String(saticiId), String(aliciId), kart, kac, fiyat, kesinti, simdi);
  return {
    id: Number(lastInsertRowid), saticiId: String(saticiId), aliciId: String(aliciId), kart, adet: kac, fiyat, toplam, kesinti, net, bakiye, ilanId, istekId,
  };
}

/** Alım isteğinin emanetindeki muzun defterdeki karşı tarafı. */
const emanetKimligi = (istekId) => `alim-${istekId}`;

function istekAyristir(s) {
  return s ? {
    id: s.id,
    aliciId: s.alici_id,
    kart: s.kart,
    adet: s.adet,
    ilkAdet: s.ilk_adet,
    fiyat: s.fiyat,
    durum: s.durum,
    olusturma: s.olusturma,
    kapanis: s.kapanis,
  } : null;
}

export function istekGetir(db, guildId, id) {
  return istekAyristir(db.prepare('SELECT * FROM alim_istekleri WHERE guild_id = ? AND id = ?').get(String(guildId), Number(id)));
}

function istekAdetiYaz(db, istek, yeniAdet, simdi) {
  db.prepare('UPDATE alim_istekleri SET adet = ?, durum = ?, kapanis = ? WHERE id = ?')
    .run(yeniAdet, yeniAdet === 0 ? 'bitti' : 'acik', yeniAdet === 0 ? simdi : null, istek.id);
}

function ilanAdetiYaz(db, ilan, yeniAdet, simdi) {
  db.prepare('UPDATE pazar_ilanlari SET adet = ?, durum = ?, kapanis = ? WHERE id = ?')
    .run(yeniAdet, yeniAdet === 0 ? 'bitti' : 'acik', yeniAdet === 0 ? simdi : null, ilan.id);
}

/**
 * Kartları (satıcının elinden zaten düşülmüş) en yüksek fiyatlı uygun alım
 * isteklerine satar; isteğin fiyatından, en çok `kac` adet. `enAz`: bu
 * fiyatın altındaki isteklere satılmaz. Satılan devirleri döner.
 */
function isteklereDagit(db, {
  guildId, saticiId, kart, kac, enAz, kesintiYuzde, ilanId = null, simdi, yoneticiler,
}) {
  const istekler = db
    .prepare(
      `SELECT * FROM alim_istekleri WHERE guild_id = ? AND kart = ? AND durum = 'acik' AND fiyat >= ? AND alici_id != ?
        ORDER BY fiyat DESC, id ASC`,
    )
    .all(String(guildId), kart, enAz, String(saticiId))
    .map(istekAyristir)
    .filter((i) => !yoneticiUyeArasi(i.aliciId, saticiId, yoneticiler) && !uzakAktarimSebebi(db, guildId, i.aliciId, saticiId));
  const devirler = [];
  let kalan = kac;
  for (const istek of istekler) {
    if (kalan === 0) break;
    const m = Math.min(kalan, istek.adet);
    devirler.push({
      ...devret(db, {
        guildId, saticiId, aliciId: istek.aliciId, kart, adet: m, fiyat: istek.fiyat, kesintiYuzde, ilanId, istekId: istek.id, alicidanDus: false, simdi,
      }),
      kalan: istek.adet - m,
    });
    istekAdetiYaz(db, istek, istek.adet - m, simdi);
    kalan -= m;
  }
  return devirler;
}

/**
 * Kartı ilana koyar: kopyalar envanterden emanete geçer. İlan fiyatına ya da
 * üstüne açık alım isteği varsa kopyalar önce o isteklere (isteğin fiyatından)
 * satılır; kalan ilanda bekler (`satilan` hemen satılan devirler).
 * @returns {{ok: false, sebep: string} | {ok: true, ilan: object, satilan: Array<object>}}
 */
export function ilanAc(db, {
  guildId, saticiId, kimlik, adet: kac = 1, fiyat, simdi = Date.now(), yoneticiler = undefined,
}) {
  const ayar = pazarAyarlari(db, guildId);
  if (!ayar.acik) return { ok: false, sebep: PAZAR_KAPALI_SEBEBI };
  const kart = kartGetir(kimlik);
  if (!kart) return { ok: false, sebep: 'Pazarda yalnız kartlar satılabilir.' };
  if (!Number.isSafeInteger(kac) || kac < 1 || kac > ILAN_ADET_SINIRI) {
    return { ok: false, sebep: `Bir ilanda 1–${ILAN_ADET_SINIRI} kopya olabilir.` };
  }
  const aralik = fiyatAraligi(kimlik, ayar.tavanCarpani);
  if (!Number.isSafeInteger(fiyat) || fiyat < aralik.min || fiyat > aralik.max) return { ok: false, sebep: fiyatHatasi(kart, aralik) };
  return islem(db, () => {
    if (acikIlanSayisi(db, guildId, saticiId) >= ayar.ilanSiniri) {
      return { ok: false, sebep: `Aynı anda en çok ${ayar.ilanSiniri} ilanın olabilir. Önce birini kaldır ya da satılmasını bekle.` };
    }
    if (!esyaDus(db, guildId, saticiId, kimlik, kac)) {
      return { ok: false, sebep: `Elinde serbest ${kac} tane **${kart.ad}** yok (çalışmaya ya da sefere kilitli kopya ilana konamaz).` };
    }
    esyaHareketi(db, { guildId, kullaniciId: saticiId, esya: kimlik, adet: -kac, tur: 'pazar-ilan', simdi });
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO pazar_ilanlari (guild_id, satici_id, kart, adet, ilk_adet, fiyat, durum, olusturma)
         VALUES (?, ?, ?, ?, ?, ?, 'acik', ?)`,
      )
      .run(String(guildId), String(saticiId), kimlik, kac, kac, fiyat, simdi);
    const ilan = ilanGetir(db, guildId, lastInsertRowid);
    const satilan = isteklereDagit(db, {
      guildId, saticiId, kart: kimlik, kac, enAz: fiyat, kesintiYuzde: ayar.kesintiYuzde, ilanId: ilan.id, simdi, yoneticiler,
    });
    const satilanAdet = satilan.reduce((t, d) => t + d.adet, 0);
    if (satilanAdet > 0) ilanAdetiYaz(db, ilan, kac - satilanAdet, simdi);
    return { ok: true, ilan: ilanGetir(db, guildId, ilan.id), satilan };
  });
}

/** İlanı kaldırır (yalnız satıcı; pazar kapalıyken de); kalan kopyalar envantere döner. */
export function ilanIptal(db, {
  guildId, kullaniciId, id, simdi = Date.now(),
}) {
  return islem(db, () => {
    const ilan = ilanGetir(db, guildId, id);
    if (!ilan || ilan.durum !== 'acik') return { ok: false, sebep: 'Bu ilan artık açık değil.' };
    if (ilan.saticiId !== String(kullaniciId)) return { ok: false, sebep: 'Yalnız kendi ilanını kaldırabilirsin.' };
    db.prepare("UPDATE pazar_ilanlari SET durum = 'iptal', kapanis = ? WHERE id = ?").run(simdi, ilan.id);
    esyaEkle(db, guildId, kullaniciId, ilan.kart, ilan.adet);
    esyaHareketi(db, { guildId, kullaniciId, esya: ilan.kart, adet: ilan.adet, tur: 'pazar-iptal', simdi });
    return { ok: true, ilan: { ...ilan, durum: 'iptal' }, adet: ilan.adet };
  });
}

/**
 * İlandan satın alır. Her şey tek işlemde; bakiye yetmezse hiçbir şey yazılmaz.
 * @returns {{ok: false, sebep: string}
 *   | {ok: true, ilan: object, adet: number, toplam: number, kesinti: number, net: number, bakiye: number}}
 */
export function pazardanAl(db, {
  guildId, aliciId, id, adet: kac = 1, simdi = Date.now(), yoneticiler = undefined,
}) {
  if (!Number.isSafeInteger(kac) || kac < 1) return { ok: false, sebep: 'Geçersiz adet.' };
  const ayar = pazarAyarlari(db, guildId);
  if (!ayar.acik) return { ok: false, sebep: PAZAR_KAPALI_SEBEBI };
  return islem(db, () => {
    const ilan = ilanGetir(db, guildId, id);
    if (!ilan || ilan.durum !== 'acik') return { ok: false, sebep: 'Bu ilan artık açık değil; başka biri almış ya da kaldırılmış olabilir.' };
    if (ilan.saticiId === String(aliciId)) return { ok: false, sebep: 'Kendi ilanını satın alamazsın; kaldırmak için ilanlarına bak.' };
    if (yoneticiUyeArasi(ilan.saticiId, aliciId, yoneticiler)) return { ok: false, sebep: YONETICI_PAZAR_SEBEBI };
    const uzak = uzakAktarimSebebi(db, guildId, ilan.saticiId, aliciId);
    if (uzak) return { ok: false, sebep: uzak };
    if (kac > ilan.adet) return { ok: false, sebep: `Bu ilanda ${ilan.adet} kopya kaldı.` };

    const d = devret(db, {
      guildId, saticiId: ilan.saticiId, aliciId, kart: ilan.kart, adet: kac, fiyat: ilan.fiyat, kesintiYuzde: ayar.kesintiYuzde, ilanId: ilan.id, alicidanDus: true, simdi,
    });
    if (!d) return { ok: false, sebep: `Bakiyen yetmiyor: ${(ilan.fiyat * kac).toLocaleString('tr-TR')} muz gerekiyor.` };
    ilanAdetiYaz(db, ilan, ilan.adet - kac, simdi);
    return {
      ok: true, ilan: { ...ilan, adet: ilan.adet - kac }, adet: kac, toplam: d.toplam, kesinti: d.kesinti, net: d.net, yuzde: ayar.kesintiYuzde, bakiye: d.bakiye,
    };
  });
}

// ── Alım istekleri ────────────────────────────────────────────────────────

function acikIstekSayisi(db, guildId, kullaniciId) {
  return db
    .prepare("SELECT COUNT(*) AS n FROM alim_istekleri WHERE guild_id = ? AND alici_id = ? AND durum = 'acik'")
    .get(String(guildId), String(kullaniciId)).n;
}

/**
 * Alım isteği verir: "bu karttan tanesi en çok `fiyat` muza, `adet` tane".
 * Bakiyede `fiyat × adet` olmalı. Önce bu fiyata ya da altına açık ilanlar
 * ucuzdan pahalıya alınır (ilanın fiyatından); kalan adet için `fiyat × kalan`
 * emanete alınır ve istek açık kalır. Kart sahipleri isteğe satabilir.
 * @returns {{ok: false, sebep: string}
 *   | {ok: true, istek: object|null, alinan: Array<object>, emanet: number, bakiye: number}}
 */
export function alimIstegiAc(db, {
  guildId, aliciId, kimlik, adet: kac = 1, fiyat, simdi = Date.now(), yoneticiler = undefined,
}) {
  const ayar = pazarAyarlari(db, guildId);
  if (!ayar.acik) return { ok: false, sebep: PAZAR_KAPALI_SEBEBI };
  const kart = kartGetir(kimlik);
  if (!kart) return { ok: false, sebep: 'Pazarda yalnız kartlar alınıp satılabilir.' };
  if (!Number.isSafeInteger(kac) || kac < 1 || kac > ILAN_ADET_SINIRI) {
    return { ok: false, sebep: `Bir istekte 1–${ILAN_ADET_SINIRI} kopya olabilir.` };
  }
  const aralik = fiyatAraligi(kimlik, ayar.tavanCarpani);
  if (!Number.isSafeInteger(fiyat) || fiyat < aralik.min || fiyat > aralik.max) return { ok: false, sebep: fiyatHatasi(kart, aralik) };
  return islem(db, () => {
    if (acikIstekSayisi(db, guildId, aliciId) >= ayar.ilanSiniri) {
      return { ok: false, sebep: `Aynı anda en çok ${ayar.ilanSiniri} alım isteğin olabilir. Önce birini kaldır.` };
    }
    const enCok = fiyat * kac;
    if (bakiyeOku(db, guildId, aliciId) < enCok) return { ok: false, sebep: `Bakiyen yetmiyor: bu istek için ${enCok.toLocaleString('tr-TR')} muz gerekiyor.` };

    // Önce uyan ilanlar: ucuzdan pahalıya, ilanın fiyatından.
    const ilanlar = db
      .prepare(
        `SELECT * FROM pazar_ilanlari WHERE guild_id = ? AND kart = ? AND durum = 'acik' AND fiyat <= ? AND satici_id != ?
          ORDER BY fiyat ASC, id ASC`,
      )
      .all(String(guildId), kimlik, fiyat, String(aliciId))
      .map(ilanAyristir)
      .filter((i) => !yoneticiUyeArasi(i.saticiId, aliciId, yoneticiler) && !uzakAktarimSebebi(db, guildId, i.saticiId, aliciId));
    const alinan = [];
    let kalan = kac;
    for (const ilan of ilanlar) {
      if (kalan === 0) break;
      const m = Math.min(kalan, ilan.adet);
      const d = devret(db, {
        guildId, saticiId: ilan.saticiId, aliciId, kart: kimlik, adet: m, fiyat: ilan.fiyat, kesintiYuzde: ayar.kesintiYuzde, ilanId: ilan.id, alicidanDus: true, simdi,
      });
      ilanAdetiYaz(db, ilan, ilan.adet - m, simdi);
      alinan.push({ ...d, kalan: ilan.adet - m });
      kalan -= m;
    }

    let istek = null;
    if (kalan > 0) {
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO alim_istekleri (guild_id, alici_id, kart, adet, ilk_adet, fiyat, durum, olusturma)
           VALUES (?, ?, ?, ?, ?, ?, 'acik', ?)`,
        )
        .run(String(guildId), String(aliciId), kimlik, kalan, kac, fiyat, simdi);
      dus(db, {
        guildId, kullaniciId: aliciId, miktar: fiyat * kalan, tur: TURLER.pazar, karsiId: emanetKimligi(lastInsertRowid), simdi,
      });
      istek = istekGetir(db, guildId, lastInsertRowid);
    }
    return {
      ok: true, istek, alinan, emanet: istek ? fiyat * kalan : 0, bakiye: bakiyeOku(db, guildId, aliciId),
    };
  });
}

/** İsteğin kalanını kapatır ve emanetini alıcıya iade eder (işlem içinde). */
function istekKapat(db, {
  guildId, istek, durum, simdi,
}) {
  db.prepare('UPDATE alim_istekleri SET durum = ?, kapanis = ? WHERE id = ?').run(durum, simdi, istek.id);
  const iade = istek.fiyat * istek.adet;
  if (iade > 0) {
    ekle(db, {
      guildId, kullaniciId: istek.aliciId, miktar: iade, tur: TURLER.pazar, karsiId: emanetKimligi(istek.id), simdi,
    });
  }
  return iade;
}

/** Alım isteğini kaldırır (yalnız sahibi; pazar kapalıyken de); kalan emanet iade edilir. */
export function alimIstegiIptal(db, {
  guildId, kullaniciId, id, simdi = Date.now(),
}) {
  return islem(db, () => {
    const istek = istekGetir(db, guildId, id);
    if (!istek || istek.durum !== 'acik') return { ok: false, sebep: 'Bu alım isteği artık açık değil.' };
    if (istek.aliciId !== String(kullaniciId)) return { ok: false, sebep: 'Yalnız kendi isteğini kaldırabilirsin.' };
    const iade = istekKapat(db, {
      guildId, istek, durum: 'iptal', simdi,
    });
    return {
      ok: true, istek: { ...istek, durum: 'iptal' }, iade, bakiye: bakiyeOku(db, guildId, kullaniciId),
    };
  });
}

/**
 * Elindeki kartları alım isteklerine hemen satar: en yüksek fiyatlı istekten
 * başlayarak, tanesi en az `enAz` muz olanlara, en çok `adet` tane.
 * @returns {{ok: false, sebep: string} | {ok: true, satilan: Array<object>, adet: number, net: number}}
 */
export function isteklereSat(db, {
  guildId, saticiId, kimlik, adet: kac = 1, enAz = 1, simdi = Date.now(), yoneticiler = undefined,
}) {
  const ayar = pazarAyarlari(db, guildId);
  if (!ayar.acik) return { ok: false, sebep: PAZAR_KAPALI_SEBEBI };
  const kart = kartGetir(kimlik);
  if (!kart) return { ok: false, sebep: 'Pazarda yalnız kartlar alınıp satılabilir.' };
  if (!Number.isSafeInteger(kac) || kac < 1 || kac > ILAN_ADET_SINIRI) return { ok: false, sebep: 'Geçersiz adet.' };
  return guvenli(() => islem(db, () => {
    if (!esyaDus(db, guildId, saticiId, kimlik, kac)) {
      return { ok: false, sebep: `Elinde serbest ${kac} tane **${kart.ad}** yok.` };
    }
    esyaHareketi(db, { guildId, kullaniciId: saticiId, esya: kimlik, adet: -kac, tur: 'pazar-sat', simdi });
    const satilan = isteklereDagit(db, {
      guildId, saticiId, kart: kimlik, kac, enAz, kesintiYuzde: ayar.kesintiYuzde, simdi, yoneticiler,
    });
    const adetToplam = satilan.reduce((t, d) => t + d.adet, 0);
    if (adetToplam === 0) throw new PazarHatasi('Bu fiyata uyan alım isteği kalmadı; başka biri senden önce satmış olabilir.');
    // Satılamayan kopyalar sahibine döner.
    if (adetToplam < kac) {
      esyaEkle(db, guildId, saticiId, kimlik, kac - adetToplam);
      esyaHareketi(db, { guildId, kullaniciId: saticiId, esya: kimlik, adet: kac - adetToplam, tur: 'pazar-iptal', simdi });
    }
    return {
      ok: true, satilan, adet: adetToplam, net: satilan.reduce((t, d) => t + d.net, 0), bakiye: bakiyeOku(db, guildId, saticiId),
    };
  }));
}

/**
 * Kartı satılan üyeye gidecek DM (rota gönderir; DM kapalıysa sessizce düşer).
 * `emoji`: kartın sunucu emojisi metni (yoksa boş).
 */
export function satisDmIcerigi({
  kart, emoji = '', adet: kac, fiyat, kesinti, yuzde = PAZAR_KESINTI_YUZDE, aliciId, kalan,
}) {
  const net = fiyat * kac - kesinti;
  const satirlar = [
    `🛒 **${emoji ? `${emoji} ` : ''}${kart.ad}** kartın Topluluk Pazarı'nda satıldı!`,
    `• Alan: <@${aliciId}>`,
    `• ${kac} × ${muz(fiyat)}`,
    `• Eline geçen: **${muz(net)}** (%${yuzde} pazar kesintisi: ${muz(kesinti)})`,
    kalan > 0 ? `• İlanda ${kalan} kopya daha bekliyor.` : '• İlanın tamamen satıldı.',
  ];
  return { content: satirlar.join('\n'), allowedMentions: { parse: [] } };
}

/** Alım isteği karşılanan üyeye gidecek DM. */
export function istekDmIcerigi({
  kart, emoji = '', adet: kac, fiyat, saticiId, kalan,
}) {
  const satirlar = [
    `🛒 **${emoji ? `${emoji} ` : ''}${kart.ad}** alım isteğin Topluluk Pazarı'nda karşılandı!`,
    `• Satan: <@${saticiId}>`,
    `• ${kac} × ${muz(fiyat)} (emanetten ödendi); kartlar envanterinde.`,
    kalan > 0 ? `• İsteğinde ${kalan} kopya daha bekliyor.` : '• İsteğin tamamen karşılandı.',
  ];
  return { content: satirlar.join('\n'), allowedMentions: { parse: [] } };
}

// ── Yönetici işlemleri ────────────────────────────────────────────────────

function gunlukYaz(db, {
  guildId, yoneticiId, eylem, hedefId = null, uyeId = null, ayrinti, simdi,
}) {
  db.prepare(
    `INSERT INTO pazar_yonetim_gunlugu (guild_id, yonetici_id, eylem, hedef_id, uye_id, ayrinti, zaman)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(String(guildId), String(yoneticiId), eylem, hedefId, uyeId ? String(uyeId) : null, JSON.stringify(ayrinti), simdi);
}

/**
 * Yönetici ayarları değiştirir; yalnız verilen alanlar yazılır, sınırlar
 * lib/ayarlar.js'teki tanımlardır.
 */
export function pazarAyarla(db, {
  guildId, yoneticiId, degisiklik, simdi = Date.now(),
}) {
  const once = pazarAyarlari(db, guildId);
  const sinirlar = {
    kesintiYuzde: [0, 50], tavanCarpani: [1, 100], ilanSiniri: [1, 200],
  };
  const yeni = {};
  if ('acik' in degisiklik) {
    if (typeof degisiklik.acik !== 'boolean') return { ok: false, sebep: '`acik` doğru/yanlış olmalı.' };
    yeni.acik = degisiklik.acik;
  }
  for (const [alan, [min, max]] of Object.entries(sinirlar)) {
    if (!(alan in degisiklik)) continue;
    const n = degisiklik[alan];
    if (!Number.isSafeInteger(n) || n < min || n > max) return { ok: false, sebep: `\`${alan}\` ${min}–${max} arası bir tam sayı olmalı.` };
    yeni[alan] = n;
  }
  const degisen = Object.entries(yeni).filter(([k, v]) => once[k] !== v);
  if (degisen.length === 0) return { ok: true, ayarlar: once, degisti: false };
  return islem(db, () => {
    for (const [k, v] of degisen) ayarYaz(db, guildId, `pazar.${k}`, v);
    gunlukYaz(db, {
      guildId, yoneticiId, eylem: 'ayar', ayrinti: Object.fromEntries(degisen.map(([k, v]) => [k, { once: once[k], sonra: v }])), simdi,
    });
    return { ok: true, ayarlar: pazarAyarlari(db, guildId), degisti: true };
  });
}

/**
 * Açık ilanın birim fiyatını ya da adedini değiştirir. Adet yalnız azalır;
 * aradaki fark satıcının envanterine döner. Fiyat yine kartın aralığında olmalı.
 */
export function yoneticiIlanDuzenle(db, {
  guildId, yoneticiId, id, fiyat = null, adet: kac = null, simdi = Date.now(),
}) {
  return islem(db, () => {
    const ilan = ilanGetir(db, guildId, id);
    if (!ilan || ilan.durum !== 'acik') return { ok: false, sebep: 'Yalnız açık ilan düzenlenebilir.' };
    const kart = kartGetir(ilan.kart);
    const ayrinti = {};
    if (fiyat !== null && fiyat !== ilan.fiyat) {
      const aralik = fiyatAraligi(ilan.kart, pazarAyarlari(db, guildId).tavanCarpani);
      if (!Number.isSafeInteger(fiyat) || fiyat < aralik.min || fiyat > aralik.max) return { ok: false, sebep: fiyatHatasi(kart, aralik) };
      ayrinti.fiyat = { once: ilan.fiyat, sonra: fiyat };
    }
    if (kac !== null && kac !== ilan.adet) {
      if (!Number.isSafeInteger(kac) || kac < 1 || kac > ilan.adet) {
        return { ok: false, sebep: `Adet yalnız azaltılabilir (1–${ilan.adet}); hepsini almak için ilanı kaldır.` };
      }
      ayrinti.adet = { once: ilan.adet, sonra: kac };
    }
    if (Object.keys(ayrinti).length === 0) return { ok: true, ilan, degisti: false };
    if (ayrinti.adet) {
      const fark = ilan.adet - kac;
      esyaEkle(db, guildId, ilan.saticiId, ilan.kart, fark);
      esyaHareketi(db, { guildId, kullaniciId: ilan.saticiId, esya: ilan.kart, adet: fark, tur: 'pazar-iptal', karsiId: yoneticiId, simdi });
    }
    db.prepare('UPDATE pazar_ilanlari SET fiyat = ?, adet = ? WHERE id = ?')
      .run(ayrinti.fiyat?.sonra ?? ilan.fiyat, ayrinti.adet?.sonra ?? ilan.adet, ilan.id);
    gunlukYaz(db, {
      guildId, yoneticiId, eylem: 'ilan-duzenle', hedefId: ilan.id, uyeId: ilan.saticiId, ayrinti: { kart: ilan.kart, ...ayrinti }, simdi,
    });
    return { ok: true, ilan: ilanGetir(db, guildId, ilan.id), degisti: true };
  });
}

/**
 * Açık ilanı kaldırır. `iade`: kalan kopyalar satıcıya döner; false ise
 * kopyalar silinir (kötüye kullanımda el koyma).
 */
export function yoneticiIlanKaldir(db, {
  guildId, yoneticiId, id, iade = true, sebep = null, simdi = Date.now(),
}) {
  return islem(db, () => {
    const ilan = ilanGetir(db, guildId, id);
    if (!ilan || ilan.durum !== 'acik') return { ok: false, sebep: 'Bu ilan artık açık değil.' };
    db.prepare("UPDATE pazar_ilanlari SET durum = 'kaldirildi', kapanis = ? WHERE id = ?").run(simdi, ilan.id);
    if (iade) {
      esyaEkle(db, guildId, ilan.saticiId, ilan.kart, ilan.adet);
      esyaHareketi(db, { guildId, kullaniciId: ilan.saticiId, esya: ilan.kart, adet: ilan.adet, tur: 'pazar-iptal', karsiId: yoneticiId, simdi });
    }
    gunlukYaz(db, {
      guildId, yoneticiId, eylem: 'ilan-kaldir', hedefId: ilan.id, uyeId: ilan.saticiId,
      ayrinti: { kart: ilan.kart, adet: ilan.adet, fiyat: ilan.fiyat, iade, sebep }, simdi,
    });
    return { ok: true, ilan: { ...ilan, durum: 'kaldirildi' }, adet: ilan.adet, iade };
  });
}

/** Açık alım isteğini kaldırır; kalan emanet alıcıya iade edilir. */
export function yoneticiIstekKaldir(db, {
  guildId, yoneticiId, id, sebep = null, simdi = Date.now(),
}) {
  return islem(db, () => {
    const istek = istekGetir(db, guildId, id);
    if (!istek || istek.durum !== 'acik') return { ok: false, sebep: 'Bu alım isteği artık açık değil.' };
    const iade = istekKapat(db, {
      guildId, istek, durum: 'kaldirildi', simdi,
    });
    gunlukYaz(db, {
      guildId, yoneticiId, eylem: 'istek-kaldir', hedefId: istek.id, uyeId: istek.aliciId,
      ayrinti: {
        kart: istek.kart, adet: istek.adet, fiyat: istek.fiyat, iade, sebep,
      },
      simdi,
    });
    return { ok: true, istek: { ...istek, durum: 'kaldirildi' }, iade };
  });
}

/**
 * Satışı geri alır: alıcıya ödediği tamamı döner, satıcıdan eline geçen
 * alınır, kartlar alıcıdan satıcıya döner; kesinti geri basılır. Alıcıda kart
 * ya da satıcıda muz kalmadıysa hiçbir şey yapılmaz. Kartlar ilana dönmez,
 * satıcının envanterine gider.
 */
export function satisGeriAl(db, {
  guildId, yoneticiId, id, sebep = null, simdi = Date.now(),
}) {
  return guvenli(() => satisGeriAlIslem(db, {
    guildId, yoneticiId, id, sebep, simdi,
  }));
}

function satisGeriAlIslem(db, {
  guildId, yoneticiId, id, sebep, simdi,
}) {
  return islem(db, () => {
    const s = db.prepare('SELECT * FROM pazar_satislari WHERE guild_id = ? AND id = ?').get(String(guildId), Number(id));
    if (!s) return { ok: false, sebep: 'Böyle bir satış yok.' };
    if (s.geri_zaman) return { ok: false, sebep: 'Bu satış zaten geri alınmış.' };
    const toplam = s.fiyat * s.adet;
    const net = toplam - s.kesinti;
    const ad = kartGetir(s.kart)?.ad ?? s.kart;
    if (!esyaDus(db, guildId, s.alici_id, s.kart, s.adet)) {
      return { ok: false, sebep: `Alıcının elinde artık serbest ${s.adet} × **${ad}** yok (satmış, ilana koymuş ya da maymunu çalışıyor olabilir).` };
    }
    if (net > 0 && dus(db, {
      guildId, kullaniciId: s.satici_id, miktar: net, tur: TURLER.pazar, karsiId: s.alici_id, simdi,
    }) === null) {
      // Hata işlemi geri sarar: alıcıdan düşülen kart da yerine döner.
      throw new PazarHatasi(`Satıcının bakiyesi yetmiyor (${net.toLocaleString('tr-TR')} muz geri alınacaktı).`);
    }
    ekle(db, {
      guildId, kullaniciId: s.alici_id, miktar: toplam, tur: TURLER.pazar, karsiId: s.satici_id, simdi,
    });
    esyaEkle(db, guildId, s.satici_id, s.kart, s.adet);
    esyaHareketi(db, { guildId, kullaniciId: s.alici_id, esya: s.kart, adet: -s.adet, tur: 'pazar-geri', karsiId: s.satici_id, simdi });
    esyaHareketi(db, { guildId, kullaniciId: s.satici_id, esya: s.kart, adet: s.adet, tur: 'pazar-geri', karsiId: s.alici_id, simdi });
    db.prepare('UPDATE pazar_satislari SET geri_alan = ?, geri_zaman = ? WHERE id = ?').run(String(yoneticiId), simdi, s.id);
    gunlukYaz(db, {
      guildId, yoneticiId, eylem: 'satis-geri', hedefId: s.id, uyeId: s.alici_id,
      ayrinti: {
        kart: s.kart, adet: s.adet, fiyat: s.fiyat, saticiId: s.satici_id, aliciId: s.alici_id, toplam, net, sebep,
      },
      simdi,
    });
    return {
      ok: true, satis: satisAyristir({ ...s, geri_alan: String(yoneticiId), geri_zaman: simdi }), toplam, net,
    };
  });
}

/** Yönetici işlemleri günlüğü, yeniden eskiye. */
export function yonetimGunlugu(db, guildId, limit = 50) {
  return db
    .prepare('SELECT * FROM pazar_yonetim_gunlugu WHERE guild_id = ? ORDER BY id DESC LIMIT ?')
    .all(String(guildId), limit)
    .map((g) => ({
      id: g.id, yoneticiId: g.yonetici_id, eylem: g.eylem, hedefId: g.hedef_id, uyeId: g.uye_id, ayrinti: JSON.parse(g.ayrinti), zaman: g.zaman,
    }));
}

// ── Okuma ─────────────────────────────────────────────────────────────────

/** Geri alınmamış satışlar (fiyat geçmişi, vitrin ve son satışlar bunları sayar). */
const GECERLI = 'geri_zaman IS NULL';

/**
 * Pazar vitrini: açık ilanı, alım isteği ya da son 7 günde satışı olan her
 * kart. `adet` ilandaki toplam kopya, `enDusuk` en ucuz birim fiyat (ilan
 * yoksa null), `satis24` son 24 saatte satılan kopya, `sonFiyat` son satış
 * birim fiyatı, `enYuksekIstek`/`istekAdet` açık alım isteklerinin en
 * yüksek fiyatı ve toplam adedi.
 */
export function vitrin(db, guildId, simdi = Date.now()) {
  const g = String(guildId);
  const ilanlar = db
    .prepare(
      `SELECT kart, SUM(adet) AS adet, MIN(fiyat) AS enDusuk, COUNT(*) AS ilan
         FROM pazar_ilanlari WHERE guild_id = ? AND durum = 'acik' GROUP BY kart`,
    )
    .all(g);
  const satislar = db
    .prepare(
      `SELECT kart,
              SUM(CASE WHEN zaman >= ? THEN adet ELSE 0 END) AS satis24,
              (SELECT p.fiyat FROM pazar_satislari p WHERE p.guild_id = s.guild_id AND p.kart = s.kart AND p.${GECERLI} ORDER BY p.id DESC LIMIT 1) AS sonFiyat
         FROM pazar_satislari s WHERE guild_id = ? AND zaman >= ? AND ${GECERLI} GROUP BY kart`,
    )
    .all(simdi - GUN_MS, g, simdi - 7 * GUN_MS);
  const istekler = db
    .prepare(
      `SELECT kart, MAX(fiyat) AS enYuksek, SUM(adet) AS adet
         FROM alim_istekleri WHERE guild_id = ? AND durum = 'acik' GROUP BY kart`,
    )
    .all(g);
  const bos = (kart) => ({
    kart, adet: 0, enDusuk: null, ilan: 0, satis24: 0, sonFiyat: null, enYuksekIstek: null, istekAdet: 0,
  });
  const harita = new Map();
  for (const i of ilanlar) {
    harita.set(i.kart, {
      ...bos(i.kart), adet: i.adet, enDusuk: i.enDusuk, ilan: i.ilan,
    });
  }
  for (const s of satislar) harita.set(s.kart, { ...(harita.get(s.kart) ?? bos(s.kart)), satis24: s.satis24, sonFiyat: s.sonFiyat });
  for (const i of istekler) harita.set(i.kart, { ...(harita.get(i.kart) ?? bos(i.kart)), enYuksekIstek: i.enYuksek, istekAdet: i.adet });
  return [...harita.values()].filter((v) => kartGetir(v.kart));
}

/** Kartın açık ilanları, ucuzdan pahalıya (eşit fiyatta önce açılan). */
export function kartIlanlari(db, guildId, kimlik, limit = 50) {
  return db
    .prepare(
      `SELECT * FROM pazar_ilanlari WHERE guild_id = ? AND kart = ? AND durum = 'acik'
        ORDER BY fiyat ASC, id ASC LIMIT ?`,
    )
    .all(String(guildId), kimlik, limit)
    .map(ilanAyristir);
}

/**
 * Kartın alım istekleri fiyat basamağına göre (Steam gibi alıcı adı
 * gösterilmez): en yüksekten, her basamakta toplam adet.
 */
export function kartIstekleri(db, guildId, kimlik, limit = 10) {
  return db
    .prepare(
      `SELECT fiyat, SUM(adet) AS adet, COUNT(*) AS istek FROM alim_istekleri
        WHERE guild_id = ? AND kart = ? AND durum = 'acik' GROUP BY fiyat ORDER BY fiyat DESC LIMIT ?`,
    )
    .all(String(guildId), kimlik, limit)
    .map((r) => ({ ...r }));
}

/** Üyenin açık alım istekleri, yeniden eskiye. */
export function isteklerim(db, guildId, kullaniciId) {
  return db
    .prepare("SELECT * FROM alim_istekleri WHERE guild_id = ? AND alici_id = ? AND durum = 'acik' ORDER BY id DESC")
    .all(String(guildId), String(kullaniciId))
    .map(istekAyristir);
}

/** Kartın Türkiye günlerine göre satış geçmişi: ağırlıklı ortalama birim fiyat, en düşük/yüksek ve adet. */
export function fiyatGecmisi(db, guildId, kimlik, { gun = 30, simdi = Date.now() } = {}) {
  return db
    .prepare(
      `SELECT date((zaman + 10800000) / 1000, 'unixepoch') AS gun,
              CAST(ROUND(SUM(fiyat * adet) * 1.0 / SUM(adet)) AS INTEGER) AS ortalama,
              MIN(fiyat) AS enDusuk, MAX(fiyat) AS enYuksek, SUM(adet) AS adet
         FROM pazar_satislari WHERE guild_id = ? AND kart = ? AND zaman >= ? AND ${GECERLI}
        GROUP BY gun ORDER BY gun`,
    )
    .all(String(guildId), kimlik, simdi - gun * GUN_MS);
}

function satisAyristir(s) {
  return {
    id: s.id,
    ilanId: s.ilan_id || null,
    istekId: s.istek_id ?? null,
    saticiId: s.satici_id,
    aliciId: s.alici_id,
    kart: s.kart,
    adet: s.adet,
    fiyat: s.fiyat,
    kesinti: s.kesinti,
    zaman: s.zaman,
    geriAlan: s.geri_alan ?? null,
    geriZaman: s.geri_zaman ?? null,
  };
}

/** Son satışlar: bütün pazar ya da bir kart (`kimlik`); geri alınanlar hariç. */
export function sonSatislar(db, guildId, { kimlik = null, limit = 10 } = {}) {
  const kosul = kimlik ? 'AND kart = ?' : '';
  return db
    .prepare(`SELECT * FROM pazar_satislari WHERE guild_id = ? AND ${GECERLI} ${kosul} ORDER BY id DESC LIMIT ?`)
    .all(String(guildId), ...(kimlik ? [kimlik] : []), limit)
    .map(satisAyristir);
}

/** Üyenin açık ilanları, yeniden eskiye. */
export function ilanlarim(db, guildId, kullaniciId) {
  return db
    .prepare("SELECT * FROM pazar_ilanlari WHERE guild_id = ? AND satici_id = ? AND durum = 'acik' ORDER BY id DESC")
    .all(String(guildId), String(kullaniciId))
    .map(ilanAyristir);
}

/** Üyenin alım ve satım geçmişi, yeniden eskiye (geri alınanlar işaretli). */
export function gecmisim(db, guildId, kullaniciId, limit = 50) {
  const k = String(kullaniciId);
  return db
    .prepare('SELECT * FROM pazar_satislari WHERE guild_id = ? AND (satici_id = ? OR alici_id = ?) ORDER BY id DESC LIMIT ?')
    .all(String(guildId), k, k, limit)
    .map(satisAyristir);
}

// ── Yönetim okumaları ────────────────────────────────────────────────────

export const YONETIM_SAYFA = 50;
/** Sistem değerinin bu katı ve üstündeki satış "pahalı" işaretlenir (muz taşıma şüphesi). */
export const PAHALI_KAT = 5;

function aralikKosulu(sutun, { baslangic = null, bitis = null } = {}, parametreler = []) {
  const k = [];
  if (baslangic !== null) { k.push(`${sutun} >= ?`); parametreler.push(baslangic); }
  if (bitis !== null) { k.push(`${sutun} < ?`); parametreler.push(bitis); }
  return k;
}

/**
 * Yönetici özeti: dönemdeki satışlar (geri alınanlar hariç), şu anki açık
 * ilanlar, en çok satan kartlar ve üyeler, en çok alışveriş eden çiftler ve
 * sistem değerinin PAHALI_KAT katı üstündeki satışlar. `haric`: sayılmayacak üyeler.
 */
export function yonetimOzeti(db, guildId, { baslangic = null, bitis = null, haric = [] } = {}) {
  const g = String(guildId);
  const p = [g];
  const kosullar = ['guild_id = ?', GECERLI, ...aralikKosulu('zaman', { baslangic, bitis }, p)];
  if (haric.length) {
    const yer = haric.map(() => '?').join(', ');
    kosullar.push(`satici_id NOT IN (${yer}) AND alici_id NOT IN (${yer})`);
    p.push(...haric.map(String), ...haric.map(String));
  }
  const nerede = kosullar.join(' AND ');
  const satis = db
    .prepare(
      `SELECT COUNT(*) AS islem, COALESCE(SUM(adet), 0) AS adet, COALESCE(SUM(fiyat * adet), 0) AS hacim,
              COALESCE(SUM(kesinti), 0) AS kesinti, COUNT(DISTINCT satici_id) AS satici, COUNT(DISTINCT alici_id) AS alici
         FROM pazar_satislari WHERE ${nerede}`,
    )
    .get(...p);
  const geriAlinan = db
    .prepare(`SELECT COUNT(*) AS n FROM pazar_satislari WHERE guild_id = ? AND geri_zaman IS NOT NULL ${baslangic !== null ? 'AND zaman >= ?' : ''}`)
    .get(g, ...(baslangic !== null ? [baslangic] : [])).n;
  const acik = db
    .prepare(
      `SELECT COUNT(*) AS ilan, COALESCE(SUM(adet), 0) AS adet, COALESCE(SUM(fiyat * adet), 0) AS deger, COUNT(DISTINCT satici_id) AS satici
         FROM pazar_ilanlari WHERE guild_id = ? AND durum = 'acik'`,
    )
    .get(g);
  const istek = db
    .prepare(
      `SELECT COUNT(*) AS istek, COALESCE(SUM(adet), 0) AS adet, COALESCE(SUM(fiyat * adet), 0) AS emanet, COUNT(DISTINCT alici_id) AS alici
         FROM alim_istekleri WHERE guild_id = ? AND durum = 'acik'`,
    )
    .get(g);
  const kartlar = db
    .prepare(
      `SELECT kart, SUM(adet) AS adet, SUM(fiyat * adet) AS hacim, COUNT(*) AS islem,
              CAST(ROUND(SUM(fiyat * adet) * 1.0 / SUM(adet)) AS INTEGER) AS ortalama
         FROM pazar_satislari WHERE ${nerede} GROUP BY kart ORDER BY hacim DESC LIMIT 15`,
    )
    .all(...p);
  const saticilar = db
    .prepare(
      `SELECT satici_id AS uye, COUNT(*) AS islem, SUM(adet) AS adet, SUM(fiyat * adet - kesinti) AS tutar
         FROM pazar_satislari WHERE ${nerede} GROUP BY satici_id ORDER BY tutar DESC LIMIT 10`,
    )
    .all(...p);
  const alicilar = db
    .prepare(
      `SELECT alici_id AS uye, COUNT(*) AS islem, SUM(adet) AS adet, SUM(fiyat * adet) AS tutar
         FROM pazar_satislari WHERE ${nerede} GROUP BY alici_id ORDER BY tutar DESC LIMIT 10`,
    )
    .all(...p);
  const ciftler = db
    .prepare(
      `SELECT satici_id AS saticiId, alici_id AS aliciId, COUNT(*) AS islem, SUM(fiyat * adet) AS hacim
         FROM pazar_satislari WHERE ${nerede} GROUP BY satici_id, alici_id HAVING COUNT(*) >= 2
        ORDER BY islem DESC, hacim DESC LIMIT 10`,
    )
    .all(...p);
  const pahali = db
    .prepare(`SELECT * FROM pazar_satislari WHERE ${nerede} ORDER BY id DESC LIMIT 500`)
    .all(...p)
    .map(satisAyristir)
    .filter((s) => {
      const kart = kartGetir(s.kart);
      return kart && s.fiyat >= kartDegeri(kart) * PAHALI_KAT;
    })
    .slice(0, 10);
  return {
    satis: { ...satis }, geriAlinan, acik: { ...acik }, istek: { ...istek }, kartlar, saticilar, alicilar, ciftler, pahali,
  };
}

/**
 * Bütün ilanlar (her durum), süzgeçli ve sayfalı. `durum`: acik | bitti |
 * iptal | kaldirildi | null (hepsi).
 */
export function yonetimIlanlari(db, guildId, {
  durum = null, uyeId = null, kart = null, sayfa = 1, limit = YONETIM_SAYFA,
} = {}) {
  const k = ['guild_id = ?'];
  const p = [String(guildId)];
  if (durum) { k.push('durum = ?'); p.push(durum); }
  if (uyeId) { k.push('satici_id = ?'); p.push(String(uyeId)); }
  if (kart) { k.push('kart = ?'); p.push(kart); }
  const nerede = k.join(' AND ');
  const toplam = db.prepare(`SELECT COUNT(*) AS n FROM pazar_ilanlari WHERE ${nerede}`).get(...p).n;
  const sayfaSayisi = Math.max(1, Math.ceil(toplam / limit));
  const s = Math.min(Math.max(1, Math.floor(sayfa) || 1), sayfaSayisi);
  const satirlar = db
    .prepare(`SELECT * FROM pazar_ilanlari WHERE ${nerede} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...p, limit, (s - 1) * limit)
    .map(ilanAyristir);
  return {
    satirlar, toplam, sayfa: s, sayfaSayisi,
  };
}

/** Bütün satışlar (geri alınanlar dahil), süzgeçli ve sayfalı. `uyeId` alıcı ya da satıcı. */
export function yonetimSatislari(db, guildId, {
  uyeId = null, kart = null, baslangic = null, bitis = null, sayfa = 1, limit = YONETIM_SAYFA,
} = {}) {
  const p = [String(guildId)];
  const k = ['guild_id = ?', ...aralikKosulu('zaman', { baslangic, bitis }, p)];
  if (uyeId) { k.push('(satici_id = ? OR alici_id = ?)'); p.push(String(uyeId), String(uyeId)); }
  if (kart) { k.push('kart = ?'); p.push(kart); }
  const nerede = k.join(' AND ');
  const toplam = db.prepare(`SELECT COUNT(*) AS n FROM pazar_satislari WHERE ${nerede}`).get(...p).n;
  const sayfaSayisi = Math.max(1, Math.ceil(toplam / limit));
  const s = Math.min(Math.max(1, Math.floor(sayfa) || 1), sayfaSayisi);
  const satirlar = db
    .prepare(`SELECT * FROM pazar_satislari WHERE ${nerede} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...p, limit, (s - 1) * limit)
    .map(satisAyristir);
  return {
    satirlar, toplam, sayfa: s, sayfaSayisi,
  };
}

/** Bütün alım istekleri (her durum), süzgeçli ve sayfalı. */
export function yonetimIstekleri(db, guildId, {
  durum = null, uyeId = null, kart = null, sayfa = 1, limit = YONETIM_SAYFA,
} = {}) {
  const k = ['guild_id = ?'];
  const p = [String(guildId)];
  if (durum) { k.push('durum = ?'); p.push(durum); }
  if (uyeId) { k.push('alici_id = ?'); p.push(String(uyeId)); }
  if (kart) { k.push('kart = ?'); p.push(kart); }
  const nerede = k.join(' AND ');
  const toplam = db.prepare(`SELECT COUNT(*) AS n FROM alim_istekleri WHERE ${nerede}`).get(...p).n;
  const sayfaSayisi = Math.max(1, Math.ceil(toplam / limit));
  const s = Math.min(Math.max(1, Math.floor(sayfa) || 1), sayfaSayisi);
  const satirlar = db
    .prepare(`SELECT * FROM alim_istekleri WHERE ${nerede} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...p, limit, (s - 1) * limit)
    .map(istekAyristir);
  return {
    satirlar, toplam, sayfa: s, sayfaSayisi,
  };
}
