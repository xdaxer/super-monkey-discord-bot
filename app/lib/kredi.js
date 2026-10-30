/**
 * Kredi (borç): muz ödünç alınır, vade sonunda anapara + faiz ödenir.
 * Vadesi geçen borç servisçe (servisler/kredi.js) cüzdandan tahsil edilir;
 * yetmeyen kalan "borç" olarak durur, günlük ceza işler ve gelirlerin bir
 * kısmı otomatik borca gider (`borcaKes`). Borçlu kumar oynayamaz, muz gönderemez.
 *
 * Kredi verilmesi geçici muz basımıdır; ödeme geri alır. Sayılar docs/para.md ile aynı.
 * Bu dosya ekonomi.js ile karşılıklı içe aktarır; üst düzeyde ekonomi.js'ten
 * hiçbir şey kullanılmaz (yalnız fonksiyon gövdelerinde), bu yüzden güvenlidir.
 */

import {
  bakiye as bakiyeOku, dus, ekle, islem, muz, TURLER,
} from './ekonomi.js';

const GUN = 86_400_000;

/**
 * Vade seçenekleri; faiz vade sonunda bir kez, anapara üzerinden. Oranlar
 * bankanın aynı vadedeki mevduat faizinden (3g %14, 7g %40, 14g %100) ve
 * günlük getirisinden yüksektir: kredi alıp bankaya yatırmak zarar ettirir.
 */
export const VADELER = [
  { kimlik: '3g', ad: '3 gün', gun: 3, ms: 3 * GUN, yuzde: 25 },
  { kimlik: '7g', ad: '7 gün', gun: 7, ms: 7 * GUN, yuzde: 60 },
  { kimlik: '14g', ad: '14 gün', gun: 14, ms: 14 * GUN, yuzde: 130 },
];

export const KREDI_MIN = 1_000;
export const LIMIT_TABAN = 5_000;
export const LIMIT_SEVIYE_BASINA = 2_000;
export const LIMIT_MAKS = 200_000;
/** Kredi bu seviyeden açılır: yeni hesap bedava kumar parası çekip borcu bırakamasın. */
export const KREDI_MIN_SEVIYE = 3;
/** Borçluyken kazanılan her gelirin borca giden payı (%). */
export const BORC_KESINTI_YUZDE = 50;
/** Gecikmenin her tam günü için anaparadan eklenen ceza (%) ve toplam ceza tavanı (%). */
export const CEZA_GUNLUK_YUZDE = 1;
export const CEZA_TAVAN_YUZDE = 20;

export const DURUMLAR = Object.freeze({ aktif: 'aktif', gecikmis: 'gecikmis', odendi: 'odendi' });
const ACIK = `('${DURUMLAR.aktif}', '${DURUMLAR.gecikmis}')`;

export const BORC_YASAK = 'Vadesi geçmiş kredi borcun var; ödeyene kadar kumar oynayamaz, muz gönderemez ya da takasa muz koyamazsın. **Banka → Kredi**';

export function vadeGetir(kimlik) {
  return VADELER.find((v) => v.kimlik === kimlik) ?? null;
}

/** Çekilebilecek en çok kredi: 5.000 + 2.000 × seviye, en çok 200.000. */
export function krediLimiti(seviye) {
  return Math.min(LIMIT_MAKS, LIMIT_TABAN + LIMIT_SEVIYE_BASINA * Math.max(0, Math.floor(seviye)));
}

export function faizHesapla(anapara, yuzde) {
  return Math.floor((anapara * yuzde) / 100);
}

/** Kişinin açık (aktif ya da gecikmiş) tek kredisi; yoksa null. */
export function aktifKredi(db, guildId, kullaniciId) {
  return db
    .prepare(`SELECT * FROM krediler WHERE guild_id = ? AND kullanici_id = ? AND durum IN ${ACIK}`)
    .get(String(guildId), String(kullaniciId)) ?? null;
}

/**
 * O ana kadar işleyen faiz. Vadeden önce (erken ödeme) orantılıdır: geçen
 * gün sayısı (başlanmış gün tam sayılır, en az 1) / vade günü × faiz.
 */
export function islemisFaiz(k, simdi) {
  if (simdi >= k.vade) return k.faiz;
  const vadeGunu = Math.max(1, Math.round((k.vade - k.baslangic) / GUN));
  const gecen = Math.min(vadeGunu, Math.max(1, Math.ceil((simdi - k.baslangic) / GUN)));
  return Math.floor((k.faiz * gecen) / vadeGunu);
}

/** Gecikme cezasının o andaki hedefi: gecikilen tam gün × %1, toplamda %20 tavanlı. */
export function cezaHedefi(k, simdi) {
  if (simdi < k.vade) return 0;
  const gun = Math.floor((simdi - k.vade) / GUN);
  const tavan = Math.floor((k.anapara * CEZA_TAVAN_YUZDE) / 100);
  return Math.min(tavan, Math.floor((k.anapara * CEZA_GUNLUK_YUZDE * gun) / 100));
}

/** Kredinin o andaki dökümü; `kalan` ödenmesi gereken toplamdır. */
export function borcOzeti(k, simdi = Date.now()) {
  const faiz = islemisFaiz(k, simdi);
  const ceza = Math.max(k.ceza, cezaHedefi(k, simdi));
  return {
    anapara: k.anapara,
    faiz,
    ceza,
    odenen: k.odenen,
    kalan: Math.max(0, k.anapara + faiz + ceza - k.odenen),
    gecikmis: simdi >= k.vade,
  };
}

/** Cezayı hedefe çeker (yalnız artar); güncel satırı döner. */
function cezaGuncelle(db, k, simdi) {
  const hedef = cezaHedefi(k, simdi);
  if (hedef <= k.ceza) return k;
  db.prepare('UPDATE krediler SET ceza = ? WHERE id = ?').run(hedef, k.id);
  return { ...k, ceza: hedef };
}

/** Ödemeyi kayda geçirir; borç bittiyse krediyi kapatır. */
function odemeIsle(db, k, tutar, simdi) {
  const yeni = { ...k, odenen: k.odenen + tutar };
  const kalan = borcOzeti(yeni, simdi).kalan;
  const kapandi = kalan === 0;
  db.prepare('UPDATE krediler SET odenen = ?, durum = ?, kapanis = ? WHERE id = ?')
    .run(yeni.odenen, kapandi ? DURUMLAR.odendi : k.durum, kapandi ? simdi : null, k.id);
  return { kalan, kapandi };
}

/** Bakiyeden en çok `istenen` kadar düşüp borca yazar (bakiye yetmezse yetenini). */
function tahsilEt(db, k, istenen, simdi) {
  const tutar = Math.min(istenen, bakiyeOku(db, k.guild_id, k.kullanici_id));
  if (tutar <= 0) return { tutar: 0, kalan: borcOzeti(k, simdi).kalan, kapandi: false };
  dus(db, {
    guildId: k.guild_id, kullaniciId: k.kullanici_id, miktar: tutar, tur: TURLER.kredi, karsiId: `kredi-${k.id}`, simdi,
  });
  return { tutar, ...odemeIsle(db, k, tutar, simdi) };
}

/**
 * Kredi çeker: muz bakiyeye geçer, vade sonunda anapara + faiz ödenir.
 * @returns {{ok: false, sebep: string} | {ok: true, kredi: object, faiz: number, bakiye: number}}
 */
export function krediAl(db, {
  guildId, kullaniciId, miktar, vade: vadeKimlik, seviye = 0, simdi = Date.now(),
}) {
  const vade = vadeGetir(vadeKimlik);
  if (!vade) return { ok: false, sebep: 'Geçersiz vade.' };
  if (!Number.isSafeInteger(miktar) || miktar < KREDI_MIN) {
    return { ok: false, sebep: `En az ${muz(KREDI_MIN)} çekebilirsin.` };
  }
  if (seviye < KREDI_MIN_SEVIYE) {
    return { ok: false, sebep: `Kredi **Sv ${KREDI_MIN_SEVIYE}**'te açılır; sen Sv ${seviye}'sin. Sohbet edip seviye atla.` };
  }
  const limit = krediLimiti(seviye);
  if (miktar > limit) {
    return { ok: false, sebep: `Kredi limitin ${muz(limit)} (5.000 + 2.000 × seviye, en çok 200.000).` };
  }

  return islem(db, () => {
    const mevcut = aktifKredi(db, guildId, kullaniciId);
    if (mevcut) {
      return {
        ok: false,
        sebep: mevcut.vade <= simdi
          ? 'Vadesi geçmiş borcun var; önce onu ödemelisin. **Banka → Kredi**'
          : 'Zaten aktif bir kredin var; aynı anda yalnız bir kredi olabilir. **Banka → Kredi**',
      };
    }
    // Mevduat ile kredi birbirini dışlar (lib/banka.js VADELER): kısa vadeli
    // mevduatın günlük getirisi kredinin günlük maliyetini geçebilir.
    const mevduatVar = db
      .prepare("SELECT 1 FROM mevduatlar WHERE guild_id = ? AND kullanici_id = ? AND durum = 'aktif' LIMIT 1")
      .get(String(guildId), String(kullaniciId));
    if (mevduatVar) {
      return { ok: false, sebep: 'Bankada açık mevduatın varken kredi alamazsın; vadesini bekle ya da boz. **Banka → Mevduat**' };
    }

    const faiz = faizHesapla(miktar, vade.yuzde);
    const { lastInsertRowid } = db.prepare(
      `INSERT INTO krediler (guild_id, kullanici_id, anapara, faiz_yuzde, faiz, baslangic, vade, durum)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(String(guildId), String(kullaniciId), miktar, vade.yuzde, faiz, simdi, simdi + vade.ms, DURUMLAR.aktif);
    const id = Number(lastInsertRowid);
    const yeni = ekle(db, {
      guildId, kullaniciId, miktar, tur: TURLER.kredi, karsiId: `kredi-${id}`, simdi,
    });
    return { ok: true, kredi: db.prepare('SELECT * FROM krediler WHERE id = ?').get(id), faiz, bakiye: yeni };
  });
}

/**
 * Borç öder. `miktar` null ise ("hepsi") kalan borç ve bakiyenin küçüğü kadar.
 * Vadeden önce ödenirse yalnız o güne kadar işleyen faiz istenir (orantılı);
 * başlanmış gün tam sayıldığı için anında al-öde bedavaya gelmez.
 * @returns {{ok: false, sebep: string} | {ok: true, odenen: number, kalan: number, kapandi: boolean}}
 */
export function krediOde(db, {
  guildId, kullaniciId, miktar = null, simdi = Date.now(),
}) {
  return islem(db, () => {
    const bulunan = aktifKredi(db, guildId, kullaniciId);
    if (!bulunan) return { ok: false, sebep: 'Açık bir kredin yok.' };
    const k = cezaGuncelle(db, bulunan, simdi);
    const { kalan } = borcOzeti(k, simdi);
    const elde = bakiyeOku(db, guildId, kullaniciId);

    if (miktar !== null && (!Number.isSafeInteger(miktar) || miktar <= 0)) {
      return { ok: false, sebep: 'Geçerli bir tutar yaz.' };
    }
    if (elde <= 0) return { ok: false, sebep: 'Bakiyen boş; ödeyecek muz yok.' };
    if (miktar !== null && miktar > elde) {
      return { ok: false, sebep: `Bakiyen yetmiyor: ${muz(elde)} var.` };
    }

    const sonuc = tahsilEt(db, k, Math.min(miktar ?? kalan, kalan), simdi);
    return { ok: true, odenen: sonuc.tutar, kalan: sonuc.kalan, kapandi: sonuc.kapandi };
  });
}

/**
 * Vadesi bugün ya da önce olan, ödenmemiş borcu var mı? Servis turunu
 * beklemeden de geçerlidir (kısıtlar vade anında başlar).
 */
export function borcluMu(db, guildId, kullaniciId, simdi = Date.now()) {
  return db
    .prepare(
      `SELECT 1 FROM krediler WHERE guild_id = ? AND kullanici_id = ? AND durum IN ${ACIK} AND vade <= ? LIMIT 1`,
    )
    .get(String(guildId), String(kullaniciId), simdi) !== undefined;
}

/**
 * Gelir kancası: borçlunun az önce kazandığı `miktar`ın %50'si borca gider.
 * Bakiyeden düşer (gelir zaten yazılmış olmalı); kesilen tutarı döner, borç
 * yoksa 0. Gelir veren her yer bunu tek satırla çağırır.
 */
export function borcaKes(db, guildId, kullaniciId, miktar, simdi = Date.now()) {
  if (!Number.isSafeInteger(miktar) || miktar <= 0) return 0;
  if (!borcluMu(db, guildId, kullaniciId, simdi)) return 0;

  return islem(db, () => {
    const k = cezaGuncelle(db, aktifKredi(db, guildId, kullaniciId), simdi);
    const pay = Math.floor((miktar * BORC_KESINTI_YUZDE) / 100);
    return tahsilEt(db, k, Math.min(pay, borcOzeti(k, simdi).kalan), simdi).tutar;
  });
}

/**
 * Servis turu: vadesi gelen krediyi gecikmişe çevirir (bir kez) ve gecikmiş
 * her borç için cezayı işletip cüzdandaki muzu borca çeker. Cüzdan
 * yetmezse kalan borç olarak durur. Aksi halde borçlu, borcunu bankadaki
 * mevduatın vadesinde cüzdanında saklayabilirdi; bu yüzden her turda tahsilat sürer.
 * `kullaniciId` verilirse yalnız o kişinin.
 * @returns {Array<{id: number, guild_id: string, kullanici_id: string, yeni: boolean, tahsil: number, kalan: number, kapandi: boolean}>}
 */
export function vadesiGelenleriIsle(db, { simdi = Date.now(), guildId = null, kullaniciId = null } = {}) {
  const kosul = kullaniciId ? 'AND guild_id = ? AND kullanici_id = ?' : '';
  const parametreler = kullaniciId ? [String(guildId), String(kullaniciId)] : [];
  const gelenler = db
    .prepare(`SELECT * FROM krediler WHERE durum IN ${ACIK} AND vade <= ? ${kosul} ORDER BY vade ASC, id ASC`)
    .all(simdi, ...parametreler);

  const sonuc = [];
  for (const gelen of gelenler) {
    islem(db, () => {
      let yeni = false;
      if (gelen.durum === DURUMLAR.aktif) {
        // Koşullu UPDATE: aynı kredi iki turda iki kez "gecikmeye düşmez".
        const { changes } = db
          .prepare('UPDATE krediler SET durum = ? WHERE id = ? AND durum = ?')
          .run(DURUMLAR.gecikmis, gelen.id, DURUMLAR.aktif);
        if (changes === 0) return;
        yeni = true;
      }
      const k = cezaGuncelle(db, { ...gelen, durum: DURUMLAR.gecikmis }, simdi);
      const t = tahsilEt(db, k, borcOzeti(k, simdi).kalan, simdi);
      if (yeni || t.tutar > 0) {
        sonuc.push({
          id: k.id, guild_id: k.guild_id, kullanici_id: k.kullanici_id, yeni, tahsil: t.tutar, kalan: t.kalan, kapandi: t.kapandi,
        });
      }
    });
  }
  return sonuc;
}

/** /cuzdan için tek satır: açık kredi varsa borç özeti, yoksa null. */
export function borcSatiri(db, guildId, kullaniciId, zamanBicimle, simdi = Date.now()) {
  const k = aktifKredi(db, guildId, kullaniciId);
  if (!k) return null;
  const o = borcOzeti(k, simdi);
  return o.gecikmis
    ? `**${muz(o.kalan)}** · vadesi geçti · **Banka → Kredi**`
    : `${muz(o.kalan)} · vade ${zamanBicimle(k.vade, 'R')} · **Banka → Kredi**`;
}
