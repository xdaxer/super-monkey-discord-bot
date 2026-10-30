/**
 * Sunucuya özel yapılandırma: "Tam yapılandırılabilirlik" bu dosyaya dayanır.
 *
 * Her değer JSON olarak saklanır; böylece metin, sayı, boolean ve liste aynı
 * tabloda tutulabilir. Anahtarlar beyaz listeyle sınırlıdır ki yazım hatası
 * sessizce yeni bir ayar uydurmasın.
 */

import { PRESTIJ_SEVIYELERI, prestijRolAnahtari } from './prestij-rol.js';
import { ROZETLER, rozetRolAnahtari } from './rozet-rol.js';
import { KADEMELER, rolAyarAnahtari } from './seviye-rol.js';
import { kademeBonusAnahtari, kademeRolAnahtari, UYELIK_KADEMELERI } from './uyelik.js';

/** Açılıp kapatılabilen sistemler. */
export const SISTEMLER = {
  moderasyon: { etiket: 'Moderasyon', varsayilan: true },
  guvenlik: { etiket: 'Güvenlik / AutoMod', varsayilan: true },
  log: { etiket: 'Log sistemi', varsayilan: false, gerekliIntent: ['GuildMessages'] },
  karsilama: { etiket: 'Karşılama', varsayilan: false, gerekliIntent: ['GuildMembers'] },
  basvuru: { etiket: 'Başvuru sistemi', varsayilan: false },
  selamlama: { etiket: 'Selamlaşma', varsayilan: false, gerekliIntent: ['MessageContent'] },
  oylama: { etiket: 'Oylama', varsayilan: false, gerekliIntent: ['GuildMessages'] },
  youtube: { etiket: 'YouTube bildirimleri', varsayilan: false },
  talep: { etiket: 'Destek talebi (ticket)', varsayilan: false },
  cekilis: { etiket: 'Çekiliş', varsayilan: false },
  anket: { etiket: 'Anket', varsayilan: true },
  hatirlatici: { etiket: 'Hatırlatıcı', varsayilan: true },
  seviye: { etiket: 'Seviye / XP', varsayilan: false, gerekliIntent: ['GuildMessages'] },
  // Varsayılan kapalı: ekonomi yönetici bilerek açılmalı (kumar ve muz ödülleri içerir).
  ekonomi: { etiket: 'Ekonomi (muz) ve kumar', varsayilan: false },
  yedek: { etiket: 'Otomatik yedekleme', varsayilan: true },
  // Üyelik logu rol değişimini dinler; XP bonusu yalnız GuildMessages ister.
  uyelik: { etiket: 'YouTube üyelik (log + XP/muz bonusu)', varsayilan: false, gerekliIntent: ['GuildMembers'] },
  ozelses: { etiket: 'Özel ses odası', varsayilan: false, gerekliIntent: ['GuildVoiceStates'] },
  eglence: { etiket: 'Eğlence', varsayilan: true },
  resim: { etiket: 'Resim', varsayilan: true },
  kullanici: { etiket: 'Kullanıcı', varsayilan: true },
  sunucu: { etiket: 'Sunucu', varsayilan: true },
  // Carl-bot'un AutoRoles görevi: girene `otorol.rol` verilir.
  otorol: { etiket: 'Girişte otomatik rol', varsayilan: false, gerekliIntent: ['GuildMembers'] },
  // InviteManager'ın görevi: kim kimi davet etti (lib/davet.js).
  davet: { etiket: 'Davet takibi', varsayilan: false, gerekliIntent: ['GuildMembers'] },
  // Carl-bot'un starboard görevi: ⭐ eşiğini geçen mesaj `yildiz.kanal`a (lib/yildiz.js).
  yildiz: { etiket: 'Yıldız panosu', varsayilan: false, gerekliIntent: ['GuildMessageReactions'] },
};

/** `kanalListesi` ayarlarının varsayılanı; paylaşılan dizi değiştirilemesin diye dondurulmuş. */
const KANAL_LISTESI_BOS = Object.freeze([]);

/** Serbest ayar anahtarları ve varsayılanları. */
export const AYARLAR = {
  'log.kanal': { etiket: 'Log kanalı', tur: 'kanal', varsayilan: null },
  'log.olay.mesajSil': { etiket: 'Mesaj silme logu', tur: 'acik', varsayilan: true },
  'log.olay.mesajDuzenle': { etiket: 'Mesaj düzenleme logu', tur: 'acik', varsayilan: true },
  'log.olay.uyeGiris': { etiket: 'Üye giriş logu', tur: 'acik', varsayilan: true },
  'log.olay.uyeCikis': { etiket: 'Üye çıkış logu', tur: 'acik', varsayilan: true },
  'log.olay.moderasyon': { etiket: 'Ban/kick logu', tur: 'acik', varsayilan: true },
  'log.olay.kanal': { etiket: 'Kanal değişim logu', tur: 'acik', varsayilan: true },
  'log.olay.rol': { etiket: 'Rol değişim logu', tur: 'acik', varsayilan: true },
  'log.olay.ses': { etiket: 'Ses kanalı giriş/çıkış logu', tur: 'acik', varsayilan: true },
  'log.olay.uyeRol': { etiket: 'Üyeye rol verilme/alınma logu', tur: 'acik', varsayilan: true },
  'log.olay.uyeProfil': { etiket: 'Üye ad/takma ad/avatar logu', tur: 'acik', varsayilan: true },
  'log.olay.sunucu': { etiket: 'Sunucu ayarı değişim logu', tur: 'acik', varsayilan: true },

  'otorol.rol': { etiket: 'Girişte verilecek rol', tur: 'rol', varsayilan: null },
  'davet.logKanal': { etiket: 'Davet log kanalı', tur: 'kanal', varsayilan: null },
  'yildiz.kanal': { etiket: 'Yıldız panosu kanalı', tur: 'kanal', varsayilan: null },
  'yildiz.esik': { etiket: 'Yıldız panosu: gereken ⭐ sayısı', tur: 'sayi', varsayilan: 2, min: 1, max: 100 },

  'karsilama.kanal': { etiket: 'Karşılama kanalı', tur: 'kanal', varsayilan: null },
  'karsilama.mesaj': {
    etiket: 'Karşılama mesajı', tur: 'metin',
    varsayilan: 'Hoş geldin {kullanici}! **{sunucu}** sunucusunda {uyeSayisi}. üyemizsin.',
  },
  'karsilama.gorsel': { etiket: 'Karşılama görseli', tur: 'acik', varsayilan: true },
  'ugurlama.kanal': { etiket: 'Uğurlama kanalı', tur: 'kanal', varsayilan: null },
  'ugurlama.mesaj': {
    etiket: 'Uğurlama mesajı', tur: 'metin',
    varsayilan: '{kullaniciAdi} aramızdan ayrıldı. Şu an {uyeSayisi} kişiyiz.',
  },

  'basvuru.kanal': { etiket: 'Başvuru inceleme kanalı', tur: 'kanal', varsayilan: null },
  'basvuru.rol': { etiket: 'Başvuruları inceleyen rol', tur: 'rol', varsayilan: null },
  'basvuru.onayRolu': { etiket: 'Onaylananlara verilecek rol', tur: 'rol', varsayilan: null },

  'moderasyon.logKanal': { etiket: 'Moderasyon log kanalı', tur: 'kanal', varsayilan: null },
  // Bota gelen DM'lerin aktarıldığı yetkili kanalı; boşsa DM'ler aktarılmaz.
  'dm.logKanal': { etiket: 'Bota gelen DM kanalı', tur: 'kanal', varsayilan: null },

  // Kanal ayarlanmadıkça selamlaşma sessiz kalır: sunucunun tamamına yayılması
  // istenmeyen bir davranış, yöneticinin kanalı bilerek seçmesi gerekiyor.
  'selamlama.kanal': { etiket: 'Selamlaşma kanalı', tur: 'kanal', varsayilan: null },
  'selamlama.cevap.sa': { etiket: 'Yanıt: sa / selam', tur: 'metin', varsayilan: 'as' },
  'selamlama.cevap.merhaba': { etiket: 'Yanıt: merhaba', tur: 'metin', varsayilan: 'merhaba' },
  'selamlama.cevap.gunaydin': { etiket: 'Yanıt: günaydın', tur: 'metin', varsayilan: 'günaydın' },
  'selamlama.cevap.iyiGunler': { etiket: 'Yanıt: iyi günler', tur: 'metin', varsayilan: 'iyi günler' },
  'selamlama.cevap.iyiAksamlar': { etiket: 'Yanıt: iyi akşamlar', tur: 'metin', varsayilan: 'iyi akşamlar' },
  'selamlama.cevap.iyiGeceler': { etiket: 'Yanıt: iyi geceler', tur: 'metin', varsayilan: 'iyi geceler' },

  // Selamlaşmayla aynı gerekçe: kanal seçilmedikçe oylama sessiz kalır, yoksa
  // bot sunucudaki her mesaja tepki bırakmaya kalkar.
  'oylama.kanal': { etiket: 'Oylama kanalı', tur: 'kanal', varsayilan: null },

  // Talep: panel kanalı herkese açık, açılan kanallar kategoriye düşer,
  // kapanış transkripti log kanalına gider. Üçü de ayrı ayarlanabilir ki
  // yetkili gözü kullanıcı gözünden ayrılabilsin.
  'talep.panelKanal': { etiket: 'Talep paneli kanalı', tur: 'kanal', varsayilan: null },
  'talep.kategori': { etiket: 'Talep kanallarının kategorisi', tur: 'kanal', varsayilan: null },
  'talep.logKanal': { etiket: 'Talep transkript kanalı', tur: 'kanal', varsayilan: null },
  'talep.rol': { etiket: 'Talepleri gören yetkili rol', tur: 'rol', varsayilan: null },
  // Yapay zekâ yanıtı ANTHROPIC_API_KEY yoksa hiç çalışmaz (lib/talep-yz.js).
  'talep.yapayZeka': { etiket: 'Talebe otomatik yapay zekâ yanıtı', tur: 'acik', varsayilan: true },
  'talep.raporKanal': { etiket: 'Talep rapor kanalı', tur: 'kanal', varsayilan: null },
  'talep.mesaj': {
    etiket: 'Talep açılış mesajı',
    tur: 'metin',
    varsayilan: 'Merhaba {kullanici}! Talebini buraya yazabilirsin, yetkililer en kısa sürede dönecek.',
  },

  'cekilis.kanal': { etiket: 'Çekiliş kanalı', tur: 'kanal', varsayilan: null },

  'seviye.kanal': { etiket: 'Seviye atlama duyuru kanalı', tur: 'kanal', varsayilan: null },
  // Boş liste = her kanalda XP. Doluysa XP yalnız bu kanallarda (ve thread'lerinde) kazanılır.
  'seviye.kanallar': {
    etiket: 'XP kazanılan kanallar (boş = her yer)', tur: 'kanalListesi', varsayilan: KANAL_LISTESI_BOS, azami: 10,
  },
  // Ses kanalından bir Türkiye gününde kazanılabilecek en çok XP (0 = ses XP'si kapalı).
  'seviye.sesXpGunluk': {
    etiket: 'Ses XP\'si: günlük tavan (0 = kapalı)', tur: 'sayi', varsayilan: 1_000, min: 0, max: 100_000,
  },
  'seviye.mesaj': {
    etiket: 'Seviye atlama mesajı',
    tur: 'metin',
    varsayilan: '🎉 {kullanici} seviye **{seviye}** oldu!',
  },
  // Kademe başına bir rol; `npm run seviyerol` açıp yazar. Boş kademe atlanır.
  ...Object.fromEntries(KADEMELER.map((k) => [
    rolAyarAnahtari(k.seviye),
    { etiket: `Seviye ${k.seviye} rolü (${k.ad})`, tur: 'rol', varsayilan: null },
  ])),

  // Ekonomi: sayıların gerekçesi docs/para.md'de.
  'ekonomi.maksBahis': {
    etiket: 'Ekonomi: en yüksek bahis', tur: 'sayi', varsayilan: 25_000, min: 100, max: 10_000_000,
  },
  'ekonomi.vergiYuzde': {
    etiket: 'Ekonomi: transfer vergisi (%)', tur: 'sayi', varsayilan: 5, min: 0, max: 50,
  },
  'ekonomi.seviyeOdulu': {
    etiket: 'Ekonomi: seviye atlama ödülü (seviye × muz)', tur: 'sayi', varsayilan: 100, min: 0, max: 10_000,
  },
  // Kanal ayarlanmadıkça piyango sonucu duyurulmaz (çekiliş yine yapılır).
  'piyango.kanal': { etiket: 'Piyango sonuç kanalı', tur: 'kanal', varsayilan: null },
  // Kanal ayarlanmadıkça haftalık boss çıkmaz (/boss cagir da kanal ister).
  'boss.kanal': { etiket: 'Boss savaşı kanalı', tur: 'kanal', varsayilan: null },
  // Kanal ayarlanmadıkça hisse haberleri duyurulmaz (fiyat şoku yine uygulanır).
  'hisse.kanal': { etiket: 'Hisse haber kanalı', tur: 'kanal', varsayilan: null },
  // Boş liste = ekonomi komutları her kanalda çalışır. Doluyken yalnız bu
  // kanallarda (ve thread'lerinde) çalışır; denetim lib/interactions.js'te.
  'ekonomi.kanallar': {
    etiket: 'Ekonomi komutlarının çalışacağı kanallar (boş = her yer)', tur: 'kanalListesi', varsayilan: KANAL_LISTESI_BOS,
    azami: 10,
  },
  'ekonomi.mesajOdulu': { etiket: 'Ekonomi: sohbet mesajına muz', tur: 'acik', varsayilan: true },
  // Activity'deki büyük kazanç/kayıp ve nadir kasalar (lib/akis.js). Kanal
  // ayarlanmadıkça kanala düşmez; Activity'deki canlı akış şeridi yine çalışır.
  'ekonomi.akisKanal': { etiket: 'Ekonomi: öne çıkanlar kanalı (büyük kazanç, nadir kasa)', tur: 'kanal', varsayilan: null },
  // 2.000: 2026-10-14…21 verisiyle günde ~16 olay (14 kişi), kanala ~8 duyuru.
  'ekonomi.akisEsik': {
    etiket: 'Ekonomi: öne çıkanlara düşen en küçük kazanç/kayıp', tur: 'sayi', varsayilan: 2_000, min: 100, max: 10_000_000,
  },
  // Topluluk pazarı (lib/pazar.js); Activity → Yönetim → Pazar'dan da değişir.
  // Kapalıyken ilan açılamaz ve satın alınamaz; ilan kaldırmak serbesttir.
  'pazar.acik': { etiket: 'Pazar: alım satım açık', tur: 'acik', varsayilan: true },
  'pazar.kesintiYuzde': {
    etiket: 'Pazar: satış kesintisi (%)', tur: 'sayi', varsayilan: 10, min: 0, max: 50,
  },
  'pazar.tavanCarpani': {
    etiket: 'Pazar: fiyat tavanı (kart değerinin katı)', tur: 'sayi', varsayilan: 10, min: 1, max: 100,
  },
  'pazar.ilanSiniri': {
    etiket: 'Pazar: kişi başı açık ilan', tur: 'sayi', varsayilan: 20, min: 1, max: 200,
  },
  // Rozet başına bir rol; `npm run rozetrol` açıp yazar. Boş rozetin rolü verilmez.
  ...Object.fromEntries(ROZETLER.map((r) => [
    rozetRolAnahtari(r.kimlik),
    { etiket: `Rozet rolü: ${r.ad}`, tur: 'rol', varsayilan: null },
  ])),
  // Prestij seviyesi başına bir rol; `npm run prestijrol` açıp yazar. Boşsa rol verilmez.
  ...Object.fromEntries(PRESTIJ_SEVIYELERI.map((n) => [
    prestijRolAnahtari(n),
    { etiket: `Prestij rolü: Prestij ${n}`, tur: 'rol', varsayilan: null },
  ])),

  // Üyelik rolünü Discord'un YouTube entegrasyonu verir; rol ayarı yok,
  // bot entegrasyon etiketinden tanıyor (lib/uyelik.js).
  'uyelik.logKanal': { etiket: 'YouTube üyelik log kanalı', tur: 'kanal', varsayilan: null },
  'uyelik.xpBonusYuzde': {
    etiket: 'Üyelere XP bonusu (%)', tur: 'sayi', varsayilan: 50, min: 0, max: 400,
  },
  // Kademe başına muz bonusu; `npm run uyelik` boş kademe rollerini doldurur.
  ...Object.fromEntries(UYELIK_KADEMELERI.flatMap(({ no, bonusYuzde }) => [
    [kademeRolAnahtari(no), { etiket: `Katıl kademe ${no}: rol`, tur: 'rol', varsayilan: null }],
    [kademeBonusAnahtari(no), {
      etiket: `Katıl kademe ${no}: muz bonusu (%)`, tur: 'sayi', varsayilan: bonusYuzde, min: 0, max: 200,
    }],
  ])),

  // Oda oluştur kanalı bir SES kanalı olmalı; girene aynı kategoride oda açılır.
  'ozelses.kanal': { etiket: 'Özel ses: oda oluştur kanalı', tur: 'kanal', varsayilan: null },
  'ozelses.ad': { etiket: 'Özel ses: oda adı ({kullanici})', tur: 'metin', varsayilan: '🔊 {kullanici}' },
  'ozelses.limit': {
    etiket: 'Özel ses: kişi sınırı (0 = sınırsız)', tur: 'sayi', varsayilan: 0, min: 0, max: 99,
  },

  // Yedekleme sunucuya özel değil ama ayarlar tablosu tek yapılandırma
  // yeri olduğu için burada duruyor; tek guild kapsamında sorun çıkarmaz.
  'yedek.periyotSaat': { etiket: 'Yedek aralığı (saat)', tur: 'sayi', varsayilan: 12, min: 1, max: 168 },
  'yedek.saklanan': { etiket: 'Saklanacak yedek sayısı', tur: 'sayi', varsayilan: 14, min: 1, max: 200 },
};

/** Discord bir komut seçeneğinde en çok bu kadar hazır/otomatik seçenek taşır. */
export const SECENEK_SINIRI = 25;

/**
 * `/ayar` otomatik tamamlaması: sorguya uyan anahtarları Discord'un sınırına
 * göre kırpar. Anahtarlar ASCII olduğu için düz küçültme yetiyor.
 */
export function ayarSecenekleri(sorgu = '', sinir = SECENEK_SINIRI, tur = null) {
  const aranan = String(sorgu ?? '').trim().toLowerCase();

  return Object.entries(AYARLAR)
    .filter(([, tanim]) => tur === null || tanim.tur === tur)
    .map(([anahtar, tanim]) => ({ name: `${tanim.etiket} (${anahtar})`.slice(0, 100), value: anahtar }))
    .filter(({ name, value }) => aranan === ''
      || value.toLowerCase().includes(aranan) || name.toLowerCase().includes(aranan))
    .slice(0, sinir);
}

export class BilinmeyenAyar extends Error {}

function zorunluAnahtar(anahtar) {
  if (!Object.hasOwn(AYARLAR, anahtar)) {
    throw new BilinmeyenAyar(`Bilinmeyen ayar anahtarı: ${anahtar}`);
  }
}

function sistemAnahtari(sistem) {
  if (!Object.hasOwn(SISTEMLER, sistem)) {
    throw new BilinmeyenAyar(`Bilinmeyen sistem: ${sistem}`);
  }
  return `sistem.${sistem}`;
}

function okuHam(db, guildId, anahtar) {
  const satir = db
    .prepare('SELECT deger FROM ayarlar WHERE guild_id = ? AND anahtar = ?')
    .get(String(guildId), anahtar);
  if (!satir) return undefined;

  try {
    return JSON.parse(satir.deger);
  } catch {
    // Bozuk satırı varsayılana düşürüyoruz; tek bir hatalı kayıt komutu düşürmemeli.
    return undefined;
  }
}

function yazHam(db, guildId, anahtar, deger) {
  db.prepare(
    `INSERT INTO ayarlar (guild_id, anahtar, deger, guncelleme) VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id, anahtar) DO UPDATE SET deger = excluded.deger, guncelleme = excluded.guncelleme`,
  ).run(String(guildId), anahtar, JSON.stringify(deger), Date.now());
}

export function ayarGetir(db, guildId, anahtar) {
  zorunluAnahtar(anahtar);
  const deger = okuHam(db, guildId, anahtar);
  return deger === undefined ? AYARLAR[anahtar].varsayilan : deger;
}

export function ayarYaz(db, guildId, anahtar, deger) {
  zorunluAnahtar(anahtar);
  yazHam(db, guildId, anahtar, deger);
  return deger;
}

/**
 * Kanal listesi ayarına kanal ekler (yinelenen eklenmez) ya da çıkarır.
 * @returns {{ok: true, liste: string[], degisti: boolean} | {ok: false, sebep: string}}
 */
export function kanalListesiDegistir(db, guildId, anahtar, kanalId, islemTuru) {
  zorunluAnahtar(anahtar);
  const tanim = AYARLAR[anahtar];
  if (tanim.tur !== 'kanalListesi') {
    return { ok: false, sebep: `**${tanim.etiket}** bir kanal listesi değil; \`/ayar ayarla\` kullan.` };
  }

  const kanal = String(kanalId);
  const mevcut = ayarGetir(db, guildId, anahtar);
  let liste = [...mevcut];
  if (islemTuru === 'ekle') {
    if (liste.includes(kanal)) return { ok: true, liste, degisti: false };
    if (liste.length >= (tanim.azami ?? 25)) {
      return { ok: false, sebep: `Listeye en çok ${tanim.azami ?? 25} kanal eklenebilir.` };
    }
    liste.push(kanal);
  } else {
    liste = liste.filter((k) => k !== kanal);
    if (liste.length === mevcut.length) return { ok: true, liste, degisti: false };
  }
  yazHam(db, guildId, anahtar, liste);
  return { ok: true, liste, degisti: true };
}

export function ayarSifirla(db, guildId, anahtar) {
  zorunluAnahtar(anahtar);
  db.prepare('DELETE FROM ayarlar WHERE guild_id = ? AND anahtar = ?').run(String(guildId), anahtar);
  return AYARLAR[anahtar].varsayilan;
}

export function sistemAcikMi(db, guildId, sistem) {
  const deger = okuHam(db, guildId, sistemAnahtari(sistem));
  return deger === undefined ? SISTEMLER[sistem].varsayilan : Boolean(deger);
}

export function sistemAyarla(db, guildId, sistem, acik) {
  yazHam(db, guildId, sistemAnahtari(sistem), Boolean(acik));
  return Boolean(acik);
}

/** Bir sunucunun bütün sistem durumları ve ayarları; /ayar liste için. */
export function sunucuOzeti(db, guildId) {
  return {
    sistemler: Object.entries(SISTEMLER).map(([ad, tanim]) => ({
      ad, etiket: tanim.etiket, acik: sistemAcikMi(db, guildId, ad),
      gerekliIntent: tanim.gerekliIntent ?? [],
    })),
    ayarlar: Object.entries(AYARLAR).map(([anahtar, tanim]) => ({
      anahtar, etiket: tanim.etiket, tur: tanim.tur, deger: ayarGetir(db, guildId, anahtar),
      varsayilan: tanim.varsayilan,
    })),
  };
}
