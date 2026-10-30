/**
 * Takas: iki üye arasında eşya (kart/kasa) ve muz değişimi.
 *
 * Teklifler takas_teklifleri tablosunda durur (yeniden başlatmaya dayanıklı).
 * Eşyalar teklif anında kilitlenmez; kabul anında tek işlemde iki tarafın da
 * hâlâ sahip olduğu doğrulanır, tutmuyorsa hiçbir şey yazılmaz.
 *
 * Muz kısmı /gonder ile aynı kuralları işler: `gonder` fonksiyonu kullanılır,
 * yani vergi kesilir, en az tutar aranır ve defter türü `gonder`/`al` olduğu
 * için gönderenin günlük limitine sayılır. Takas bu kuralların kaçış yolu olamaz.
 * Yönetici ile üye arasında takas yoktur (lib/yonetici-carpan.js).
 */

import {
  bakiye, gonder, islem, muz, TRANSFER_MIN,
} from './ekonomi.js';
import {
  adet, esyaDus, esyaEkle, esyaHareketi, serbestEnvanter,
} from './envanter.js';
import { esyaGetir } from './esyalar.js';
import { hediyeEdilirMi, kartGetir } from './kasalar.js';
import { YONETICI_AKTARIM_SEBEBI, yoneticiUyeArasi } from './yonetici-carpan.js';
import { uzakAktarimSebebi } from './ekonomi-uzak.js';

/** Teklifin geçerlilik süresi. */
export const SURE_MS = 10 * 60_000;
/** Bir kişinin aynı anda açık tutabileceği teklif sayısı. */
export const ACIK_SINIRI = 3;
/** Teklifteki tek kalem için en çok adet. */
export const ADET_SINIRI = 100;

/** Kabul sırasında kuralı bozan durumu işlemi geri alarak bildirmek için. */
class TakasHatasi extends Error {}

/** Takaslanabilir mi: yalnız hediye edilebilen kasalar ve kartlar. */
export function takaslanirMi(kimlik) {
  return hediyeEdilirMi(kimlik);
}

/** Eşyanın görünen adı. */
export function esyaAdi(kimlik) {
  return kartGetir(kimlik)?.ad ?? esyaGetir(kimlik)?.ad ?? kimlik;
}

/** Eşyanın emoji çözücüye verilecek nesnesi (kart ya da mağaza eşyası). */
export function esyaNesnesi(kimlik) {
  return kartGetir(kimlik) ?? esyaGetir(kimlik);
}

/** Bir üyenin takas edebileceği eşyalar: [{ kimlik, adet }]. */
export function takasEsyalari(db, guildId, kullaniciId) {
  return Object.entries(serbestEnvanter(db, guildId, kullaniciId))
    .filter(([kimlik]) => takaslanirMi(kimlik))
    .map(([kimlik, n]) => ({ kimlik, adet: n }));
}

function ayristir(satir) {
  if (!satir) return null;
  return {
    id: satir.id,
    guildId: satir.guild_id,
    tekliEdenId: satir.teklif_eden,
    karsiId: satir.karsi_id,
    verEsya: satir.ver_esya,
    verAdet: satir.ver_adet,
    isteEsya: satir.iste_esya,
    isteAdet: satir.iste_adet,
    muzVer: satir.muz_ver,
    muzIste: satir.muz_iste,
    durum: satir.durum,
    olusturma: satir.olusturma,
    bitis: satir.bitis,
    kanalId: satir.kanal_id,
    mesajId: satir.mesaj_id,
  };
}

export function teklifGetir(db, id) {
  return ayristir(db.prepare('SELECT * FROM takas_teklifleri WHERE id = ?').get(Number(id)));
}

/** Kişinin süresi dolmamış açık teklif sayısı. */
export function acikTeklifSayisi(db, guildId, kullaniciId, simdi = Date.now()) {
  return db
    .prepare(
      `SELECT COUNT(*) AS n FROM takas_teklifleri
       WHERE guild_id = ? AND teklif_eden = ? AND durum = 'acik' AND bitis > ?`,
    )
    .get(String(guildId), String(kullaniciId), simdi).n;
}

/**
 * Süresi dolmuş açık teklifleri 'suresi' yapar.
 * @returns {Array} kapatılan teklifler
 */
export function suresiDolanlariKapat(db, simdi = Date.now()) {
  return islem(db, () => {
    const satirlar = db
      .prepare("SELECT * FROM takas_teklifleri WHERE durum = 'acik' AND bitis <= ?")
      .all(simdi);
    db.prepare("UPDATE takas_teklifleri SET durum = 'suresi' WHERE durum = 'acik' AND bitis <= ?").run(simdi);
    return satirlar.map((s) => ({ ...ayristir(s), durum: 'suresi' }));
  });
}

function kalemHatasi(kimlik, kac) {
  if (!kimlik) return null;
  if (!takaslanirMi(kimlik)) return 'Yalnız kasalar (Günlük Kasa hariç) ve kartlar takas edilebilir.';
  if (!Number.isSafeInteger(kac) || kac < 1 || kac > ADET_SINIRI) return `Adet 1 ile ${ADET_SINIRI} arasında olmalı.`;
  return null;
}

function muzHatasi(miktar) {
  if (miktar === 0) return null;
  if (!Number.isSafeInteger(miktar) || miktar < TRANSFER_MIN) {
    return `Takasa konan muz en az ${muz(TRANSFER_MIN)} olmalı (ya da hiç koyma).`;
  }
  return null;
}

/**
 * Teklif oluşturur. Eşyalar kilitlenmez ama teklif anında da sahiplik ve
 * bakiye kontrol edilir ki olmayan şeye teklif verilmesin.
 *
 * @returns {{ok: false, sebep: string} | {ok: true, teklif: object}}
 */
export function teklifOlustur(db, {
  guildId, tekliEdenId, karsiId, verEsya = null, verAdet = 1, isteEsya = null, isteAdet = 1,
  muzVer = 0, muzIste = 0, simdi = Date.now(), yoneticiler = undefined,
}) {
  if (String(tekliEdenId) === String(karsiId)) return { ok: false, sebep: 'Kendinle takas yapamazsın.' };
  if (yoneticiUyeArasi(tekliEdenId, karsiId, yoneticiler)) return { ok: false, sebep: YONETICI_AKTARIM_SEBEBI };
  const uzak = uzakAktarimSebebi(db, guildId, tekliEdenId, karsiId);
  if (uzak) return { ok: false, sebep: uzak };

  const hata = kalemHatasi(verEsya, verAdet) ?? kalemHatasi(isteEsya, isteAdet)
    ?? muzHatasi(muzVer) ?? muzHatasi(muzIste);
  if (hata) return { ok: false, sebep: hata };

  if (!verEsya && muzVer === 0) return { ok: false, sebep: 'Teklifte vereceğin bir şey olmalı (eşya ya da muz).' };
  if (!isteEsya && muzIste === 0) return { ok: false, sebep: 'Karşı taraftan istediğin bir şey olmalı (eşya ya da muz).' };

  return islem(db, () => {
    if (acikTeklifSayisi(db, guildId, tekliEdenId, simdi) >= ACIK_SINIRI) {
      return { ok: false, sebep: `Aynı anda en çok ${ACIK_SINIRI} açık teklifin olabilir. Birini geri çek ya da bitmesini bekle.` };
    }
    if (verEsya && adet(db, guildId, tekliEdenId, verEsya) < verAdet) {
      return { ok: false, sebep: `Elinde ${verAdet} × ${esyaAdi(verEsya)} yok.` };
    }
    if (isteEsya && adet(db, guildId, karsiId, isteEsya) < isteAdet) {
      return { ok: false, sebep: `Karşı tarafta ${isteAdet} × ${esyaAdi(isteEsya)} yok.` };
    }
    if (muzVer > bakiye(db, guildId, tekliEdenId)) {
      return { ok: false, sebep: `Bakiyen yetmiyor: ${muz(bakiye(db, guildId, tekliEdenId))} var.` };
    }
    if (muzIste > bakiye(db, guildId, karsiId)) {
      return { ok: false, sebep: 'Karşı tarafın bakiyesi istediğin muza yetmiyor.' };
    }

    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO takas_teklifleri
           (guild_id, teklif_eden, karsi_id, ver_esya, ver_adet, iste_esya, iste_adet, muz_ver, muz_iste, olusturma, bitis)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        String(guildId), String(tekliEdenId), String(karsiId),
        verEsya, verEsya ? verAdet : 0, isteEsya, isteEsya ? isteAdet : 0,
        muzVer, muzIste, simdi, simdi + SURE_MS,
      );
    return { ok: true, teklif: teklifGetir(db, lastInsertRowid) };
  });
}

/** Teklif mesajının yerini saklar (süre dolunca düzenlemek için). */
export function mesajBagla(db, id, kanalId, mesajId) {
  db.prepare('UPDATE takas_teklifleri SET kanal_id = ?, mesaj_id = ? WHERE id = ?')
    .run(String(kanalId), String(mesajId), Number(id));
}

/** Teklif açık değilse nedenini söyleyen cümle; açıksa null. */
function kapaliSebebi(teklif) {
  if (!teklif) return 'Bu teklif bulunamadı.';
  const sebepler = {
    kabul: 'Bu teklif zaten kabul edilmiş.',
    red: 'Bu teklif reddedilmiş.',
    geri: 'Bu teklif geri çekilmiş.',
    suresi: 'Bu teklifin süresi dolmuş.',
  };
  return sebepler[teklif.durum] ?? null;
}

/** Açık teklifi kapatır; süre dolmuşsa 'suresi' yazıp bunu bildirir. */
function kapat(db, teklif, yeniDurum, simdi) {
  if (teklif.bitis <= simdi) {
    db.prepare("UPDATE takas_teklifleri SET durum = 'suresi' WHERE id = ?").run(teklif.id);
    return { ok: false, sebep: 'Bu teklifin süresi dolmuş.', durum: 'suresi' };
  }
  db.prepare('UPDATE takas_teklifleri SET durum = ? WHERE id = ?').run(yeniDurum, teklif.id);
  return { ok: true, teklif: { ...teklif, durum: yeniDurum } };
}

/** Karşı taraf reddeder. */
export function reddet(db, { id, kullaniciId, simdi = Date.now() }) {
  return islem(db, () => {
    const teklif = teklifGetir(db, id);
    const kapali = kapaliSebebi(teklif);
    if (kapali) return { ok: false, sebep: kapali };
    if (teklif.karsiId !== String(kullaniciId)) return { ok: false, sebep: 'Bu teklifi yalnız karşı taraf reddedebilir.' };
    return kapat(db, teklif, 'red', simdi);
  });
}

/** Teklif eden geri çeker. */
export function geriCek(db, { id, kullaniciId, simdi = Date.now() }) {
  return islem(db, () => {
    const teklif = teklifGetir(db, id);
    const kapali = kapaliSebebi(teklif);
    if (kapali) return { ok: false, sebep: kapali };
    if (teklif.tekliEdenId !== String(kullaniciId)) return { ok: false, sebep: 'Bu teklifi yalnız teklifi veren geri çekebilir.' };
    return kapat(db, teklif, 'geri', simdi);
  });
}

/** Muz kısmı: /gonder'in kurallarıyla; olmazsa işlemi geri aldırır. */
function muzAktar(db, {
  guildId, gonderenId, aliciId, miktar, seviye, vergiYuzde, simdi, kim,
}) {
  if (miktar === 0) return { vergi: 0, net: 0 };
  const sonuc = gonder(db, {
    guildId, gonderenId, aliciId, miktar, seviye, vergiYuzde, simdi,
  });
  if (!sonuc.ok) throw new TakasHatasi(`${kim} muz aktarımı olmadı: ${sonuc.sebep} Hiçbir şey değişmedi.`);
  return { vergi: sonuc.vergi, net: sonuc.net };
}

/**
 * Teklifi kabul eder (yalnız karşı taraf). Her şey tek işlemde: iki tarafın da
 * eşyası ve muzu doğrulanır, vergi/limit kuralları işler; biri tutmazsa
 * hiçbir şey yazılmaz ve teklif açık kalır.
 *
 * `seviyeler`: günlük gönderim limiti için { kullaniciId: seviye }.
 *
 * @returns {{ok: false, sebep: string} | {ok: true, teklif: object, vergiVer: number, vergiIste: number}}
 */
export function kabulEt(db, {
  id, kullaniciId, seviyeler = {}, vergiYuzde = 0, simdi = Date.now(), yoneticiler = undefined,
}) {
  try {
    return islem(db, () => {
      const teklif = teklifGetir(db, id);
      const kapali = kapaliSebebi(teklif);
      if (kapali) return { ok: false, sebep: kapali };
      if (teklif.karsiId !== String(kullaniciId)) return { ok: false, sebep: 'Bu teklifi yalnız karşı taraf kabul edebilir.' };
      if (teklif.bitis <= simdi) return kapat(db, teklif, 'suresi', simdi);

      const { guildId, tekliEdenId, karsiId } = teklif;
      // Kural yürürlüğe girmeden açılmış teklifler de geçmesin.
      if (yoneticiUyeArasi(tekliEdenId, karsiId, yoneticiler)) return { ok: false, sebep: YONETICI_AKTARIM_SEBEBI };
      const uzak = uzakAktarimSebebi(db, guildId, tekliEdenId, karsiId);
      if (uzak) return { ok: false, sebep: uzak };

      // Sahiplik doğrulaması: kabul anındaki gerçek duruma bakılır.
      if (teklif.verEsya && adet(db, guildId, tekliEdenId, teklif.verEsya) < teklif.verAdet) {
        throw new TakasHatasi(`Teklifi verenin artık ${teklif.verAdet} × ${esyaAdi(teklif.verEsya)} eşyası yok. Hiçbir şey değişmedi.`);
      }
      if (teklif.isteEsya && adet(db, guildId, karsiId, teklif.isteEsya) < teklif.isteAdet) {
        throw new TakasHatasi(`Sende artık ${teklif.isteAdet} × ${esyaAdi(teklif.isteEsya)} yok. Hiçbir şey değişmedi.`);
      }

      const ver = muzAktar(db, {
        guildId, gonderenId: tekliEdenId, aliciId: karsiId, miktar: teklif.muzVer,
        seviye: seviyeler[tekliEdenId] ?? 0, vergiYuzde, simdi, kim: 'Teklifi verenin',
      });
      const iste = muzAktar(db, {
        guildId, gonderenId: karsiId, aliciId: tekliEdenId, miktar: teklif.muzIste,
        seviye: seviyeler[karsiId] ?? 0, vergiYuzde, simdi, kim: 'Senin',
      });

      const tasi = (kimden, kime, esya, kac) => {
        if (!esya) return;
        if (!esyaDus(db, guildId, kimden, esya, kac)) throw new TakasHatasi('Eşya devri başarısız oldu. Hiçbir şey değişmedi.');
        esyaEkle(db, guildId, kime, esya, kac);
        esyaHareketi(db, { guildId, kullaniciId: kimden, esya, adet: -kac, tur: 'takas-ver', karsiId: kime, simdi });
        esyaHareketi(db, { guildId, kullaniciId: kime, esya, adet: kac, tur: 'takas-al', karsiId: kimden, simdi });
      };
      tasi(tekliEdenId, karsiId, teklif.verEsya, teklif.verAdet);
      tasi(karsiId, tekliEdenId, teklif.isteEsya, teklif.isteAdet);

      db.prepare("UPDATE takas_teklifleri SET durum = 'kabul' WHERE id = ?").run(teklif.id);
      return {
        ok: true, teklif: { ...teklif, durum: 'kabul' }, vergiVer: ver.vergi, vergiIste: iste.vergi,
      };
    });
  } catch (error) {
    if (error instanceof TakasHatasi) return { ok: false, sebep: error.message };
    throw error;
  }
}
