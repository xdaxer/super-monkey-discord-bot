export const RSS_TABANI = 'https://www.youtube.com/feeds/videos.xml?channel_id=';

/** YouTube kanal kimlikleri "UC" ile başlayan 24 karakterdir. */
const KANAL_ID = /^UC[\w-]{22}$/;

/**
 * Kullanıcının yazdığı şeyden kanal kimliğini çıkarır.
 * Ham kimliği ve /channel/UC... içeren bağlantıları kabul eder.
 * @returns {string|null}
 */
export function kanalIdAyikla(girdi) {
  const metin = String(girdi).trim();

  if (KANAL_ID.test(metin)) return metin;

  const baglanti = /youtube\.com\/channel\/(UC[\w-]{22})/.exec(metin);
  if (baglanti) return baglanti[1];

  return null;
}

const VARLIKLAR = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'",
};

export function xmlCoz(metin) {
  return String(metin)
    .replaceAll(/&(?:amp|lt|gt|quot|apos|#39);/g, (esl) => VARLIKLAR[esl] ?? esl)
    .replaceAll(/&#(\d+);/g, (_, kod) => String.fromCodePoint(Number(kod)));
}

function etiketIcerigi(blok, etiket) {
  const eslesme = new RegExp(`<${etiket}[^>]*>([\\s\\S]*?)</${etiket}>`).exec(blok);
  return eslesme ? xmlCoz(eslesme[1].trim()) : null;
}

/**
 * YouTube kanal RSS akışını ayrıştırır.
 *
 * Akış sabit ve dar bir biçimdir, bu yüzden tam bir XML ayrıştırıcı bağımlılığı
 * eklemeden düzenli ifadeyle okuyoruz. Beklenmeyen biçimde boş dizi döner;
 * çağıran taraf bunu hata değil "yeni video yok" gibi ele almamalı diye
 * ayrıca hata fırlatmıyoruz ama boş sonuç loglanabilir.
 *
 * @returns {Array<{videoId: string, baslik: string, url: string, yayin: number, kanalAdi: string|null}>}
 */
export function rssAyristir(xml) {
  const girdiler = String(xml).match(/<entry>[\s\S]*?<\/entry>/g) ?? [];

  const videolar = [];
  for (const blok of girdiler) {
    const videoId = etiketIcerigi(blok, 'yt:videoId');
    if (!videoId) continue;

    const yayinMetni = etiketIcerigi(blok, 'published');
    const yayin = yayinMetni ? Date.parse(yayinMetni) : Number.NaN;

    videolar.push({
      videoId,
      baslik: etiketIcerigi(blok, 'title') ?? '(başlıksız)',
      url: `https://www.youtube.com/watch?v=${videoId}`,
      yayin: Number.isFinite(yayin) ? yayin : 0,
      kanalAdi: etiketIcerigi(blok, 'name'),
    });
  }

  return videolar;
}

/**
 * Son bildirilen videodan sonrakileri, eskiden yeniye sıralı döndürür.
 *
 * İlk kez yoklanan abonelikte (sonVideoId null) hiçbir şey göndermiyoruz;
 * yoksa abonelik eklendiği anda son 15 video birden düşerdi.
 */
export function yeniVideolar(videolar, sonVideoId) {
  if (videolar.length === 0) return [];
  if (!sonVideoId) return [];

  const indeks = videolar.findIndex((v) => v.videoId === sonVideoId);

  // Son bildirilen video akışta yoksa (çok eskimiş) yalnız en yenisini gönder.
  const yeniler = indeks === -1 ? videolar.slice(0, 1) : videolar.slice(0, indeks);

  return [...yeniler].reverse();
}

/* --- youtube_abonelikleri tablosu --- */

export function abonelikEkle(
  db,
  {
    guildId, kanalId, hedefKanalId, sonVideoId = null, herkesiEtiketle = false,
  },
) {
  db.prepare(
    `INSERT INTO youtube_abonelikleri
       (guild_id, kanal_id, hedef_kanal_id, son_video_id, eklenme, herkesi_etiketle)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(guild_id, kanal_id) DO UPDATE SET
       hedef_kanal_id = excluded.hedef_kanal_id,
       herkesi_etiketle = excluded.herkesi_etiketle`,
  ).run(String(guildId), kanalId, String(hedefKanalId), sonVideoId, Date.now(), herkesiEtiketle ? 1 : 0);
}

export function abonelikCikar(db, guildId, kanalId) {
  const sonuc = db
    .prepare('DELETE FROM youtube_abonelikleri WHERE guild_id = ? AND kanal_id = ?')
    .run(String(guildId), kanalId);
  return sonuc.changes > 0;
}

export function abonelikler(db, guildId = null) {
  if (guildId === null) {
    return db.prepare('SELECT * FROM youtube_abonelikleri').all();
  }
  return db
    .prepare('SELECT * FROM youtube_abonelikleri WHERE guild_id = ?')
    .all(String(guildId));
}

export function sonVideoYaz(db, guildId, kanalId, videoId) {
  db.prepare(
    'UPDATE youtube_abonelikleri SET son_video_id = ? WHERE guild_id = ? AND kanal_id = ?',
  ).run(videoId, String(guildId), kanalId);
}

/** RSS akışını çeker. Ağ/HTTP hatasında null döner, fırlatmaz. */
export async function akisCek(kanalId, getir = fetch) {
  try {
    const yanit = await getir(`${RSS_TABANI}${kanalId}`);
    if (!yanit.ok) return null;
    return rssAyristir(await yanit.text());
  } catch {
    return null;
  }
}
