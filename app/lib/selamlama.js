/**
 * Selamlaşma: yapılandırılan kanalda "sa / selam / merhaba" gibi bir selam
 * yakalanınca botun kısa yanıt vermesi.
 *
 * Tanıma burada saf tutuluyor (Discord nesnesi almıyor) ki kalıp birim
 * testiyle doğrulanabilsin; olay dosyası yalnız kanal, sistem ve bekleme
 * kontrolünü yapar.
 */

const TR_ASCII = {
  ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g',
  ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ç: 'c', Ç: 'c', â: 'a', î: 'i', û: 'u',
};

/**
 * Türkçe harfleri ASCII karşılığına indirip küçültür; "S.A", "Selâm" ve
 * "selam" aynı kalıba düşsün diye. Türkçe harfler önce çevriliyor: 'İ'
 * doğrudan küçültülünce birleşik noktalı 'i̇' üretiyor.
 */
export function sadelestir(metin) {
  return String(metin ?? '')
    .replace(/[ıİşŞğĞüÜöÖçÇâîû]/g, (harf) => TR_ASCII[harf])
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/**
 * Kalıpları sararken baştaki/sondaki bakış kontrolleri harf-rakam komşusunu
 * eler: "sa" eşleşir ama "saat", "sana", "usa" eşleşmez. \b yerine
 * \p{L}\p{N} kullanılıyor çünkü \b ASCII dışı harfleri sınır sayar.
 */
function kalipKur(kaliplar) {
  return new RegExp(String.raw`(?<![\p{L}\p{N}])(?:${kaliplar.join('|')})(?![\p{L}\p{N}])`, 'u');
}

/**
 * Selam grupları. Her grubun kendi yanıt ayarı var: "sa" dinî selamın
 * kısaltması olduğu için karşılığı "as", "merhaba" ise kendi karşılığını
 * alır. Yeni grup eklemek için buraya bir satır ve AYARLAR'a bir anahtar
 * yetiyor.
 */
export const GRUPLAR = [
  {
    ad: 'sa',
    ayar: 'selamlama.cevap.sa',
    kalip: kalipKur([
      String.raw`s[.\-_ ]*a`, //                        sa, s.a, s.a., s-a, s a
      String.raw`sea`, //                               "s.a" yazarken kayan el
      String.raw`slm+`, //                              slm, slmm
      String.raw`selam+(?:lar)?`, //                    selam, selammm, selamlar
      String.raw`(?:es)?selam[ui]?n?\s*aleyk[ui]m`, //  selamun aleykum, esselamu aleykum
      String.raw`aleyk[ui]m\s*(?:es)?selam`, //         aleykum selam
    ]),
  },
  {
    ad: 'merhaba',
    ayar: 'selamlama.cevap.merhaba',
    kalip: kalipKur([
      String.raw`m(?:erhaba|rb|rhb)`, //                merhaba, mrb, mrhb
    ]),
  },
  {
    ad: 'gunaydin',
    ayar: 'selamlama.cevap.gunaydin',
    kalip: kalipKur([
      String.raw`g(?:unaydin(?:lar)?|nydn)`, //         günaydın, günaydınlar, gnydn
      String.raw`(?:iyi|hayirli)\s*sabahlar`, //        iyi sabahlar, hayırlı sabahlar
    ]),
  },
  {
    ad: 'iyiGunler',
    ayar: 'selamlama.cevap.iyiGunler',
    kalip: kalipKur([
      String.raw`(?:iyi|hayirli)\s*gunler`, //          iyi günler, iyigünler, hayırlı günler
    ]),
  },
  {
    ad: 'iyiAksamlar',
    ayar: 'selamlama.cevap.iyiAksamlar',
    kalip: kalipKur([
      String.raw`(?:iyi|hayirli)\s*aksamlar`, //        iyi akşamlar, hayırlı akşamlar
    ]),
  },
  {
    ad: 'iyiGeceler',
    ayar: 'selamlama.cevap.iyiGeceler',
    kalip: kalipKur([
      String.raw`(?:iyi|hayirli)\s*geceler`, //         iyi geceler, iyigeceler, hayırlı geceler
    ]),
  },
];

/**
 * Mesajdaki selamın grubunu döndürür, yoksa null. Bir mesajda iki grup da
 * geçiyorsa ("merhaba sa") metinde önce gelen kazanır: okuyanın beklediği
 * karşılık ilk yazdığı selamın karşılığıdır.
 */
export function selamGrubu(metin) {
  const sade = sadelestir(metin);

  let kazanan = null;
  for (const grup of GRUPLAR) {
    const yer = sade.search(grup.kalip);
    if (yer !== -1 && (kazanan === null || yer < kazanan.yer)) kazanan = { grup, yer };
  }

  return kazanan?.grup ?? null;
}

/** Mesajın herhangi bir yerinde selam geçiyor mu? */
export function selamMi(metin) {
  return selamGrubu(metin) !== null;
}
