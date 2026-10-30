/**
 * Maymun çiftlikleri: Sv 5'te açılan pasif gelir alanı (Activity → Çiftlik).
 * Oyuncu haritadaki arsalara Muz Çiftliği kurar; çiftlik **saniye başına**
 * muz üretip deposunda biriktirir, oyuncu gelip toplar. Çiftlik BTD6'daki gibi
 * üç yolda yükseltilir (bir yol 5'e, ikincisi en çok 2'ye; üçüncüsü kapalı):
 *
 *   Üretim (üst):  ham hız çarpanı.
 *   Depo (orta):   daha uzun depo + çarpan; seyrek uğrayana.
 *   Pazar (alt):   en yüksek çarpan ama kısa depo; sık uğrayana. 2. kademe
 *                  satış iadesini %70'ten %90'a çıkarır.
 *
 *   hız (muz/sn) = TABAN_HIZ × Π yol çarpanı
 *   birikmiş     = en az(hız × geçen sn, hız × depo sn)
 *
 * Denge kararları:
 *  - Gelir yatırımdan gelir: üyelik/yönetici çarpanı uygulanmaz. Prestij
 *    çarpanı üretim hızını artırır (2026-10-26'dan beri; depo saati aynı
 *    kalır, muz kapasitesi hızla büyür). Borçluysa toplanan muzun payı borca
 *    gider (kredi.js borcaKes).
 *  - Depo dolunca üretim durur; Pazar yolu çok kazandırır ama sık uğramayı ister.
 *  - Yükseltmeden ve satıştan önce birikmiş toplanır; yeni hız geriye işlemez.
 *  - Satış harcananın %70'ini (Muz Kurtarma ile %90) geri verir: kur-sat ile
 *    muz basılamaz, arsa değiştirmek ucuz kalır.
 *  - Üye arsası (YouTube Katıl): üyelik bitince o çiftlik durur.
 *  - Prestijde çiftlikler satılır: depodaki muz ve satış değeri prestijden
 *    sonraki yeni cüzdana aktarılır (ciftlikleriDevret, prestij.js).
 *
 * Sayılar docs/para.md "Maymun çiftlikleri" bölümüyle birebir aynıdır.
 */

import {
  bakiye, dus, ekle, islem, TURLER,
} from './ekonomi.js';
import { borcaKes } from './kredi.js';
import { YOL_TAVANI, yukseltmeAyristir, yukseltmeGecerliMi } from './maymun.js';
import { prestijCarpani } from './prestij-carpan.js';
import { kullaniciGetir } from './seviye.js';
import { uyelikKademesi } from './uyelik-carpan.js';

const SN = 1000;

/** Çiftlik alanının açıldığı seviye. */
export const KILIT_SEVIYESI = 5;
/** Yükseltilmemiş çiftliğin hızı (muz/sn; saatte 28,8) ve deposu (saat). */
export const TABAN_HIZ = 0.008;
export const TABAN_DEPO_SAAT = 12;
/** Satışta harcananın geri dönen payı; Muz Kurtarma (Pazar 2+) ile yüksek olanı. */
export const SATIS_ORANI = 0.7;
export const KURTARMA_SATIS_ORANI = 0.9;

/** Normal arsalar: kurma bedeli ve gereken seviye (haritada üstte 4, altta 3). */
export const ARSALAR = Object.freeze([
  { bedel: 3_000, seviye: 5 },
  { bedel: 8_000, seviye: 8 },
  { bedel: 15_000, seviye: 12 },
  { bedel: 25_000, seviye: 16 },
  { bedel: 40_000, seviye: 22 },
  { bedel: 60_000, seviye: 30 },
  { bedel: 85_000, seviye: 40 },
]);
/** Üyelere özel ek arsa (son arsa numarası; haritada sağ alt). */
export const UYE_ARSASI = Object.freeze({ bedel: 5_000, seviye: KILIT_SEVIYESI, uye: true });
export const UYE_ARSA_NO = ARSALAR.length;

/**
 * Yükseltme yolları (BTD6 Muz Çiftliği). Kademe alanları birikimli değildir,
 * o kademedeki toplam etkidir: `carpan` hız çarpanı, `depo` deponun saati
 * (Depo yolu), `depoKatsayi` depoyu kısaltır (Pazar 3+), `satis` satış oranı.
 * `simge`: Activity'deki yükseltme simgesi (public/ciftlik/simge/<simge>.webp).
 */
export const YOLLAR = Object.freeze([
  {
    kimlik: 'uretim',
    ad: 'Üretim',
    kademeler: [
      { ad: 'Artan Üretim', aciklama: 'Ağaçlar daha çok muz verir: üretim ×1,3.', bedel: 1_500, carpan: 1.3 },
      { ad: 'Büyük Üretim', aciklama: 'Üretim ×1,6.', bedel: 3_500, carpan: 1.6 },
      { ad: 'Muz Plantasyonu', aciklama: 'Koca bir plantasyon: üretim ×2,6.', bedel: 9_000, carpan: 2.6 },
      { ad: 'Muz Araştırma Tesisi', aciklama: 'Bilimle yetişen muz: üretim ×4,5.', bedel: 24_000, carpan: 4.5 },
      { ad: 'Muz Merkezi', aciklama: 'Muz üretiminin kalbi: üretim ×8.', bedel: 60_000, carpan: 8 },
    ],
  },
  {
    kimlik: 'depo',
    ad: 'Depo',
    kademeler: [
      { ad: 'Uzun Ömürlü Muzlar', aciklama: 'Muzlar çürümez: depo 24 saat.', bedel: 1_200, carpan: 1, depo: 24 },
      { ad: 'Değerli Muzlar', aciklama: 'Üretim ×1,3, depo 24 saat.', bedel: 3_000, carpan: 1.3, depo: 24 },
      { ad: 'Maymun Bankası', aciklama: 'Muzlar bankada birikir: üretim ×2,2, depo 36 saat.', bedel: 8_000, carpan: 2.2, depo: 36 },
      { ad: 'IMF Kredisi', aciklama: 'Üretim ×3,6, depo 48 saat.', bedel: 22_000, carpan: 3.6, depo: 48 },
      { ad: 'Maymunomi', aciklama: 'Muz ekonomisinin efendisi: üretim ×6,5, depo 72 saat.', bedel: 55_000, carpan: 6.5, depo: 72 },
    ],
  },
  {
    kimlik: 'pazar',
    ad: 'Pazar',
    kademeler: [
      { ad: 'EZ Toplama', aciklama: 'Muzlar kolay toplanır: üretim ×1,15.', bedel: 1_500, carpan: 1.15 },
      { ad: 'Muz Kurtarma', aciklama: 'Üretim ×1,35; satınca harcananın %90\'ı geri döner.', bedel: 3_500, carpan: 1.35, satis: KURTARMA_SATIS_ORANI },
      { ad: 'Pazar Yeri', aciklama: 'Muzlar tezgâhta satılır: üretim ×3, depo ⅔ kısalır.', bedel: 9_000, carpan: 3, depoKatsayi: 2 / 3, satis: KURTARMA_SATIS_ORANI },
      { ad: 'Merkez Pazar', aciklama: 'Üretim ×5, depo yarıya iner.', bedel: 25_000, carpan: 5, depoKatsayi: 1 / 2, satis: KURTARMA_SATIS_ORANI },
      { ad: 'Maymun Wall Street', aciklama: 'Borsa açıldı: üretim ×9, depo ⅓\'e iner. Sık uğra!', bedel: 65_000, carpan: 9, depoKatsayi: 1 / 3, satis: KURTARMA_SATIS_ORANI },
    ],
  },
]);
const SIMGE_ONEKI = ['u', 'd', 'p'];

const kademe = (yol, n) => (n > 0 ? YOLLAR[yol].kademeler[n - 1] : null);

/**
 * Yolların toplam etkisi: hız (muz/sn), depo (saat ve muz), satış oranı.
 * `prestij`: sahibinin prestij çarpanı; hızı çarpar, `carpan` yalnız yollarındır.
 */
export function ciftlikEtkisi(yollar, prestij = 1) {
  const carpan = yollar.reduce((t, n, i) => t * (kademe(i, n)?.carpan ?? 1), 1);
  const depoSaat = (kademe(1, yollar[1])?.depo ?? TABAN_DEPO_SAAT) * (kademe(2, yollar[2])?.depoKatsayi ?? 1);
  const hiz = TABAN_HIZ * carpan * prestij;
  return {
    carpan,
    hiz,
    depoSaat,
    kapasite: hiz * depoSaat * 3600,
    satisOrani: kademe(2, yollar[2])?.satis ?? SATIS_ORANI,
  };
}

/** Haritada ve panelde gösterilen görsel: en yüksek yolun saf kademesi ("300", "050"…). */
export function gorselKodu(yollar) {
  const en = Math.max(...yollar);
  if (en === 0) return '000';
  const yol = yollar.indexOf(en);
  return [0, 1, 2].map((i) => (i === yol ? en : 0)).join('');
}

/** Çiftliğin adı: en yüksek yolun kademe adı, yükseltilmemişse "Muz Çiftliği". */
export function ciftlikAdi(yollar) {
  const en = Math.max(...yollar);
  return en === 0 ? 'Muz Çiftliği' : kademe(yollar.indexOf(en), en).ad;
}

/** Bir yolun sonraki kademesi ve engeli: 'tavan' (5'te) ya da 'capraz' (BTD6 kuralı). */
export function sonrakiKademe(yollar, yol) {
  const n = yollar[yol] + 1;
  if (n > YOL_TAVANI) return { kademe: null, engel: 'tavan' };
  const yeni = yollar.map((x, i) => (i === yol ? n : x));
  return { kademe: n, ...kademe(yol, n), engel: yukseltmeGecerliMi(yeni) ? null : 'capraz' };
}

/** Arsanın tanımı (normal ya da üye); yoksa null. */
export function arsaGetir(no) {
  if (no === UYE_ARSA_NO) return UYE_ARSASI;
  return ARSALAR[no] ?? null;
}

/** Depoda biriken muz (kesirli), depoyla sınırlı. */
export function birikmisHesapla(ciftlik, simdi) {
  const { hiz, kapasite } = ciftlikEtkisi(ciftlik.yollar, ciftlik.prestij);
  return Math.min(kapasite, (hiz * Math.max(0, simdi - ciftlik.sonToplama)) / SN);
}

function satirlar(db, guildId, kullaniciId) {
  const prestij = prestijCarpani(db, guildId, kullaniciId);
  return db
    .prepare('SELECT arsa, yollar, harcanan, son_toplama, kurulus FROM ciftlikler WHERE guild_id = ? AND kullanici_id = ? ORDER BY arsa')
    .all(String(guildId), String(kullaniciId))
    .map((s) => ({
      arsa: s.arsa, yollar: yukseltmeAyristir(s.yollar), harcanan: s.harcanan, sonToplama: s.son_toplama, kurulus: s.kurulus, prestij,
    }));
}

function oyuncuBilgisi(db, guildId, kullaniciId) {
  return {
    seviye: kullaniciGetir(db, guildId, kullaniciId).seviye,
    uye: uyelikKademesi(db, guildId, kullaniciId) !== null,
  };
}

/** Arsa bu oyuncuya açık mı; değilse nedeni. */
function arsaEngeli(arsa, oyuncu) {
  if (arsa.uye && !oyuncu.uye) return 'Bu arsa YouTube Katıl üyelerine özel.';
  if (oyuncu.seviye < arsa.seviye) return `Bu arsa **Sv ${arsa.seviye}**'te açılır.`;
  return null;
}

const durduMu = (no, oyuncu) => Boolean(arsaGetir(no)?.uye && !oyuncu.uye);
const yuvarla = (n) => Math.floor(n * 100) / 100;

function ciftlikGorunumu(c, oyuncu, simdi) {
  const etki = ciftlikEtkisi(c.yollar, c.prestij);
  return {
    yollar: c.yollar,
    gorsel: gorselKodu(c.yollar),
    ad: ciftlikAdi(c.yollar),
    hiz: etki.hiz,
    depoSaat: etki.depoSaat,
    kapasite: yuvarla(etki.kapasite),
    birikmis: yuvarla(birikmisHesapla(c, simdi)),
    sonToplama: c.sonToplama,
    kurulus: c.kurulus,
    harcanan: c.harcanan,
    satisOrani: etki.satisOrani,
    satisDegeri: Math.floor(c.harcanan * etki.satisOrani),
    durdu: durduMu(c.arsa, oyuncu),
    yolDurumu: YOLLAR.map((y, i) => {
      const simdiki = kademe(i, c.yollar[i]);
      const s = sonrakiKademe(c.yollar, i);
      return {
        yol: y.kimlik,
        ad: y.ad,
        kademe: c.yollar[i],
        simdi: simdiki ? { ad: simdiki.ad, simge: `${SIMGE_ONEKI[i]}${c.yollar[i]}` } : null,
        sonraki: s.kademe ? {
          kademe: s.kademe, ad: s.ad, aciklama: s.aciklama, bedel: s.bedel, simge: `${SIMGE_ONEKI[i]}${s.kademe}`,
        } : null,
        engel: s.engel,
      };
    }),
  };
}

/** Ekranın bütün verisi: oyuncu, arsalar (çiftlikleriyle) ve toplamlar. */
export function ciftlikDurumu(db, guildId, kullaniciId, simdi = Date.now()) {
  const oyuncu = oyuncuBilgisi(db, guildId, kullaniciId);
  const kurulu = new Map(satirlar(db, guildId, kullaniciId).map((c) => [c.arsa, c]));
  const arsalar = [...ARSALAR, UYE_ARSASI].map((a, no) => {
    const c = kurulu.get(no);
    const engel = arsaEngeli(a, oyuncu);
    return {
      no, uye: Boolean(a.uye), bedel: a.bedel, seviye: a.seviye, acik: engel === null, engel, ciftlik: c ? ciftlikGorunumu(c, oyuncu, simdi) : null,
    };
  });
  const calisan = arsalar.filter((a) => a.ciftlik && !a.ciftlik.durdu);
  return {
    kilitli: oyuncu.seviye < KILIT_SEVIYESI,
    kilitSeviyesi: KILIT_SEVIYESI,
    oyuncuSeviyesi: oyuncu.seviye,
    uye: oyuncu.uye,
    taban: { hiz: TABAN_HIZ, depoSaat: TABAN_DEPO_SAAT, satisOrani: SATIS_ORANI },
    prestij: prestijCarpani(db, guildId, kullaniciId),
    arsalar,
    hiz: calisan.reduce((t, a) => t + a.ciftlik.hiz, 0),
    birikmis: yuvarla(calisan.reduce((t, a) => t + a.ciftlik.birikmis, 0)),
  };
}

function kilitDenetle(oyuncu) {
  return oyuncu.seviye < KILIT_SEVIYESI ? `Maymun çiftlikleri **Sv ${KILIT_SEVIYESI}**'te açılır (sen Sv ${oyuncu.seviye}).` : null;
}

function ciftlikBul(db, guildId, kullaniciId, no) {
  return satirlar(db, guildId, kullaniciId).find((x) => x.arsa === no) ?? null;
}

/**
 * Boş arsaya yükseltilmemiş çiftlik kurar.
 * @returns {{ok: false, sebep: string} | {ok: true, arsa: number, bedel: number, bakiye: number}}
 */
export function ciftlikKur(db, {
  guildId, kullaniciId, arsa: no, simdi = Date.now(),
}) {
  return islem(db, () => {
    const oyuncu = oyuncuBilgisi(db, guildId, kullaniciId);
    const kilit = kilitDenetle(oyuncu);
    if (kilit) return { ok: false, sebep: kilit };
    const arsa = arsaGetir(no);
    if (!arsa) return { ok: false, sebep: 'Böyle bir arsa yok.' };
    const engel = arsaEngeli(arsa, oyuncu);
    if (engel) return { ok: false, sebep: engel };
    if (ciftlikBul(db, guildId, kullaniciId, no)) return { ok: false, sebep: 'Bu arsada zaten bir çiftliğin var.' };

    const kalan = dus(db, {
      guildId, kullaniciId, miktar: arsa.bedel, tur: TURLER.ciftlik, karsiId: `kur-${no}`, simdi,
    });
    if (kalan === null) return { ok: false, sebep: 'Bakiyen bu çiftliği kurmaya yetmiyor.' };
    db.prepare(
      `INSERT INTO ciftlikler (guild_id, kullanici_id, arsa, seviye, yollar, harcanan, son_toplama, kurulus)
       VALUES (?, ?, ?, 1, '0-0-0', ?, ?, ?)`,
    ).run(String(guildId), String(kullaniciId), no, arsa.bedel, simdi, simdi);
    return {
      ok: true, arsa: no, bedel: arsa.bedel, bakiye: kalan,
    };
  });
}

/** Çiftliğin birikmişinin tam kısmını yatırır (işlem içinde); toplanan muzu döner. */
function hasat(db, guildId, kullaniciId, c, simdi) {
  const { hiz, kapasite } = ciftlikEtkisi(c.yollar, c.prestij);
  const birikmis = birikmisHesapla(c, simdi);
  const muz = Math.floor(birikmis);
  // Depo dolmadıysa artan kesir kaybolmasın: saat, toplanan muz kadar ilerler.
  const yeniZaman = birikmis >= kapasite ? simdi : Math.min(simdi, c.sonToplama + Math.ceil((muz / hiz) * SN));
  db.prepare('UPDATE ciftlikler SET son_toplama = ? WHERE guild_id = ? AND kullanici_id = ? AND arsa = ?')
    .run(yeniZaman, String(guildId), String(kullaniciId), c.arsa);
  if (muz > 0) {
    ekle(db, {
      guildId, kullaniciId, miktar: muz, tur: TURLER.ciftlik, karsiId: `hasat-${c.arsa}`, simdi,
    });
    borcaKes(db, guildId, kullaniciId, muz, simdi); // borçluysa gelirin payı borca gider
  }
  return muz;
}

/**
 * Birikmiş muzu toplar: `arsa` verilirse yalnız o çiftlik, yoksa hepsi.
 * Duran (üyeliği bitmiş) çiftlik atlanır.
 * @returns {{ok: false, sebep: string} | {ok: true, toplanan: Array<{arsa: number, muz: number}>, toplam: number, bakiye: number}}
 */
export function ciftlikTopla(db, {
  guildId, kullaniciId, arsa = null, simdi = Date.now(),
}) {
  return islem(db, () => {
    const oyuncu = oyuncuBilgisi(db, guildId, kullaniciId);
    const kilit = kilitDenetle(oyuncu);
    if (kilit) return { ok: false, sebep: kilit };
    const hepsi = satirlar(db, guildId, kullaniciId);
    const secilen = arsa === null ? hepsi : hepsi.filter((c) => c.arsa === arsa);
    if (arsa !== null && secilen.length === 0) return { ok: false, sebep: 'Bu arsada çiftliğin yok.' };
    const calisan = secilen.filter((c) => !durduMu(c.arsa, oyuncu));
    if (calisan.length === 0) return { ok: false, sebep: 'Bu çiftlik üyeliğin bittiği için durdu.' };

    const toplanan = calisan
      .map((c) => ({ arsa: c.arsa, muz: hasat(db, guildId, kullaniciId, c, simdi) }))
      .filter((t) => t.muz > 0);
    const toplam = toplanan.reduce((t, x) => t + x.muz, 0);
    if (toplam === 0) return { ok: false, sebep: 'Depoda henüz 1 muz bile birikmedi.' };
    return {
      ok: true, toplanan, toplam, bakiye: bakiye(db, guildId, kullaniciId),
    };
  });
}

/**
 * Çiftliğin bir yolunu bir kademe yükseltir; önce birikmiş muzu toplar.
 * @returns {{ok: false, sebep: string} | {ok: true, arsa: number, yol: number, kademe: number, ad: string, bedel: number, toplanan: number, bakiye: number}}
 */
export function ciftlikYukselt(db, {
  guildId, kullaniciId, arsa: no, yol, simdi = Date.now(),
}) {
  return islem(db, () => {
    const oyuncu = oyuncuBilgisi(db, guildId, kullaniciId);
    const kilit = kilitDenetle(oyuncu);
    if (kilit) return { ok: false, sebep: kilit };
    if (!YOLLAR[yol]) return { ok: false, sebep: 'Böyle bir yükseltme yolu yok.' };
    const c = ciftlikBul(db, guildId, kullaniciId, no);
    if (!c) return { ok: false, sebep: 'Bu arsada çiftliğin yok.' };
    if (durduMu(no, oyuncu)) return { ok: false, sebep: 'Bu çiftlik üyeliğin bittiği için durdu.' };
    const s = sonrakiKademe(c.yollar, yol);
    if (s.engel === 'tavan') return { ok: false, sebep: `${YOLLAR[yol].ad} yolu zaten en üstte.` };
    if (s.engel === 'capraz') return { ok: false, sebep: 'Bu yol kapalı: bir yol 5\'e, ikinci yol en çok 2\'ye çıkar, üçüncüsü kapalı kalır.' };
    if (bakiye(db, guildId, kullaniciId) < s.bedel) return { ok: false, sebep: 'Bakiyen bu yükseltmeye yetmiyor.' };

    // Önce eski hızla biriken toplanır (yükseltme geriye işlemez); sonra bedel düşülür.
    const toplanan = hasat(db, guildId, kullaniciId, c, simdi);
    const kalan = dus(db, {
      guildId, kullaniciId, miktar: s.bedel, tur: TURLER.ciftlik, karsiId: `yukselt-${no}`, simdi,
    });
    // Borca kesinti toplananın payıdır, bakiye denetlenenin altına inmez; yine de düşemezse işlem geri alınır.
    if (kalan === null) throw new Error('Yükseltme bedeli düşülemedi');
    const yeni = c.yollar.map((x, i) => (i === yol ? s.kademe : x)).join('-');
    db.prepare('UPDATE ciftlikler SET yollar = ?, harcanan = harcanan + ? WHERE guild_id = ? AND kullanici_id = ? AND arsa = ?')
      .run(yeni, s.bedel, String(guildId), String(kullaniciId), no);
    return {
      ok: true, arsa: no, yol, kademe: s.kademe, ad: s.ad, bedel: s.bedel, toplanan, bakiye: kalan,
    };
  });
}

/**
 * Çiftliği satar: önce birikmiş toplanır, harcananın satış oranı kadarı
 * geri verilir, arsa boşalır.
 * @returns {{ok: false, sebep: string} | {ok: true, arsa: number, iade: number, toplanan: number, bakiye: number}}
 */
export function ciftlikSat(db, {
  guildId, kullaniciId, arsa: no, simdi = Date.now(),
}) {
  return islem(db, () => {
    const oyuncu = oyuncuBilgisi(db, guildId, kullaniciId);
    const kilit = kilitDenetle(oyuncu);
    if (kilit) return { ok: false, sebep: kilit };
    const c = ciftlikBul(db, guildId, kullaniciId, no);
    if (!c) return { ok: false, sebep: 'Bu arsada çiftliğin yok.' };

    const toplanan = durduMu(no, oyuncu) ? 0 : hasat(db, guildId, kullaniciId, c, simdi);
    const iade = Math.floor(c.harcanan * ciftlikEtkisi(c.yollar).satisOrani);
    db.prepare('DELETE FROM ciftlikler WHERE guild_id = ? AND kullanici_id = ? AND arsa = ?')
      .run(String(guildId), String(kullaniciId), no);
    if (iade > 0) {
      ekle(db, {
        guildId, kullaniciId, miktar: iade, tur: TURLER.ciftlik, karsiId: `sat-${no}`, simdi,
      });
    }
    return {
      ok: true, arsa: no, iade, toplanan, bakiye: bakiye(db, guildId, kullaniciId),
    };
  });
}

/** Çiftliğin prestijde cüzdana geçecek değeri: depodaki muz (duran üye arsası hariç) + satış değeri. */
function devirDegeri(c, oyuncu, simdi) {
  const depo = durduMu(c.arsa, oyuncu) ? 0 : Math.floor(birikmisHesapla(c, simdi));
  return depo + Math.floor(c.harcanan * ciftlikEtkisi(c.yollar).satisOrani);
}

/** Prestij yapılsa çiftliklerden yeni cüzdana geçecek muz (bilgi ekranı). */
export function ciftlikDevirToplami(db, guildId, kullaniciId, simdi = Date.now()) {
  const oyuncu = oyuncuBilgisi(db, guildId, kullaniciId);
  return satirlar(db, guildId, kullaniciId).reduce((t, c) => t + devirDegeri(c, oyuncu, simdi), 0);
}

/**
 * Prestij (işlem içinde, cüzdan sıfırlandıktan sonra): bütün çiftlikleri
 * satar, değerlerini cüzdana `prestij-<arsa>` olarak yazar; seviye kilidi
 * aranmaz.
 * @returns {{ciftlik: number, muz: number}}
 */
export function ciftlikleriDevret(db, guildId, kullaniciId, simdi = Date.now()) {
  const oyuncu = oyuncuBilgisi(db, guildId, kullaniciId);
  const hepsi = satirlar(db, guildId, kullaniciId);
  let muz = 0;
  for (const c of hepsi) {
    const deger = devirDegeri(c, oyuncu, simdi);
    db.prepare('DELETE FROM ciftlikler WHERE guild_id = ? AND kullanici_id = ? AND arsa = ?')
      .run(String(guildId), String(kullaniciId), c.arsa);
    if (deger > 0) {
      ekle(db, {
        guildId, kullaniciId, miktar: deger, tur: TURLER.ciftlik, karsiId: `prestij-${c.arsa}`, simdi,
      });
    }
    muz += deger;
  }
  return { ciftlik: hepsi.length, muz };
}

/** Eski 10 seviyeli sistemde 2.–10. seviyelere çıkma bedelleri (geçiş iadesi için). */
export const ESKI_SEVIYE_BEDELLERI = Object.freeze([0, 2_000, 3_500, 5_500, 8_000, 11_000, 15_000, 20_000, 26_000, 34_000]);

/**
 * Bir kerelik geçiş (2026-10-23): eski seviyeli çiftliklerin yükseltme
 * harcaması sahibine iade edilir, çiftlik yükseltilmemiş (0-0-0) kalır.
 * Tekrar çalışırsa hiçbir şey yapmaz (seviye 1'e çekilir).
 * @returns {Array<{guildId: string, kullaniciId: string, arsa: number, iade: number}>}
 */
export function eskiSeviyeleriIadeEt(db, simdi = Date.now()) {
  return islem(db, () => db
    .prepare('SELECT guild_id, kullanici_id, arsa, seviye FROM ciftlikler WHERE seviye > 1')
    .all()
    .map((s) => {
      const iade = ESKI_SEVIYE_BEDELLERI.slice(0, s.seviye).reduce((t, b) => t + b, 0);
      ekle(db, {
        guildId: s.guild_id, kullaniciId: s.kullanici_id, miktar: iade, tur: TURLER.ciftlik, karsiId: `iade-${s.arsa}`, simdi,
      });
      db.prepare('UPDATE ciftlikler SET seviye = 1 WHERE guild_id = ? AND kullanici_id = ? AND arsa = ?')
        .run(s.guild_id, s.kullanici_id, s.arsa);
      return {
        guildId: s.guild_id, kullaniciId: s.kullanici_id, arsa: s.arsa, iade,
      };
    }));
}
