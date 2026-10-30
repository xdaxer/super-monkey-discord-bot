/**
 * Davet takibi (InviteManager yerine).
 *
 * Discord bir üyenin hangi davetle geldiğini söylemez. Davetlerin kullanım
 * sayılarını önbellekte tutup üye girince yeniden çekiyoruz; sayısı artan
 * davet, üyenin geldiği davettir.
 */

/** Discord davet nesnesini önbellek kaydına çevirir. */
export function davetKaydi(davet) {
  return {
    uses: davet.uses ?? 0,
    maxUses: davet.maxUses ?? 0,
    inviterId: davet.inviterId ?? davet.inviter?.id ?? null,
    inviterAd: davet.inviter?.username ?? null,
  };
}

/** Kullanım sınırı bu girişle dolmuş olabilecek (Discord'un sildiği) davet mi? */
const dolmusOlabilir = (d) => d.maxUses > 0 && d.uses + 1 >= d.maxUses;

/**
 * Üyenin kullandığı davetin kodunu bulur.
 *
 * @param {Map<string, object>} onceki girişten önceki önbellek
 * @param {Map<string, object>} simdiki girişten sonra çekilen davetler
 * @param {Map<string, object>} silinenler yakın zamanda silinen davetler; sınırı
 *   dolan davet Discord'da silinir ve silinme olayı girişten önce gelebilir
 * @returns {string|null} tek aday yoksa null (tahmin etmeyiz)
 */
export function kullanilanDavet(onceki, simdiki, silinenler = new Map()) {
  const artan = [...simdiki].filter(([kod, d]) => d.uses > (onceki.get(kod)?.uses ?? 0));
  if (artan.length === 1) return artan[0][0];
  if (artan.length > 1) return null;

  const adaylar = new Set();
  for (const [kod, d] of onceki) {
    if (!simdiki.has(kod) && dolmusOlabilir(d)) adaylar.add(kod);
  }
  for (const [kod, d] of silinenler) {
    if (dolmusOlabilir(d)) adaylar.add(kod);
  }
  return adaylar.size === 1 ? [...adaylar][0] : null;
}

export function katilimKaydet(db, guildId, {
  uyeId, davetEdenId = null, davetEdenAd = null, kod = null,
  kaynak = 'bot', kaynakMesajId = null, zaman = Date.now(),
}) {
  return db.prepare(
    `INSERT INTO davet_katilimlari
       (guild_id, uye_id, davet_eden_id, davet_eden_ad, kod, kaynak, kaynak_mesaj_id, zaman)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(kaynak_mesaj_id) DO NOTHING`,
  ).run(String(guildId), String(uyeId), davetEdenId, davetEdenAd, kod, kaynak, kaynakMesajId, zaman);
}

/** Üyenin açık (henüz ayrılmamış) son girişini kapatır; o satırı döndürür. */
export function ayrilmaIsaretle(db, guildId, uyeId, zaman = Date.now()) {
  const satir = db.prepare(
    `SELECT * FROM davet_katilimlari WHERE guild_id = ? AND uye_id = ? AND ayrilma IS NULL
     ORDER BY zaman DESC, id DESC LIMIT 1`,
  ).get(String(guildId), String(uyeId));
  if (!satir) return null;

  db.prepare('UPDATE davet_katilimlari SET ayrilma = ? WHERE id = ?').run(zaman, satir.id);
  return { ...satir, ayrilma: zaman };
}

/** Üyeyi en son kim davet etti (içe aktarılan geçmiş dahil). */
export function davetEdeni(db, guildId, uyeId) {
  return db.prepare(
    `SELECT * FROM davet_katilimlari WHERE guild_id = ? AND uye_id = ?
     ORDER BY zaman DESC, id DESC LIMIT 1`,
  ).get(String(guildId), String(uyeId)) ?? null;
}

export function baslangicYaz(db, guildId, kullaniciId, adet, zaman = Date.now()) {
  db.prepare(
    `INSERT INTO davet_baslangic (guild_id, kullanici_id, adet, zaman) VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id, kullanici_id) DO UPDATE SET adet = excluded.adet, zaman = excluded.zaman`,
  ).run(String(guildId), String(kullaniciId), adet, zaman);
}

/** Başlangıçtan sonraki bot kayıtları: sayıma giren girişler. */
const SAYILAN = `
  FROM davet_katilimlari k
  LEFT JOIN davet_baslangic b ON b.guild_id = k.guild_id AND b.kullanici_id = k.davet_eden_id
  WHERE k.guild_id = ? AND k.kaynak = 'bot' AND k.davet_eden_id IS NOT NULL
    AND k.zaman > COALESCE(b.zaman, 0)`;

/**
 * Bir kullanıcının davet sayısı. `toplam` InviteManager'dan devralınan sayı
 * ile botun saydığı girişlerin toplamıdır; `ayrilan` yalnız botun gördüğü
 * çıkışlardır (InviteManager çıkışları ayrı bildirmiyordu).
 */
export function davetSayisi(db, guildId, kullaniciId) {
  const g = String(guildId);
  const k = String(kullaniciId);
  const baslangic = db.prepare('SELECT adet FROM davet_baslangic WHERE guild_id = ? AND kullanici_id = ?')
    .get(g, k)?.adet ?? 0;
  const bot = db.prepare(
    `SELECT COUNT(*) AS adet, COUNT(k.ayrilma) AS ayrilan ${SAYILAN} AND k.davet_eden_id = ?`,
  ).get(g, k);

  return { toplam: baslangic + bot.adet, devralinan: baslangic, yeni: bot.adet, ayrilan: bot.ayrilan };
}

export function davetSiralamasi(db, guildId, sinir = 10) {
  const g = String(guildId);
  return db.prepare(
    `SELECT kullanici_id, SUM(adet) AS toplam FROM (
       SELECT kullanici_id, adet FROM davet_baslangic WHERE guild_id = ?
       UNION ALL
       SELECT k.davet_eden_id AS kullanici_id, 1 AS adet ${SAYILAN}
     ) GROUP BY kullanici_id HAVING toplam > 0 ORDER BY toplam DESC, kullanici_id LIMIT ?`,
  ).all(g, g, sinir);
}

/**
 * InviteManager'ın invite-log satırını ayrıştırır:
 * `<@id> **joined**; Invited by **ad** (**N** invites)`
 * Bulunamayan girişler (`I can't figure out how <@id> joined`) davet edensiz döner.
 */
export function inviteManagerSatiri(icerik) {
  const tam = /^<@!?(\d+)> \*\*(\w+)\*\*; Invited by \*\*(.+?)\*\* \(\*\*(-?\d+)\*\* invites?\)/.exec(icerik);
  if (tam) return { uyeId: tam[1], eylem: tam[2], davetEdenAd: tam[3], sayi: Number(tam[4]) };

  const bilinmeyen = /^I can't figure out how <@!?(\d+)> joined/.exec(icerik);
  if (bilinmeyen) return { uyeId: bilinmeyen[1], eylem: 'joined', davetEdenAd: null, sayi: null };

  return null;
}
