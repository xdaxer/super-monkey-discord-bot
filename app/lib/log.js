import { PermissionFlagsBits } from 'discord.js';

import { ayarGetir, sistemAcikMi } from './ayarlar.js';
import { PINGSIZ } from './bicim.js';
import { veritabani } from './db.js';

/** MessageContent kapalıyken içerik yerine bunu yazıyoruz; sessizce boş bırakmıyoruz. */
export const ICERIK_YOK = '_(içerik alınamıyor: MessageContent intent\'i kapalı)_';

/**
 * Bir olayın loglanıp loglanmayacağına karar verir.
 * Saf mantık: db ve guildId verilerek test edilebilir.
 */
export function loglanmaliMi(db, guildId, olayAnahtari) {
  if (!guildId) return { ok: false, sebep: 'sunucu dışı' };
  if (!sistemAcikMi(db, guildId, 'log')) return { ok: false, sebep: 'log sistemi kapalı' };

  const kanalId = ayarGetir(db, guildId, 'log.kanal');
  if (!kanalId) return { ok: false, sebep: 'log kanalı ayarlanmamış' };

  if (!ayarGetir(db, guildId, olayAnahtari)) {
    return { ok: false, sebep: `${olayAnahtari} kapalı` };
  }

  return { ok: true, kanalId };
}

/**
 * Log gömmesini ayarlanan kanala gönderir. Kanal yoksa, silinmişse veya bot
 * yazamıyorsa sessizce vazgeçer: log eksikliği botu düşürmemeli.
 */
export async function logGonder(client, guildId, olayAnahtari, embed, db = veritabani()) {
  const karar = loglanmaliMi(db, guildId, olayAnahtari);
  if (!karar.ok) return false;

  const kanal = await client.channels.fetch(karar.kanalId).catch(() => null);
  if (!kanal?.isTextBased?.()) return false;

  const botUye = kanal.guild?.members?.me;
  if (botUye && !kanal.permissionsFor(botUye)?.has(PermissionFlagsBits.SendMessages)) {
    return false;
  }

  await kanal.send({ embeds: [embed], ...PINGSIZ }).catch(() => null);
  return true;
}

/** Mesaj içeriğini loglanabilir biçime getirir; intent kapalıysa açık not bırakır. */
export function icerikGoster(icerik, sinir = 1000) {
  if (icerik === null || icerik === undefined || icerik === '') return ICERIK_YOK;
  const metin = String(icerik);
  return metin.length > sinir ? `${metin.slice(0, sinir)}…` : metin;
}

/**
 * Ses durumu değişiminin türü: 'giris', 'cikis', 'gecis' ya da null (yalnız
 * mikrofon/kulaklık gibi kanal dışı değişim).
 */
export function sesDegisimi(oncekiKanalId, sonrakiKanalId) {
  const once = oncekiKanalId ?? null;
  const sonra = sonrakiKanalId ?? null;
  if (once === sonra) return null;
  if (!once) return 'giris';
  if (!sonra) return 'cikis';
  return 'gecis';
}

/** İki rol kimliği listesinin farkı; @everyone dahil sıralama önemsiz. */
export function rolFarki(oncekiIdler, sonrakiIdler) {
  const once = new Set(oncekiIdler);
  const sonra = new Set(sonrakiIdler);
  return {
    eklenen: [...sonra].filter((id) => !once.has(id)),
    cikan: [...once].filter((id) => !sonra.has(id)),
  };
}

/**
 * Önce/sonra nesnelerinde değişen alanları "Ad: eski → yeni" satırlarına
 * çevirir. `alanlar` [etiket, okuyucu, secenek?] üçlüleridir; okuyucu ham
 * değeri gösterilecek metne çevirir. `{ yalnizDegisti: true }` verilen alan
 * (avatar hash'i gibi okunmaz değerler) yalnız "değişti" diye yazılır.
 * Değişen yoksa boş dizi döner.
 */
export function alanDegisimleri(once, sonra, alanlar) {
  const satirlar = [];
  for (const [etiket, oku, secenek] of alanlar) {
    const a = oku(once);
    const b = oku(sonra);
    if (a === b) continue;
    if (secenek?.yalnizDegisti) {
      satirlar.push(`**${etiket}** değişti`);
      continue;
    }
    satirlar.push(`**${etiket}:** ${a === '' || a == null ? '_yok_' : a} → ${b === '' || b == null ? '_yok_' : b}`);
  }
  return satirlar;
}
