/**
 * Anket: Discord'un yerel anket (poll) özelliğiyle, komutun yazıldığı
 * kanalda verilen seçenekler arasından oylama açar.
 *
 * Oy sayımı, süre dolunca kapanma ve sonuç gösterimi Discord'da; bot hiçbir
 * şey saklamıyor. Böylece yeniden başlatma anketi etkilemiyor ve veritabanı
 * tablosu gerekmiyor. Buradaki fonksiyonlar saf: yalnız girdiyi doğrulayıp
 * gönderilecek poll verisini üretir.
 */

/** Discord sınırları (API reddetmeden önce kullanıcıya açık hata verelim). */
export const EN_AZ_SECENEK = 2;
export const EN_COK_SECENEK = 10;
export const SORU_SINIRI = 300;
export const SECENEK_SINIRI = 55;
/** Süre saat cinsinden; Discord 1 saat ile 32 gün arasını kabul eder. */
export const EN_KISA_SAAT = 1;
export const EN_UZUN_SAAT = 768;
export const VARSAYILAN_SAAT = 24;

/**
 * Seçenek listesini ayrıştırır. Metinde `|` varsa ona göre bölünür (seçenek
 * içinde virgül kullanılabilsin diye), yoksa virgüle göre — /sec ile aynı alışkanlık.
 * Boşlar atılır, büyük/küçük harf farkı gözetmeden tekrarlar tek sayılır.
 */
export function seceneklerAyristir(metin) {
  const ham = String(metin ?? '');
  const ayirici = ham.includes('|') ? '|' : ',';
  const gorulen = new Set();
  const sonuc = [];

  for (const parca of ham.split(ayirici)) {
    const secenek = parca.trim();
    if (!secenek) continue;
    const anahtar = secenek.toLocaleLowerCase('tr');
    if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);
    sonuc.push(secenek);
  }
  return sonuc;
}

/** Milisaniyeyi Discord'un istediği tam saate yuvarlar (yukarı). */
export function saateCevir(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.ceil(ms / 3_600_000);
}

/**
 * Girdiyi doğrular ve discord.js'in beklediği poll nesnesini üretir.
 *
 * @param {{soru: string, secenekler: string[], saat: number|null, coklu?: boolean}} girdi
 * @returns {{ok: true, poll: object} | {ok: false, sebep: string}}
 */
export function anketHazirla({ soru, secenekler, saat, coklu = false }) {
  const metin = String(soru ?? '').trim();
  if (!metin) return { ok: false, sebep: 'Anket sorusu boş olamaz.' };
  if (metin.length > SORU_SINIRI) {
    return { ok: false, sebep: `Soru en fazla ${SORU_SINIRI} karakter olabilir.` };
  }

  if (secenekler.length < EN_AZ_SECENEK) {
    return {
      ok: false,
      sebep: `En az ${EN_AZ_SECENEK} farklı seçenek gerekli. `
        + 'Virgülle ya da `|` ile ayır: `Pizza | Lahmacun | Döner`',
    };
  }
  if (secenekler.length > EN_COK_SECENEK) {
    return { ok: false, sebep: `En fazla ${EN_COK_SECENEK} seçenek verilebilir (${secenekler.length} verdin).` };
  }

  const uzun = secenekler.find((s) => s.length > SECENEK_SINIRI);
  if (uzun) {
    return {
      ok: false,
      sebep: `Her seçenek en fazla ${SECENEK_SINIRI} karakter olabilir: "${uzun.slice(0, 30)}…"`,
    };
  }

  if (saat === null || !Number.isInteger(saat) || saat < EN_KISA_SAAT || saat > EN_UZUN_SAAT) {
    return {
      ok: false,
      sebep: 'Süre 1 saat ile 32 gün arasında olmalı (ör. `2sa`, `3g`). '
        + 'Discord anketleri saat birimiyle çalışır; kısa süreler 1 saate yuvarlanır.',
    };
  }

  return {
    ok: true,
    poll: {
      question: { text: metin },
      answers: secenekler.map((text) => ({ text })),
      duration: saat,
      allowMultiselect: Boolean(coklu),
    },
  };
}

/**
 * Mesaj bağlantısından veya düz kimlikten mesaj (ve varsa kanal) kimliğini çıkarır.
 * @returns {{kanalId: string|null, mesajId: string} | null}
 */
export function mesajHedefi(metin) {
  const ham = String(metin ?? '').trim();
  const baglanti = /channels\/(?:\d+|@me)\/(\d+)\/(\d+)/.exec(ham);
  if (baglanti) return { kanalId: baglanti[1], mesajId: baglanti[2] };
  if (/^\d{15,25}$/.test(ham)) return { kanalId: null, mesajId: ham };
  return null;
}

/**
 * Anket bot tarafından bitirilebilir mi? Discord yalnız anketi gönderenin
 * (burada botun) bitirmesine izin verir.
 * @returns {{ok: true} | {ok: false, sebep: string}}
 */
export function bitirilebilirMi(mesaj, botId) {
  if (!mesaj?.poll) return { ok: false, sebep: 'Bu mesajda anket yok.' };
  if (mesaj.author?.id !== botId) {
    return { ok: false, sebep: 'Bu anketi bot açmamış; yalnız `/anket` ile açılanlar bitirilebilir.' };
  }
  if (mesaj.poll.resultsFinalized
      || (mesaj.poll.expiresTimestamp && mesaj.poll.expiresTimestamp <= Date.now())) {
    return { ok: false, sebep: 'Bu anket zaten bitmiş.' };
  }
  return { ok: true };
}
