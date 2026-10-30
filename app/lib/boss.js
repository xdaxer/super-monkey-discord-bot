/**
 * Haftalık boss savaşı: her Cumartesi 20:00'de (Türkiye, UTC+3 sabit) bir BTD
 * bossu çıkar, 48 saat içinde sunucu birlikte yenmeye çalışır.
 *
 * Sayılar docs/para.md "Boss savaşı" bölümüyle birebir aynıdır.
 *
 * Can, gerçekten saldıranlara göre ölçeklenir (2026-10-22 dengesi): ilk iki
 * boss "7 günde ekonomi hareketi olan üye" (110 / 80) üzerinden ~155 bin canla
 * çıktı, ama yalnız 24–27 kişi saldırdı (kişi başı ~2,5 saldırı, ~575 hasar) ve
 * ikisi de canının %90'ı dururken kaçtı. Artık can = beklenen katılımcı
 * (son 3 bossun ortalama katılımcısı) × KISI_CAN × boss ve Elit çarpanı.
 *
 * Para akışı: boss ödülü ve teselli YOKTAN basılan muzdur (`boss` türü,
 * ekonomi panelinde "basılan"). Yenilince her katılımcı KATILIM_MUZ +
 * HASAR_MUZ × kendi hasarını alır (2026-10-23; eski hasar payı havuzu az
 * geliyordu): ortalama ~900 hasarlık katılımcı ~2.800, 48 saat her saat vuran
 * ~23 bin. Kişi başı ödeme başkalarının hasarına bağlı değildir. Kasalar ve son
 * vuruş bunun üstüne küçük, tek seferlik eklerdir (top 3 + son vuruş yalnız 4 kişi).
 *
 * Ödeme tek işlemde ve bir kez: boss satırı koşullu UPDATE ile
 * `aktif` -> `yenildi|kacti` yapılır; değişiklik olmayan çağrı hiçbir şey ödemez.
 */

import { haftaBaslangici } from './siralamalar.js';
import { kartDegeri, kartGetir, kasaVer } from './kasalar.js';
import { envanter } from './envanter.js';
import {
  ekle, islem, TURLER,
} from './ekonomi.js';

const SAAT = 3_600_000;
const GUN = 86_400_000;

/** Çıkış: Cumartesi (Pazartesi'den 5 gün sonra) 20:00 Türkiye. */
export const CIKIS_GUNU = 5;
export const CIKIS_SAATI = 20;
/** Boss kaç saat kalır. */
export const SURE_MS = 48 * SAAT;
/** Kapalıyken kaçırılan çıkışa bu süre içinde dönülürse boss çıkar (kalan süre baştan 48 saat). */
export const TELAFI_MS = 12 * SAAT;
/** Üye başına saldırılar arası bekleme (48 saatte en çok 48 saldırı). */
export const SALDIRI_BEKLEME_MS = 1 * SAAT;
/** "Aktif üye": bu kadar gün içinde ekonomi hareketi olan. */
export const AKTIF_GUN = 7;

/**
 * Can: beklenen katılımcı × KISI_CAN, en az MIN_CAN (boss ve Elit çarpanıyla).
 * Bir katılımcı 1 saatlik beklemeyle ortalama ~4 saldırı, ~900 hasar yapar:
 * normal boss (katılımcı başı 600–900 can) çoğu hafta yenilir, Elit
 * (960–1.440) ancak sıkı katılımla.
 */
export const KISI_CAN = 600;
export const MIN_CAN = 3_000;
/** Beklenen katılımcı: son BAKILAN_BOSS bossun ortalaması; hiç boss yoksa aktif üyenin bu oranı. */
export const BAKILAN_BOSS = 3;
export const ILK_KATILIM_ORANI = 0.3;
export const MIN_KATILIMCI = 5;

/** Elit ihtimali (%) ve can çarpanı (daha çok can = daha çok hasar ödülü). */
export const ELIT_SANS = 0.15;
export const ELIT_CAN_CARPANI = 1.6;

/** Hasar: taban + kart gücü, ±%15 rastgele; %10 kritik (2x). */
export const HASAR_TABAN = 100;
export const HASAR_SAPMA = 0.15;
export const KRITIK_SANS = 0.1;
export const KRITIK_CARPANI = 2;
export const GUC_KART_SAYISI = 5;
/** Kart gücü (nadirlik başına); parlak kart 2 kat. */
export const KART_GUCU = Object.freeze({
  siradan: 10, nadir: 25, destansi: 60, efsanevi: 120, mitik: 250,
});
export const PARLAK_GUC_CARPANI = 2;

/** Yenilme ödülü: katılan herkese KATILIM_MUZ + HASAR_MUZ × hasar, üstüne kasalar. */
export const KATILIM_MUZ = 1_000;
export const HASAR_MUZ = 2;
export const KATILIM_KASASI = 'kasa-ahsap';
/** Sıralama (1., 2., 3.) kasası; Elit'te 1. Elmas olur. */
export const SIRA_KASALARI = Object.freeze(['kasa-altin', 'kasa-altin', 'kasa-altin']);
export const ELIT_BIRINCI_KASASI = 'kasa-elmas';
export const SON_VURUS_MUZ = 2_500;
export const SON_VURUS_KASASI = 'kasa-demir';
/** Kaçma tesellisi: katılan herkese sabit muz. */
export const TESELLI_MUZ = 300;

export const DURUMLAR = Object.freeze({ aktif: 'aktif', yenildi: 'yenildi', kacti: 'kacti' });

/**
 * Altı boss. `can`: can çarpanı. `emoji`: sunucudaki
 * btd_ emojisi (Elit için `elitEmoji`), `yedek`: emoji bulunamazsa simge.
 */
export const BOSSLAR = Object.freeze([
  { kimlik: 'bloonarius', ad: 'Bloonarius', emoji: 'btd_bloonarius', elitEmoji: 'btd_bloonarius_elite', yedek: '🎈', can: 1.0 },
  { kimlik: 'lych', ad: 'Lych', emoji: 'btd_lych', elitEmoji: 'btd_lych_elite', yedek: '💀', can: 1.1 },
  { kimlik: 'vortex', ad: 'Vortex', emoji: 'btd_vortex', elitEmoji: 'btd_vortex_elite', yedek: '🌀', can: 1.2 },
  { kimlik: 'dreadbloon', ad: 'Dreadbloon', emoji: 'btd_dreadbloon', elitEmoji: 'btd_dreadbloon_elite', yedek: '🛡️', can: 1.3 },
  { kimlik: 'phayze', ad: 'Phayze', emoji: 'btd_phayze', elitEmoji: 'btd_phayze_elite', yedek: '👁️', can: 1.4 },
  { kimlik: 'blastapopoulos', ad: 'Blastapopoulos', emoji: 'btd_blastapopoulos', elitEmoji: 'btd_blasta_elite', yedek: '💥', can: 1.5 },
]);

export function bossGetir(kimlik) {
  return BOSSLAR.find((b) => b.kimlik === kimlik) ?? null;
}

/** Bossun (Elit ise Elit sürümün) emoji adı ve yedeği: `emojiCozucu` nesnesi. */
export function bossGorunumu(kimlik, elit) {
  const b = bossGetir(kimlik);
  return {
    emojiAdi: elit ? b.elitEmoji : b.emoji,
    yedek: b.yedek,
    ad: elit ? `Elit ${b.ad}` : b.ad,
  };
}

// ── Zamanlama ──────────────────────────────────────────────────────────────

/** `simdi`den SONRAKİ ilk çıkış anı (UTC ms); tam çıkış anı sonrakine sayılır. */
export function sonrakiCikis(simdi = Date.now()) {
  const bu = haftaBaslangici(simdi) + CIKIS_GUNU * GUN + CIKIS_SAATI * SAAT;
  return bu > simdi ? bu : bu + 7 * GUN;
}

/** `simdi`den önceki (ya da tam o andaki) en son planlı çıkış anı. */
export function sonCikis(simdi = Date.now()) {
  const bu = haftaBaslangici(simdi) + CIKIS_GUNU * GUN + CIKIS_SAATI * SAAT;
  return bu <= simdi ? bu : bu - 7 * GUN;
}

// ── Can ve hasar ───────────────────────────────────────────────────────────

/** Son `AKTIF_GUN` günde ekonomi hareketi olan farklı üye sayısı. */
export function aktifUyeSayisi(db, guildId, simdi = Date.now()) {
  return Number(db
    .prepare('SELECT COUNT(DISTINCT kullanici_id) AS n FROM ekonomi_hareketleri WHERE guild_id = ? AND zaman > ?')
    .get(String(guildId), simdi - AKTIF_GUN * GUN).n);
}

/**
 * Beklenen katılımcı: son `BAKILAN_BOSS` sonuçlanmış bossun ortalama
 * katılımcısı (yuvarlanmış); hiç boss yoksa aktif üyenin `ILK_KATILIM_ORANI`'ı.
 * En az `MIN_KATILIMCI`.
 */
export function beklenenKatilimci(db, guildId, simdi = Date.now()) {
  const sayilar = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM boss_hasarlari h WHERE h.savas_id = s.id) AS n
         FROM boss_savaslari s WHERE s.guild_id = ? AND s.durum != ?
        ORDER BY s.id DESC LIMIT ?`,
    )
    .all(String(guildId), DURUMLAR.aktif, BAKILAN_BOSS)
    .map((s) => Number(s.n));
  const tahmin = sayilar.length > 0
    ? sayilar.reduce((t, n) => t + n, 0) / sayilar.length
    : aktifUyeSayisi(db, guildId, simdi) * ILK_KATILIM_ORANI;
  return Math.max(MIN_KATILIMCI, Math.round(tahmin));
}

/** Beklenen katılımcıya, bossa ve Elit'e göre can. */
export function canHesapla(beklenen, kimlik, elit) {
  const b = bossGetir(kimlik);
  const taban = Math.max(MIN_CAN, beklenen * KISI_CAN);
  return Math.round(taban * b.can * (elit ? ELIT_CAN_CARPANI : 1));
}

/** Envanterdeki en değerli `GUC_KART_SAYISI` farklı kartın güç toplamı. */
export function kartGucu(sahip) {
  const guclar = [];
  for (const [kimlik, n] of Object.entries(sahip)) {
    if (!(n > 0)) continue;
    const kart = kartGetir(kimlik);
    if (!kart) continue;
    guclar.push({
      deger: kartDegeri(kart),
      guc: KART_GUCU[kart.nadirlik] * (kart.parlak ? PARLAK_GUC_CARPANI : 1),
    });
  }
  return guclar
    .sort((a, b) => b.deger - a.deger)
    .slice(0, GUC_KART_SAYISI)
    .reduce((t, g) => t + g.guc, 0);
}

/**
 * Tek saldırının hasarı. `rastgele` [0,1) döndürür; ilk çağrı sapma, ikincisi kritik.
 * @returns {{hasar: number, kritik: boolean, guc: number}}
 */
export function hasarHesapla(guc, rastgele = Math.random) {
  const sapma = 1 + (rastgele() * 2 - 1) * HASAR_SAPMA;
  const kritik = rastgele() < KRITIK_SANS;
  const hasar = Math.max(1, Math.round((HASAR_TABAN + guc) * sapma * (kritik ? KRITIK_CARPANI : 1)));
  return { hasar, kritik, guc };
}

// ── Okuma ──────────────────────────────────────────────────────────────────

export function aktifBoss(db, guildId) {
  return db
    .prepare('SELECT * FROM boss_savaslari WHERE guild_id = ? AND durum = ?')
    .get(String(guildId), DURUMLAR.aktif) ?? null;
}

export function bossBul(db, savasId) {
  return db.prepare('SELECT * FROM boss_savaslari WHERE id = ?').get(savasId) ?? null;
}

/** Hasar sıralaması: çok hasar ilk; eşitlikte önce vuran (kimlik sırası sabit). */
export function hasarSirasi(db, savasId, limit = 1000) {
  return db
    .prepare(
      `SELECT kullanici_id, hasar, saldiri FROM boss_hasarlari WHERE savas_id = ?
       ORDER BY hasar DESC, kullanici_id ASC LIMIT ?`,
    )
    .all(savasId, limit);
}

export function kisiDurumu(db, savasId, kullaniciId) {
  const sira = hasarSirasi(db, savasId);
  const i = sira.findIndex((s) => s.kullanici_id === String(kullaniciId));
  const satir = db
    .prepare('SELECT hasar, saldiri, son_saldiri FROM boss_hasarlari WHERE savas_id = ? AND kullanici_id = ?')
    .get(savasId, String(kullaniciId));
  return {
    hasar: satir?.hasar ?? 0,
    saldiri: satir?.saldiri ?? 0,
    sonSaldiri: satir?.son_saldiri ?? 0,
    sira: i >= 0 ? i + 1 : null,
    katilimci: sira.length,
  };
}

/** Kişinin bir sonraki saldırı anı (hiç vurmadıysa hemen: 0). */
export function sonrakiSaldiri(sonSaldiri) {
  return sonSaldiri > 0 ? sonSaldiri + SALDIRI_BEKLEME_MS : 0;
}

// ── Çıkarma ────────────────────────────────────────────────────────────────

/**
 * Boss çıkarır. Sunucuda aktif boss varsa ya da aynı planlı çıkış zaten
 * kayıtlıysa `null` döner (kısmi tekil indeks + INSERT OR IGNORE).
 * @returns {null | object} oluşan boss satırı
 */
export function bossCikar(db, {
  guildId, kimlik = null, elit = null, cikis = null, rastgele = Math.random, simdi = Date.now(),
}) {
  return islem(db, () => {
    if (aktifBoss(db, guildId)) return null;
    const secilen = kimlik ? bossGetir(kimlik) : BOSSLAR[Math.min(BOSSLAR.length - 1, Math.floor(rastgele() * BOSSLAR.length))];
    const elitMi = elit ?? rastgele() < ELIT_SANS;
    const aktifUye = aktifUyeSayisi(db, guildId, simdi);
    const beklenen = beklenenKatilimci(db, guildId, simdi);
    const can = canHesapla(beklenen, secilen.kimlik, elitMi);

    const { changes, lastInsertRowid } = db.prepare(
      `INSERT OR IGNORE INTO boss_savaslari
         (guild_id, boss, elit, max_can, can, aktif_uye, beklenen, cikis, baslangic, bitis)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(String(guildId), secilen.kimlik, elitMi ? 1 : 0, can, can, aktifUye, beklenen, cikis, simdi, simdi + SURE_MS);
    if (changes === 0) return null;
    return bossBul(db, Number(lastInsertRowid));
  });
}

/**
 * Haftalık çıkış vadesi geldiyse (ya da telafi penceresindeyse) boss çıkarır.
 * Çıkış ayarı, kanal ve sistem denetimi servistedir; burada yalnız zaman.
 * @returns {null | object}
 */
export function vadesiGelenBoss(db, { guildId, rastgele = Math.random, simdi = Date.now() }) {
  const cikis = sonCikis(simdi);
  if (simdi - cikis > TELAFI_MS) return null; // kaçırıldı, pencere geçti
  return bossCikar(db, { guildId, cikis, rastgele, simdi });
}

// ── Saldırı ────────────────────────────────────────────────────────────────

/**
 * Saldırır. Bekleme, hasar yazımı ve (gerekirse) sonuçlandırma tek işlemde.
 * @returns {{ok: false, sebep: string, kalanMs?: number, bitti?: object}
 *   | {ok: true, hasar: number, kritik: boolean, can: number, maxCan: number, sonrakiSaldiri: number, sonVurus: boolean, sonuc: object|null}}
 */
export function saldir(db, {
  guildId, kullaniciId, rastgele = Math.random, simdi = Date.now(),
}) {
  return islem(db, () => {
    const boss = aktifBoss(db, guildId);
    if (!boss) return { ok: false, sebep: 'Şu an aktif bir boss yok.' };
    if (simdi >= boss.bitis) {
      const sonuc = sonuclandir(db, { savasId: boss.id, simdi });
      return { ok: false, sebep: 'Boss kaçtı, bu savaş bitti.', bitti: sonuc };
    }

    const kisi = db
      .prepare('SELECT son_saldiri FROM boss_hasarlari WHERE savas_id = ? AND kullanici_id = ?')
      .get(boss.id, String(kullaniciId));
    const hazirAn = sonrakiSaldiri(kisi?.son_saldiri ?? 0);
    if (hazirAn > simdi) {
      return { ok: false, sebep: 'Henüz dinleniyorsun.', kalanMs: hazirAn - simdi };
    }

    const guc = kartGucu(envanter(db, guildId, kullaniciId));
    const { hasar: ham, kritik } = hasarHesapla(guc, rastgele);
    const hasar = Math.min(ham, boss.can); // son vuruşta taşan hasar sayılmaz
    const canSonra = boss.can - hasar;

    db.prepare('UPDATE boss_savaslari SET can = ? WHERE id = ?').run(canSonra, boss.id);
    db.prepare(
      `INSERT INTO boss_hasarlari (savas_id, kullanici_id, hasar, saldiri, son_saldiri) VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(savas_id, kullanici_id) DO UPDATE SET
         hasar = hasar + excluded.hasar, saldiri = saldiri + 1, son_saldiri = excluded.son_saldiri`,
    ).run(boss.id, String(kullaniciId), hasar, simdi);

    let sonuc = null;
    if (canSonra <= 0) {
      db.prepare('UPDATE boss_savaslari SET son_vurus_id = ? WHERE id = ?').run(String(kullaniciId), boss.id);
      sonuc = sonuclandir(db, { savasId: boss.id, simdi });
    }
    return {
      ok: true, hasar, kritik, guc, can: canSonra, maxCan: boss.max_can,
      sonrakiSaldiri: simdi + SALDIRI_BEKLEME_MS, sonVurus: canSonra <= 0, sonuc,
    };
  });
}

// ── Sonuç ──────────────────────────────────────────────────────────────────

/** Yenilme ödülü (muz, son vuruş eki hariç): katılım + hasar × HASAR_MUZ. */
export function odulHesapla(hasar) {
  return KATILIM_MUZ + HASAR_MUZ * hasar;
}

/**
 * Sıralamada `i`. (0'dan) kişinin ödemesi: yenildiyse katılım + hasar payı,
 * sıra ve son vuruş ekleriyle kasalar; kaçtıysa teselli. `sonuclandir` ödemeyi,
 * Activity bildirimi gösterimi bununla hesaplar ki ikisi ayrışmasın.
 */
export function odemeHesapla(boss, s, i) {
  if (boss.durum === DURUMLAR.kacti) {
    return {
      kullaniciId: s.kullanici_id, hasar: s.hasar, sira: i + 1, muz: TESELLI_MUZ, sonVurus: false, kasalar: [],
    };
  }
  const kasalar = [KATILIM_KASASI];
  if (i < SIRA_KASALARI.length) kasalar.push(i === 0 && boss.elit === 1 ? ELIT_BIRINCI_KASASI : SIRA_KASALARI[i]);
  const sonVurus = boss.son_vurus_id === s.kullanici_id;
  if (sonVurus) kasalar.push(SON_VURUS_KASASI);
  return {
    kullaniciId: s.kullanici_id,
    hasar: s.hasar,
    sira: i + 1,
    muz: odulHesapla(s.hasar) + (sonVurus ? SON_VURUS_MUZ : 0),
    sonVurus,
    kasalar,
  };
}

/** Yenilen savaşta dağıtılan muz (son vuruş eki hariç). */
export function dagitilanHesapla(katilimci, toplamHasar) {
  return katilimci * KATILIM_MUZ + HASAR_MUZ * toplamHasar;
}

/**
 * Savaşı sonuçlandırır: durum koşullu güncellenir (yalnız `aktif` iken), sonra
 * ödenir. Zaten sonuçlanmışsa `null` döner ve hiçbir şey ödenmez.
 * Durum: can <= 0 -> yenildi, aksi halde (süre doldu) kacti.
 * @returns {null | {savas: object, durum: string, katilimci: number, dagitilan: number, odemeler: Array<object>, sonVurusId: string|null}}
 */
export function sonuclandir(db, { savasId, simdi = Date.now() }) {
  return islem(db, () => {
    const boss = bossBul(db, savasId);
    if (!boss) return null;
    const durum = boss.can <= 0 ? DURUMLAR.yenildi : DURUMLAR.kacti;
    if (durum === DURUMLAR.kacti && simdi < boss.bitis) return null; // süre dolmadı

    const { changes } = db
      .prepare('UPDATE boss_savaslari SET durum = ?, sonuc_zaman = ? WHERE id = ? AND durum = ?')
      .run(durum, simdi, savasId, DURUMLAR.aktif);
    if (changes === 0) return null;

    const sira = hasarSirasi(db, savasId);
    const karsiId = `boss-${savasId}`;
    const odemeler = sira.map((s, i) => odemeHesapla({ ...boss, durum }, s, i));
    for (const o of odemeler) {
      ekle(db, {
        guildId: boss.guild_id, kullaniciId: o.kullaniciId, miktar: o.muz, tur: TURLER.boss, karsiId, simdi,
      });
      for (const k of o.kasalar) {
        kasaVer(db, { guildId: boss.guild_id, kullaniciId: o.kullaniciId, kasa: k, tur: 'boss-odul', simdi });
      }
    }
    const yenildi = durum === DURUMLAR.yenildi;
    return {
      savas: bossBul(db, savasId),
      durum,
      katilimci: sira.length,
      dagitilan: yenildi ? dagitilanHesapla(sira.length, sira.reduce((t, s) => t + s.hasar, 0)) : 0,
      odemeler,
      sonVurusId: yenildi ? boss.son_vurus_id : null,
    };
  });
}

/**
 * Kişinin son `pencereMs` içinde sonuçlanan savaştaki ödemesi (katılmadıysa
 * ya da böyle savaş yoksa null). Activity'deki sonuç penceresi için.
 * @returns {null | {savas: object, katilimci: number, odeme: object}}
 */
export function sonSavasOdemesi(db, {
  guildId, kullaniciId, pencereMs = GUN, simdi = Date.now(),
}) {
  const savas = db
    .prepare('SELECT * FROM boss_savaslari WHERE guild_id = ? AND durum != ? AND sonuc_zaman > ? ORDER BY id DESC LIMIT 1')
    .get(String(guildId), DURUMLAR.aktif, simdi - pencereMs);
  if (!savas) return null;
  const sira = hasarSirasi(db, savas.id);
  const i = sira.findIndex((s) => s.kullanici_id === String(kullaniciId));
  if (i < 0) return null;
  return { savas, katilimci: sira.length, odeme: odemeHesapla(savas, sira[i], i) };
}

/** Süresi dolmuş aktif boss varsa sonuçlandırır (bot kapalıyken dolanlar dahil). */
export function suresiDolanlar(db, guildId, simdi = Date.now()) {
  const boss = aktifBoss(db, guildId);
  if (!boss || simdi < boss.bitis) return [];
  const sonuc = sonuclandir(db, { savasId: boss.id, simdi });
  return sonuc ? [sonuc] : [];
}

/** Sonucu duyurulmamış (son 24 saat) savaşlar. */
export function duyurulacaklar(db, guildId, simdi = Date.now()) {
  return db
    .prepare(
      'SELECT * FROM boss_savaslari WHERE guild_id = ? AND durum != ? AND duyuruldu = 0 AND sonuc_zaman > ? ORDER BY id ASC',
    )
    .all(String(guildId), DURUMLAR.aktif, simdi - GUN);
}

/** Koşullu güncelleme: aynı duyuru iki kez işaretlenmez. */
export function duyuruldu(db, savasId) {
  return db.prepare('UPDATE boss_savaslari SET duyuruldu = 1 WHERE id = ? AND duyuruldu = 0').run(savasId).changes > 0;
}

export function mesajKaydet(db, savasId, kanalId, mesajId) {
  db.prepare('UPDATE boss_savaslari SET kanal_id = ?, mesaj_id = ? WHERE id = ?').run(kanalId, mesajId, savasId);
}

/** Mesajı gönderilemeyen yeni boss geri alınır (sonraki turda yeniden denenir). */
export function bossSil(db, savasId) {
  db.prepare('DELETE FROM boss_savaslari WHERE id = ? AND mesaj_id IS NULL AND durum = ?').run(savasId, DURUMLAR.aktif);
}

/** Duyuru için sonuç özeti: hasar sıralaması, ilk 3, toplam hasar. */
export function sonucOzeti(db, savas) {
  const sira = hasarSirasi(db, savas.id);
  const toplamHasar = sira.reduce((t, s) => t + s.hasar, 0);
  return {
    sira,
    ilk3: sira.slice(0, 3),
    katilimci: sira.length,
    toplamHasar,
    dagitilan: savas.durum === DURUMLAR.yenildi ? dagitilanHesapla(sira.length, toplamHasar) : 0,
  };
}
