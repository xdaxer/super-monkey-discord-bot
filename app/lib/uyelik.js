/**
 * YouTube kanal üyeliği ("Katıl"): rolü Discord'un YouTube entegrasyonu verir
 * ve alır, bot hiç dokunmaz. Bot yalnız rolü tanır; kanal izinleri, üyelik
 * logu ve XP bonusu bu tanımaya dayanır.
 *
 * Karar mantığı saf tutuluyor, Discord'a istek atmadan test edilebiliyor.
 * Bu dosya yaprak modüldür (hiçbir şey içe aktarmaz): ayarlar.js kademe
 * tanımlarını buradan alır, muz çarpanı lib/uyelik-carpan.js'tedir.
 */

/**
 * Katıl kademeleri: her kademeye bir üyelik rolü ve ayrı bir muz bonusu (%)
 * bağlanır (`uyelik.kademe.<n>.rol`, `uyelik.kademe.<n>.muzBonusYuzde`).
 * YouTube en çok 6 seviyeye izin verir; kullanılmayan kademenin rolü boş kalır.
 * Sayılar docs/para.md ile aynıdır.
 */
export const UYELIK_KADEMELERI = Object.freeze([
  { no: 1, bonusYuzde: 10 },
  { no: 2, bonusYuzde: 20 },
  { no: 3, bonusYuzde: 35 },
  { no: 4, bonusYuzde: 50 },
  { no: 5, bonusYuzde: 75 },
  { no: 6, bonusYuzde: 100 },
]);

export const kademeRolAnahtari = (no) => `uyelik.kademe.${no}.rol`;
export const kademeBonusAnahtari = (no) => `uyelik.kademe.${no}.muzBonusYuzde`;

/**
 * Üyenin rollerine göre en yüksek kademe bonusu (kademeler toplanmaz).
 * @param {Iterable<string>} rolIdleri Üyenin üyelik rolleri
 * @param {(anahtar: string) => any} oku ayar okuyucu
 * @returns {{no: number, rolId: string, yuzde: number} | null}
 */
export function enIyiKademe(rolIdleri, oku) {
  const roller = new Set(rolIdleri);
  let enIyi = null;
  for (const { no } of UYELIK_KADEMELERI) {
    const rolId = oku(kademeRolAnahtari(no));
    if (!rolId || !roller.has(rolId)) continue;
    const yuzde = Math.max(0, Number(oku(kademeBonusAnahtari(no))) || 0);
    if (!enIyi || yuzde > enIyi.yuzde) enIyi = { no, rolId, yuzde };
  }
  return enIyi;
}

/**
 * Kademe rollerini kurulum için sıralar: genel "YouTube Member" rolü (adında
 * seviye adı yok) dışarıda kalır, kalanlar oluşturulma sırasına (kimlik) göre
 * dizilir; entegrasyon seviyeleri alttan üste oluşturur.
 */
export function kademeSirasi(roller) {
  return roller
    .filter((r) => r.name.includes(':'))
    .sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
}

/**
 * Entegrasyon rolü mü? Discord entegrasyon rollerine `integrationId` etiketi
 * koyar. Bot rolleri de entegrasyondur ama `botId` taşır, onlar sayılmaz.
 * Her üyelik seviyesi ayrı bir rol olduğundan tek rol kimliği ayarlamak
 * yerine etikete bakıyoruz: seviye eklenince ayar gerekmez.
 */
export function uyelikRoluMu(rol) {
  const etiket = rol?.tags;
  return Boolean(etiket?.integrationId) && !etiket.botId;
}

/** Rol koleksiyonundan (Collection, Map veya dizi) üyelik rollerini seçer. */
export function uyelikRolleri(roller) {
  const liste = Array.isArray(roller) ? roller : [...(roller?.values?.() ?? [])];
  return liste.filter(uyelikRoluMu);
}

/**
 * Üyenin rol değişiminden üyeliğe ait kısmı çıkarır.
 * @param {Iterable<string>} onceki Önceki rol kimlikleri
 * @param {Iterable<string>} sonraki Sonraki rol kimlikleri
 * @param {Iterable<string>} uyelikIdleri Sunucudaki üyelik rolü kimlikleri
 * @returns {{eklenen: string[], cikan: string[]}}
 */
export function uyelikDegisimi(onceki, sonraki, uyelikIdleri) {
  const uyelik = new Set(uyelikIdleri);
  const once = new Set([...onceki].filter((id) => uyelik.has(id)));
  const sonra = new Set([...sonraki].filter((id) => uyelik.has(id)));

  return {
    eklenen: [...sonra].filter((id) => !once.has(id)),
    cikan: [...once].filter((id) => !sonra.has(id)),
  };
}

/**
 * Seviye değişimini (ör. alt seviyeden üst seviyeye geçiş) başlangıç ve
 * bitişten ayırır: yalnız hiç rolü kalmayan üye "bitti" sayılır.
 * @returns {'basladi' | 'bitti' | 'degisti' | null}
 */
export function degisimTuru({ eklenen, cikan }, sonrakiUyelikSayisi) {
  if (eklenen.length === 0 && cikan.length === 0) return null;
  if (sonrakiUyelikSayisi === 0) return 'bitti';
  if (cikan.length === 0 && sonrakiUyelikSayisi === eklenen.length) return 'basladi';
  return 'degisti';
}

/** Yüzde bonusu XP'ye uygular; sonuç tam sayı. */
export function bonusluXp(xp, yuzde) {
  const oran = Math.max(0, Number(yuzde) || 0);
  return Math.round(xp * (1 + oran / 100));
}
