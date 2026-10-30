/**
 * Düello: iki üye arasında muz bahsi (zar, yazı-tura, at yarışı ya da XOX).
 *
 * Meydan okuyanın bahsi meydan okuma anında düşülür (emanet), rakibinki
 * kabulde; ikisi de tek işlemde. Bekleyen meydan okuma duello_meydanlari
 * tablosunda tutulur ki butonlar bot yeniden başlasa da aynı kaydı bulsun.
 * Reddedilen, geri çekilen, süresi dolan ve açılışta kalan meydan okumalarda
 * emanet meydan okuyana iade edilir. Kazanan iki bahsin toplamından %5 kasa
 * payı kesilmiş tutarı alır; kesilen pay muz çıkışıdır (kimseye gitmez).
 * Sayılar docs/para.md ile birebir aynıdır.
 */

import {
  bakiye, dus, ekle, islem, TURLER,
} from './ekonomi.js';
import { bahisKontrol } from './kumar.js';

/** Meydan okuma bu süre içinde kabul edilmezse geçersiz olur. */
export const DUELLO_SURE_MS = 2 * 60_000;
/** Havuzdan kesilen kasa payı (yüzde). */
export const KASA_PAYI_YUZDE = 5;

export const OYUNLAR = Object.freeze(['zar', 'yazitura', 'at', 'xox']);
export const SECIMLER = Object.freeze(['yazi', 'tura']);

// ── Saf mantık ─────────────────────────────────────────────────────────────

/** Havuz iki bahsin toplamı; kasa payı aşağı yuvarlanır, kazanan kalanı alır. */
export function havuzHesapla(bahis) {
  const havuz = bahis * 2;
  const kasa = Math.floor((havuz * KASA_PAYI_YUZDE) / 100);
  return { havuz, kasa, kazanc: havuz - kasa };
}

const zar = (rastgele) => 1 + Math.floor(rastgele() * 6);

/**
 * İkişer zar: büyük toplam kazanır, eşitlik berabere.
 * @returns {{meydan: number[], rakip: number[], kazanan: 'meydan'|'rakip'|null}}
 */
export function zarDuellosu(rastgele = Math.random) {
  const meydan = [zar(rastgele), zar(rastgele)];
  const rakip = [zar(rastgele), zar(rastgele)];
  const fark = (meydan[0] + meydan[1]) - (rakip[0] + rakip[1]);
  return { meydan, rakip, kazanan: fark > 0 ? 'meydan' : fark < 0 ? 'rakip' : null };
}

/**
 * Meydan okuyanın seçimi tutarsa o kazanır; beraberlik yoktur.
 * @returns {{sonuc: 'yazi'|'tura', kazanan: 'meydan'|'rakip'}}
 */
export function yaziTuraDuellosu(secim, rastgele = Math.random) {
  const sonuc = rastgele() < 0.5 ? 'yazi' : 'tura';
  return { sonuc, kazanan: sonuc === secim ? 'meydan' : 'rakip' };
}

/**
 * İki at, biri meydan okuyanın biri rakibin; yarı yarıya, beraberlik yoktur.
 * @returns {{kazanan: 'meydan'|'rakip'}}
 */
export function atDuellosu(rastgele = Math.random) {
  return { kazanan: rastgele() < 0.5 ? 'meydan' : 'rakip' };
}

/** Düello oyununu oynar. */
export function duelloOyna(duello, rastgele = Math.random) {
  if (duello.oyun === 'zar') return zarDuellosu(rastgele);
  if (duello.oyun === 'at') return atDuellosu(rastgele);
  return yaziTuraDuellosu(duello.secim, rastgele);
}

/** Yazı-tura seçimi verilmediyse rastgele seçilir. */
export function secimBelirle(secim, rastgele = Math.random) {
  if (SECIMLER.includes(secim)) return secim;
  return rastgele() < 0.5 ? 'yazi' : 'tura';
}

/** Kendine ve botlara düello yok. */
export function rakipKontrol(meydanId, rakip) {
  if (String(rakip.id) === String(meydanId)) return { ok: false, sebep: 'Kendinle düello yapamazsın.' };
  if (rakip.bot) return { ok: false, sebep: 'Botlarla düello yapılmaz.' };
  return { ok: true };
}

/** Bahis, kumarla aynı sınırlara uyar (en az BAHIS_MIN, en çok ekonomi.maksBahis). */
export function duelloBahisKontrol(miktar, mevcutBakiye, maks) {
  return bahisKontrol(miktar, mevcutBakiye, maks);
}

export function suresiDolduMu(duello, simdi = Date.now()) {
  return simdi >= duello.bitis;
}

/**
 * Düğmeyi kimin kullanabileceği: Kabul / Reddet yalnız rakip, Geri çek yalnız
 * meydan okuyan.
 * @param {'kabul'|'red'|'geri'} tur
 */
export function butonYetkisi(tur, duello, kullaniciId) {
  const kisi = String(kullaniciId);
  if (tur === 'geri') {
    return kisi === duello.meydanId
      ? { ok: true }
      : { ok: false, sebep: 'Geri çekmeyi yalnız meydan okuyan yapabilir.' };
  }
  return kisi === duello.rakipId
    ? { ok: true }
    : { ok: false, sebep: 'Bu meydan okuma sana değil.' };
}

// ── Düğme kimliği ──────────────────────────────────────────────────────────

const ONEK = 'duello';
const BUTONLAR = ['kabul', 'red', 'geri'];

export function duelloButonId(tur, id) {
  return `${ONEK}:${tur}:${id}`;
}

/** @returns {{tur: string, id: number} | null} */
export function duelloButonAyristir(customId) {
  const [onek, tur, id] = String(customId ?? '').split(':');
  if (onek !== ONEK || !BUTONLAR.includes(tur) || !/^\d{1,15}$/.test(id ?? '')) return null;
  return { tur, id: Number(id) };
}

// ── Kayıt ──────────────────────────────────────────────────────────────────

function satirOku(satir) {
  return {
    id: satir.id,
    guildId: satir.guild_id,
    kanalId: satir.kanal_id,
    mesajId: satir.mesaj_id,
    meydanId: satir.meydan_id,
    rakipId: satir.rakip_id,
    bahis: satir.bahis,
    oyun: satir.oyun,
    secim: satir.secim,
    olusturma: satir.olusturma,
    bitis: satir.bitis,
  };
}

export function duelloGetir(db, id) {
  const satir = db.prepare('SELECT * FROM duello_meydanlari WHERE id = ?').get(id);
  return satir ? satirOku(satir) : null;
}

function duelloSil(db, id) {
  db.prepare('DELETE FROM duello_meydanlari WHERE id = ?').run(id);
}

export function mesajIdKaydet(db, id, mesajId) {
  db.prepare('UPDATE duello_meydanlari SET mesaj_id = ? WHERE id = ?').run(String(mesajId), id);
}

/** Emaneti meydan okuyana iade eder ve kaydı siler. */
function iadeEt(db, duello, simdi) {
  ekle(db, {
    guildId: duello.guildId, kullaniciId: duello.meydanId, miktar: duello.bahis,
    tur: TURLER.iade, karsiId: duello.rakipId, oyun: duello.oyun, simdi,
  });
  duelloSil(db, duello.id);
}

// ── Akış ───────────────────────────────────────────────────────────────────

/**
 * Meydan okuma açar: bahsi emanete alır. Kişi başı aynı anda en çok bir
 * bekleyen meydan okuma; süresi dolmuş eski kayıt önce iade edilir.
 *
 * @returns {{ok: false, sebep: string} | {ok: true, duello: object, bakiye: number}}
 */
export function duelloAc(db, {
  guildId, kanalId, meydanId, rakipId, bahis, oyun, secim = null, simdi = Date.now(),
}) {
  if (!OYUNLAR.includes(oyun)) return { ok: false, sebep: 'Bilinmeyen oyun.' };

  return islem(db, () => {
    const eski = db
      .prepare('SELECT * FROM duello_meydanlari WHERE guild_id = ? AND meydan_id = ?')
      .get(String(guildId), String(meydanId));
    if (eski) {
      const duello = satirOku(eski);
      if (!suresiDolduMu(duello, simdi)) {
        return { ok: false, sebep: 'Zaten bekleyen bir meydan okuman var; önce o sonuçlansın ya da geri çek.' };
      }
      iadeEt(db, duello, simdi);
    }

    const kalan = dus(db, {
      guildId, kullaniciId: meydanId, miktar: bahis, tur: TURLER.bahis, karsiId: rakipId, oyun, simdi,
    });
    if (kalan === null) return { ok: false, sebep: 'Bakiyen bu bahse yetmiyor.' };

    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO duello_meydanlari
           (guild_id, kanal_id, meydan_id, rakip_id, bahis, oyun, secim, olusturma, bitis)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        String(guildId), String(kanalId), String(meydanId), String(rakipId), bahis, oyun,
        oyun === 'yazitura' ? secim : null, simdi, simdi + DUELLO_SURE_MS,
      );
    return { ok: true, duello: duelloGetir(db, Number(lastInsertRowid)), bakiye: kalan };
  });
}

/**
 * Rakip kabul eder: bahsi düşülür, oyun oynanır, ödeme yapılır; tek işlemde.
 * Rakibin bakiyesi yetmezse hiçbir şey değişmez ve meydan okuma bekler.
 *
 * @returns {{ok: false, sebep: string, gecersiz?: boolean}
 *   | {ok: true, duello: object, sonuc: object, kazananId: string|null, kaybedenId: string|null,
 *      kazanc: number, kasa: number, havuz: number}}
 */
export function duelloKabul(db, { id, kullaniciId, simdi = Date.now(), rastgele = Math.random }) {
  return islem(db, () => {
    const duello = duelloGetir(db, id);
    if (!duello) return { ok: false, gecersiz: true, sebep: 'Bu meydan okuma artık geçerli değil.' };

    const yetki = butonYetkisi('kabul', duello, kullaniciId);
    if (!yetki.ok) return yetki;

    if (suresiDolduMu(duello, simdi)) {
      iadeEt(db, duello, simdi);
      return { ok: false, gecersiz: true, sebep: 'Meydan okumanın süresi dolmuş; bahis iade edildi.' };
    }

    const kalan = dus(db, {
      guildId: duello.guildId, kullaniciId: duello.rakipId, miktar: duello.bahis,
      tur: TURLER.bahis, karsiId: duello.meydanId, oyun: duello.oyun, simdi,
    });
    if (kalan === null) {
      const mevcut = bakiye(db, duello.guildId, duello.rakipId);
      return {
        ok: false,
        sebep: `Bakiyen yetmiyor: bu düello için ${duello.bahis} muz gerekiyor, ${mevcut} muzun var.`,
      };
    }

    duelloSil(db, duello.id);
    // XOX sırayla oynanır: iki bahis de düşüldü, oyunu xoxKabul (lib/xox.js)
    // aynı işlem içinde açar ve sonucu o öder.
    if (duello.oyun === 'xox') return { ok: true, duello, sonuc: null, bekliyor: true };

    const sonuc = duelloOyna(duello, rastgele);
    const { havuz, kasa, kazanc } = havuzHesapla(duello.bahis);

    if (sonuc.kazanan === null) {
      // Beraberlik: kasa payı alınmaz, iki taraf da bahsini geri alır.
      for (const [kisi, karsi] of [[duello.meydanId, duello.rakipId], [duello.rakipId, duello.meydanId]]) {
        ekle(db, {
          guildId: duello.guildId, kullaniciId: kisi, miktar: duello.bahis,
          tur: TURLER.iade, karsiId: karsi, oyun: duello.oyun, simdi,
        });
      }
      return { ok: true, duello, sonuc, kazananId: null, kaybedenId: null, kazanc: 0, kasa: 0, havuz };
    }

    const kazananId = sonuc.kazanan === 'meydan' ? duello.meydanId : duello.rakipId;
    const kaybedenId = sonuc.kazanan === 'meydan' ? duello.rakipId : duello.meydanId;
    ekle(db, {
      guildId: duello.guildId, kullaniciId: kazananId, miktar: kazanc,
      tur: TURLER.kazanc, karsiId: kaybedenId, oyun: duello.oyun, simdi,
    });
    return { ok: true, duello, sonuc, kazananId, kaybedenId, kazanc, kasa, havuz };
  });
}

/**
 * Rakip reddeder ('red') ya da meydan okuyan geri çeker ('geri'); emanet iade edilir.
 * @returns {{ok: false, sebep: string, gecersiz?: boolean} | {ok: true, duello: object}}
 */
export function duelloIptal(db, { id, kullaniciId, tur, simdi = Date.now() }) {
  return islem(db, () => {
    const duello = duelloGetir(db, id);
    if (!duello) return { ok: false, gecersiz: true, sebep: 'Bu meydan okuma artık geçerli değil.' };

    const yetki = butonYetkisi(tur, duello, kullaniciId);
    if (!yetki.ok) return yetki;

    iadeEt(db, duello, simdi);
    return { ok: true, duello };
  });
}

/**
 * Süresi dolan tek bir meydan okumayı iade eder (zamanlayıcı için).
 * @returns {object | null} iade edilen düello; hâlâ bekliyorsa ya da yoksa null
 */
export function suresiDolaniIadeEt(db, id, simdi = Date.now()) {
  return islem(db, () => {
    const duello = duelloGetir(db, id);
    if (!duello || !suresiDolduMu(duello, simdi)) return null;
    iadeEt(db, duello, simdi);
    return duello;
  });
}

/**
 * Bot açılışında yarım kalan (kabul edilmemiş) bütün meydan okumaların
 * emanetini iade eder; eski mesajlardaki butonlar "geçerli değil" yanıtı alır.
 * @returns {number} iade edilen meydan okuma sayısı
 */
export function acikDuellolariIadeEt(db, simdi = Date.now()) {
  return islem(db, () => {
    const satirlar = db.prepare('SELECT * FROM duello_meydanlari').all().map(satirOku);
    for (const duello of satirlar) iadeEt(db, duello, simdi);
    return satirlar.length;
  });
}
