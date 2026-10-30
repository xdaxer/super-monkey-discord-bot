import { PermissionFlagsBits } from 'discord.js';

import { optionalEnv } from './env.js';

export { PermissionFlagsBits };

/**
 * Bot sahibinin Discord kullanıcı kimliği (.env → authorUserID).
 */
export function botSahibi() {
  return optionalEnv('authorUserID');
}

/**
 * Sahip dışında yetkili geliştiricilerin kimlikleri
 * (.env → developerUserIDs, virgülle ayrılmış).
 *
 * Sahipten ayrı tutuluyor: sahip tektir ve değişmez, geliştirici listesi
 * projeye kim dokunuyorsa ona göre değişir. Ayrı olunca kaydın "bu komuta
 * kim erişebiliyor" sorusuna verdiği cevap da ikisini ayırt edebiliyor.
 */
export function gelistiriciler(ham = optionalEnv('developerUserIDs')) {
  return String(ham ?? '')
    .split(',')
    .map((parca) => parca.trim())
    // Snowflake yalnız rakamdır; yanlışlıkla yazılan isim/boşluk sessizce elenir
    // ki bozuk bir satır bütün listeyi geçersiz kılmasın.
    .filter((parca) => /^\d+$/.test(parca));
}

/** Sahibe özel komutlara erişebilen bütün kimlikler. */
export function yetkiliKimlikler(sahipId = botSahibi(), gelistiriciListesi = gelistiriciler()) {
  return [...new Set([sahipId, ...gelistiriciListesi].filter(Boolean).map(String))];
}

/**
 * Kullanıcının sahibe özel komutları kullanıp kullanamayacağını denetler.
 *
 * Yetkili kimse yoksa KİMSE geçemez. Kapalı tarafa düşmek bilinçli: sahibe
 * özel bir komutun, kimlik eksik diye sessizce bütün yöneticilere açılması
 * en kötü sonuç olurdu.
 *
 * Karşılaştırma metin üzerinden: Discord kimlikleri snowflake ve
 * Number.MAX_SAFE_INTEGER'ı aşıyor, sayıya çevrilirse sessizce bozulur.
 *
 * @returns {{ok: true, rol: 'sahip'|'gelistirici'} | {ok: false, sebep: string}}
 */
export function sahipKontrol(kullaniciId, sahipId = botSahibi(), gelistiriciListesi = gelistiriciler()) {
  const yetkili = yetkiliKimlikler(sahipId, gelistiriciListesi);

  if (yetkili.length === 0) {
    return {
      ok: false,
      sebep: '⛔ Bu komut yalnız bot sahibine ve yetkili geliştiricilere açık, ama '
        + '`app/.env` içinde `authorUserID` ayarlanmamış. Ayarlanana kadar kimse kullanamaz.',
    };
  }

  const kimlik = String(kullaniciId);
  if (!yetkili.includes(kimlik)) {
    return {
      ok: false,
      sebep: '⛔ Bu komutu yalnız bot sahibi ve yetkili geliştiriciler kullanabilir.',
    };
  }

  return { ok: true, rol: kimlik === String(sahipId) ? 'sahip' : 'gelistirici' };
}

/**
 * Moderasyon işlemlerinde rol hiyerarşisini ve özel durumları denetler.
 *
 * Saf fonksiyon: discord.js nesneleri yerine aynı şekle sahip sahte nesnelerle
 * de çağrılabilir, bu yüzden testlerde Discord'a bağlanmak gerekmez.
 *
 * @returns {{ok: true} | {ok: false, sebep: string}}
 */
export function hiyerarsiKontrol({ guild, uygulayan, hedef, bot }) {
  if (hedef.id === guild.ownerId) {
    return { ok: false, sebep: 'Sunucu sahibine işlem yapılamaz.' };
  }
  if (hedef.id === bot.id) {
    return { ok: false, sebep: 'Bot kendisine işlem yapamaz.' };
  }
  if (hedef.id === uygulayan.id) {
    return { ok: false, sebep: 'Kendinize işlem yapamazsınız.' };
  }

  // Sunucu sahibi rol karşılaştırmasından muaftır; zaten herkesten yüksektir.
  if (uygulayan.id !== guild.ownerId
      && uygulayan.roles.highest.comparePositionTo(hedef.roles.highest) <= 0) {
    return {
      ok: false,
      sebep: 'Hedefin en yüksek rolü sizinkiyle aynı veya sizden yüksek.',
    };
  }

  if (bot.roles.highest.comparePositionTo(hedef.roles.highest) <= 0) {
    return {
      ok: false,
      sebep: 'Hedefin rolü botun rolünden yüksek. Sunucu ayarlarından botun rolünü yukarı taşıyın.',
    };
  }

  return { ok: true };
}

/**
 * Botun gerekli sunucu yetkisine sahip olup olmadığını söyler.
 * @returns {{ok: true} | {ok: false, sebep: string}}
 */
export function botYetkisiKontrol(botUye, ...bayraklar) {
  const eksik = bayraklar.filter((bayrak) => !botUye.permissions.has(bayrak));
  if (eksik.length === 0) return { ok: true };

  const adlar = eksik.map((bayrak) => YETKI_ADLARI.get(bayrak) ?? 'bilinmeyen yetki');
  return {
    ok: false,
    sebep: `Botun şu yetkisi eksik: ${adlar.join(', ')}. Sunucu ayarlarından verin.`,
  };
}

/**
 * Botun bir kanaldaki yetkilerini denetler. Sunucu geneli yetki yetmiyor:
 * kanal izni ayrıca kapatılmış olabilir.
 * @returns {{ok: true} | {ok: false, sebep: string}}
 */
export function kanalYetkisiKontrol(kanal, botUye, ...bayraklar) {
  const izinler = kanal?.permissionsFor?.(botUye);
  if (!izinler) return { ok: false, sebep: 'Botun bu kanaldaki yetkileri okunamadı.' };

  const eksik = bayraklar.filter((bayrak) => !izinler.has(bayrak));
  if (eksik.length === 0) return { ok: true };

  const adlar = eksik.map((bayrak) => YETKI_ADLARI.get(bayrak) ?? 'bilinmeyen yetki');
  return {
    ok: false,
    sebep: `Botun bu kanalda şu yetkisi eksik: ${adlar.join(', ')}. Kanal izinlerinden verin.`,
  };
}

export const YETKI_ADLARI = new Map([
  [PermissionFlagsBits.BanMembers, 'Üyeleri Yasakla'],
  [PermissionFlagsBits.KickMembers, 'Üyeleri At'],
  [PermissionFlagsBits.ModerateMembers, 'Üyeleri Denetle (timeout)'],
  [PermissionFlagsBits.ManageMessages, 'Mesajları Yönet'],
  [PermissionFlagsBits.ManageGuild, 'Sunucuyu Yönet'],
  [PermissionFlagsBits.ManageRoles, 'Rolleri Yönet'],
  [PermissionFlagsBits.ViewAuditLog, 'Denetim Kaydını Görüntüle'],
  [PermissionFlagsBits.SendMessages, 'Mesaj Gönder'],
  [PermissionFlagsBits.SendMessagesInThreads, 'Alt Başlıklarda Mesaj Gönder'],
  [PermissionFlagsBits.MentionEveryone, '@everyone, @here ve Tüm Rollerden Bahset'],
  [PermissionFlagsBits.EmbedLinks, 'Bağlantıları Göm'],
  [PermissionFlagsBits.AttachFiles, 'Dosya Ekle'],
  [PermissionFlagsBits.AddReactions, 'Tepki Ekle'],
  [PermissionFlagsBits.ReadMessageHistory, 'Mesaj Geçmişini Oku'],
  [PermissionFlagsBits.ViewChannel, 'Kanalı Görüntüle'],
]);
