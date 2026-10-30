/**
 * XOX düellosu: iki üye sırayla 3×3 tahtaya işaret koyar.
 *
 * Meydan okuma ve emanet lib/duello.js'teki gibidir; kabulde rakibin bahsi
 * düşülür ve oyun aynı işlemde xox_oyunlari tablosuna yazılır. X ve O kurayla
 * dağıtılır, X başlar. Kazanan havuzu %5 kasa payı kesilmiş alır; berabere
 * biterse ikisine de iade. Sırası gelen hamle süresini (60 sn) aşarsa hükmen
 * kaybeder; pes eden kaybeder. Bot yeniden başlarsa yarım kalan oyunlarda iki
 * tarafa da bahsi iade edilir.
 */

import { duelloKabul, havuzHesapla } from './duello.js';
import { ekle, islem, TURLER } from './ekonomi.js';

export const XOX_HAMLE_SURE_MS = 60_000;
const BOS = '.';
const BOS_TAHTA = BOS.repeat(9);

export const CIZGILER = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

// ── Saf mantık ─────────────────────────────────────────────────────────────

/** @returns {{isaret: 'X'|'O', cizgi: number[]} | null} */
export function kazananBul(tahta) {
  for (const cizgi of CIZGILER) {
    const [a, b, c] = cizgi;
    if (tahta[a] !== BOS && tahta[a] === tahta[b] && tahta[a] === tahta[c]) return { isaret: tahta[a], cizgi };
  }
  return null;
}

export const doluMu = (tahta) => !tahta.includes(BOS);

export function hamleUygula(tahta, hucre, isaret) {
  return `${tahta.slice(0, hucre)}${isaret}${tahta.slice(hucre + 1)}`;
}

export const siradakiId = (oyun) => (oyun.sira === 'X' ? oyun.xId : oyun.oId);
export const sureDolduMu = (oyun, simdi = Date.now()) => simdi >= oyun.sonHamle + XOX_HAMLE_SURE_MS;

// ── Düğme kimliği ──────────────────────────────────────────────────────────

const ONEK = 'xox';

/** `hucre`: 0–8 ya da 'pes'. */
export function xoxButonId(id, hucre) {
  return `${ONEK}:${id}:${hucre}`;
}

/** @returns {{id: number, hucre: number|'pes'} | null} */
export function xoxButonAyristir(customId) {
  const [onek, id, hucre] = String(customId ?? '').split(':');
  if (onek !== ONEK || !/^\d{1,15}$/.test(id ?? '')) return null;
  if (hucre === 'pes') return { id: Number(id), hucre };
  if (!/^[0-8]$/.test(hucre ?? '')) return null;
  return { id: Number(id), hucre: Number(hucre) };
}

// ── Kayıt ──────────────────────────────────────────────────────────────────

function satirOku(s) {
  return {
    id: s.id,
    guildId: s.guild_id,
    kanalId: s.kanal_id,
    xId: s.x_id,
    oId: s.o_id,
    bahis: s.bahis,
    tahta: s.tahta,
    sira: s.sira,
    sonHamle: s.son_hamle,
  };
}

export function xoxGetir(db, id) {
  const satir = db.prepare('SELECT * FROM xox_oyunlari WHERE id = ?').get(id);
  return satir ? satirOku(satir) : null;
}

/**
 * Oyunu bitirir: kazanana havuz (kasa payı kesilerek), berabere ise iki tarafa iade.
 * @param {'X'|'O'|null} kazanan
 */
function bitir(db, oyun, kazanan, sebep, simdi, cizgi = null) {
  db.prepare('DELETE FROM xox_oyunlari WHERE id = ?').run(oyun.id);
  const { havuz, kasa, kazanc } = havuzHesapla(oyun.bahis);
  if (kazanan === null) {
    for (const [kisi, karsi] of [[oyun.xId, oyun.oId], [oyun.oId, oyun.xId]]) {
      ekle(db, {
        guildId: oyun.guildId, kullaniciId: kisi, miktar: oyun.bahis, tur: TURLER.iade, karsiId: karsi, oyun: 'xox', simdi,
      });
    }
    return {
      sebep, kazananId: null, kaybedenId: null, havuz, kasa: 0, kazanc: 0, cizgi,
    };
  }
  const kazananId = kazanan === 'X' ? oyun.xId : oyun.oId;
  const kaybedenId = kazanan === 'X' ? oyun.oId : oyun.xId;
  // karsi_id = kaybeden: düello galibiyeti başarımı bu kayıttan sayılır.
  ekle(db, {
    guildId: oyun.guildId, kullaniciId: kazananId, miktar: kazanc, tur: TURLER.kazanc, karsiId: kaybedenId, oyun: 'xox', simdi,
  });
  return {
    sebep, kazananId, kaybedenId, havuz, kasa, kazanc, cizgi,
  };
}

const karsiIsaret = (isaret) => (isaret === 'X' ? 'O' : 'X');

/**
 * Rakip XOX düellosunu kabul eder: bahsi düşülür, oyun açılır; tek işlemde.
 * @returns {{ok: false, sebep: string, gecersiz?: boolean} | {ok: true, duello: object, oyun: object}}
 */
export function xoxKabul(db, {
  id, kullaniciId, simdi = Date.now(), rastgele = Math.random,
}) {
  return islem(db, () => {
    const s = duelloKabul(db, { id, kullaniciId, simdi });
    if (!s.ok) return s;
    const { duello } = s;
    const meydanX = rastgele() < 0.5;
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO xox_oyunlari (guild_id, kanal_id, x_id, o_id, bahis, tahta, sira, son_hamle)
         VALUES (?, ?, ?, ?, ?, ?, 'X', ?)`,
      )
      .run(
        duello.guildId, duello.kanalId,
        meydanX ? duello.meydanId : duello.rakipId,
        meydanX ? duello.rakipId : duello.meydanId,
        duello.bahis, BOS_TAHTA, simdi,
      );
    return { ok: true, duello, oyun: xoxGetir(db, Number(lastInsertRowid)) };
  });
}

/**
 * Hamle. Sırası gelenin süresi dolmuşsa, kim basarsa bassın oyun önce hükmen biter.
 * @returns {{ok: false, sebep: string, gecersiz?: boolean}
 *   | {ok: true, oyun: object, bitti: object|null}}
 */
export function xoxHamle(db, {
  id, kullaniciId, hucre, simdi = Date.now(),
}) {
  return islem(db, () => {
    const oyun = xoxGetir(db, id);
    if (!oyun) return { ok: false, gecersiz: true, sebep: 'Bu oyun bitmiş.' };
    const kisi = String(kullaniciId);
    if (kisi !== oyun.xId && kisi !== oyun.oId) return { ok: false, sebep: 'Bu oyunda değilsin.' };

    if (sureDolduMu(oyun, simdi)) {
      return { ok: true, oyun, bitti: bitir(db, oyun, karsiIsaret(oyun.sira), 'sure', simdi) };
    }
    if (kisi !== siradakiId(oyun)) return { ok: false, sebep: 'Sıra sende değil.' };
    if (oyun.tahta[hucre] !== BOS) return { ok: false, sebep: 'O kare dolu.' };

    const tahta = hamleUygula(oyun.tahta, hucre, oyun.sira);
    const yeni = { ...oyun, tahta, sira: karsiIsaret(oyun.sira), sonHamle: simdi };
    const kazanan = kazananBul(tahta);
    if (kazanan) return { ok: true, oyun: yeni, bitti: bitir(db, yeni, kazanan.isaret, 'cizgi', simdi, kazanan.cizgi) };
    if (doluMu(tahta)) return { ok: true, oyun: yeni, bitti: bitir(db, yeni, null, 'berabere', simdi) };

    db.prepare('UPDATE xox_oyunlari SET tahta = ?, sira = ?, son_hamle = ? WHERE id = ?')
      .run(tahta, yeni.sira, simdi, id);
    return { ok: true, oyun: yeni, bitti: null };
  });
}

/** Oyunculardan biri pes eder; rakibi kazanır. */
export function xoxPes(db, { id, kullaniciId, simdi = Date.now() }) {
  return islem(db, () => {
    const oyun = xoxGetir(db, id);
    if (!oyun) return { ok: false, gecersiz: true, sebep: 'Bu oyun bitmiş.' };
    const kisi = String(kullaniciId);
    if (kisi !== oyun.xId && kisi !== oyun.oId) return { ok: false, sebep: 'Bu oyunda değilsin.' };
    const kaybeden = kisi === oyun.xId ? 'X' : 'O';
    return { ok: true, oyun, bitti: bitir(db, oyun, karsiIsaret(kaybeden), 'pes', simdi) };
  });
}

/**
 * Süresi dolan oyunu hükmen bitirir (zamanlayıcı için).
 * @returns {{oyun: object, bitti: object} | null} hâlâ sürüyorsa ya da yoksa null
 */
export function xoxSuresiDolaniBitir(db, id, simdi = Date.now()) {
  return islem(db, () => {
    const oyun = xoxGetir(db, id);
    if (!oyun || !sureDolduMu(oyun, simdi)) return null;
    return { oyun, bitti: bitir(db, oyun, karsiIsaret(oyun.sira), 'sure', simdi) };
  });
}

/**
 * Bot açılışında yarım kalan bütün oyunlarda iki tarafa da bahsini iade eder.
 * @returns {number} iade edilen oyun sayısı
 */
export function acikXoxlariIadeEt(db, simdi = Date.now()) {
  return islem(db, () => {
    const oyunlar = db.prepare('SELECT * FROM xox_oyunlari').all().map(satirOku);
    for (const oyun of oyunlar) bitir(db, oyun, null, 'iade', simdi);
    return oyunlar.length;
  });
}
