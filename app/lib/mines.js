/**
 * Mines: 9 karelik (3×3) tahtada seçilen sayıda mayın gizli. Oyuncu kare
 * açtıkça çarpan büyür; mayına basarsa bahis gider, istediği an "çek"erse
 * bahis × çarpan ödenir.
 *
 * Çarpan, adil oranın (açılan k güvenli kare için Π (n−i)/(n−m−i)) %95'idir
 * (MINES_KASA_ORANI), 2 basamağa aşağı yuvarlanır ve MINES_MAKS_CARPAN (9x)
 * ile sınırlıdır; hangi anda çekilirse çekilsin beklenen geri ödeme en çok
 * %95'tir (tavan bunu yalnız düşürür). Tavana varan ya da bütün güvenli
 * kareleri açan oyun kendiliğinden çekilir. Tavandan önce en yüksek 119,7x'e
 * (4–5 mayın) çıkıyordu; kullanıcı isteğiyle 2026-10-22'de 9x'e çekildi.
 *
 * Bahis başlangıçta düşülür, oyun mines_oyunlari tablosunda tutulur (mayın
 * yerleri başta belirlenir). Açılışta kalan oyunların bahsi iade edilir.
 * Sayılar docs/para.md ile birebir aynıdır.
 */

import { dus, ekle, islem, TURLER } from './ekonomi.js';
import { kumarCashback } from './kumar-cashback.js';
import { odemeHesapla } from './kumar.js';

export const MINES_HUCRE = 9;
export const MINES_SUTUN = 3;
export const MINES_KASA_ORANI = 0.95;
/** Çarpan tavanı: bu değere varan oyun kendiliğinden çekilir. */
export const MINES_MAKS_CARPAN = 9;
export const MAYIN_MIN = 1;
export const MAYIN_MAKS = MINES_HUCRE - 1;
export const MAYIN_VARSAYILAN = 2;
/** Bu süreden eski oyun, sahibi yenisini açmak isteyince kendiliğinden çekilir. */
export const MINES_ZAMAN_ASIMI_MS = 5 * 60_000;

// ── Saf mantık ─────────────────────────────────────────────────────────────

/** `acilan` güvenli kare açıldıktan sonraki çarpan (0 kare → 1, çekilemez); en çok MINES_MAKS_CARPAN. */
export function minesCarpani(mayin, acilan) {
  let adil = 1;
  for (let i = 0; i < acilan; i += 1) adil *= (MINES_HUCRE - i) / (MINES_HUCRE - mayin - i);
  if (acilan === 0) return 1;
  // Küçük pay kayan nokta hatası için: 9 × 0,95 = 8,5499… çıkar, 8,55 olmalı.
  return Math.min(MINES_MAKS_CARPAN, Math.floor(adil * MINES_KASA_ORANI * 100 + 1e-9) / 100);
}

/** Oyunun en çok kaç kare sürdüğü: çarpan tavana vardığı ya da güvenli kareler bittiği an. */
export function minesKareSiniri(mayin) {
  const guvenli = MINES_HUCRE - mayin;
  for (let k = 1; k < guvenli; k += 1) if (minesCarpani(mayin, k) >= MINES_MAKS_CARPAN) return k;
  return guvenli;
}

/** Mayın yerleri (sıralı, tekrarsız). */
export function mayinYerlestir(mayin, rastgele = Math.random) {
  const kareler = Array.from({ length: MINES_HUCRE }, (_, i) => i);
  for (let i = kareler.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rastgele() * (i + 1));
    [kareler[i], kareler[j]] = [kareler[j], kareler[i]];
  }
  return kareler.slice(0, mayin).sort((a, b) => a - b);
}

/** Oyun kendiliğinden çekilmeli mi: çarpan tavana vardı ya da güvenli kare kalmadı. */
export function kendiligindenCekilirMi(oyun) {
  return oyun.acilan.length >= minesKareSiniri(oyun.mayin);
}

// ── Düğme kimliği ──────────────────────────────────────────────────────────

const ONEK = 'mines';

/** `hucre`: 0–8 ya da 'cek'. */
export function minesButonId(id, hucre) {
  return `${ONEK}:${id}:${hucre}`;
}

/** @returns {{id: number, hucre: number|'cek'} | null} */
export function minesButonAyristir(customId) {
  const [onek, id, hucre] = String(customId ?? '').split(':');
  if (onek !== ONEK || !/^\d{1,15}$/.test(id ?? '')) return null;
  if (hucre === 'cek') return { id: Number(id), hucre };
  if (!/^\d{1,2}$/.test(hucre ?? '') || Number(hucre) >= MINES_HUCRE) return null;
  return { id: Number(id), hucre: Number(hucre) };
}

// ── Kayıt ──────────────────────────────────────────────────────────────────

const liste = (metin) => (metin ? metin.split(',').map(Number) : []);

function satirOku(s) {
  return {
    id: s.id,
    guildId: s.guild_id,
    kullaniciId: s.kullanici_id,
    bahis: s.bahis,
    mayin: s.mayin_sayisi,
    mayinlar: liste(s.mayinlar),
    acilan: liste(s.acilan),
    baslangic: s.baslangic,
  };
}

export function minesGetir(db, id) {
  const satir = db.prepare('SELECT * FROM mines_oyunlari WHERE id = ?').get(id);
  return satir ? satirOku(satir) : null;
}

export function kullaniciOyunu(db, guildId, kullaniciId) {
  const satir = db.prepare('SELECT * FROM mines_oyunlari WHERE guild_id = ? AND kullanici_id = ?')
    .get(String(guildId), String(kullaniciId));
  return satir ? satirOku(satir) : null;
}

function sil(db, id) {
  db.prepare('DELETE FROM mines_oyunlari WHERE id = ?').run(id);
}

/** Çeker: bahis × çarpan öder, oyunu siler. Hiç kare açılmadıysa bahis iade edilir. */
function cekVeOde(db, oyun, simdi) {
  sil(db, oyun.id);
  if (oyun.acilan.length === 0) {
    const bakiye = ekle(db, {
      guildId: oyun.guildId, kullaniciId: oyun.kullaniciId, miktar: oyun.bahis, tur: TURLER.iade, oyun: 'mines', simdi,
    });
    return {
      tur: 'iade', carpan: 1, odeme: oyun.bahis, net: 0, bakiye,
    };
  }
  const carpan = minesCarpani(oyun.mayin, oyun.acilan.length);
  const odeme = odemeHesapla(oyun.bahis, carpan);
  const bakiye = ekle(db, {
    guildId: oyun.guildId, kullaniciId: oyun.kullaniciId, miktar: odeme, tur: TURLER.kazanc, oyun: 'mines', simdi,
  });
  const net = odeme - oyun.bahis;
  const cb = kumarCashback(db, {
    guildId: oyun.guildId, kullaniciId: oyun.kullaniciId, net, simdi,
  });
  return {
    tur: 'cekildi', carpan, odeme, net, cashback: cb?.iade ?? 0, bakiye: cb?.bakiye ?? bakiye,
  };
}

/**
 * Oyun açar: bahsi düşer, mayınları yerleştirir. Süren oyun varsa reddeder;
 * zaman aşımına uğramışsa önce onu çeker.
 *
 * @returns {{ok: false, sebep: string}
 *   | {ok: true, oyun: object, bakiye: number, eski: {oyun: object, bitti: object}|null}}
 */
export function minesBaslat(db, {
  guildId, kullaniciId, bahis, mayin, simdi = Date.now(), rastgele = Math.random,
}) {
  if (!Number.isInteger(mayin) || mayin < MAYIN_MIN || mayin > MAYIN_MAKS) {
    return { ok: false, sebep: `Mayın sayısı ${MAYIN_MIN}–${MAYIN_MAKS} arası olmalı.` };
  }
  return islem(db, () => {
    let eski = null;
    const acik = kullaniciOyunu(db, guildId, kullaniciId);
    if (acik) {
      if (simdi - acik.baslangic < MINES_ZAMAN_ASIMI_MS) {
        return { ok: false, sebep: 'Süren bir mines oyunun var; önce onu bitir (mesajındaki düğmelerle).' };
      }
      eski = { oyun: acik, bitti: cekVeOde(db, acik, simdi) };
    }

    const kalan = dus(db, {
      guildId, kullaniciId, miktar: bahis, tur: TURLER.bahis, oyun: 'mines', simdi,
    });
    if (kalan === null) return { ok: false, sebep: 'Bakiyen bu bahse yetmiyor.' };

    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO mines_oyunlari (guild_id, kullanici_id, bahis, mayin_sayisi, mayinlar, acilan, baslangic)
         VALUES (?, ?, ?, ?, ?, '', ?)`,
      )
      .run(String(guildId), String(kullaniciId), bahis, mayin, mayinYerlestir(mayin, rastgele).join(','), simdi);
    return {
      ok: true, oyun: minesGetir(db, Number(lastInsertRowid)), bakiye: kalan, eski,
    };
  });
}

function oyunVeSahip(db, id, kullaniciId) {
  const oyun = minesGetir(db, id);
  if (!oyun) return { ok: false, gecersiz: true, sebep: 'Bu oyun bitmiş.' };
  if (oyun.kullaniciId !== String(kullaniciId)) {
    return { ok: false, sebep: 'Bu oyun senin değil. Kendi oyununu `/kumar mines` ile aç.' };
  }
  return { ok: true, oyun };
}

/**
 * Kare açar. Mayınsa oyun biter (bahis gider); güvenliyse çarpan büyür,
 * tahtanın sonuna varılırsa kendiliğinden çekilir.
 * @returns {{ok: false, sebep: string, gecersiz?: boolean}
 *   | {ok: true, oyun: object, bitti: {tur: 'patladi'|'cekildi', patlayan?: number, carpan: number,
 *      odeme: number, net: number, bakiye: number|null}|null}}
 */
export function minesAc(db, {
  id, kullaniciId, hucre, simdi = Date.now(),
}) {
  return islem(db, () => {
    const k = oyunVeSahip(db, id, kullaniciId);
    if (!k.ok) return k;
    const { oyun } = k;
    if (oyun.acilan.includes(hucre)) return { ok: false, sebep: 'O kare zaten açık.' };

    if (oyun.mayinlar.includes(hucre)) {
      sil(db, oyun.id);
      const cb = kumarCashback(db, {
        guildId: oyun.guildId, kullaniciId: oyun.kullaniciId, net: -oyun.bahis, simdi,
      });
      return {
        ok: true,
        oyun,
        bitti: {
          tur: 'patladi', patlayan: hucre, carpan: 0, odeme: 0, net: -oyun.bahis, cashback: cb?.iade ?? 0, bakiye: cb?.bakiye ?? null,
        },
      };
    }

    const yeni = { ...oyun, acilan: [...oyun.acilan, hucre] };
    if (kendiligindenCekilirMi(yeni)) return { ok: true, oyun: yeni, bitti: cekVeOde(db, yeni, simdi) };

    db.prepare('UPDATE mines_oyunlari SET acilan = ? WHERE id = ?').run(yeni.acilan.join(','), id);
    return { ok: true, oyun: yeni, bitti: null };
  });
}

/** Kazancı çeker. En az bir kare açılmış olmalı. */
export function minesCek(db, { id, kullaniciId, simdi = Date.now() }) {
  return islem(db, () => {
    const k = oyunVeSahip(db, id, kullaniciId);
    if (!k.ok) return k;
    if (k.oyun.acilan.length === 0) return { ok: false, sebep: 'Çekmeden önce en az bir kare aç.' };
    return { ok: true, oyun: k.oyun, bitti: cekVeOde(db, k.oyun, simdi) };
  });
}

/**
 * Açılışta yarım kalan bütün oyunların bahsini iade eder.
 * @returns {number} iade edilen oyun sayısı
 */
export function acikMinesIadeEt(db, simdi = Date.now()) {
  return islem(db, () => {
    const oyunlar = db.prepare('SELECT * FROM mines_oyunlari').all().map(satirOku);
    for (const oyun of oyunlar) {
      ekle(db, {
        guildId: oyun.guildId, kullaniciId: oyun.kullaniciId, miktar: oyun.bahis, tur: TURLER.iade, oyun: 'mines', simdi,
      });
    }
    db.prepare('DELETE FROM mines_oyunlari').run();
    return oyunlar.length;
  });
}
