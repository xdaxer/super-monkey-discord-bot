/**
 * Özel ses odası (katıl-oluştur): ayarlı "oda oluştur" ses kanalına giren
 * üyeye aynı kategoride kendi ses kanalı açılır, üye oraya taşınır; oda
 * boşalınca silinir (karar D-OZELSES).
 *
 * Karar ve izin hesabı burada saf tutuluyor (Discord nesnesi almıyor) ki
 * birim testiyle doğrulanabilsin; olay dosyası yalnız Discord işini yapar.
 */

import { OverwriteType, PermissionFlagsBits } from 'discord.js';

/** Discord kanal adı sınırı. */
export const AD_SINIRI = 100;

/** Şablon boş veya yalnız boşluk üretirse kullanılan ad. */
export const YEDEK_AD = 'Ses Odası';

/**
 * Oda sahibinin kendi odasındaki izinleri. ManageChannels: yeniden adlandırma
 * ve kişi sınırı; MoveMembers: istemediği kişiyi odadan çıkarma.
 * ManageRoles bilerek yok: izin üzerine yazmalarını değiştirebilen sahip,
 * kategorinin gizlilik kurallarını kendi odasında delebilirdi. Kilit, gizlilik
 * ve izin/engel listesini sahip panelden ister, izinleri bot uygular.
 */
export const SAHIP_IZINLERI = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
  PermissionFlagsBits.Stream,
  PermissionFlagsBits.UseVAD,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.MoveMembers,
];

/** Botun odayı yönetip üyeyi taşıyabilmesi ve panel mesajını yazabilmesi için gerekenler. */
export const BOT_IZINLERI = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.MoveMembers,
];

/**
 * Odada @everyone'a açılanlar. Bu sunucuda @everyone ve üye rollerinin genel
 * Mesaj Gönder ve Ses Etkinliği yetkisi kapalı, ses kategorisi de açmıyor
 * (Genel #1 gibi kanallar kendi izniyle açıyor). Açılmazsa odanın sohbetine
 * kimse yazamıyor ve mikrofon yalnız bas-konuş ile çalışıyor (üye geri
 * bildirimleri, D-OZELSES-2).
 */
export const SOHBET_IZINLERI = [
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
];
export const SES_IZINLERI = [PermissionFlagsBits.UseVAD];

/** Panelden izin verilen üyenin aldığı izinler. */
export const IZINLI_IZINLERI = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect];

/** Boş oda durumu: açık, görünür, liste yok. */
export const BOS_DURUM = Object.freeze({
  kilitli: false, gizli: false, izinliler: [], engelliler: [],
});

const birlestir = (bayraklar) => bayraklar.reduce((a, b) => a | b, 0n);

/** Oda adını şablondan üretir: {kullanici} üyenin sunucudaki görünen adıdır. */
export function odaAdi(sablon, kullaniciAdi) {
  const ad = String(sablon ?? '')
    .replaceAll('{kullanici}', String(kullaniciAdi ?? ''))
    .trim()
    .slice(0, AD_SINIRI)
    .trim();
  return ad || YEDEK_AD;
}

/**
 * Ses durumu değişiminden yapılacak işi çıkarır.
 *
 * @returns {{hubaGirdi: boolean, ayrilanKanalId: string|null}}
 *   hubaGirdi: üye oda oluştur kanalına yeni girdi.
 *   ayrilanKanalId: üyenin çıktığı kanal; oda ise boşalmış olabilir.
 */
export function sesGecisi({ oncekiKanalId = null, sonrakiKanalId = null, hubId = null }) {
  const degisti = oncekiKanalId !== sonrakiKanalId;
  return {
    hubaGirdi: Boolean(hubId) && degisti && sonrakiKanalId === hubId,
    ayrilanKanalId: degisti && oncekiKanalId ? oncekiKanalId : null,
  };
}

/**
 * Odanın izin üzerine yazmaları: kategorininkiler temel alınır, üstüne oda
 * durumu (kilit, gizlilik, izinli/engelli üyeler), sahip ve bot eklenir.
 * Her panel işleminde baştan hesaplanır; böylece kilidi açmak kategorinin
 * özgün izinlerine döner, bir önceki işlemin kalıntısı birikmez.
 *
 * Discord botun kendisinde olmayan bir izni verdirmez de yasaklatmaz da; bu
 * yüzden bütün bitler botun izinleriyle maskelenir, yoksa tek eksik izin
 * bütün işlemi reddettirir.
 *
 * @param {object} girdi
 * @param {Array<{id: string, type: number, allow: bigint, deny: bigint}>} girdi.ustIzinler
 * @param {string} girdi.sahipId
 * @param {string} girdi.botId
 * @param {string|null} [girdi.everyoneId] @everyone rolünün kimliği (= guild id)
 * @param {bigint|null} [girdi.botYetkileri] Botun üst kanaldaki izin bitleri
 * @param {{kilitli: boolean, gizli: boolean, izinliler: string[], engelliler: string[]}} [girdi.durum]
 * @returns {Array<{id: string, type: number, allow: bigint, deny: bigint}>}
 */
export function izinListesi({
  ustIzinler = [], sahipId, botId, everyoneId = null, botYetkileri = null, durum = BOS_DURUM,
}) {
  const maske = (bit) => (botYetkileri === null ? bit : bit & botYetkileri);
  const liste = new Map();

  for (const iz of ustIzinler) {
    liste.set(String(iz.id), {
      id: String(iz.id), type: iz.type, allow: BigInt(iz.allow), deny: BigInt(iz.deny),
    });
  }

  const al = (id, tur = OverwriteType.Member) => liste.get(String(id))
    ?? { id: String(id), type: tur, allow: 0n, deny: 0n };
  const ver = (id, bayraklar, tur) => {
    const bit = birlestir(bayraklar);
    const mevcut = al(id, tur);
    liste.set(String(id), { ...mevcut, allow: mevcut.allow | bit, deny: mevcut.deny & ~bit });
  };
  const yasakla = (id, bayraklar, tur) => {
    const bit = birlestir(bayraklar);
    const mevcut = al(id, tur);
    liste.set(String(id), { ...mevcut, allow: mevcut.allow & ~bit, deny: mevcut.deny | bit });
  };

  if (everyoneId) ver(everyoneId, [...SOHBET_IZINLERI, ...SES_IZINLERI], OverwriteType.Role);

  // Kilit/gizlilik yalnız @everyone'a değil kategorideki rol izinlerine de
  // uygulanır: rol izni @everyone yasağını ezer, yoksa kilit delik kalırdı.
  const kapat = [
    ...(durum.kilitli ? [PermissionFlagsBits.Connect] : []),
    ...(durum.gizli ? [PermissionFlagsBits.ViewChannel] : []),
  ];
  if (kapat.length > 0) {
    if (everyoneId) yasakla(everyoneId, kapat, OverwriteType.Role);
    for (const iz of [...liste.values()]) {
      if (iz.type === OverwriteType.Role) yasakla(iz.id, kapat, OverwriteType.Role);
    }
  }

  const ozel = new Set([String(sahipId), String(botId)]);
  for (const id of durum.izinliler ?? []) {
    if (!ozel.has(String(id))) ver(id, IZINLI_IZINLERI);
  }
  for (const id of durum.engelliler ?? []) {
    if (!ozel.has(String(id))) yasakla(id, [PermissionFlagsBits.Connect]);
  }

  ver(sahipId, SAHIP_IZINLERI);
  ver(botId, BOT_IZINLERI);

  return [...liste.values()]
    .map((iz) => ({ ...iz, allow: maske(iz.allow), deny: maske(iz.deny) }))
    .filter((iz) => iz.allow !== 0n || iz.deny !== 0n);
}

/**
 * Oda durumunu kanalın mevcut izinlerinden okur; ayrı tablo tutulmaz, böylece
 * Discord arayüzünden yapılan değişiklikle çelişmez.
 *
 * @param {Array<{id: string, type: number, allow: bigint, deny: bigint}>} izinler
 */
export function durumOku(izinler, { everyoneId, sahipId, botId }) {
  const ozel = new Set([String(sahipId), String(botId)]);
  const herkes = izinler.find((iz) => String(iz.id) === String(everyoneId));
  const yasakli = (bit) => Boolean(herkes && (BigInt(herkes.deny) & bit));

  const uyeler = izinler.filter((iz) => iz.type === OverwriteType.Member && !ozel.has(String(iz.id)));
  return {
    kilitli: yasakli(PermissionFlagsBits.Connect),
    gizli: yasakli(PermissionFlagsBits.ViewChannel),
    izinliler: uyeler
      .filter((iz) => BigInt(iz.allow) & PermissionFlagsBits.Connect)
      .map((iz) => String(iz.id)),
    engelliler: uyeler
      .filter((iz) => BigInt(iz.deny) & PermissionFlagsBits.Connect)
      .map((iz) => String(iz.id)),
  };
}

/** Bir kimliği listeye ekler, öbür listeden çıkarır (izinli ↔ engelli). */
export function listeyeTasi(durum, ids, hedef) {
  const oteki = hedef === 'izinliler' ? 'engelliler' : 'izinliler';
  const yeni = ids.map(String);
  return {
    ...durum,
    [hedef]: [...new Set([...(durum[hedef] ?? []), ...yeni])],
    [oteki]: (durum[oteki] ?? []).filter((id) => !yeni.includes(String(id))),
  };
}

/** Kişi sınırı girdisini ayrıştırır: 0 (sınırsız) ile 99 arası tam sayı. */
export function limitAyristir(metin) {
  const temiz = String(metin ?? '').trim();
  if (!/^\d{1,2}$/.test(temiz)) {
    return { ok: false, sebep: 'Kişi sınırı 0 ile 99 arasında bir tam sayı olmalı (0 = sınırsız).' };
  }
  return { ok: true, deger: Number(temiz) };
}

/**
 * Discord kanal adını kanal başına 10 dakikada 2 kez değiştirtiyor; fazlasında
 * istek sessizce bekletiliyor ve etkileşim zaman aşımına düşüyor. Sınırı
 * burada tutup kullanıcıya kalan süreyi söylüyoruz.
 */
export const AD_PENCERESI_MS = 10 * 60_000;
export const AD_HAKKI = 2;

export function adSinirlayici({ pencere = AD_PENCERESI_MS, hak = AD_HAKKI } = {}) {
  const gecmis = new Map();
  return {
    /** @returns {{ok: true} | {ok: false, kalanMs: number}} */
    dene(kanalId, simdi = Date.now()) {
      const zamanlar = (gecmis.get(kanalId) ?? []).filter((t) => simdi - t < pencere);
      if (zamanlar.length >= hak) {
        gecmis.set(kanalId, zamanlar);
        return { ok: false, kalanMs: pencere - (simdi - zamanlar[0]) };
      }
      gecmis.set(kanalId, [...zamanlar, simdi]);
      return { ok: true };
    },
  };
}

/** Paneli kim kullanabilir: oda sahibi veya sunucuda Kanalları Yönet yetkilisi. */
export function paneliKullanabilirMi(kayit, kullaniciId, yetkili = false) {
  if (!kayit) return false;
  return yetkili || String(kayit.sahip_id) === String(kullaniciId);
}

/** Sahiplik alınabilir mi: sahip odada değil ve isteyen odada. */
export function sahiplikAlinabilirMi(kayit, kullaniciId, odadakiIdler) {
  if (!kayit || String(kayit.sahip_id) === String(kullaniciId)) return false;
  const odada = new Set([...odadakiIdler].map(String));
  return odada.has(String(kullaniciId)) && !odada.has(String(kayit.sahip_id));
}

/** Odada bot olmayan kimse kalmadıysa boştur; odada unutulan bir bot odayı yaşatmaz. */
export function odaBosMu(uyeler) {
  return ![...(uyeler ?? [])].some((uye) => !uye?.user?.bot);
}

// --- Kayıt tablosu: yalnız burada kayıtlı kanallar bot tarafından silinir. ---

export function odaKaydet(db, { kanalId, guildId, sahipId, simdi = Date.now() }) {
  db.prepare(`INSERT OR REPLACE INTO ozel_ses_odalari (kanal_id, guild_id, sahip_id, olusturma)
              VALUES (?, ?, ?, ?)`).run(String(kanalId), String(guildId), String(sahipId), simdi);
}

export function odaGetir(db, kanalId) {
  return db.prepare('SELECT * FROM ozel_ses_odalari WHERE kanal_id = ?').get(String(kanalId)) ?? null;
}

export function odaSil(db, kanalId) {
  return db.prepare('DELETE FROM ozel_ses_odalari WHERE kanal_id = ?').run(String(kanalId)).changes > 0;
}

export function sahibinOdalari(db, guildId, sahipId) {
  return db.prepare(`SELECT * FROM ozel_ses_odalari WHERE guild_id = ? AND sahip_id = ?
                     ORDER BY olusturma DESC`).all(String(guildId), String(sahipId));
}

export function sahipYaz(db, kanalId, sahipId) {
  db.prepare('UPDATE ozel_ses_odalari SET sahip_id = ? WHERE kanal_id = ?')
    .run(String(sahipId), String(kanalId));
}

export function tumOdalar(db, guildId) {
  return db.prepare('SELECT * FROM ozel_ses_odalari WHERE guild_id = ?').all(String(guildId));
}
