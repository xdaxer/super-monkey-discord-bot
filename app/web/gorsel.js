/**
 * Activity'de emoji ve avatar görselleri.
 *
 * Activity iframe'i yalnız kendi kökenine (Discord proxy → Activity alan adı)
 * istek atabilir; cdn.discordapp.com'a doğrudan erişemez. Bu yüzden sunucu
 * emojileri ve avatarlar /api/emoji/:id ve /api/avatar/:id üzerinden, bellekte
 * önbelleklenerek aktarılır.
 */

import { paraSimgesi } from '../lib/ekonomi.js';

/** Bir nesnenin (kart, eşya, meslek, şirket...) görseli: `{url, metin}`; url yoksa metin gösterilir. */
export function gorselCozucu(guild) {
  const bul = (ad) => (ad ? guild?.emojis?.cache?.find((e) => e.name === ad) ?? null : null);
  return (nesne) => {
    const emoji = bul(nesne?.emojiAdi);
    return {
      url: emoji ? emojiYolu(emoji.id, emoji.animated) : null,
      metin: nesne?.yedek ?? '❔',
    };
  };
}

export function emojiYolu(id, animasyonlu = false) {
  return `/api/emoji/${id}${animasyonlu ? '?a=1' : ''}`;
}

/** Para simgesinin görseli (uygulama emojisi `<:muz:id>` ya da 🍌). */
export function paraGorseli() {
  const m = /^<(a?):\w+:(\d+)>$/.exec(paraSimgesi());
  return m ? { url: emojiYolu(m[2], m[1] === 'a'), metin: '🍌' } : { url: null, metin: paraSimgesi() };
}

/** Basit sınırlı önbellek (ekleme sırasıyla en eski düşer). */
function onbellek(sinir) {
  const m = new Map();
  return {
    get: (k) => m.get(k),
    set(k, v) {
      if (m.size >= sinir) m.delete(m.keys().next().value);
      m.set(k, v);
    },
  };
}

const emojiler = onbellek(800);
const avatarlar = onbellek(500);

async function indir(url, fetchFn) {
  const yanit = await fetchFn(url, { signal: AbortSignal.timeout(5000) });
  if (!yanit.ok) return null;
  return { veri: Buffer.from(await yanit.arrayBuffer()), tur: yanit.headers.get('content-type') ?? 'image/webp' };
}

/** Emoji görseli; kimlik yalnız rakam (URL'ye başka bir şey sızmaz). */
export async function emojiGetir(id, animasyonlu, fetchFn = fetch) {
  if (!/^\d{5,25}$/.test(id)) return null;
  const anahtar = `${id}:${animasyonlu ? 1 : 0}`;
  const var_ = emojiler.get(anahtar);
  if (var_) return var_;
  const g = await indir(`https://cdn.discordapp.com/emojis/${id}.webp?size=96${animasyonlu ? '&animated=true' : ''}`, fetchFn);
  if (g) emojiler.set(anahtar, g);
  return g;
}

/** Sunucu üyesinin avatarı; üye değilse null (açık vekil olmasın). */
export async function avatarGetir(guild, kullaniciId, fetchFn = fetch) {
  if (!/^\d{5,25}$/.test(kullaniciId) || !guild) return null;
  const var_ = avatarlar.get(kullaniciId);
  if (var_ && var_.zaman > Date.now() - 3_600_000) return var_.g;
  const uye = guild.members.cache.get(kullaniciId) ?? await guild.members.fetch(kullaniciId).catch(() => null);
  if (!uye) return null;
  const g = await indir(uye.displayAvatarURL({ extension: 'webp', size: 128 }), fetchFn);
  if (g) avatarlar.set(kullaniciId, { g, zaman: Date.now() });
  return g;
}

/** Üyenin görünen adı ve avatar yolu (sıralama, boss listesi vb.). Önbellekte yoksa kimlikten kısaltma. */
export function uyeOzeti(guild, kullaniciId) {
  const uye = guild?.members?.cache?.get(String(kullaniciId));
  return {
    id: String(kullaniciId),
    ad: uye?.displayName ?? uye?.user?.globalName ?? uye?.user?.username ?? `Üye ${String(kullaniciId).slice(-4)}`,
    avatar: `/api/avatar/${kullaniciId}`,
  };
}
