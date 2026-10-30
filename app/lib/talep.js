/**
 * Destek talebi (ticket): panel butonundan üyeye özel kanal açılır, yetkili rol
 * eklenir, kapanışta yazışma transkript olarak log kanalına bırakılır.
 *
 * Başvuru modülünden (lib/basvuru.js) ayrıdır: başvuru tek seferlik bir formdur
 * ve onay/ret ile biter; talep karşılıklı yazışılan, kapanınca silinen geçici
 * bir kanaldır.
 *
 * Karar mantığı saf tutuluyor: Discord'a istek atmadan çağrılabilir.
 */

export const DURUMLAR = Object.freeze({ acik: 'acik', kapali: 'kapali' });

/** Panel butonu sabittir: bot yeniden başlasa da aynı customId çalışır. */
export const PANEL_BUTON = 'talep:ac';
const KAPAT_ONEKI = 'talep:kapat:';

export function kapatButonId(id) {
  return `${KAPAT_ONEKI}${id}`;
}

export function kapatButonAyristir(customId) {
  if (typeof customId !== 'string' || !customId.startsWith(KAPAT_ONEKI)) return null;
  const id = Number(customId.slice(KAPAT_ONEKI.length));
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Bir talep kanalının adı. Discord kanal adları küçük harf ve tireyle sınırlı. */
export function kanalAdi(kullaniciAdi, id) {
  const sade = String(kullaniciAdi ?? '')
    .toLowerCase()
    .replaceAll('ı', 'i').replaceAll('ğ', 'g').replaceAll('ü', 'u')
    .replaceAll('ş', 's').replaceAll('ö', 'o').replaceAll('ç', 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20);

  // Ad tamamen elenirse (ör. yalnız emoji) numara tek başına yeter.
  return sade ? `talep-${sade}-${id}` : `talep-${id}`;
}

export function talepEkle(db, { guildId, kanalId, kullaniciId, konu, simdi = Date.now() }) {
  const sonuc = db.prepare(
    `INSERT INTO talepler (guild_id, kanal_id, kullanici_id, konu, durum, acilis, kapanis, kapatan_id)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)`,
  ).run(String(guildId), String(kanalId), String(kullaniciId), String(konu), DURUMLAR.acik, simdi);

  return Number(sonuc.lastInsertRowid);
}

export function talepGetir(db, id) {
  return db.prepare('SELECT * FROM talepler WHERE id = ?').get(id) ?? null;
}

export function kanaldanTalep(db, kanalId) {
  return db.prepare('SELECT * FROM talepler WHERE kanal_id = ?').get(String(kanalId)) ?? null;
}

/** Kullanıcının bu sunucudaki açık talebi; yoksa null. */
export function acikTalep(db, guildId, kullaniciId) {
  return db.prepare(
    'SELECT * FROM talepler WHERE guild_id = ? AND kullanici_id = ? AND durum = ? LIMIT 1',
  ).get(String(guildId), String(kullaniciId), DURUMLAR.acik) ?? null;
}

export function acikTalepler(db, guildId) {
  return db.prepare(
    'SELECT * FROM talepler WHERE guild_id = ? AND durum = ? ORDER BY acilis ASC',
  ).all(String(guildId), DURUMLAR.acik);
}

/**
 * Talebi kapalıya çeker.
 * @returns {boolean} yazıldı mı (ikinci kapatma denemesi false döner)
 */
export function talepKapat(db, id, kapatanId, simdi = Date.now()) {
  const yazildi = db.prepare(
    'UPDATE talepler SET durum = ?, kapanis = ?, kapatan_id = ? WHERE id = ? AND durum = ?',
  ).run(DURUMLAR.kapali, simdi, String(kapatanId), id, DURUMLAR.acik);

  return yazildi.changes > 0;
}

/**
 * Talebi kim kapatabilir: sahibi, ayarlı yetkili rol veya Sunucuyu Yönet yetkisi.
 * @returns {{ok: true} | {ok: false, sebep: string}}
 */
export function kapatabilirMi(member, talep, yetkiliRolId, yonetYetkisi = false) {
  if (yonetYetkisi) return { ok: true };
  if (member?.id && String(member.id) === String(talep?.kullanici_id)) return { ok: true };
  if (yetkiliRolId && member?.roles?.cache?.has?.(yetkiliRolId)) return { ok: true };

  return {
    ok: false,
    sebep: '⛔ Bu talebi yalnız sahibi veya yetkili rol kapatabilir.',
  };
}

/** Açılış mesajındaki yer tutucuları doldurur. */
export function acilisMetni(sablon, { kullaniciId }) {
  return String(sablon ?? '').replaceAll('{kullanici}', `<@${kullaniciId}>`);
}

/**
 * Yazışmayı düz metin transkriptine çevirir.
 *
 * `mesajlar` eskiden yeniye sıralı olmalı. discord.js Message yerine aynı
 * şekilli sahte nesnelerle de çağrılabilir; testler bunu kullanır.
 */
export function transkriptMetni(talep, mesajlar, { sunucuAdi = '' } = {}) {
  const tarih = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);

  const baslik = [
    `Talep #${talep.id}`,
    `Sunucu: ${sunucuAdi}`,
    `Açan: ${talep.kullanici_id}`,
    `Konu: ${talep.konu}`,
    `Açılış: ${tarih(talep.acilis)}`,
    `Kapanış: ${talep.kapanis ? tarih(talep.kapanis) : '-'}`,
    `Kapatan: ${talep.kapatan_id ?? '-'}`,
    `Mesaj sayısı: ${mesajlar.length}`,
    '='.repeat(60),
    '',
  ];

  const satirlar = mesajlar.map((m) => {
    const yazar = m.author?.tag ?? m.author?.username ?? m.author?.id ?? 'bilinmiyor';
    const ekler = [...(m.attachments?.values?.() ?? [])].map((a) => a.url);
    const govde = [m.content || '(boş mesaj)', ...ekler.map((u) => `[ek] ${u}`)];
    return `[${tarih(m.createdTimestamp ?? 0)}] ${yazar}: ${govde.join('\n    ')}`;
  });

  return [...baslik, ...satirlar, ''].join('\n');
}
