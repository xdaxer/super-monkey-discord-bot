/**
 * Hatırlatıcı: belirtilen zamanda, kurulduğu kanalda kurucuyu (ve isterse
 * seçtiği kişi/rolü) etiketleyen mesaj.
 *
 * Kayıt tabloda tutulur ki bot yeniden başladığında bekleyen hatırlatmalar
 * kaybolmasın; bot kapalıyken zamanı geçenler açılıştaki ilk turda gönderilir.
 *
 * Zaman ayrıştırma ve mesaj içeriği saf: Discord'a istek atmadan test edilir.
 */

export const DURUMLAR = Object.freeze({
  bekliyor: 'bekliyor',
  gonderildi: 'gonderildi',
  iptal: 'iptal',
});

/** Tarama 15 saniyede bir; daha kısa hatırlatma anlamlı zamanda gelmez. */
export const EN_KISA_MS = 60_000;
export const EN_UZUN_MS = 365 * 86_400_000;
export const MESAJ_SINIRI = 1000;
/** Kişi başı bekleyen hatırlatma sınırı: kanalı zamanlanmış etiketle doldurmayı engeller. */
export const KISI_BASI_SINIR = 25;

/**
 * Mutlak saatler Türkiye saatiyle okunur. Türkiye 2016'dan beri sabit UTC+3
 * (yaz saati yok), bu yüzden saat dilimi veritabanına gerek kalmıyor.
 */
const TR_OFFSET_MS = 3 * 3_600_000;

const BIRIMLER = {
  sn: 1000, s: 1000,
  dk: 60_000, d: 60_000, m: 60_000,
  sa: 3_600_000, h: 3_600_000,
  g: 86_400_000,
  hf: 7 * 86_400_000, w: 7 * 86_400_000,
};

/** "1sa30dk", "2g 3sa", "45dk" gibi bileşik göreli süreyi ms'ye çevirir. */
function goreliAyristir(metin) {
  const temiz = metin.replace(/\s+/g, '');
  if (!/^(\d+(sn|dk|sa|hf|g|s|d|h|m|w))+$/i.test(temiz)) return null;

  let toplam = 0;
  for (const [, miktar, birim] of temiz.matchAll(/(\d+)(sn|dk|sa|hf|g|s|d|h|m|w)/gi)) {
    toplam += Number(miktar) * BIRIMLER[birim.toLowerCase()];
  }
  return Number.isFinite(toplam) && toplam > 0 ? toplam : null;
}

/** Türkiye saatindeki takvim alanlarından UTC zaman damgası üretir. */
function trZamani(yil, ay, gun, saat, dakika) {
  return Date.UTC(yil, ay - 1, gun, saat, dakika) - TR_OFFSET_MS;
}

/** Ayrıştırılan alanlar gerçek bir takvim günü mü (31.02 gibi taşmaları eler). */
function gecerliTarih(yil, ay, gun, saat, dakika) {
  if (saat > 23 || dakika > 59) return false;
  const d = new Date(Date.UTC(yil, ay - 1, gun));
  return d.getUTCFullYear() === yil && d.getUTCMonth() === ay - 1 && d.getUTCDate() === gun;
}

/**
 * Kullanıcının yazdığı zamanı mutlak zaman damgasına çevirir.
 *
 * Kabul edilenler:
 *  - göreli: `10dk`, `2sa`, `1sa30dk`, `3g`, `1hf`
 *  - saat: `21:30` (geçtiyse yarın)
 *  - `yarın 09:00`
 *  - tarih: `05.10 21:30`, `05.10.2026 21:30` (yılsız tarih geçtiyse gelecek yıl)
 *
 * @returns {{ok: true, zaman: number} | {ok: false, sebep: string}}
 */
export function zamanAyristir(metin, simdi = Date.now()) {
  const ham = String(metin ?? '').trim().toLocaleLowerCase('tr');
  const ornek = 'Örnek: `30dk`, `1sa30dk`, `21:30`, `yarın 09:00`, `05.10 21:30`.';
  if (!ham) return { ok: false, sebep: `Zaman boş olamaz. ${ornek}` };

  const sure = goreliAyristir(ham);
  if (sure !== null) return sinirla(simdi + sure, simdi);

  // Türkiye saatine göre "bugün"ün takvim alanları.
  const tr = new Date(simdi + TR_OFFSET_MS);
  const bugun = { yil: tr.getUTCFullYear(), ay: tr.getUTCMonth() + 1, gun: tr.getUTCDate() };

  const saatEslesme = /^(?:(yarın|yarin)\s+)?(\d{1,2})[:.](\d{2})$/.exec(ham);
  if (saatEslesme) {
    const [, yarin, sa, dk] = saatEslesme;
    const saat = Number(sa);
    const dakika = Number(dk);
    if (saat > 23 || dakika > 59) return { ok: false, sebep: `Geçersiz saat. ${ornek}` };

    let zaman = trZamani(bugun.yil, bugun.ay, bugun.gun, saat, dakika);
    if (yarin) zaman += 86_400_000;
    // Yalnız saat verildiyse ve bugün geçtiyse yarını kastediyor.
    else if (zaman <= simdi) zaman += 86_400_000;
    return sinirla(zaman, simdi);
  }

  const tarihEslesme = /^(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?\s+(\d{1,2})[:.](\d{2})$/.exec(ham);
  if (tarihEslesme) {
    const [, g, a, y, sa, dk] = tarihEslesme;
    const gun = Number(g);
    const ay = Number(a);
    const saat = Number(sa);
    const dakika = Number(dk);
    let yil = y ? Number(y) : bugun.yil;

    if (!gecerliTarih(yil, ay, gun, saat, dakika)) {
      return { ok: false, sebep: `Geçersiz tarih veya saat. ${ornek}` };
    }

    let zaman = trZamani(yil, ay, gun, saat, dakika);
    if (zaman <= simdi && !y) {
      yil += 1;
      if (!gecerliTarih(yil, ay, gun, saat, dakika)) {
        return { ok: false, sebep: 'Bu tarih geçti ve gelecek yıl yok (29 Şubat).' };
      }
      zaman = trZamani(yil, ay, gun, saat, dakika);
    }
    return sinirla(zaman, simdi);
  }

  return { ok: false, sebep: `Zaman anlaşılamadı. ${ornek}` };
}

function sinirla(zaman, simdi) {
  const fark = zaman - simdi;
  if (fark <= 0) return { ok: false, sebep: 'Bu zaman geçmişte kalıyor.' };
  if (fark < EN_KISA_MS) return { ok: false, sebep: 'Hatırlatma en az 1 dakika sonrası için kurulabilir.' };
  if (fark > EN_UZUN_MS) return { ok: false, sebep: 'Hatırlatma en çok 1 yıl sonrası için kurulabilir.' };
  return { ok: true, zaman };
}

export function hatirlaticiEkle(db, { guildId, kanalId, kullaniciId, mesaj, etiketId = null,
  etiketTur = null, zaman, simdi = Date.now() }) {
  const sonuc = db.prepare(
    `INSERT INTO hatirlaticilar
       (guild_id, kanal_id, kullanici_id, mesaj, etiket_id, etiket_tur, zaman, durum, olusturma, mesaj_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  ).run(String(guildId), String(kanalId), String(kullaniciId), String(mesaj),
    etiketId ? String(etiketId) : null, etiketTur, zaman, DURUMLAR.bekliyor, simdi);

  return Number(sonuc.lastInsertRowid);
}

/** Kurulum onay mesajını bağlar; hatırlatma o mesaja yanıt olarak düşer. */
export function mesajBagla(db, id, mesajId) {
  db.prepare('UPDATE hatirlaticilar SET mesaj_id = ? WHERE id = ?').run(String(mesajId), id);
}

export function hatirlaticiGetir(db, id) {
  return db.prepare('SELECT * FROM hatirlaticilar WHERE id = ?').get(id) ?? null;
}

/** Bir kullanıcının bu sunucudaki bekleyen hatırlatmaları, yakından uzağa. */
export function bekleyenler(db, guildId, kullaniciId) {
  return db.prepare(
    `SELECT * FROM hatirlaticilar
     WHERE guild_id = ? AND kullanici_id = ? AND durum = ? ORDER BY zaman ASC`,
  ).all(String(guildId), String(kullaniciId), DURUMLAR.bekliyor);
}

/** Zamanı gelmiş bütün bekleyen hatırlatmalar. */
export function zamaniGelenler(db, simdi = Date.now()) {
  return db.prepare(
    'SELECT * FROM hatirlaticilar WHERE durum = ? AND zaman <= ? ORDER BY zaman ASC',
  ).all(DURUMLAR.bekliyor, simdi);
}

/**
 * Hatırlatmayı gönderilmiş sayar. Yalnız bekleyen kayıt değişir: iki tur
 * aynı anda denese de etiket bir kez gider.
 * @returns {boolean} bu çağrı mı teslim aldı
 */
export function teslimAl(db, id) {
  return db.prepare('UPDATE hatirlaticilar SET durum = ? WHERE id = ? AND durum = ?')
    .run(DURUMLAR.gonderildi, id, DURUMLAR.bekliyor).changes > 0;
}

export function iptalEt(db, id) {
  return db.prepare('UPDATE hatirlaticilar SET durum = ? WHERE id = ? AND durum = ?')
    .run(DURUMLAR.iptal, id, DURUMLAR.bekliyor).changes > 0;
}

/** Etiket metni: kişi, rol ya da @everyone (rol kimliği sunucu kimliğine eşit). */
export function etiketMetni(kayit) {
  if (!kayit.etiket_id) return '';
  if (kayit.etiket_tur === 'rol') {
    return kayit.etiket_id === kayit.guild_id ? '@everyone' : `<@&${kayit.etiket_id}>`;
  }
  return `<@${kayit.etiket_id}>`;
}

/**
 * Zamanı gelince gönderilecek mesaj.
 *
 * allowedMentions yalnız kurucuyu ve seçilen hedefi bırakır: hatırlatma
 * metnine yazılmış @everyone ya da rol etiketi kimseyi çağırmaz.
 */
export function hatirlatmaIcerigi(kayit) {
  const etiketler = [`<@${kayit.kullanici_id}>`];
  const ek = etiketMetni(kayit);
  if (ek && ek !== `<@${kayit.kullanici_id}>`) etiketler.push(ek);

  const alinti = String(kayit.mesaj).split('\n').map((satir) => `> ${satir}`).join('\n');

  const izin = { parse: [], users: [String(kayit.kullanici_id)], roles: [] };
  if (kayit.etiket_id && kayit.etiket_tur === 'rol') {
    if (kayit.etiket_id === kayit.guild_id) izin.parse.push('everyone');
    else izin.roles.push(kayit.etiket_id);
  } else if (kayit.etiket_id && !izin.users.includes(kayit.etiket_id)) {
    izin.users.push(kayit.etiket_id);
  }

  return {
    content: `⏰ ${etiketler.join(' ')} hatırlatma:\n${alinti}`,
    allowedMentions: izin,
  };
}
