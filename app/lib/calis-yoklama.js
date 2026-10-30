/**
 * Çalışma yoklaması (ustabaşı): makro ve autoclicker'a karşı.
 *
 * Çalış düğmesi art arda basılsın diye yerinden kaymaz; sabit bir noktaya
 * tıklayan autoclicker bu yüzden üye başında olmadan saatlerce çalışabilir.
 * Yoklama çıkınca çalışma, üye karışık dizilmiş maymunlardan istenenini
 * seçene kadar durur. Doğru cevabı sunucu bilir (grev'in aksine sonucu
 * istemci bildirmez); bekleyen yoklama veritabanında durur, bot yeniden
 * başlasa da düşmez.
 *
 * Ne zaman çıkar (`sebep`):
 * - `sira`: her SIRA_ALT–SIRA_UST başarılı çalışmada bir (sayaç `calismalar.yoklama_kalan`);
 * - `tik`: son AYNI_TIK_ESIGI çalışmada düğmenin hep aynı pikseline (ya da hep klavyeyle) basıldıysa;
 * - `sentetik`: tık tarayıcıya betikle verildiyse (isTrusted false).
 * Yanlış ya da EN_AZ_CEVAP_MS'den hızlı cevap yeni bir yoklama açar; yenisi
 * ardışık yanlış sayısına göre artan ceza beklemesinden (CEZALAR_MS) sonra
 * cevaplanabilir. Tık izi bellektedir: bot yeniden başlarsa sıfırlanır.
 *
 * Sayılar docs/para.md "Çalışma yoklaması" bölümüyle aynıdır.
 */

import { MESLEKLER } from './meslekler.js';

export const SIRA_ALT = 30;
export const SIRA_UST = 60;
/**
 * Fareyi düğmenin üstüne bırakıp tıklayan insan da aynı piksele basar; bu
 * yüzden eşik yüksek ve tık tetiklemesi tek başına şüphe sayılmaz (SUPHE).
 */
export const AYNI_TIK_ESIGI = 12;
export const SECENEK_ADEDI = 6;
/** Yoklama açıldıktan sonra bundan hızlı gelen cevap insan değil sayılır. */
export const EN_AZ_CEVAP_MS = 500;
/** Ardışık 1., 2., 3. ve sonraki yanlışın ceza beklemesi. */
export const CEZALAR_MS = Object.freeze([30_000, 2 * 60_000, 10 * 60_000, 30 * 60_000]);
/** Yönetim özetinin kapsadığı gün. */
export const OZET_GUN = 7;
/** Yönetimde şüpheli işareti: bu kadar yanlış cevap, betik tıkı ya da pencerede boşa tık. */
export const SUPHE = Object.freeze({ yanlis: 3, sentetik: 1, bosTik: 15 });

const GUN_MS = 86_400_000;
const tiklar = new Map();
const anahtar = (guildId, kullaniciId) => `${guildId}:${kullaniciId}`;

function aralik(min, max, rastgele) {
  return min + Math.floor(rastgele() * (max - min + 1));
}

/** Sıradaki `sira` yoklamasına kadar kaç çalışma. */
export function siraEsigi(rastgele = Math.random) {
  return aralik(SIRA_ALT, SIRA_UST, rastgele);
}

/**
 * İstek gövdesindeki tık izi: `{x, y}` düğmeye göre piksel, `klavye`,
 * `guvenli` (isTrusted). Eski istemci göndermezse ya da bozuksa null; hata vermez.
 */
export function tikAyristir(govde) {
  const x = Number(govde?.x);
  const y = Number(govde?.y);
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || Math.abs(x) > 10_000 || Math.abs(y) > 10_000) return null;
  return { x, y, klavye: govde.klavye === true, guvenli: govde.guvenli !== false };
}

/**
 * Başarılı bir çalışmanın tıkını izler; robot gibiyse sebebi (`tik` |
 * `sentetik`), değilse null döner. Sebep dönünce iz sıfırlanır.
 */
export function tikIzle(guildId, kullaniciId, tik) {
  if (!tik) return null;
  const k = anahtar(guildId, kullaniciId);
  if (!tik.guvenli) {
    tiklar.delete(k);
    return 'sentetik';
  }
  const iz = tiklar.get(k) ?? [];
  iz.push(tik.klavye ? 'klavye' : `${tik.x},${tik.y}`);
  if (iz.length > AYNI_TIK_ESIGI) iz.shift();
  tiklar.set(k, iz);
  if (iz.length === AYNI_TIK_ESIGI && iz.every((t) => t === iz[0])) {
    tiklar.delete(k);
    return 'tik';
  }
  return null;
}

/** Testler için: bellekteki tık izlerini siler. */
export function tikIzleriniSil() {
  tiklar.clear();
}

function satirCoz(s) {
  return s ? { ...s, secenekler: JSON.parse(s.secenekler) } : null;
}

/** Bekleyen yoklama ({id, sebep, hedef, secenekler, olusturma, acilis}) ya da null. */
export function yoklamaBekleyen(db, guildId, kullaniciId) {
  return satirCoz(db.prepare(`SELECT id, sebep, hedef, secenekler, olusturma, acilis FROM calis_yoklamalari
    WHERE guild_id = ? AND kullanici_id = ? AND sonuc IS NULL ORDER BY id DESC LIMIT 1`)
    .get(String(guildId), String(kullaniciId)));
}

/** Meslekler arasından hedef ve onu içeren karışık SECENEK_ADEDI seçenek. */
export function secenekleriKur(rastgele = Math.random) {
  const havuz = MESLEKLER.map((m) => m.kimlik);
  for (let i = havuz.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rastgele() * (i + 1));
    [havuz[i], havuz[j]] = [havuz[j], havuz[i]];
  }
  const secenekler = havuz.slice(0, SECENEK_ADEDI);
  return { hedef: secenekler[Math.floor(rastgele() * secenekler.length)], secenekler };
}

/** Yoklama açar (bekleyen varsa onu döner). `acilis`: cevabın kabul edildiği ilk an. */
export function yoklamaBaslat(db, {
  guildId, kullaniciId, sebep, simdi = Date.now(), acilis = simdi, rastgele = Math.random,
}) {
  const bekleyen = yoklamaBekleyen(db, guildId, kullaniciId);
  if (bekleyen) return bekleyen;
  const { hedef, secenekler } = secenekleriKur(rastgele);
  db.prepare(`INSERT INTO calis_yoklamalari (guild_id, kullanici_id, sebep, hedef, secenekler, olusturma, acilis)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(String(guildId), String(kullaniciId), sebep, hedef, JSON.stringify(secenekler), simdi, acilis);
  return yoklamaBekleyen(db, guildId, kullaniciId);
}

/**
 * Başarılı çalışmadan sonra çağrılır: sırayı ilerletir, tık izine bakar ve
 * gerekiyorsa yoklama açar. Açılan yoklamayı ya da null döner.
 */
export function yoklamaDenetle(db, {
  guildId, kullaniciId, tik = null, simdi = Date.now(), rastgele = Math.random,
}) {
  const g = String(guildId);
  const u = String(kullaniciId);
  const satir = db.prepare('SELECT yoklama_kalan FROM calismalar WHERE guild_id = ? AND kullanici_id = ?').get(g, u);
  const kalan = (satir?.yoklama_kalan ?? siraEsigi(rastgele)) - 1;
  const sebep = tikIzle(g, u, tik) ?? (kalan <= 0 ? 'sira' : null);
  db.prepare('UPDATE calismalar SET yoklama_kalan = ? WHERE guild_id = ? AND kullanici_id = ?')
    .run(sebep ? siraEsigi(rastgele) : kalan, g, u);
  return sebep ? yoklamaBaslat(db, {
    guildId: g, kullaniciId: u, sebep, simdi, rastgele,
  }) : null;
}

/** Kişinin şu ana kadarki ardışık yanlış sayısı (son doğrudan beri). */
function ardisikYanlis(db, guildId, kullaniciId) {
  const sonuclar = db.prepare(`SELECT sonuc FROM calis_yoklamalari
    WHERE guild_id = ? AND kullanici_id = ? AND sonuc IS NOT NULL ORDER BY id DESC LIMIT ?`)
    .all(String(guildId), String(kullaniciId), CEZALAR_MS.length + 1);
  const i = sonuclar.findIndex((s) => s.sonuc === 'dogru');
  return i === -1 ? sonuclar.length : i;
}

/**
 * Bekleyen yoklamayı cevaplar. `bosTik`: pencerede seçenek dışına tıklama
 * sayısı (yalnız yönetim özeti için). Yanlışta ceza beklemeli yeni yoklama açılır.
 * @returns {{ok: false, sebep: string}
 *   | {ok: true, dogru: boolean, hizli: boolean, cezaMs: number, yoklama: object|null}}
 */
export function yoklamaCevapla(db, {
  guildId, kullaniciId, secim, bosTik = 0, simdi = Date.now(), rastgele = Math.random,
}) {
  const y = yoklamaBekleyen(db, guildId, kullaniciId);
  if (!y) return { ok: false, sebep: 'Bekleyen yoklama yok.' };
  if (!y.secenekler.includes(secim)) return { ok: false, sebep: 'Böyle bir seçenek yok.' };
  if (simdi < y.acilis) return { ok: false, sebep: 'Ustabaşı daha kızgın, biraz bekle.' };

  const hizli = simdi - y.acilis < EN_AZ_CEVAP_MS;
  const dogru = !hizli && secim === y.hedef;
  const bos = Number.isSafeInteger(bosTik) ? Math.min(Math.max(bosTik, 0), 999) : 0;
  db.prepare('UPDATE calis_yoklamalari SET cevap = ?, sonuc = ?, bos_tik = ? WHERE id = ?')
    .run(simdi, dogru ? 'dogru' : hizli ? 'hizli' : 'yanlis', bos, y.id);
  if (dogru) {
    return {
      ok: true, dogru, hizli, cezaMs: 0, yoklama: null,
    };
  }
  const cezaMs = CEZALAR_MS[Math.min(ardisikYanlis(db, guildId, kullaniciId), CEZALAR_MS.length) - 1];
  const yeni = yoklamaBaslat(db, {
    guildId, kullaniciId, sebep: 'tekrar', simdi, acilis: simdi + cezaMs, rastgele,
  });
  return {
    ok: true, dogru, hizli, cezaMs, yoklama: yeni,
  };
}

function medyan(dizi) {
  if (dizi.length === 0) return null;
  const s = [...dizi].sort((a, b) => a - b);
  const o = Math.floor(s.length / 2);
  return s.length % 2 ? s[o] : Math.round((s[o - 1] + s[o]) / 2);
}

/**
 * Yönetim özeti (son OZET_GUN gün): genel sayılar ve kişi başı satırlar.
 * Şüpheliler (çok yanlış, betik tıkı, boşa tık) üstte.
 */
export function yoklamaOzeti(db, guildId, simdi = Date.now()) {
  const satirlar = db.prepare(`SELECT kullanici_id, sebep, sonuc, acilis, cevap, bos_tik, olusturma FROM calis_yoklamalari
    WHERE guild_id = ? AND olusturma >= ? ORDER BY id`).all(String(guildId), simdi - OZET_GUN * GUN_MS);
  const kisiler = new Map();
  for (const s of satirlar) {
    const k = kisiler.get(s.kullanici_id) ?? {
      kullaniciId: s.kullanici_id, toplam: 0, dogru: 0, yanlis: 0, tik: 0, sentetik: 0, bosTik: 0, sureler: [], bekliyor: null, son: 0,
    };
    k.toplam += 1;
    if (s.sonuc === 'dogru') {
      k.dogru += 1;
      k.sureler.push(s.cevap - s.acilis);
    } else if (s.sonuc) k.yanlis += 1;
    else k.bekliyor = s.olusturma;
    if (s.sebep === 'tik') k.tik += 1;
    if (s.sebep === 'sentetik') k.sentetik += 1;
    k.bosTik += s.bos_tik ?? 0;
    k.son = Math.max(k.son, s.olusturma);
    kisiler.set(s.kullanici_id, k);
  }
  const liste = [...kisiler.values()].map(({ sureler, ...k }) => {
    const supheli = k.yanlis >= SUPHE.yanlis || k.sentetik >= SUPHE.sentetik || k.bosTik >= SUPHE.bosTik;
    return { ...k, medyanMs: medyan(sureler), supheli };
  }).sort((a, b) => (b.supheli - a.supheli) || (b.yanlis - a.yanlis) || (b.tik + b.sentetik - a.tik - a.sentetik) || (b.toplam - a.toplam));
  return {
    gun: OZET_GUN,
    toplam: satirlar.length,
    kisi: liste.length,
    dogru: liste.reduce((t, k) => t + k.dogru, 0),
    yanlis: liste.reduce((t, k) => t + k.yanlis, 0),
    bekleyen: liste.filter((k) => k.bekliyor !== null).length,
    supheli: liste.filter((k) => k.supheli).length,
    sira: { alt: SIRA_ALT, ust: SIRA_UST },
    kisiler: liste,
  };
}
