/**
 * Çekiliş: süreli, butonla katılımlı, tekrarsız kazanan çekilişi.
 *
 * Katılım mesaj tepkisinde değil tabloda tutulur. Gerekçe: tepkiler mesajla
 * birlikte silinebiliyor, kullanıcı tepkisini geri çekebiliyor ve bot kapalıyken
 * eklenen tepkiler kaçırılıyor. Tabloda tutmak, bot yeniden başladığında
 * katılımcı listesinin eksiksiz kalmasını sağlar.
 *
 * Karar mantığı saf: Discord'a hiç istek atmadan çağrılabilir.
 */

export const DURUMLAR = Object.freeze({
  acik: 'acik',
  bitti: 'bitti',
  iptal: 'iptal',
});

/** Çekiliş en az bu kadar sürmeli; daha kısası katılıma vakit bırakmaz. */
export const EN_KISA_MS = 10_000;
/** En uzun süre: bir aydan uzun çekiliş kurtarma taramasını anlamsız uzatır. */
export const EN_UZUN_MS = 30 * 86_400_000;

export const EN_COK_KAZANAN = 20;

const BUTON_ONEKI = 'cekilis:katil:';

export function katilButonId(id) {
  return `${BUTON_ONEKI}${id}`;
}

/** Buton kimliğinden çekiliş numarasını çıkarır; bizim butonumuz değilse null. */
export function butonAyristir(customId) {
  if (typeof customId !== 'string' || !customId.startsWith(BUTON_ONEKI)) return null;
  const id = Number(customId.slice(BUTON_ONEKI.length));
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Çekiliş parametrelerini doğrular.
 * @returns {{ok: true} | {ok: false, sebep: string}}
 */
export function gecerliMi({ sureMs, kazananSayisi, odul }) {
  if (!Number.isFinite(sureMs) || sureMs < EN_KISA_MS) {
    return { ok: false, sebep: 'Süre en az 10 saniye olmalı. Örnek: `10dk`, `2sa`, `3g`.' };
  }
  if (sureMs > EN_UZUN_MS) {
    return { ok: false, sebep: 'Süre en çok 30 gün olabilir.' };
  }
  if (!Number.isInteger(kazananSayisi) || kazananSayisi < 1 || kazananSayisi > EN_COK_KAZANAN) {
    return { ok: false, sebep: `Kazanan sayısı 1 ile ${EN_COK_KAZANAN} arasında olmalı.` };
  }
  if (!String(odul ?? '').trim()) {
    return { ok: false, sebep: 'Ödül boş olamaz.' };
  }
  return { ok: true };
}

export function cekilisEkle(db, { guildId, kanalId, odul, kazananSayisi, bitis, olusturanId }) {
  const sonuc = db.prepare(
    `INSERT INTO cekilisler (guild_id, kanal_id, mesaj_id, odul, kazanan_sayisi, bitis, durum, olusturan_id, kazananlar)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?, NULL)`,
  ).run(String(guildId), String(kanalId), String(odul), kazananSayisi, bitis,
    DURUMLAR.acik, String(olusturanId));

  return Number(sonuc.lastInsertRowid);
}

export function mesajBagla(db, id, mesajId) {
  db.prepare('UPDATE cekilisler SET mesaj_id = ? WHERE id = ?').run(String(mesajId), id);
}

function satirCevir(satir) {
  if (!satir) return null;
  return { ...satir, kazananlar: satir.kazananlar ? JSON.parse(satir.kazananlar) : [] };
}

export function cekilisGetir(db, id) {
  return satirCevir(db.prepare('SELECT * FROM cekilisler WHERE id = ?').get(id));
}

/** Bir sunucudaki açık çekilişler, bitişe göre yakından uzağa. */
export function acikCekilisler(db, guildId = null) {
  const sorgu = guildId
    ? db.prepare('SELECT * FROM cekilisler WHERE durum = ? AND guild_id = ? ORDER BY bitis ASC')
      .all(DURUMLAR.acik, String(guildId))
    : db.prepare('SELECT * FROM cekilisler WHERE durum = ? ORDER BY bitis ASC').all(DURUMLAR.acik);
  return sorgu.map(satirCevir);
}

/**
 * Katılımı değiştirir: katılmamışsa katar, katılmışsa çıkarır.
 * @returns {{katildi: boolean, adet: number}}
 */
export function katilimDegistir(db, cekilisId, kullaniciId, simdi = Date.now()) {
  const var_ = db
    .prepare('SELECT 1 FROM cekilis_katilimlari WHERE cekilis_id = ? AND kullanici_id = ?')
    .get(cekilisId, String(kullaniciId));

  if (var_) {
    db.prepare('DELETE FROM cekilis_katilimlari WHERE cekilis_id = ? AND kullanici_id = ?')
      .run(cekilisId, String(kullaniciId));
  } else {
    db.prepare('INSERT INTO cekilis_katilimlari (cekilis_id, kullanici_id, zaman) VALUES (?, ?, ?)')
      .run(cekilisId, String(kullaniciId), simdi);
  }

  return { katildi: !var_, adet: katilimSayisi(db, cekilisId) };
}

export function katilimcilar(db, cekilisId) {
  return db
    .prepare('SELECT kullanici_id FROM cekilis_katilimlari WHERE cekilis_id = ? ORDER BY zaman ASC')
    .all(cekilisId)
    .map((s) => s.kullanici_id);
}

export function katilimSayisi(db, cekilisId) {
  return db
    .prepare('SELECT COUNT(*) AS adet FROM cekilis_katilimlari WHERE cekilis_id = ?')
    .get(cekilisId)?.adet ?? 0;
}

/**
 * Listeden tekrarsız kazanan seçer (Fisher-Yates ile kısmi karıştırma).
 * İstenen sayı katılımcıdan çoksa olan kadarını döndürür.
 */
export function kazananSec(adaylar, adet, rastgele = Math.random) {
  const havuz = [...adaylar];
  const hedef = Math.min(Math.max(0, Math.floor(adet)), havuz.length);

  for (let i = 0; i < hedef; i += 1) {
    const j = i + Math.floor(rastgele() * (havuz.length - i));
    [havuz[i], havuz[j]] = [havuz[j], havuz[i]];
  }

  return havuz.slice(0, hedef);
}

/**
 * Çekilişi sonuçlandırır ve kazananları kayda yazar.
 *
 * Yalnız açık çekiliş sonuçlanır: aynı çekilişin iki kez çekilmesini bu
 * engeller (ör. zamanlayıcı ile açılıştaki kurtarma aynı anda denerse).
 *
 * @returns {{ok: true, kazananlar: string[], katilimci: number}
 *          | {ok: false, sebep: string}}
 */
export function sonuclandir(db, id, { rastgele = Math.random, simdi = null } = {}) {
  const cekilis = cekilisGetir(db, id);
  if (!cekilis) return { ok: false, sebep: 'bulunamadi' };
  if (cekilis.durum !== DURUMLAR.acik) return { ok: false, sebep: 'zaten-sonuclandi' };
  // Servis turu listeyi okuduktan sonra çekiliş uzatılmış olabilir; taze
  // kayıttaki bitişe bakmazsak uzatılan çekiliş eski süresiyle çekilirdi.
  if (simdi !== null && cekilis.bitis > simdi) return { ok: false, sebep: 'vadesi-gelmedi' };

  const adaylar = katilimcilar(db, id);
  const kazananlar = kazananSec(adaylar, cekilis.kazanan_sayisi, rastgele);

  const yazildi = db.prepare(
    'UPDATE cekilisler SET durum = ?, kazananlar = ? WHERE id = ? AND durum = ?',
  ).run(DURUMLAR.bitti, JSON.stringify(kazananlar), id, DURUMLAR.acik);

  if (yazildi.changes === 0) return { ok: false, sebep: 'zaten-sonuclandi' };

  return { ok: true, kazananlar, katilimci: adaylar.length };
}

/**
 * Sonuçlanmış çekilişten yeni kazanan çeker. Eski kazananlar havuz dışında
 * bırakılır: "yeniden çek" aynı kişiyi tekrar vermemeli.
 *
 * @returns {{ok: true, kazananlar: string[]} | {ok: false, sebep: string}}
 */
export function yenidenCek(db, id, { adet = 1, rastgele = Math.random } = {}) {
  const cekilis = cekilisGetir(db, id);
  if (!cekilis) return { ok: false, sebep: 'bulunamadi' };
  if (cekilis.durum !== DURUMLAR.bitti) return { ok: false, sebep: 'sonuclanmamis' };

  const eski = new Set(cekilis.kazananlar);
  const havuz = katilimcilar(db, id).filter((k) => !eski.has(k));
  if (havuz.length === 0) return { ok: false, sebep: 'aday-yok' };

  const yeniler = kazananSec(havuz, adet, rastgele);
  db.prepare('UPDATE cekilisler SET kazananlar = ? WHERE id = ?')
    .run(JSON.stringify([...cekilis.kazananlar, ...yeniler]), id);

  return { ok: true, kazananlar: yeniler };
}

/**
 * Açık çekilişin bitişini ileri alır.
 *
 * Bitişi geçmiş ama henüz çekilmemiş bir çekilişte (servis turunu bekleyen ya
 * da sistemi kapalı olan) ek süre şimdiden sayılır; yoksa "5dk uzat" geçmişte
 * kalan bir bitiş üretip çekilişi hemen kapatabilirdi.
 *
 * @returns {{ok: true, eskiBitis: number, bitis: number} | {ok: false, sebep: string}}
 */
export function uzat(db, id, ekMs, { simdi = Date.now() } = {}) {
  if (!Number.isFinite(ekMs) || ekMs <= 0) return { ok: false, sebep: 'gecersiz-sure' };

  const cekilis = cekilisGetir(db, id);
  if (!cekilis) return { ok: false, sebep: 'bulunamadi' };
  if (cekilis.durum !== DURUMLAR.acik) return { ok: false, sebep: 'kapali' };

  const bitis = Math.max(cekilis.bitis, simdi) + ekMs;
  if (bitis - simdi > EN_UZUN_MS) return { ok: false, sebep: 'cok-uzun' };

  const yazildi = db.prepare('UPDATE cekilisler SET bitis = ? WHERE id = ? AND durum = ?')
    .run(bitis, id, DURUMLAR.acik);
  if (yazildi.changes === 0) return { ok: false, sebep: 'kapali' };

  return { ok: true, eskiBitis: cekilis.bitis, bitis };
}

export function iptalEt(db, id) {
  const yazildi = db.prepare('UPDATE cekilisler SET durum = ? WHERE id = ? AND durum = ?')
    .run(DURUMLAR.iptal, id, DURUMLAR.acik);
  return yazildi.changes > 0;
}

/** Kazanan listesini okunur metne çevirir. */
export function kazananMetni(kazananlar) {
  if (!kazananlar || kazananlar.length === 0) return '_katılan olmadı_';
  return kazananlar.map((k) => `<@${k}>`).join(', ');
}
