/**
 * Mağaza eşyaları: kasalar, takviyeler, rozetler ve özel renk rolü.
 * (Kasaların içeriği ve açılışı lib/kasalar.js'te.)
 * (Yöneticinin satışa koyduğu roller lib/magaza.js'te.)
 *
 * Katalog ve fiyatlar docs/para.md ile birebir aynıdır. Satın alma tek
 * işlemde yapılır: önce koşullar denetlenir, sonra muz düşülür, sonra eşya
 * verilir; bir adım hata atarsa hepsi geri alınır.
 */

import {
  bakiye, dus, ekle, islem, SERI_KORUYUCU, trGunBaslangici, TURLER,
} from './ekonomi.js';
import { ENERJI_MAKS, enerjiOku, enerjiYaz } from './enerji.js';
import {
  adet, envanter, esyaEkle, esyaHareketi, etkiBitisi, etkiUzat,
} from './envanter.js';
import { etkinlikFiyati } from './etkinlik.js';

const SAAT = 3_600_000;
const GUN = 24 * SAAT;

/** Satın alınabilen ve kasadan çıkabilen her şey. `fiyat: null` satılmaz. */
export const ESYALAR = [
  {
    kimlik: 'xp-iksiri', ad: 'XP İksiri', kategori: 'takviye', tur: 'etki', fiyat: 6000,
    emojiAdi: 'btd_alchemist', yedek: '🧪', sureMs: GUN, maksMs: 7 * GUN,
    aciklama: '24 saat boyunca mesajlardan **2 kat XP**. Tekrar alınırsa süre uzar (en çok 7 gün).',
  },
  {
    kimlik: 'muz-ciftligi', ad: 'Muz Çiftliği', kategori: 'takviye', tur: 'etki', fiyat: 2500,
    emojiAdi: 'btd_banana_farm', yedek: '🌴', sureMs: GUN, maksMs: 7 * GUN,
    aciklama: '24 saat boyunca sohbet muzu **3 kat**. Tekrar alınırsa süre uzar (en çok 7 gün).',
  },
  {
    kimlik: SERI_KORUYUCU, ad: 'Seri Koruyucu', kategori: 'takviye', tur: 'stok', fiyat: 3000,
    emojiAdi: null, yedek: '🛡️', maks: 3,
    aciklama: 'Günlük ödülü kaçırdığın günde serini kendiliğinden korur. En çok 3 tane taşınır.',
  },
  {
    kimlik: 'enerji-totemi', ad: 'Enerji Totemi', kategori: 'takviye', tur: 'enerji', fiyat: 200,
    emojiAdi: 'btd_energizing_totem', yedek: '⚡', gunluk: 40,
    aciklama: '/calis enerjini anında **100**\'e doldurur. Günde en çok 40 kez alınır.',
  },
  ...[
    ['gunluk', 'Günlük Kasa', '🎁', null, 'Her günlük ödülle ve 20. seviyeye kadar tek seviyelerde gelir; satılmaz, hediye edilemez. Az muz ve çoğunlukla sıradan kart.'],
    ['ahsap', 'Ahşap Kasa', '📦', 1_200, 'Sıradan ve nadir kartlar, muz, küçük takviyeler. 20 açılışta en az bir Destansı garanti.'],
    ['demir', 'Demir Kasa', '🧰', 4_000, 'Nadir ve destansı kartlar ağırlıkta, XP iksiri çıkabilir.'],
    ['altin', 'Altın Kasa', '👑', 12_000, 'Destansı ve efsanevi kartlar; Altın Balon rozeti çıkabilir. 10 açılışta en az bir Efsanevi garanti.'],
    ['elmas', 'Elmas Kasa', '💎', 30_000, 'Efsanevi ve mitik kartlar için en iyi şans.'],
  ].map(([k, ad, yedek, fiyat, aciklama]) => ({
    kimlik: `kasa-${k}`, ad, kategori: 'kasa', tur: 'kasa', fiyat, emojiAdi: null, yedek, aciklama,
  })),
  ...[
    // Son sütun: /calis kazancına kalıcı bonus (yüzde). Toplamı %63; ucuz
    // rozetler birkaç haftada, pahalılar yıllarda kendini öder (muz çıkışı kalır).
    ['kirmizi', 'Kırmızı Balon', 'btd_red', 1_000, 2],
    ['mavi', 'Mavi Balon', 'btd_blue', 2_500, 2],
    ['yesil', 'Yeşil Balon', 'btd_green', 5_000, 3],
    ['sari', 'Sarı Balon', 'btd_yellow', 10_000, 3],
    ['pembe', 'Pembe Balon', 'btd_pink', 20_000, 4],
    ['siyah', 'Siyah Balon', 'btd_black', 35_000, 4],
    ['gokkusagi', 'Gökkuşağı Balon', 'btd_rainbow', 60_000, 5],
    ['seramik', 'Seramik Balon', 'btd_ceramic', 100_000, 5],
    ['altin', 'Altın Balon', 'btd_golden', null, 5],
    ['moab', 'M.O.A.B.', 'btd_moab', 250_000, 6],
    ['bfb', 'B.F.B.', 'btd_bfb', 500_000, 6],
    ['zomg', 'Z.O.M.G.', 'btd_zomg', 1_000_000, 8],
    ['bad', 'B.A.D.', 'btd_bad', 2_500_000, 10],
  ].map(([k, ad, emojiAdi, fiyat, calisBonus]) => ({
    kimlik: `rozet-${k}`, ad, kategori: 'rozet', tur: 'rozet', fiyat, emojiAdi, yedek: '🎈', calisBonus,
    aciklama: `**/calis kazancına kalıcı +%${calisBonus}** (rozetler toplanır, prestijde korunur). `
      + (fiyat === null ? 'Satılmaz; yalnız Altın ve Elmas Kasa\'dan çıkar.' : 'Cüzdanında ve rozet rolünde sergilenir.'),
  })),
];

/** Mağazadan tek seferde en çok bu kadar kasa alınır. */
export const KASA_ALIM_SINIRI = 10;

/** Özel renk rolü: ilk alım ve sonraki renk değişimleri. */
export const RENK_FIYAT = 25_000;
export const RENK_DEGISIM = 2_500;

export const KATEGORI_ADLARI = { kasa: 'Kasalar', takviye: 'Takviyeler', rozet: 'Rozetler' };

const ESYA_HARITASI = new Map(ESYALAR.map((e) => [e.kimlik, e]));

export function esyaGetir(kimlik) {
  return ESYA_HARITASI.get(kimlik) ?? null;
}

export function satilikEsyalar() {
  return ESYALAR.filter((e) => e.fiyat !== null);
}

/**
 * Eşyanın emojisi: sunucuda `emojiAdi` adlı emoji varsa o, yoksa yedek.
 * @param {(ad: string) => string|null} [bul] sunucu emojisini metin olarak döner
 */
export function esyaEmoji(esya, bul = () => null) {
  return (esya.emojiAdi && bul(esya.emojiAdi)) || esya.yedek;
}

/** Eşyanın bugün (Türkiye günü) mağazadan kaç kez alındığı. */
export function gunlukAlim(db, guildId, kullaniciId, kimlik, simdi = Date.now()) {
  return db
    .prepare(
      `SELECT COUNT(*) AS n FROM ekonomi_hareketleri
       WHERE guild_id = ? AND kullanici_id = ? AND tur = 'magaza' AND karsi_id = ? AND miktar < 0 AND zaman >= ?`,
    )
    .get(String(guildId), String(kullaniciId), kimlik, trGunBaslangici(simdi)).n;
}

/** Bir eşyanın şu an alınıp alınamayacağı (fiyat dışındaki sınırlar). */
export function alinabilirMi(db, { guildId, kullaniciId, esya, simdi = Date.now() }) {
  if (!esya || esya.fiyat === null) return { ok: false, sebep: 'Bu eşya satılmıyor.' };
  if (esya.tur === 'rozet' && adet(db, guildId, kullaniciId, esya.kimlik) > 0) {
    return { ok: false, sebep: `**${esya.ad}** rozeti zaten koleksiyonunda.` };
  }
  if (esya.tur === 'stok' && adet(db, guildId, kullaniciId, esya.kimlik) >= esya.maks) {
    return { ok: false, sebep: `En çok ${esya.maks} **${esya.ad}** taşıyabilirsin.` };
  }
  if (esya.tur === 'enerji') {
    if (enerjiOku(db, guildId, kullaniciId, simdi) >= ENERJI_MAKS - 1) return { ok: false, sebep: 'Enerjin zaten dolu.' };
    if (gunlukAlim(db, guildId, kullaniciId, esya.kimlik, simdi) >= esya.gunluk) {
      return { ok: false, sebep: `**${esya.ad}** günde en çok ${esya.gunluk} kez alınır; gece yarısı yenilenir.` };
    }
  }
  if (esya.tur === 'etki') {
    const kalan = Math.max(etkiBitisi(db, guildId, kullaniciId, esya.kimlik, simdi) - simdi, 0);
    if (kalan + esya.sureMs > esya.maksMs) {
      return { ok: false, sebep: `**${esya.ad}** en çok 7 gün biriktirilebilir; süren dolunca tekrar al.` };
    }
  }
  return { ok: true };
}

/**
 * Eşyayı verir (ödeme dışında). Kasadan sınırı aşan bir eşya çıkarsa yerine
 * fiyatı kadar muz verir.
 * @returns {{tur: 'muz', miktar: number, yerine?: string} | {tur: 'esya', kimlik: string, adet?: number, bitis?: number}}
 */
export function esyaVer(db, { guildId, kullaniciId, esya, simdi = Date.now() }) {
  // Totemin sınırları satın almada denetlendi (günlük sayaç bu alımı da sayar).
  if (esya.tur === 'enerji') {
    return { tur: 'esya', kimlik: esya.kimlik, enerji: enerjiYaz(db, guildId, kullaniciId, ENERJI_MAKS, simdi) };
  }
  if (!alinabilirMi(db, { guildId, kullaniciId, esya: { ...esya, fiyat: 0 }, simdi }).ok) {
    // Kasadan sınırı aşan bir eşya çıktı: değeri kadar muz.
    const miktar = esya.fiyat ?? 0;
    if (miktar > 0) ekle(db, { guildId, kullaniciId, miktar, tur: TURLER.kazanc, karsiId: esya.kimlik, simdi });
    return { tur: 'muz', miktar, yerine: esya.kimlik };
  }
  if (esya.tur === 'etki') {
    return { tur: 'esya', kimlik: esya.kimlik, bitis: etkiUzat(db, guildId, kullaniciId, esya.kimlik, esya.sureMs, simdi) };
  }
  return { tur: 'esya', kimlik: esya.kimlik, adet: esyaEkle(db, guildId, kullaniciId, esya.kimlik) };
}

/**
 * Eşya satın alır. `adet` yalnız kasalarda 1'den büyük olabilir; kasalar
 * açılmadan envantere girer (`/kasa ac`).
 *
 * @returns {{ok: false, sebep: string}
 *   | {ok: true, esya: object, adet: number, odenen: number, bakiye: number, sonuc: object}}
 */
export function esyaSatinAl(db, {
  guildId, kullaniciId, kimlik, adet: kac = 1, simdi = Date.now(),
}) {
  const esya = esyaGetir(kimlik);
  if (!Number.isSafeInteger(kac) || kac < 1 || kac > KASA_ALIM_SINIRI) {
    return { ok: false, sebep: `Tek seferde 1–${KASA_ALIM_SINIRI} adet alınabilir.` };
  }
  if (kac > 1 && esya?.tur !== 'kasa') return { ok: false, sebep: 'Birden çok adet yalnız kasalarda alınabilir.' };
  const uygun = alinabilirMi(db, { guildId, kullaniciId, esya, simdi });
  if (!uygun.ok) return uygun;

  const odenen = etkinlikFiyati(db, guildId, esya, simdi).fiyat * kac;
  return islem(db, () => {
    const kalan = dus(db, { guildId, kullaniciId, miktar: odenen, tur: TURLER.magaza, karsiId: kimlik, simdi });
    if (kalan === null) return { ok: false, sebep: 'Bakiyen yetmiyor.' };

    const sonuc = esya.tur === 'kasa'
      ? { tur: 'esya', kimlik, adet: esyaEkle(db, guildId, kullaniciId, kimlik, kac) }
      : esyaVer(db, { guildId, kullaniciId, esya, simdi });
    if (esya.tur === 'kasa') {
      esyaHareketi(db, { guildId, kullaniciId, esya: kimlik, adet: kac, tur: 'satin-al', simdi });
    }

    return { ok: true, esya, adet: kac, odenen, sonuc, bakiye: bakiye(db, guildId, kullaniciId) };
  });
}

/** Kullanıcının rozetleri, katalog sırasıyla (en değerlisi sonda). */
export function rozetler(db, guildId, kullaniciId) {
  const sahip = envanter(db, guildId, kullaniciId);
  return ESYALAR.filter((e) => e.tur === 'rozet' && sahip[e.kimlik] > 0);
}

/** Rozetlerin /calis bonusu (yüzde, toplam). */
export function rozetCalisBonusu(db, guildId, kullaniciId) {
  return rozetler(db, guildId, kullaniciId).reduce((t, r) => t + r.calisBonus, 0);
}

// ── Özel renk rolü ─────────────────────────────────────────────────────────

/**
 * "#ff8800", "ff8800" ya da "#f80" → sayı. Siyah (0) Discord'da "renksiz"
 * demek olduğu için reddedilir.
 * @returns {number|null}
 */
export function renkAyristir(metin) {
  let hex = String(metin ?? '').trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(hex)) hex = [...hex].map((h) => h + h).join('');
  if (!/^[0-9a-f]{6}$/.test(hex)) return null;
  const sayi = Number.parseInt(hex, 16);
  return sayi === 0 ? null : sayi;
}

export function renkMetni(sayi) {
  return `#${sayi.toString(16).padStart(6, '0')}`;
}

export function ozelRolGetir(db, guildId, kullaniciId) {
  return db
    .prepare('SELECT rol_id, renk FROM ozel_roller WHERE guild_id = ? AND kullanici_id = ?')
    .get(String(guildId), String(kullaniciId)) ?? null;
}

/**
 * Özel renk rolünü satın alır ya da rengini değiştirir. Discord işleri
 * dışarıdan verilir; hata atarlarsa muz iade edilir.
 *
 * @param {object} p
 * @param {(rolId: string) => Promise<object|null>} p.rolBul kayıtlı rol hâlâ var mı
 * @param {(renk: number) => Promise<{id: string}>} p.rolOlustur rolü açıp üyeye verir
 * @param {(rol: object, renk: number) => Promise<void>} p.rolRenkle var olan rolü boyar
 * @returns {Promise<{ok: false, sebep: string} | {ok: true, yeni: boolean, fiyat: number, rolId: string, bakiye: number}>}
 */
export async function renkSatinAl(db, {
  guildId, kullaniciId, renk, rolBul, rolOlustur, rolRenkle, simdi = Date.now(),
}) {
  const kayit = ozelRolGetir(db, guildId, kullaniciId);
  const rol = kayit ? await rolBul(kayit.rol_id) : null;
  if (rol && kayit.renk === renk) return { ok: false, sebep: 'Rolün zaten bu renkte.' };

  const fiyat = rol ? RENK_DEGISIM : RENK_FIYAT;
  const kalan = dus(db, { guildId, kullaniciId, miktar: fiyat, tur: TURLER.magaza, karsiId: 'renk-rolu', simdi });
  if (kalan === null) return { ok: false, sebep: `Bakiyen yetmiyor: bu işlem ${fiyat.toLocaleString('tr-TR')} muz.` };

  let rolId;
  try {
    if (rol) {
      await rolRenkle(rol, renk);
      rolId = rol.id;
    } else {
      rolId = (await rolOlustur(renk)).id;
    }
  } catch {
    ekle(db, { guildId, kullaniciId, miktar: fiyat, tur: TURLER.iade, karsiId: 'renk-rolu', simdi });
    return { ok: false, sebep: 'Rol ayarlanamadı (botun yetkisi yetmiyor olabilir); muzun iade edildi.' };
  }

  db.prepare(
    `INSERT INTO ozel_roller (guild_id, kullanici_id, rol_id, renk) VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id, kullanici_id) DO UPDATE SET rol_id = excluded.rol_id, renk = excluded.renk`,
  ).run(String(guildId), String(kullaniciId), String(rolId), renk);

  return { ok: true, yeni: !rol, fiyat, rolId, bakiye: kalan };
}
