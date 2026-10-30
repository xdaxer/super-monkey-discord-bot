/**
 * Maymun seferleri: envanterdeki bir maymun 1, 4 ya da 8 saatlik sefere
 * gönderilir, dönünce muz, deneyim ve küçük ihtimalle kasa getirir. Çalışmanın
 * (aktif oyun) yanında boştayken gelir; saatlik getirisi çalışmanın altındadır,
 * uzun sefer saat başına daha az verir.
 *
 *   muz = SEFER_SAATLIK × saat × verim × nadirlik × (1 + %4 × (seviye − 1)) × (1 + Kazanç)
 *   süre = saat × (1 − Dayanıklılık), XP = saat × SEFER_XP_SAATLIK
 *
 * Muz ve XP gönderirken hesaplanır (oyuncu ne getireceğini bilir); kasa zarı,
 * prestij/üyelik çarpanları ve borç kesintisi toplarken uygulanır. Seferdeki
 * maymunun bir kopyası kilitlidir (envanter.js esyaDus). Prestij kartlarla
 * birlikte dönmemiş seferleri de siler.
 *
 * Sayılar docs/para.md "Seferler" bölümüyle birebir aynıdır.
 */

import {
  bakiye, ekle, islem, TURLER,
} from './ekonomi.js';
import { adet, kilitliEsya, seferdekiler } from './envanter.js';
import { kartGetir, kasaVer } from './kasalar.js';
import { borcaKes } from './kredi.js';
import {
  maymunBilgisi, maymunMu, seviyeHesapla, xpVer,
} from './maymun.js';
import { carpanUygula, prestijCarpani } from './prestij-carpan.js';
import { kullaniciGetir } from './seviye.js';
import { uyelikCarpani } from './uyelik-carpan.js';
import { yoneticiCarpani } from './yonetici-carpan.js';

const SAAT = 3_600_000;

export const SEFER_SAATLIK = 40;
export const SEFER_XP_SAATLIK = 4;
export const SEVIYE_ARTISI = 0.04;
export const NADIRLIK_KATSAYISI = Object.freeze({ siradan: 1, nadir: 1.25, destansi: 1.6 });
export const PARLAK_KATSAYISI = 1.2;

/** Sefer süreleri: `verim` saat başı getiriyi, `ahsap`/`demir` kasa olasılığını (0–1) verir. */
export const SEFERLER = Object.freeze([
  {
    kimlik: 'kisa', ad: 'Kısa devriye', emoji: '🥾', saat: 1, verim: 1, ahsap: 0.02, demir: 0.002,
  },
  {
    kimlik: 'orta', ad: 'Orman seferi', emoji: '🌴', saat: 4, verim: 0.85, ahsap: 0.08, demir: 0.01,
  },
  {
    kimlik: 'uzun', ad: 'Büyük balon avı', emoji: '🎈', saat: 8, verim: 0.7, ahsap: 0.15, demir: 0.02,
  },
]);

/** Aynı anda sefer sayısı: Sv 0'da 1, Sv 10'da 2, Sv 25'te 3. */
export const SLOT_ESIKLERI = Object.freeze([0, 10, 25]);

const HARITA = new Map(SEFERLER.map((s) => [s.kimlik, s]));

export function seferGetir(kimlik) {
  return HARITA.get(kimlik) ?? null;
}

export function seferSlotu(seviye) {
  return SLOT_ESIKLERI.filter((e) => seviye >= e).length;
}

/** Bir sonraki slotun açıldığı seviye; hepsi açıksa null. */
export function sonrakiSlotSeviyesi(seviye) {
  return SLOT_ESIKLERI.find((e) => e > seviye) ?? null;
}

/** Maymunun (maymunBilgisi) bu seferden getireceği taban muz, XP ve süre. */
export function seferTahmini(bilgi, sefer) {
  const nadirlik = (NADIRLIK_KATSAYISI[bilgi.kart.nadirlik] ?? 1) * (bilgi.kart.parlak ? PARLAK_KATSAYISI : 1);
  const muz = Math.round(SEFER_SAATLIK * sefer.saat * sefer.verim * nadirlik
    * (1 + SEVIYE_ARTISI * (bilgi.seviye - 1)) * (1 + bilgi.etki.kazanc));
  return {
    muz,
    xp: sefer.saat * SEFER_XP_SAATLIK,
    sureMs: Math.round(sefer.saat * SAAT * (1 - bilgi.etki.sure)),
  };
}

/** Kullanıcının seferleri, en erken döneni önce. */
export function seferListesi(db, guildId, kullaniciId, simdi = Date.now()) {
  return db
    .prepare('SELECT * FROM maymun_seferleri WHERE guild_id = ? AND kullanici_id = ? ORDER BY bitis, id')
    .all(String(guildId), String(kullaniciId))
    .map((s) => ({
      id: s.id,
      kart: kartGetir(s.kart),
      kimlik: s.kart,
      sefer: seferGetir(s.sure),
      muz: s.muz,
      xp: s.xp,
      baslangic: s.baslangic,
      bitis: s.bitis,
      hazir: s.bitis <= simdi,
      kalanMs: Math.max(0, s.bitis - simdi),
    }));
}

/** Dönmüş ama toplanmamış sefer sayısı. */
export function hazirSeferSayisi(db, guildId, kullaniciId, simdi = Date.now()) {
  return db
    .prepare('SELECT COUNT(*) AS n FROM maymun_seferleri WHERE guild_id = ? AND kullanici_id = ? AND bitis <= ?')
    .get(String(guildId), String(kullaniciId), simdi).n;
}

/** Kartın sefere gidebilecek (çalışmaya ve sefere kilitli olmayan) kopya sayısı. */
export function sefereHazirAdet(db, guildId, kullaniciId, kimlik) {
  const calisan = kilitliEsya(db, guildId, kullaniciId) === kimlik ? 1 : 0;
  return adet(db, guildId, kullaniciId, kimlik) - calisan - (seferdekiler(db, guildId, kullaniciId)[kimlik] ?? 0);
}

/**
 * Maymunu sefere gönderir.
 * @returns {{ok: false, sebep: string} | {ok: true, id: number, maymun: object, sefer: object, muz: number, xp: number, bitis: number}}
 */
export function seferGonder(db, {
  guildId, kullaniciId, kimlik, sure, simdi = Date.now(),
}) {
  const sefer = seferGetir(sure);
  if (!sefer) return { ok: false, sebep: 'Böyle bir sefer yok.' };
  const kart = kartGetir(kimlik);
  if (!kart || !maymunMu(kimlik)) return { ok: false, sebep: 'Sefere yalnız maymunlar (kuleler ve kahramanlar) gider.' };

  return islem(db, () => {
    if (adet(db, guildId, kullaniciId, kimlik) < 1) return { ok: false, sebep: `Envanterinde **${kart.ad}** yok.` };
    if (sefereHazirAdet(db, guildId, kullaniciId, kimlik) < 1) {
      return {
        ok: false,
        sebep: `**${kart.ad}** şu an meşgul (çalışıyor ya da seferde). Başka bir maymun gönder ya da çalışan maymunu \`/calis maymun\` ile değiştir.`,
      };
    }
    const seviye = kullaniciGetir(db, guildId, kullaniciId).seviye;
    const slot = seferSlotu(seviye);
    const giden = db.prepare('SELECT COUNT(*) AS n FROM maymun_seferleri WHERE guild_id = ? AND kullanici_id = ?')
      .get(String(guildId), String(kullaniciId)).n;
    if (giden >= slot) {
      const sonraki = sonrakiSlotSeviyesi(seviye);
      return {
        ok: false,
        sebep: `Aynı anda en çok **${slot}** sefer yapabilirsin${sonraki ? ` (Sv ${sonraki}'te bir yer daha açılır)` : ''}. Dönenleri \`/maymun topla\` ile topla.`,
      };
    }

    const maymun = maymunBilgisi(db, guildId, kullaniciId, kimlik);
    const tahmin = seferTahmini(maymun, sefer);
    const bitis = simdi + tahmin.sureMs;
    const { lastInsertRowid } = db.prepare(
      `INSERT INTO maymun_seferleri (guild_id, kullanici_id, kart, sure, muz, xp, baslangic, bitis)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(String(guildId), String(kullaniciId), kimlik, sefer.kimlik, tahmin.muz, tahmin.xp, simdi, bitis);
    return {
      ok: true, id: Number(lastInsertRowid), maymun, sefer, muz: tahmin.muz, xp: tahmin.xp, bitis,
    };
  });
}

/** Sefer kasası zarı: Şans yolunun çarpanıyla Demir ya da Ahşap; yoksa null. */
export function seferKasasi(sefer, carpan = 1, rastgele = Math.random) {
  const zar = rastgele();
  if (zar < sefer.demir * carpan) return 'kasa-demir';
  if (zar < (sefer.demir + sefer.ahsap) * carpan) return 'kasa-ahsap';
  return null;
}

/**
 * Dönmüş bütün seferleri toplar.
 * @returns {{ok: false, sebep: string} | {ok: true, toplanan: object[], toplamMuz: number, bakiye: number}}
 */
export function seferTopla(db, {
  guildId, kullaniciId, simdi = Date.now(), rastgele = Math.random,
}) {
  return islem(db, () => {
    const hazir = seferListesi(db, guildId, kullaniciId, simdi).filter((s) => s.hazir);
    if (hazir.length === 0) return { ok: false, sebep: 'Dönmüş seferin yok.' };

    const carpan = prestijCarpani(db, guildId, kullaniciId) * uyelikCarpani(db, guildId, kullaniciId) * yoneticiCarpani(kullaniciId);
    const toplanan = hazir.map((s) => {
      const once = maymunBilgisi(db, guildId, kullaniciId, s.kimlik);
      const muz = carpanUygula(s.muz, carpan);
      ekle(db, {
        guildId, kullaniciId, miktar: muz, tur: TURLER.sefer, karsiId: s.kimlik, simdi,
      });
      borcaKes(db, guildId, kullaniciId, muz, simdi); // borçluysa gelirin payı borca gider
      const lvl = seviyeHesapla(xpVer(db, guildId, kullaniciId, s.kimlik, s.xp));
      const kasa = seferKasasi(s.sefer, once.etki.kasa, rastgele);
      if (kasa) {
        kasaVer(db, {
          guildId, kullaniciId, kasa, tur: 'sefer', simdi,
        });
      }
      db.prepare('DELETE FROM maymun_seferleri WHERE id = ?').run(s.id);
      return {
        id: s.id, kart: s.kart, sefer: s.sefer, muz, xp: s.xp, ...lvl, seviyeAtladi: lvl.seviye > once.seviye, kasa,
      };
    });
    return {
      ok: true, toplanan, toplamMuz: toplanan.reduce((t, s) => t + s.muz, 0), bakiye: bakiye(db, guildId, kullaniciId),
    };
  });
}

/**
 * Seferi ödülsüz bitirir (maymun hemen döner, kilidi kalkar).
 * @returns {{ok: false, sebep: string} | {ok: true, kart: object}}
 */
export function seferGeri(db, { guildId, kullaniciId, id }) {
  const satir = db
    .prepare('SELECT kart FROM maymun_seferleri WHERE id = ? AND guild_id = ? AND kullanici_id = ?')
    .get(Number(id), String(guildId), String(kullaniciId));
  if (!satir) return { ok: false, sebep: 'Böyle bir seferin yok.' };
  db.prepare('DELETE FROM maymun_seferleri WHERE id = ?').run(Number(id));
  return { ok: true, kart: kartGetir(satir.kart) };
}

/** Kullanıcının bütün seferlerini siler (prestij); silinen sayıyı döner. */
export function seferleriSil(db, guildId, kullaniciId) {
  return Number(db
    .prepare('DELETE FROM maymun_seferleri WHERE guild_id = ? AND kullanici_id = ?')
    .run(String(guildId), String(kullaniciId)).changes);
}
