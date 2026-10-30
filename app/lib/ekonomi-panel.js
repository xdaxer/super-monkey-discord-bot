/**
 * Ekonomi paneli hesapları: muz arzı, basılan / yok edilen muz ve kötüye
 * kullanım incelemesi için hareket dökümü.
 *
 * Her şey `ekonomi_hareketleri` defterinden okunur; bu dosya hiçbir şey yazmaz.
 *
 * Basılan = dışarıdan sisteme giren muz (ödüller, faiz, kasa, kart satışı).
 * Yok edilen = sistemden çıkan muz (mağaza, transfer vergisi, düello kasa payı,
 * kumarda kasanın kârı, erken bozma cezası, kredi faizi ve gecikme cezası). Üyeler arası aktarımlar ve
 * mevduat (bakiyeden bankaya geçiş, arza dahil) ikisine de girmez.
 *
 * Sınıflama (tür + karşı taraf tipi → kategori) `kategoriBul`da; tablo docs/para.md'de.
 *
 * "Yöneticiler hariç" görünümde (`haric` = sahip + geliştiriciler) yöneticilerin
 * kendi satırları sayılmaz; üyelerle aralarındaki muz (gönderim, düello)
 * "Yönetici" kategorisine düşer: yöneticiden gelen basılan, yöneticiye giden
 * yok edilen sayılır.
 */

import { DURUMLAR } from './banka.js';
import { trGunBaslangici } from './ekonomi.js';
import { esyaGetir } from './esyalar.js';
import { OYUN_ADLARI } from './akis.js';
import { etkinlikAdi, etkinlikGecmisi } from './etkinlik.js';
import { hissedeKilitli, hisseSonucu } from './hisse.js';
import { yetkiliKimlikler } from './izin.js';
import { kartDegeri, kartGetir } from './kasalar.js';

const GUN_MS = 86_400_000;

/** Raporlanabilir dönemler: kaç Türkiye günü (bugün dahil). */
export const DONEMLER = Object.freeze({
  bugun: { ad: 'Bugün', gun: 1 },
  '7g': { ad: 'Son 7 gün', gun: 7 },
  '30g': { ad: 'Son 30 gün', gun: 30 },
});

export const SON_HAREKET_ADEDI = 15;
export const KAZANAN_ADEDI = 5;

/** Dönemin [başlangıç, bitiş) aralığı; başlangıç Türkiye gün başlangıcıdır. */
export function donemAraligi(donem, simdi = Date.now()) {
  const tanim = DONEMLER[donem] ?? DONEMLER.bugun;
  return { baslangic: trGunBaslangici(simdi) - (tanim.gun - 1) * GUN_MS, bitis: simdi + 1 };
}

/**
 * Kategori tanımları. `yon`: 'net' = kategorinin işaretli toplamı pozitifse
 * basılan, negatifse yok edilen sayılır; 'iki' = artanlar basılan, azalanlar
 * yok edilen (yönetici ver/al ayrı ayrı gerçek giriş-çıkıştır); 'nötr' = arzı
 * değiştirmez (mevduat: bakiyeden bankaya geçiş).
 */
export const KATEGORILER = Object.freeze({
  gunluk: { ad: 'Günlük ödül', yon: 'net' },
  mesaj: { ad: 'Sohbet ödülü', yon: 'net' },
  seviye: { ad: 'Seviye ödülü', yon: 'net' },
  gorev: { ad: 'Görev ödülü', yon: 'net' },
  'set-odul': { ad: 'Set ödülü', yon: 'net' },
  faiz: { ad: 'Banka faizi', yon: 'net' },
  calis: { ad: 'Çalışma (/calis)', yon: 'net' },
  sefer: { ad: 'Maymun seferi', yon: 'net' },
  yukseltme: { ad: 'Maymun yükseltmesi', yon: 'net' },
  // Kurma/yükseltme bedeli (−) yok edilen, hasat (+) basılan muzdur; net gösterilir.
  ciftlik: { ad: 'Maymun çiftliği (hasat − kurma/yükseltme)', yon: 'net' },
  basarim: { ad: 'Başarım ödülü', yon: 'net' },
  // Prestij bedeli ve sıfırlanan kalan bakiye: ikisi de sistemden çıkan (yok edilen) muz.
  prestij: { ad: 'Prestij (bedel + sıfırlanan bakiye)', yon: 'net' },
  // Bilet (−) ve ikramiye (+) netleşir: taban ödenen haftada basılan, %10 kesinti yok edilen.
  piyango: { ad: 'Piyango', yon: 'net' },
  // Boss ödülü (+) ve teselli (+) yoktan basılan muzdur.
  boss: { ad: 'Boss savaşı ödülü', yon: 'net' },
  // Promosyon kodu ödülü (+) yoktan basılan muzdur (lib/promo.js).
  promo: { ad: 'Promosyon kodu', yon: 'net' },
  'kart-satisi': { ad: 'Kart satışı', yon: 'net' },
  kasa: { ad: 'Kasa ve eşya ödülü', yon: 'net' },
  kumar: { ad: 'Kumar (kasa kârı)', yon: 'net' },
  duello: { ad: 'Düello kasa payı', yon: 'net' },
  magaza: { ad: 'Mağaza harcaması', yon: 'net' },
  // Alıcının ödediği (−) ile satıcıya geçen (+) arasındaki fark: pazar kesintisi.
  pazar: { ad: 'Topluluk pazarı kesintisi', yon: 'net' },
  transfer: { ad: 'Transfer vergisi', yon: 'net' },
  // Kredi verilmesi (+) geçici basımdır, ödeme (−) geri alır: net = açık anapara (basılan) ya da
  // tahsil edilmiş faiz + ceza (yok edilen). Kapanmış kredide net tam olarak −(faiz + ceza).
  kredi: { ad: 'Kredi (açık anapara / faiz + ceza)', yon: 'net' },
  yonetici: { ad: 'Yönetici', yon: 'iki' },
  mevduat: { ad: 'Mevduat', yon: 'nötr' },
  // Hisse alımı muzu portföye kilitler (maliyetiyle arza dahil), satış geri çevirir:
  // ikisi de arzı değiştirmez. Gerçekleşen kâr/zarar ve komisyon `hisseSonucu`ndan gelir.
  hisse: { ad: 'Hisse alım/satım', yon: 'nötr' },
});

/** Satılan hisselerin gerçekleşen kâr/zararı defterde ayrı satır değildir; hisse_islemleri'nden gelir. */
export const HISSE_SONUCU = Object.freeze({ kod: 'hisse-sonucu', kar: 'Hisse kârı (piyasadan)', zarar: 'Hisse zararı ve komisyon' });

/** Erken bozma cezası mevduat tablosundan gelir; defterde ayrı satırı yoktur. */
export const ERKEN_BOZMA = Object.freeze({ kod: 'erken-bozma', ad: 'Erken bozma cezası' });

/**
 * Defter satırının kategorisi.
 * `karsi`: karşı taraf tipi (SQL'de hesaplanır):
 *   'yok' (boş: kumar), 'kasa' (kasa-… kimliği), 'yonetici' (yalnız yöneticiler hariç görünümde), 'uye' (bakiyesi olan üye),
 *   'sayi' (üye olmayan sayısal kimlik: mağaza rolü ya da hesabı olmayan rakip), 'diger'.
 */
export function kategoriBul(tur, karsi) {
  // Yöneticiler hariç görünümde üye ile yönetici arasındaki muz yönetici kategorisindedir.
  if (karsi === 'yonetici' && ['al', 'gonder', 'bahis', 'kazanc', 'iade'].includes(tur)) return 'yonetici';
  switch (tur) {
    case 'gunluk': case 'mesaj': case 'seviye': case 'gorev': case 'faiz':
    case 'set-odul': case 'yonetici': case 'mevduat':
    case 'calis': case 'sefer': case 'yukseltme': case 'ciftlik': case 'basarim': case 'piyango': case 'boss': case 'kredi': case 'hisse': case 'prestij': case 'promo':
      return tur;
    case 'satis': return 'kart-satisi';
    case 'gonder': case 'al': case 'vergi': return 'transfer';
    case 'magaza': return 'magaza';
    case 'pazar': return 'pazar';
    case 'cashback': return 'kumar';
    case 'bahis':
      // Karşı tarafı olan bahis düellodur.
      return karsi === 'yok' ? 'kumar' : 'duello';
    case 'kazanc':
      if (karsi === 'yok') return 'kumar';
      return karsi === 'uye' ? 'duello' : 'kasa';
    case 'iade':
      // Blackjack iadesi karşısız, düello iadesi üyeli, mağaza iadesi rol kimlikli.
      if (karsi === 'yok') return 'kumar';
      return karsi === 'uye' ? 'duello' : 'magaza';
    default:
      return `diger:${tur}`;
  }
}

/**
 * Gruplanmış defter satırlarından basılan / yok edilen hesabı.
 * Saf fonksiyon: sorgu `donemSatirlari`nda, burada yalnız aritmetik var.
 *
 * @param {Array<{tur: string, karsi: string, artan: number, azalan: number}>} satirlar
 *   Tür + karşı tip başına pozitif ve negatif miktarların mutlak toplamları.
 * @param {number} [erkenBozmaCezasi]
 * @returns {{basilan: Array<{kod: string, ad: string, miktar: number}>, yokEdilen: Array<{kod: string, ad: string, miktar: number}>,
 *   toplamBasilan: number, toplamYokEdilen: number, net: number}}
 */
export function basilanYokEdilen(satirlar, erkenBozmaCezasi = 0, hisseSonucuMuz = 0) {
  const toplamlar = new Map();
  for (const s of satirlar) {
    const kod = kategoriBul(s.tur, s.karsi);
    const t = toplamlar.get(kod) ?? { artan: 0, azalan: 0 };
    t.artan += s.artan;
    t.azalan += s.azalan;
    toplamlar.set(kod, t);
  }

  const basilan = [];
  const yokEdilen = [];
  for (const [kod, { artan, azalan }] of toplamlar) {
    const tanim = KATEGORILER[kod] ?? { ad: `Diğer (${kod.slice('diger:'.length)})`, yon: 'net' };
    if (tanim.yon === 'nötr') continue;
    if (tanim.yon === 'iki') {
      if (artan > 0) basilan.push({ kod, ad: `${tanim.ad} (verilen)`, miktar: artan });
      if (azalan > 0) yokEdilen.push({ kod, ad: `${tanim.ad} (alınan)`, miktar: azalan });
      continue;
    }
    const net = artan - azalan;
    if (net > 0) basilan.push({ kod, ad: tanim.ad, miktar: net });
    else if (net < 0) yokEdilen.push({ kod, ad: tanim.ad, miktar: -net });
  }
  if (erkenBozmaCezasi > 0) {
    yokEdilen.push({ kod: ERKEN_BOZMA.kod, ad: ERKEN_BOZMA.ad, miktar: erkenBozmaCezasi });
  }

  // Pozitif sonuç: portföyden çıkan muz maliyetinden fazla döndü (basılan); negatif: zarar ve komisyon (yok edilen).
  if (hisseSonucuMuz > 0) basilan.push({ kod: HISSE_SONUCU.kod, ad: HISSE_SONUCU.kar, miktar: hisseSonucuMuz });
  else if (hisseSonucuMuz < 0) yokEdilen.push({ kod: HISSE_SONUCU.kod, ad: HISSE_SONUCU.zarar, miktar: -hisseSonucuMuz });

  const buyukten = (a, b) => b.miktar - a.miktar;
  basilan.sort(buyukten);
  yokEdilen.sort(buyukten);
  const topla = (liste) => liste.reduce((t, k) => t + k.miktar, 0);
  const toplamBasilan = topla(basilan);
  const toplamYokEdilen = topla(yokEdilen);
  return { basilan, yokEdilen, toplamBasilan, toplamYokEdilen, net: toplamBasilan - toplamYokEdilen };
}

/**
 * Arzdaki yüzde değişim. Dönem başı arz = şimdiki arz − net; sıfır ya da
 * negatifse (ilk muzlar basılıyor) yüzde tanımsızdır.
 * @returns {number | null}
 */
export function arzDegisimi(arz, net) {
  const once = arz - net;
  if (once <= 0) return null;
  return (net / once) * 100;
}

// ── Sorgular ───────────────────────────────────────────────────────────────

/** `haric` kişileri dışarıda bırakan SQL parçası; `sutun` kişi sütunu. */
function haricKosulu(haric, sutun = 'kullanici_id') {
  return haric.length ? ` AND ${sutun} NOT IN (${haric.map(() => '?').join(', ')})` : '';
}

/**
 * Toplam arz: bakiyeler + bankada kilitli anapara + hisse portföylerinin maliyeti; ayrıca muzu olan üye sayısı.
 * `haric`: sayılmayacak kişiler (yöneticiler hariç görünüm).
 */
export function arzOzeti(db, guildId, haric = []) {
  const g = String(guildId);
  const h = haric.map(String);
  const b = db
    .prepare(`SELECT COALESCE(SUM(bakiye), 0) AS toplam, COUNT(*) AS uye FROM bakiyeler WHERE guild_id = ? AND bakiye > 0${haricKosulu(h)}`)
    .get(g, ...h);
  const k = db
    .prepare(`SELECT COALESCE(SUM(anapara), 0) AS toplam FROM mevduatlar WHERE guild_id = ? AND durum = ?${haricKosulu(h)}`)
    .get(g, DURUMLAR.aktif, ...h);
  const hissede = hissedeKilitli(db, guildId, h);
  return {
    bakiyeler: b.toplam, bankada: k.toplam, hissede, arz: b.toplam + k.toplam + hissede, uyeSayisi: b.uye,
  };
}

/** Dönemdeki defter satırları, tür + karşı taraf tipine göre gruplu. `haric`: sayılmayan kişiler (karşı taraf olunca 'yonetici'). */
export function donemSatirlari(db, guildId, { baslangic, bitis }, haric = []) {
  const h = haric.map(String);
  const yer = h.map(() => '?').join(', ');
  return db
    .prepare(
      `SELECT h.tur AS tur,
              CASE
                WHEN h.karsi_id IS NULL THEN 'yok'
                ${h.length ? `WHEN h.karsi_id IN (${yer}) THEN 'yonetici'` : ''}
                WHEN h.karsi_id LIKE 'kasa-%' THEN 'kasa'
                WHEN h.karsi_id NOT GLOB '*[^0-9]*' THEN
                  CASE WHEN EXISTS (SELECT 1 FROM bakiyeler b
                                    WHERE b.guild_id = h.guild_id AND b.kullanici_id = h.karsi_id)
                       THEN 'uye' ELSE 'sayi' END
                ELSE 'diger'
              END AS karsi,
              COALESCE(SUM(CASE WHEN h.miktar > 0 THEN h.miktar END), 0) AS artan,
              COALESCE(SUM(CASE WHEN h.miktar < 0 THEN -h.miktar END), 0) AS azalan
         FROM ekonomi_hareketleri h
        WHERE h.guild_id = ? AND h.zaman >= ? AND h.zaman < ?${haricKosulu(h, 'h.kullanici_id')}
        GROUP BY h.tur, karsi`,
    )
    .all(...h, String(guildId), baslangic, bitis, ...h);
}

/** Dönemde vadesinden önce bozulan mevduatların toplam cezası (anapara − ödenen). */
export function erkenBozmaCezasi(db, guildId, { baslangic, bitis }, haric = []) {
  const satir = db
    .prepare(
      `SELECT COALESCE(SUM(anapara - COALESCE(odenen, 0)), 0) AS ceza FROM mevduatlar
        WHERE guild_id = ? AND durum = ? AND kapanis >= ? AND kapanis < ?${haricKosulu(haric)}`,
    )
    .get(String(guildId), DURUMLAR.bozuldu, baslangic, bitis, ...haric.map(String));
  return satir.ceza;
}

/** Dönemde açılan kasa ve satılan kart sayısı (eşya defterinden). */
export function kasaKartOzeti(db, guildId, { baslangic, bitis }, haric = []) {
  const satir = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN tur = 'kasa-ac' THEN 1 ELSE 0 END), 0) AS kasa,
              COALESCE(SUM(CASE WHEN tur = 'sat' THEN -adet ELSE 0 END), 0) AS kart
         FROM esya_hareketleri WHERE guild_id = ? AND zaman >= ? AND zaman < ?${haricKosulu(haric)}`,
    )
    .get(String(guildId), baslangic, bitis, ...haric.map(String));
  return { kasaAcilan: satir.kasa, kartSatilan: satir.kart };
}

/**
 * Dönemde bakiyesi en çok artan üyeler. Mevduat (arzda kalır) ve yönetici
 * verilen/alınan sayılmaz; yalnız pozitif net listelenir.
 */
export function enCokKazananlar(db, guildId, { baslangic, bitis }, limit = KAZANAN_ADEDI, haric = []) {
  return db
    .prepare(
      `SELECT kullanici_id, SUM(miktar) AS net FROM ekonomi_hareketleri
        WHERE guild_id = ? AND zaman >= ? AND zaman < ? AND tur NOT IN ('mevduat', 'yonetici', 'kredi', 'hisse')${haricKosulu(haric)}
        GROUP BY kullanici_id HAVING SUM(miktar) > 0
        ORDER BY net DESC, kullanici_id ASC LIMIT ?`,
    )
    .all(String(guildId), baslangic, bitis, ...haric.map(String), limit);
}

/**
 * Kumar oyunlarının dönem özeti: yatırılan, ödenen (kazanç + iade), gerçekleşen
 * geri ödeme. Oyun 2026-10-24'ten beri deftere yazılır; öncesi `oyun: null`
 * ("Kayıt öncesi") satırında toplanır. Düello (karşı taraflı) ve cashback dahil değil.
 * @returns {Array<{oyun: string|null, ad: string, bahis: number, odeme: number, adet: number, kisi: number, geriOdeme: number|null}>}
 */
export function kumarOyunlari(db, guildId, { baslangic, bitis }, haric = []) {
  return db
    .prepare(
      `SELECT oyun,
              COALESCE(SUM(CASE WHEN tur = 'bahis' THEN -miktar END), 0) AS bahis,
              COALESCE(SUM(CASE WHEN tur IN ('kazanc', 'iade') THEN miktar END), 0) AS odeme,
              COALESCE(SUM(CASE WHEN tur = 'bahis' THEN 1 END), 0) AS adet,
              COUNT(DISTINCT kullanici_id) AS kisi
         FROM ekonomi_hareketleri
        WHERE guild_id = ? AND zaman >= ? AND zaman < ? AND karsi_id IS NULL
          AND tur IN ('bahis', 'kazanc', 'iade')${haricKosulu(haric)}
        GROUP BY oyun ORDER BY bahis DESC, oyun ASC`,
    )
    .all(String(guildId), baslangic, bitis, ...haric.map(String))
    .filter((s) => s.bahis > 0 || s.odeme > 0)
    .map((s) => ({
      ...s,
      ad: s.oyun ? (OYUN_ADLARI[s.oyun] ?? s.oyun) : 'Kayıt öncesi',
      geriOdeme: s.bahis > 0 ? (s.odeme / s.bahis) * 100 : null,
    }));
}

/** Döneme değen etkinlikler (geçmişten), en yeni önce. */
export function donemEtkinlikleri(db, guildId, { baslangic, bitis }) {
  return etkinlikGecmisi(db, guildId, { baslangic, bitis }).map((e) => ({ ...e, ad: etkinlikAdi(e.tur) }));
}

/**
 * Yöneticilerin (bot sahibi + geliştiriciler) üyelere muz gönderimi. Yönetici
 * geliri ×5 çarpanlı olduğundan gönderdikleri fiilen basılan muz gibidir;
 * panelde transferden ayrı gösterilir. Yöneticiler arası gönderim sayılmaz.
 */
export function yoneticiGonderimleri(db, guildId, { baslangic, bitis }, yoneticiler = yetkiliKimlikler()) {
  if (yoneticiler.length === 0) return { toplam: 0, adet: 0, aliciSayisi: 0, alicilar: [] };
  const yer = yoneticiler.map(() => '?').join(', ');
  const satirlar = db
    .prepare(
      `SELECT karsi_id AS alici, COUNT(*) AS adet, SUM(-miktar) AS toplam FROM ekonomi_hareketleri
        WHERE guild_id = ? AND zaman >= ? AND zaman < ? AND tur = 'gonder'
          AND kullanici_id IN (${yer}) AND karsi_id NOT IN (${yer})
        GROUP BY karsi_id ORDER BY toplam DESC, karsi_id ASC`,
    )
    .all(String(guildId), baslangic, bitis, ...yoneticiler, ...yoneticiler);
  return {
    toplam: satirlar.reduce((t, s) => t + s.toplam, 0),
    adet: satirlar.reduce((t, s) => t + s.adet, 0),
    aliciSayisi: satirlar.length,
    alicilar: satirlar.slice(0, KAZANAN_ADEDI).map((s) => ({ kullanici_id: s.alici, toplam: s.toplam, adet: s.adet })),
  };
}

/** Takastaki bir kalemin muz değeri: kartın satış değeri ya da kasanın mağaza fiyatı. */
function takasDegeri(kimlik, adet) {
  if (!kimlik || adet < 1) return 0;
  const kart = kartGetir(kimlik);
  return adet * (kart ? kartDegeri(kart) : (esyaGetir(kimlik)?.fiyat ?? 0));
}

/**
 * Dönemde kabul edilen takaslar. Değer = kart satış değeri / kasa fiyatı + muz.
 * Değeri en dengesiz olanlar listelenir: yan hesaptan kasa aktarma gibi
 * karşılıksız devirler burada görünür. Yönetici taraf olan takaslar işaretlenir.
 */
export function takasOzeti(db, guildId, { baslangic, bitis }, yoneticiler = yetkiliKimlikler()) {
  const takaslar = db
    .prepare(
      `SELECT id, teklif_eden, karsi_id, ver_esya, ver_adet, iste_esya, iste_adet, muz_ver, muz_iste, olusturma
         FROM takas_teklifleri WHERE guild_id = ? AND durum = 'kabul' AND olusturma >= ? AND olusturma < ?`,
    )
    .all(String(guildId), baslangic, bitis)
    .map((t) => {
      const verDeger = takasDegeri(t.ver_esya, t.ver_adet) + t.muz_ver;
      const isteDeger = takasDegeri(t.iste_esya, t.iste_adet) + t.muz_iste;
      return {
        id: t.id,
        edenId: t.teklif_eden,
        karsiId: t.karsi_id,
        verDeger,
        isteDeger,
        fark: Math.abs(verDeger - isteDeger),
        yonetici: yoneticiler.includes(t.teklif_eden) || yoneticiler.includes(t.karsi_id),
        zaman: t.olusturma,
      };
    });
  return {
    adet: takaslar.length,
    toplamDeger: takaslar.reduce((t, x) => t + x.verDeger + x.isteDeger, 0),
    yoneticili: takaslar.filter((x) => x.yonetici).length,
    dengesiz: takaslar.filter((x) => x.fark > 0).sort((a, b) => b.fark - a.fark || a.id - b.id).slice(0, KAZANAN_ADEDI),
  };
}

/**
 * `/ekonomi-panel ozet` için bütün veriyi toplar. `haric` doluysa (yöneticiler
 * hariç görünüm) arz, basılan/yok edilen, kasa/kart, kazananlar ve kumar
 * oyunları o kişiler olmadan hesaplanır; yönetici gönderimleri ve takaslar aynı kalır.
 */
export function panelOzeti(db, guildId, donem, simdi = Date.now(), { haric = [] } = {}) {
  const aralik = donemAraligi(donem, simdi);
  const arz = arzOzeti(db, guildId, haric);
  const hesap = basilanYokEdilen(
    donemSatirlari(db, guildId, aralik, haric),
    erkenBozmaCezasi(db, guildId, aralik, haric),
    hisseSonucu(db, guildId, aralik, haric),
  );
  return {
    donem, aralik, yoneticiHaric: haric.length > 0, ...arz, ...hesap,
    degisimYuzde: arzDegisimi(arz.arz, hesap.net),
    ...kasaKartOzeti(db, guildId, aralik, haric),
    kazananlar: enCokKazananlar(db, guildId, aralik, KAZANAN_ADEDI, haric),
    kumarOyunlari: kumarOyunlari(db, guildId, aralik, haric),
    etkinlikler: donemEtkinlikleri(db, guildId, aralik),
    yoneticiGonderim: yoneticiGonderimleri(db, guildId, aralik),
    takaslar: takasOzeti(db, guildId, aralik),
  };
}

/** Bir üyenin en yeni `limit` defter hareketi (yeniden eskiye). */
export function sonHareketler(db, guildId, kullaniciId, limit = SON_HAREKET_ADEDI) {
  return db
    .prepare(
      `SELECT tur, miktar, bakiye_sonra, karsi_id, zaman FROM ekonomi_hareketleri
        WHERE guild_id = ? AND kullanici_id = ? ORDER BY id DESC LIMIT ?`,
    )
    .all(String(guildId), String(kullaniciId), limit);
}

// ── Hareket dökümü (yönetim paneli) ────────────────────────────────────────

/** Defter türlerinin okunur adları ve filtre grupları. */
export const TUR_ETIKETLERI = Object.freeze({
  gunluk: 'Günlük ödül',
  mesaj: 'Sohbet ödülü',
  calis: 'Çalışma',
  sefer: 'Maymun seferi',
  yukseltme: 'Maymun yükseltmesi',
  ciftlik: 'Maymun çiftliği',
  gorev: 'Görev',
  seviye: 'Seviye ödülü',
  basarim: 'Başarım',
  bahis: 'Bahis',
  kazanc: 'Kazanç',
  iade: 'İade',
  cashback: 'Kumar iadesi',
  gonder: 'Muz gönderme',
  al: 'Muz alma',
  vergi: 'Transfer vergisi',
  magaza: 'Mağaza',
  satis: 'Kart satışı',
  pazar: 'Topluluk pazarı',
  'set-odul': 'Set ödülü',
  mevduat: 'Mevduat',
  faiz: 'Banka faizi',
  kredi: 'Kredi',
  hisse: 'Hisse',
  piyango: 'Piyango',
  boss: 'Boss',
  prestij: 'Prestij',
  promo: 'Promosyon kodu',
  yonetici: 'Yönetici',
});

export const TUR_GRUPLARI = Object.freeze([
  { kimlik: 'emek', ad: 'Emek', turler: ['gunluk', 'mesaj', 'calis', 'sefer', 'gorev', 'seviye', 'basarim'] },
  { kimlik: 'kumar', ad: 'Kumar ve düello', turler: ['bahis', 'kazanc', 'iade', 'cashback'] },
  { kimlik: 'transfer', ad: 'Transfer', turler: ['gonder', 'al', 'vergi'] },
  { kimlik: 'esya', ad: 'Mağaza ve eşya', turler: ['magaza', 'pazar', 'yukseltme', 'satis', 'set-odul'] },
  { kimlik: 'finans', ad: 'Finans', turler: ['mevduat', 'faiz', 'kredi', 'hisse', 'piyango', 'ciftlik'] },
  { kimlik: 'diger', ad: 'Diğer', turler: ['boss', 'prestij', 'promo', 'yonetici'] },
]);

export const HAREKET_SIRALAMALARI = Object.freeze({
  yeni: 'h.id DESC',
  eski: 'h.id ASC',
  buyuk: 'h.miktar DESC, h.id DESC',
  kucuk: 'h.miktar ASC, h.id DESC',
  mutlak: 'ABS(h.miktar) DESC, h.id DESC',
});

export const HAREKET_SAYFA = 50;

/**
 * Defter dökümü: süzgeç + sıralama + sayfa. Süzgeçler isteğe bağlıdır:
 * `turler` (dizi), `uyeId`, `yon` ('giris' | 'cikis'), `minMiktar` (mutlak),
 * `baslangic`/`bitis` (ms), `haric` (listelenmeyecek kullanıcılar).
 * @returns {{satirlar: Array<object>, toplam: number, giris: number, cikis: number, sayfa: number, sayfaSayisi: number}}
 */
export function hareketAra(db, guildId, {
  turler = null, uyeId = null, yon = null, minMiktar = 0, baslangic = null, bitis = null,
  haric = [], siralama = 'yeni', sayfa = 1, limit = HAREKET_SAYFA,
} = {}) {
  const kosullar = ['h.guild_id = ?'];
  const parametreler = [String(guildId)];
  if (turler?.length) {
    kosullar.push(`h.tur IN (${turler.map(() => '?').join(', ')})`);
    parametreler.push(...turler);
  }
  if (uyeId) {
    kosullar.push('h.kullanici_id = ?');
    parametreler.push(String(uyeId));
  }
  if (yon === 'giris') kosullar.push('h.miktar > 0');
  if (yon === 'cikis') kosullar.push('h.miktar < 0');
  if (minMiktar > 0) {
    kosullar.push('ABS(h.miktar) >= ?');
    parametreler.push(minMiktar);
  }
  if (baslangic !== null) {
    kosullar.push('h.zaman >= ?');
    parametreler.push(baslangic);
  }
  if (bitis !== null) {
    kosullar.push('h.zaman < ?');
    parametreler.push(bitis);
  }
  if (haric.length) {
    kosullar.push(`h.kullanici_id NOT IN (${haric.map(() => '?').join(', ')})`);
    parametreler.push(...haric.map(String));
  }
  const nerede = kosullar.join(' AND ');
  const ozet = db
    .prepare(
      `SELECT COUNT(*) AS toplam,
              COALESCE(SUM(CASE WHEN h.miktar > 0 THEN h.miktar END), 0) AS giris,
              COALESCE(SUM(CASE WHEN h.miktar < 0 THEN -h.miktar END), 0) AS cikis
         FROM ekonomi_hareketleri h WHERE ${nerede}`,
    )
    .get(...parametreler);
  const sayfaSayisi = Math.max(1, Math.ceil(ozet.toplam / limit));
  const gecerliSayfa = Math.min(Math.max(1, Math.floor(sayfa)), sayfaSayisi);
  const satirlar = db
    .prepare(
      `SELECT h.id, h.kullanici_id, h.tur, h.miktar, h.bakiye_sonra, h.karsi_id, h.zaman, h.oyun
         FROM ekonomi_hareketleri h WHERE ${nerede}
        ORDER BY ${HAREKET_SIRALAMALARI[siralama] ?? HAREKET_SIRALAMALARI.yeni} LIMIT ? OFFSET ?`,
    )
    .all(...parametreler, limit, (gecerliSayfa - 1) * limit);
  return {
    satirlar, toplam: ozet.toplam, giris: ozet.giris, cikis: ozet.cikis, sayfa: gecerliSayfa, sayfaSayisi,
  };
}

// ── Mağaza satışları (yönetim paneli) ──────────────────────────────────────

export const SATIS_SAYFA = 50;
export const ALICI_ADEDI = 20;

/**
 * Mağaza satışları: defterdeki `magaza` çıkışları (`karsi_id` = eşya/kasa
 * kimliği, rol kimliği ya da 'renk-rolu'). Rol verilemeyip aynı anda iade
 * edilen alımlar sayılmaz. Kasalar tek satırda birden çok alınabilir; adet
 * `esya_hareketleri`'ndeki aynı anlı 'satin-al' satırından gelir, öteki
 * ürünlerde 1'dir.
 *
 * Süzgeçler: `baslangic`/`bitis` (ms), `haric` (sayılmayacak kullanıcılar),
 * `uyeId`, `urun`. `urunler` dökümü ürün süzgecini yok sayar (başka ürüne
 * geçilebilsin); öteki her şey bütün süzgeçlere uyar.
 * @returns {{ozet: object, urunler: Array<object>, alicilar: Array<object>, satirlar: Array<object>,
 *   sayfa: number, sayfaSayisi: number}}
 */
export function magazaSatislari(db, guildId, {
  baslangic = null, bitis = null, haric = [], uyeId = null, urun = null, sayfa = 1, limit = SATIS_SAYFA,
} = {}) {
  const kosullar = ['h.guild_id = ?', "h.tur = 'magaza'", 'h.miktar < 0', 'h.karsi_id IS NOT NULL'];
  const parametreler = [String(guildId)];
  if (baslangic !== null) {
    kosullar.push('h.zaman >= ?');
    parametreler.push(baslangic);
  }
  if (bitis !== null) {
    kosullar.push('h.zaman < ?');
    parametreler.push(bitis);
  }
  if (haric.length) {
    kosullar.push(`h.kullanici_id NOT IN (${haric.map(() => '?').join(', ')})`);
    parametreler.push(...haric.map(String));
  }
  if (uyeId) {
    kosullar.push('h.kullanici_id = ?');
    parametreler.push(String(uyeId));
  }
  const alimlar = `WITH alimlar AS (
    SELECT h.id, h.kullanici_id, h.karsi_id AS urun, -h.miktar AS tutar, h.zaman,
           COALESCE((SELECT e.adet FROM esya_hareketleri e
                      WHERE e.guild_id = h.guild_id AND e.kullanici_id = h.kullanici_id AND e.tur = 'satin-al'
                        AND e.zaman = h.zaman AND e.esya = h.karsi_id LIMIT 1), 1) AS adet
      FROM ekonomi_hareketleri h
     WHERE ${kosullar.join(' AND ')}
       AND NOT EXISTS (SELECT 1 FROM ekonomi_hareketleri i
                        WHERE i.guild_id = h.guild_id AND i.kullanici_id = h.kullanici_id AND i.tur = 'iade'
                          AND i.zaman = h.zaman AND i.oyun IS NULL AND i.karsi_id = h.karsi_id AND i.miktar = -h.miktar)
  )`;
  const urunKosulu = urun ? 'WHERE urun = ?' : '';
  const urunParam = urun ? [String(urun)] : [];
  const ozet = db
    .prepare(
      `${alimlar} SELECT COUNT(*) AS alim, COALESCE(SUM(adet), 0) AS adet, COALESCE(SUM(tutar), 0) AS toplam,
              COUNT(DISTINCT kullanici_id) AS alici FROM alimlar ${urunKosulu}`,
    )
    .get(...parametreler, ...urunParam);
  const urunler = db
    .prepare(
      `${alimlar} SELECT urun, COUNT(*) AS alim, SUM(adet) AS adet, SUM(tutar) AS toplam,
              COUNT(DISTINCT kullanici_id) AS alici, MAX(zaman) AS son
         FROM alimlar GROUP BY urun ORDER BY toplam DESC, urun`,
    )
    .all(...parametreler);
  const alicilar = db
    .prepare(
      `${alimlar} SELECT kullanici_id, COUNT(*) AS alim, SUM(adet) AS adet, SUM(tutar) AS toplam,
              COUNT(DISTINCT urun) AS cesit, MAX(zaman) AS son
         FROM alimlar ${urunKosulu} GROUP BY kullanici_id ORDER BY toplam DESC, kullanici_id LIMIT ?`,
    )
    .all(...parametreler, ...urunParam, ALICI_ADEDI);
  const sayfaSayisi = Math.max(1, Math.ceil(ozet.alim / limit));
  const gecerliSayfa = Math.min(Math.max(1, Math.floor(sayfa) || 1), sayfaSayisi);
  const satirlar = db
    .prepare(`${alimlar} SELECT * FROM alimlar ${urunKosulu} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...parametreler, ...urunParam, limit, (gecerliSayfa - 1) * limit);
  return {
    ozet, urunler, alicilar, satirlar, sayfa: gecerliSayfa, sayfaSayisi,
  };
}
