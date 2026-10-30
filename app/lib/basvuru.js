export const DURUMLAR = { beklemede: 'beklemede', onay: 'onay', ret: 'ret' };

export const SORULAR = [
  { id: 'tanitim', etiket: 'Kendini kısaca tanıt', uzun: true, enFazla: 500 },
  { id: 'neden', etiket: 'Neden başvuruyorsun?', uzun: true, enFazla: 500 },
  { id: 'ek', etiket: 'Eklemek istediğin bir şey var mı?', uzun: true, enFazla: 300, zorunlu: false },
];

export function bekleyenBasvuru(db, guildId, kullaniciId) {
  return db
    .prepare(`SELECT id, zaman FROM basvurular
              WHERE guild_id = ? AND kullanici_id = ? AND durum = ?`)
    .get(String(guildId), String(kullaniciId), DURUMLAR.beklemede) ?? null;
}

export function basvuruEkle(db, { guildId, kullaniciId, form, cevaplar }) {
  const sonuc = db
    .prepare(`INSERT INTO basvurular (guild_id, kullanici_id, form, cevaplar, durum, zaman)
              VALUES (?, ?, ?, ?, ?, ?)`)
    .run(String(guildId), String(kullaniciId), form, JSON.stringify(cevaplar),
         DURUMLAR.beklemede, Date.now());

  return Number(sonuc.lastInsertRowid);
}

export function basvuruGetir(db, guildId, id) {
  const satir = db
    .prepare('SELECT * FROM basvurular WHERE guild_id = ? AND id = ?')
    .get(String(guildId), Number(id));
  if (!satir) return null;

  let cevaplar = {};
  try {
    cevaplar = JSON.parse(satir.cevaplar);
  } catch {
    cevaplar = {};
  }

  return { ...satir, cevaplar };
}

export function mesajBagla(db, guildId, id, mesajId) {
  db.prepare('UPDATE basvurular SET mesaj_id = ? WHERE guild_id = ? AND id = ?')
    .run(String(mesajId), String(guildId), Number(id));
}

/**
 * Kararı yazar. Yalnız beklemedeki başvuru karara bağlanabilir; böylece aynı
 * butona iki kez basılması ikinci kez işlem yapmaz.
 *
 * @returns {boolean} karar gerçekten yazıldıysa true
 */
export function basvuruKarar(db, { guildId, id, durum, kararVerenId }) {
  if (durum !== DURUMLAR.onay && durum !== DURUMLAR.ret) {
    throw new Error(`Geçersiz başvuru durumu: ${durum}`);
  }

  const sonuc = db
    .prepare(`UPDATE basvurular SET durum = ?, karar_veren_id = ?
              WHERE guild_id = ? AND id = ? AND durum = ?`)
    .run(durum, String(kararVerenId), String(guildId), Number(id), DURUMLAR.beklemede);

  return sonuc.changes > 0;
}

/** Buton customId'sini ayrıştırır: "basvuru:onay:12" -> {eylem, id} */
export function butonAyristir(customId) {
  const parcalar = String(customId).split(':');
  if (parcalar[0] !== 'basvuru' || parcalar.length !== 3) return null;

  const [, eylem, ham] = parcalar;
  if (eylem !== 'onay' && eylem !== 'ret') return null;

  const id = Number(ham);
  if (!Number.isInteger(id) || id <= 0) return null;

  return { eylem, id };
}
