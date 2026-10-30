/**
 * Maymun grevi: çalışırken çok küçük bir ihtimalle çıkan sürpriz.
 *
 * Grev çıkınca üye Activity'de mini oyunu oynar. Kazanırsa hiçbir şey olmaz,
 * kaybederse (ya da oyunu bırakıp süreyi doldurursa) enerjisi sıfırlanır.
 * Bekleyen grev bellekte tutulur: bot yeniden başlarsa düşer, bu bilinçli
 * (üyeye zarar vermeyen taraf). Her grev `grev_kayitlari`na yazılır; yönetim
 * panelindeki sayılar oradan gelir. Kimsenin göreceği başka bir yerde anlatılmaz.
 */

import { enerjiYaz } from './enerji.js';
import { yetkiliKimlikler } from './izin.js';

/** Her başarılı çalışmada grev çıkma ihtimali (%0,1). */
export const GREV_SANSI = 0.001;
/** Grev çıktıktan sonra oyunun bitmesi için tanınan süre; dolarsa kayıp sayılır. */
export const GREV_SURE_MS = 3 * 60_000;
/** Bundan önce gelen "kazandım" sahte sayılır (oyun hedefi bundan hızlı bitmez). */
export const GREV_EN_AZ_MS = 15_000;
const SON_KAYIT = 50;

const bekleyenler = new Map();
const anahtar = (guildId, kullaniciId) => `${guildId}:${kullaniciId}`;

/** Bu çalışmada grev çıkacak mı? */
export function grevZari(rastgele = Math.random) {
  return rastgele() < GREV_SANSI;
}

/** Grevi başlatır ve kaydeder (varsa bekleyenin yerine yenisi); bekleyen kaydı döner. */
export function grevBaslat(db, {
  guildId, kullaniciId, test = false, simdi = Date.now(),
}) {
  const { lastInsertRowid } = db
    .prepare('INSERT INTO grev_kayitlari (guild_id, kullanici_id, baslangic, test) VALUES (?, ?, ?, ?)')
    .run(String(guildId), String(kullaniciId), simdi, test ? 1 : 0);
  const kayit = { id: Number(lastInsertRowid), baslangic: simdi, bitis: simdi + GREV_SURE_MS };
  bekleyenler.set(anahtar(guildId, kullaniciId), kayit);
  return kayit;
}

/**
 * Grevi sonuçlandırır. Kaybedilirse enerji sıfırlanır.
 * @returns {{ok: false} | {ok: true, kazandi: boolean}}
 */
export function grevBitir(db, {
  guildId, kullaniciId, kazandi, vurulan = null, simdi = Date.now(),
}) {
  const kayit = bekleyenler.get(anahtar(guildId, kullaniciId));
  if (!kayit) return { ok: false };
  bekleyenler.delete(anahtar(guildId, kullaniciId));
  const sureDoldu = simdi > kayit.bitis;
  const gecerli = kazandi === true && simdi - kayit.baslangic >= GREV_EN_AZ_MS && !sureDoldu;
  if (!gecerli) enerjiYaz(db, guildId, kullaniciId, 0, simdi);
  const sonuc = gecerli ? 'kazandi' : sureDoldu ? 'sure' : 'kaybetti';
  const adet = Number.isSafeInteger(vurulan) ? Math.min(Math.max(vurulan, 0), 999) : null;
  db.prepare('UPDATE grev_kayitlari SET bitis = ?, sonuc = ?, vurulan = ? WHERE id = ?').run(simdi, sonuc, adet, kayit.id);
  return { ok: true, kazandi: gecerli };
}

/** Bekleyen grev ({bitis}) ya da null. Süresi dolmuşsa kayıp olarak işlenir. */
export function grevBekleyen(db, guildId, kullaniciId, simdi = Date.now()) {
  const kayit = bekleyenler.get(anahtar(guildId, kullaniciId));
  if (!kayit) return null;
  if (simdi > kayit.bitis) {
    grevBitir(db, {
      guildId, kullaniciId, kazandi: false, simdi,
    });
    return null;
  }
  return { bitis: kayit.bitis };
}

/** Gizli test düğmesi: yalnız .env'deki sahip ve geliştiriciler. */
export function grevTestYetkisi(kullaniciId, kimlikler = yetkiliKimlikler()) {
  return kimlikler.includes(String(kullaniciId));
}

/**
 * Yönetim paneli özeti. Sayılar gerçek grevlerdir (test düğmesi hariç);
 * son kayıtlar testleri de işaretli olarak listeler.
 */
export function grevOzeti(db, guildId) {
  const say = db.prepare(`SELECT COUNT(*) AS toplam, COUNT(DISTINCT kullanici_id) AS kisi,
      SUM(sonuc = 'kazandi') AS kazanan, SUM(sonuc IN ('kaybetti', 'sure')) AS kaybeden,
      SUM(sonuc IS NULL) AS yarim, MAX(baslangic) AS son
    FROM grev_kayitlari WHERE guild_id = ? AND test = 0`).get(String(guildId));
  const test = db.prepare('SELECT COUNT(*) AS n FROM grev_kayitlari WHERE guild_id = ? AND test = 1').get(String(guildId)).n;
  const kayitlar = db.prepare(`SELECT kullanici_id AS kullaniciId, baslangic, sonuc, vurulan, test
    FROM grev_kayitlari WHERE guild_id = ? ORDER BY baslangic DESC, id DESC LIMIT ?`).all(String(guildId), SON_KAYIT);
  return {
    toplam: say.toplam,
    kisi: say.kisi,
    kazanan: say.kazanan ?? 0,
    kaybeden: say.kaybeden ?? 0,
    yarim: say.yarim ?? 0,
    son: say.son ?? null,
    test,
    sans: GREV_SANSI,
    kayitlar: kayitlar.map((k) => ({ ...k, test: k.test === 1 })),
  };
}
