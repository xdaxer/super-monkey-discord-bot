/**
 * Yetkili etkinlik modu: yöneticinin açtığı süreli ekonomi etkinlikleri.
 *
 * Etkinlik sunucuda tür başına tek satırdır; aynı tür tekrar başlatılırsa
 * süre güncellenir. Süresi geçen etkinlik etkisiz sayılır (okurken
 * `bitis > simdi`), ayrı bir temizlik servisi gerekmez. Her başlatma ayrıca
 * `etkinlik_gecmisi`ne yazılır (uzatma son satırı uzatır, erken bitirme
 * bitişi o ana çeker) ki etkinliklerin ekonomiye etkisi sonradan ölçülebilsin.
 * Sayılar docs/para.md ile birebir aynıdır.
 *
 * Birleşme kuralları (çarpanlar toplanmaz, çarpılır):
 *  - muz-2x × Muz Çiftliği (3x) = 6x sohbet muzu. Çiftlik yalnız sohbet
 *    muzunu etkiler; `/gunluk` yalnız etkinlikten 2 kat alır.
 *  - xp-2x × XP İksiri (2x) = 4x XP. Üst sınır koymuyoruz: XP 60 sn
 *    beklemeyle sınırlı, iki takviye de süreli ve biri para karşılığı;
 *    tavan, satın alınan iksirin değerini sessizce silerdi.
 *  - kasa-indirim yalnız mağaza fiyatını düşürür; başka bir indirimle
 *    birleşmez (şimdilik başka indirim yok).
 */

/** En az 10 dakika, en çok 7 gün. */
export const SURE_MIN_MS = 10 * 60_000;
export const SURE_MAX_MS = 7 * 86_400_000;

/** Kasa indirimi yüzdesi. */
export const KASA_INDIRIM_YUZDE = 25;

/** `seviye-kasa`: seviye kasasının bir üst sınıfı (Elmas aynı kalır). */
export const KASA_YUKSELTME = Object.freeze({
  'kasa-gunluk': 'kasa-ahsap',
  'kasa-ahsap': 'kasa-demir',
  'kasa-demir': 'kasa-altin',
  'kasa-altin': 'kasa-elmas',
  'kasa-elmas': 'kasa-elmas',
});

export const ETKINLIKLER = Object.freeze({
  'muz-2x': {
    ad: '2x Muz', simge: '🍌',
    etki: 'Günlük ödül ve sohbet muzu **2 kat** (Muz Çiftliği ile çarpılır).',
  },
  'xp-2x': {
    ad: '2x XP', simge: '✨',
    etki: 'Mesajlardan kazanılan XP **2 kat** (XP İksiri ile çarpılır).',
  },
  'kasa-indirim': {
    ad: 'Kasa İndirimi', simge: '🏷️',
    etki: `Mağazadaki kasalar **%${KASA_INDIRIM_YUZDE} indirimli**.`,
  },
  'seviye-kasa': {
    ad: 'Seviye Kasası Yükseltmesi', simge: '🎁',
    etki: 'Seviye atlayınca **bir üst sınıf kasa** (Günlük→Ahşap→Demir→Altın→Elmas).',
  },
});

export const ETKINLIK_TURLERI = Object.keys(ETKINLIKLER);

/** Etkinliğin açılış metni: "🍌 2x Muz". */
export function etkinlikAdi(tur) {
  const e = ETKINLIKLER[tur];
  return e ? `${e.simge} ${e.ad}` : tur;
}

/**
 * Etkinliği başlatır; varsa süresini yeniler.
 * @returns {{ok: false, sebep: string} | {ok: true, bitis: number, guncellendi: boolean}}
 */
export function etkinlikBaslat(db, {
  guildId, tur, sureMs, baslatanId, simdi = Date.now(),
}) {
  if (!ETKINLIKLER[tur]) return { ok: false, sebep: 'Bilinmeyen etkinlik türü.' };
  if (!Number.isFinite(sureMs) || sureMs < SURE_MIN_MS || sureMs > SURE_MAX_MS) {
    return { ok: false, sebep: 'Süre en az 10 dakika, en çok 7 gün olmalı (örnek: `30dk`, `2sa`, `1g`).' };
  }

  const guncellendi = etkinlikAktifMi(db, guildId, tur, simdi);
  const bitis = simdi + sureMs;
  db.prepare(
    `INSERT INTO etkinlikler (guild_id, tur, bitis, baslatan, baslangic) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(guild_id, tur) DO UPDATE SET
       bitis = excluded.bitis, baslatan = excluded.baslatan, baslangic = excluded.baslangic`,
  ).run(String(guildId), tur, bitis, String(baslatanId), simdi);
  const sonKayit = guncellendi ? gecmisSonId(db, guildId, tur) : null;
  if (sonKayit) {
    db.prepare('UPDATE etkinlik_gecmisi SET bitis = ? WHERE id = ?').run(bitis, sonKayit);
  } else {
    db.prepare('INSERT INTO etkinlik_gecmisi (guild_id, tur, baslangic, bitis, baslatan) VALUES (?, ?, ?, ?, ?)')
      .run(String(guildId), tur, simdi, bitis, String(baslatanId));
  }
  return { ok: true, bitis, guncellendi };
}

/** Türün geçmişteki son kaydı (yoksa null). */
function gecmisSonId(db, guildId, tur) {
  return db
    .prepare('SELECT id FROM etkinlik_gecmisi WHERE guild_id = ? AND tur = ? ORDER BY id DESC LIMIT 1')
    .get(String(guildId), tur)?.id ?? null;
}

/**
 * Etkinlik geçmişi, en yeni önce. `baslangic`/`bitis` verilirse yalnız o
 * aralığa değen etkinlikler.
 * @returns {Array<{tur: string, baslangic: number, bitis: number, baslatan: string, erken: boolean}>}
 */
export function etkinlikGecmisi(db, guildId, { baslangic = null, bitis = null, limit = 20 } = {}) {
  const kosul = baslangic !== null && bitis !== null ? ' AND bitis > ? AND baslangic < ?' : '';
  const aralik = kosul ? [baslangic, bitis] : [];
  return db
    .prepare(
      `SELECT tur, baslangic, bitis, baslatan, erken FROM etkinlik_gecmisi
        WHERE guild_id = ?${kosul} ORDER BY baslangic DESC, id DESC LIMIT ?`,
    )
    .all(String(guildId), ...aralik, limit)
    .map((e) => ({ ...e, erken: Boolean(e.erken) }));
}

/** Etkinliği erken bitirir. @returns {boolean} etkindi mi */
export function etkinlikBitir(db, guildId, tur, simdi = Date.now()) {
  const etkin = etkinlikAktifMi(db, guildId, tur, simdi);
  db.prepare('DELETE FROM etkinlikler WHERE guild_id = ? AND tur = ?').run(String(guildId), tur);
  const sonKayit = etkin ? gecmisSonId(db, guildId, tur) : null;
  if (sonKayit) db.prepare('UPDATE etkinlik_gecmisi SET bitis = ?, erken = 1 WHERE id = ?').run(simdi, sonKayit);
  return etkin;
}

export function etkinlikAktifMi(db, guildId, tur, simdi = Date.now()) {
  return Boolean(db
    .prepare('SELECT 1 AS var FROM etkinlikler WHERE guild_id = ? AND tur = ? AND bitis > ?')
    .get(String(guildId), tur, simdi));
}

/** Süresi dolmamış etkinlikler, bitişe göre. @returns {Array<{tur, bitis, baslatan, baslangic}>} */
export function aktifEtkinlikler(db, guildId, simdi = Date.now()) {
  return db
    .prepare(
      `SELECT tur, bitis, baslatan, baslangic FROM etkinlikler
       WHERE guild_id = ? AND bitis > ? ORDER BY bitis ASC, tur ASC`,
    )
    .all(String(guildId), simdi);
}

/** Çarpan etkinliği (muz-2x, xp-2x) etkinse 2, değilse 1. */
export function etkinlikCarpani(db, guildId, tur, simdi = Date.now()) {
  return (tur === 'muz-2x' || tur === 'xp-2x') && etkinlikAktifMi(db, guildId, tur, simdi) ? 2 : 1;
}

/**
 * Mağaza fiyatı; tek hesap noktası. Yalnız `tur: 'kasa'` ve satılan eşyalar
 * indirimden etkilenir; indirim aşağı yuvarlanır.
 * @returns {{fiyat: number|null, eski: number|null, indirimli: boolean}}
 */
export function etkinlikFiyati(db, guildId, esya, simdi = Date.now()) {
  const eski = esya.fiyat;
  if (eski === null || esya.tur !== 'kasa' || !etkinlikAktifMi(db, guildId, 'kasa-indirim', simdi)) {
    return { fiyat: eski, eski, indirimli: false };
  }
  return { fiyat: Math.floor((eski * (100 - KASA_INDIRIM_YUZDE)) / 100), eski, indirimli: true };
}

/** Seviye kasasını etkinliğe göre yükseltir (etkinlik yoksa aynısı). */
export function seviyeKasasiEtkinlikli(db, guildId, kasa, simdi = Date.now()) {
  if (!etkinlikAktifMi(db, guildId, 'seviye-kasa', simdi)) return kasa;
  return KASA_YUKSELTME[kasa] ?? kasa;
}

/** Etkin etkinliklerin kısa satırları ("🍌 2x Muz — bitiş <t:..:R>"); gösterim için. */
export function etkinlikSatirlari(db, guildId, zamanBicim, simdi = Date.now()) {
  return aktifEtkinlikler(db, guildId, simdi)
    .map((e) => `${etkinlikAdi(e.tur)} — ${zamanBicim(e.bitis, 'R')}`);
}
