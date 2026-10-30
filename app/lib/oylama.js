/**
 * Oylama: seçilen kanaldaki her mesaja ⬆️ / ⬇️ tepkisi bırakılır, böylece
 * kanal hazır oy düğmeleriyle gelen bir öneri/oylama kanalına dönüşür.
 *
 * Karar mantığı burada saf tutuluyor (Discord'a hiç istek atmadan
 * çağrılabiliyor); olay dosyası ile komut yalnız ayar, yetki ve sıralama
 * işini yapar.
 */

/** Yukarı oy. Discord'a gönderilen biçim bu: U+2B06 + varyasyon seçici. */
export const YUKARI = '⬆️';
/** Aşağı oy. */
export const ASAGI = '⬇️';

/**
 * Tepkiler bu sırayla eklenir; ⬆️ solda görünsün diye sıra korunur.
 * Emoji'yi değiştirmek isteyen buradaki iki sabiti değiştirir — ayar
 * anahtarı açmıyoruz, çünkü geçersiz bir emoji ancak Discord'a gönderilince
 * hata verir ve kanal yarı tepkili kalır.
 */
export const TEPKILER = Object.freeze([YUKARI, ASAGI]);

/**
 * Varyasyon seçiciyi atar. Discord bir tepkiyi kimi zaman "⬆️", kimi zaman
 * "⬆" olarak geri verir; ikisini aynı saymazsak bot her taramada aynı
 * mesaja yeniden tepki eklemeye çalışır.
 */
export function sadeEmoji(deger) {
  return String(deger ?? '').replace(/️/g, '');
}

/**
 * Mesaj oylanmalı mı? İçeriğe bakmaz (MessageContent intent'i gerekmez),
 * yalnız mesajın türüne bakar.
 *
 * @param {object} mesaj discord.js Message veya aynı şekilli bir nesne
 * @param {string|null} botId Botun kendi kullanıcı kimliği
 * @returns {{ok: true} | {ok: false, sebep: string}}
 */
export function oylanirMi(mesaj, botId = null) {
  if (!mesaj?.guild && !mesaj?.guildId) return { ok: false, sebep: 'sunucu-disi' };

  // Botun kendi mesajına oy düğmesi koymak anlamsız; bildirim/yanıt mesajları
  // oylama listesini kirletir. Başka botların (ör. webhook'la gelen öneri)
  // mesajları oylanır: kullanıcı "tüm mesajlar" istedi.
  if (botId && mesaj.author?.id === botId) return { ok: false, sebep: 'botun-kendi-mesaji' };

  // Katılma duyurusu, sabitleme bildirimi gibi sistem mesajları oylanmaz.
  if (mesaj.system) return { ok: false, sebep: 'sistem-mesaji' };

  return { ok: true };
}

/**
 * Mesajda botun henüz eklemediği tepkileri sırayla döndürür. Zaten eklenmiş
 * olanları atlamak, geçmiş taramasının tekrar tekrar çalıştırılabilmesini
 * sağlar (ikinci çalıştırma yalnız eksikleri tamamlar).
 */
export function eksikTepkiler(mesaj) {
  const bizimkiler = new Set(
    [...(mesaj?.reactions?.cache?.values?.() ?? [])]
      .filter((tepki) => tepki?.me)
      .map((tepki) => sadeEmoji(tepki.emoji?.name)),
  );

  return TEPKILER.filter((emoji) => !bizimkiler.has(sadeEmoji(emoji)));
}

/**
 * Eksik tepkileri sırayla ekler. Sırayla: paralel gönderimde Discord
 * tepkileri karışık sırada kaydedebiliyor, ⬆️ solda kalsın istiyoruz.
 *
 * @returns {Promise<number>} eklenen tepki sayısı
 */
export async function tepkileriEkle(mesaj) {
  const eksik = eksikTepkiler(mesaj);
  for (const emoji of eksik) await mesaj.react(emoji);
  return eksik.length;
}

/** Geçmiş taramasında tek seferde çekilen mesaj sayısı (Discord üst sınırı). */
export const YIGIN = 100;

/**
 * Kanal geçmişini yeniden eskiye tarar ve oylanabilir mesajlara eksik
 * tepkileri ekler.
 *
 * `kanal` yalnız `messages.fetch({ limit, before })` sunan herhangi bir nesne
 * olabilir; testler sahte kanalla çağırır.
 *
 * @param {object} kanal
 * @param {object} secenekler
 * @param {string|null} secenekler.botId
 * @param {number} secenekler.adet Taranacak en fazla mesaj sayısı
 * @param {(ilerleme: {taranan: number, islenen: number}) => void} [secenekler.ilerleme]
 * @param {boolean} [secenekler.kendiOylariniAyikla] Eski kendi oylarını da kaldır
 * @returns {Promise<{taranan: number, islenen: number, eklenen: number, atlanan: number,
 *                    kendiOyu: number, hata: number}>}
 */
export async function gecmisiOyla(kanal, {
  botId = null, adet = 1000, ilerleme = null, kendiOylariniAyikla = true,
} = {}) {
  const sayac = { taranan: 0, islenen: 0, eklenen: 0, atlanan: 0, kendiOyu: 0, hata: 0 };
  let once;

  while (sayac.taranan < adet) {
    const limit = Math.min(YIGIN, adet - sayac.taranan);
    const yigin = await kanal.messages.fetch(once ? { limit, before: once } : { limit });
    const mesajlar = [...(yigin?.values?.() ?? yigin ?? [])];
    if (mesajlar.length === 0) break;

    for (const mesaj of mesajlar) {
      sayac.taranan += 1;
      once = mesaj.id;

      if (!oylanirMi(mesaj, botId).ok) {
        sayac.atlanan += 1;
        continue;
      }

      try {
        const eklenen = await tepkileriEkle(mesaj);
        sayac.eklenen += eklenen;
        // Zaten iki tepkisi de varsa "işlenen" sayılmaz: ikinci çalıştırmada
        // ne kadarının yeni olduğu görünsün.
        if (eklenen > 0) sayac.islenen += 1;

        // Canlı koruma eklenmeden önce verilmiş kendi oyları burada temizlenir;
        // yoksa düzeltme yalnız yeni mesajlara yarar, eski sıralama bozuk kalır.
        if (kendiOylariniAyikla) sayac.kendiOyu += await kendiOylariniTemizle(mesaj);
      } catch {
        // Tek bir mesajın silinmiş/kilitli olması taramayı durdurmamalı.
        sayac.hata += 1;
      }
    }

    ilerleme?.({ taranan: sayac.taranan, islenen: sayac.islenen });
    if (mesajlar.length < limit) break;
  }

  return sayac;
}

/**
 * Bu tepki, mesaj sahibinin kendi mesajına verdiği bir oy mu?
 *
 * Kendine oy vermek anketi yanıltıyor: her gönderen kendi fikrine bir ⬆️ ile
 * başlıyor, böylece sıralama fikrin değeriyle değil kimin önce oy verdiğiyle
 * belirleniyor. Bu yüzden kendi oyu eklenir eklenmez geri alınır.
 *
 * Aşağı ok da engelleniyor: kendi mesajına ⬇️ basmak nadir ama iki yönü ayrı
 * kurala bağlamak, sonradan "neden biri serbest biri değil" sorusunu doğurur.
 *
 * Kimlikler metin olarak karşılaştırılır — snowflake sayıya çevrilince bozulur.
 *
 * @param {object} girdi
 * @param {string} girdi.emoji Tepkinin emoji adı
 * @param {string} girdi.tepkiVeren Tepkiyi ekleyen kullanıcı kimliği
 * @param {string} girdi.mesajYazari Mesajı yazan kullanıcı kimliği
 * @param {string|null} [girdi.botId] Botun kimliği; kendi tepkisi sayılmaz
 */
export function kendiOyuMu({ emoji, tepkiVeren, mesajYazari, botId = null }) {
  if (!emoji || !tepkiVeren || !mesajYazari) return false;

  // Botun kendi bıraktığı oy düğmeleri elbette kaldırılmaz.
  if (botId && String(tepkiVeren) === String(botId)) return false;

  // Kanaldaki başka emojilere karışmıyoruz; yalnız bizim oy düğmelerimiz.
  if (!TEPKILER.some((bizim) => sadeEmoji(bizim) === sadeEmoji(emoji))) return false;

  return String(tepkiVeren) === String(mesajYazari);
}

/**
 * Bir mesajdaki kendi oylarını kaldırır. `/oylama gecmis` bunu kullanır:
 * canlı koruma eklenmeden önce verilmiş kendi oyları da temizlenmeli, yoksa
 * eski mesajların sıralaması yanlış kalır.
 *
 * Tepki başına kullanıcı listesi çekmek pahalı; sayısı 1 olan tepkiye hiç
 * bakmıyoruz çünkü o tek tepki botun kendisinindir.
 *
 * @returns {Promise<number>} kaldırılan kendi oyu sayısı
 */
export async function kendiOylariniTemizle(mesaj) {
  const yazarId = mesaj?.author?.id;
  if (!yazarId) return 0;

  let kaldirilan = 0;

  for (const tepki of [...(mesaj?.reactions?.cache?.values?.() ?? [])]) {
    if (!TEPKILER.some((bizim) => sadeEmoji(bizim) === sadeEmoji(tepki?.emoji?.name))) continue;
    if ((tepki.count ?? 0) <= 1) continue;
    if (typeof tepki.users?.fetch !== 'function' || typeof tepki.users?.remove !== 'function') continue;

    const kullanicilar = await tepki.users.fetch();
    if (!kullanicilar?.has?.(yazarId)) continue;

    await tepki.users.remove(yazarId);
    kaldirilan += 1;
  }

  return kaldirilan;
}
