/**
 * Kart birleştirme: aynı kartın 5 normal kopyası, bir üst nadirlikten rastgele
 * 1 karta dönüşür (Mitik birleştirilemez). Parlak kartlar birleştirilemez ve
 * birleştirmeden parlak kart çıkmaz: parlak yalnız kasadan gelir.
 *
 * Ekonomi gerekçesi (docs/para.md "Birleştirme"): 5 kopyanın satış değeri
 * her basamakta çıkacak kartın değerinden yüksektir (oran 1,20-1,33), yani
 * birleştirmek kopyaları satmaktan hep biraz kötüdür; muz yaratmaz, yalnız
 * kopyaları koleksiyon ilerlemesine çevirir.
 */

import { islem } from './ekonomi.js';
import { adet, envanter, esyaDus, esyaEkle, esyaHareketi } from './envanter.js';
import {
  kartGetir, KARTLAR, NADIRLIK_SIRASI, NADIRLIKLER, parlakKimlik, parlakMi, rastgeleKart,
} from './kasalar.js';

/** Bir birleştirme için gereken normal kopya sayısı. */
export const BIRLESTIRME_ADEDI = 5;
/** Tek komutta en çok birleştirme sayısı. */
export const BIRLESTIRME_SINIRI = 50;

/** Bir üst nadirlik; yoksa (Mitik) null. */
export function ustNadirlik(nadirlik) {
  return NADIRLIK_SIRASI[NADIRLIK_SIRASI.indexOf(nadirlik) + 1] ?? null;
}

/** Bir birleştirmenin değer oranı: 5 kopyanın değeri / çıkacak kartın değeri (hep > 1). */
export function birlestirmeOrani(nadirlik) {
  const ust = ustNadirlik(nadirlik);
  if (!ust) return null;
  return (NADIRLIKLER[nadirlik].deger * BIRLESTIRME_ADEDI) / NADIRLIKLER[ust].deger;
}

/** Birleştirilebilir kart mı (normal, Mitik değil)? */
export function birlestirilebilirMi(kimlik) {
  const kart = kartGetir(kimlik);
  return Boolean(kart) && !parlakMi(kimlik) && ustNadirlik(kart.nadirlik) !== null;
}

/** Bir karttan yapılabilecek birleştirme sayısı (son kopya hep kalır). */
export function birlestirilebilirAdet(sahipAdet) {
  return Math.max(0, Math.floor((sahipAdet - 1) / BIRLESTIRME_ADEDI));
}

/** Tek karttan `kac` birleştirme yapar; çağıran işlem içinde olmalı. */
function birlestirYaz(db, { guildId, kullaniciId, kart, kac, rastgele, simdi }) {
  const harcanan = kac * BIRLESTIRME_ADEDI;
  // Son kopya hep kaldığı için kilitli maymun kopyası harcanmaz; yine de düşme başarısızsa hiçbir şey yazılmaz.
  if (!esyaDus(db, guildId, kullaniciId, kart.kimlik, harcanan)) throw new Error(`Birleştirme için yeterli ${kart.ad} yok.`);
  esyaHareketi(db, { guildId, kullaniciId, esya: kart.kimlik, adet: -harcanan, tur: 'birlestir', simdi });
  const sonuclar = [];
  for (let i = 0; i < kac; i += 1) {
    const yeniKart = rastgeleKart(ustNadirlik(kart.nadirlik), rastgele);
    // "Yeni": bu kartın normal ya da parlak sürümü daha önce yoktu.
    const onceki = adet(db, guildId, kullaniciId, yeniKart.kimlik)
      + adet(db, guildId, kullaniciId, parlakKimlik(yeniKart.kimlik));
    const toplam = esyaEkle(db, guildId, kullaniciId, yeniKart.kimlik);
    esyaHareketi(db, {
      guildId, kullaniciId, esya: yeniKart.kimlik, adet: 1, tur: 'birlestir', karsiId: kart.kimlik, simdi,
    });
    sonuclar.push({ kart: yeniKart, adet: toplam, yeniKart: onceki === 0 });
  }
  return { kaynak: kart, harcanan, sonuclar };
}

/**
 * Bir kartın normal kopyalarından `kac` kez birleştirir (her biri 5 kopya → 1 kart).
 * @returns {{ok: false, sebep: string} | {ok: true, kaynak: object, harcanan: number, sonuclar: Array<{kart: object, adet: number, yeniKart: boolean}>, yeniKart: number}}
 */
export function birlestir(db, {
  guildId, kullaniciId, kimlik, adet: kac = 1, rastgele = Math.random, simdi = Date.now(),
}) {
  const kart = kartGetir(kimlik);
  if (!kart) return { ok: false, sebep: 'Böyle bir kart yok.' };
  if (parlakMi(kimlik)) return { ok: false, sebep: 'Parlak kartlar birleştirilemez.' };
  if (!birlestirilebilirMi(kimlik)) return { ok: false, sebep: 'Mitik kartlar birleştirilemez: üstlerinde nadirlik yok.' };
  if (!Number.isSafeInteger(kac) || kac < 1 || kac > BIRLESTIRME_SINIRI) {
    return { ok: false, sebep: `Birleştirme sayısı 1-${BIRLESTIRME_SINIRI} olmalı.` };
  }

  return islem(db, () => {
    const gereken = kac * BIRLESTIRME_ADEDI;
    if (adet(db, guildId, kullaniciId, kimlik) < gereken) {
      return { ok: false, sebep: `${kac} birleştirme için **${kart.ad}** kartından ${gereken} kopya gerekir (${BIRLESTIRME_ADEDI} kopya → 1 üst kart).` };
    }
    const sonuc = birlestirYaz(db, { guildId, kullaniciId, kart, kac, rastgele, simdi });
    return { ok: true, ...sonuc, yeniKart: sonuc.sonuclar.filter((s) => s.yeniKart).length };
  });
}

/** Toptan birleştirmenin yazmadan önizlemesi: kaç birleştirme, kaç kopya harcanır. */
export function toptanBirlestirOnizleme(sahip) {
  let birlestirme = 0;
  for (const kart of KARTLAR) {
    if (!birlestirilebilirMi(kart.kimlik)) continue;
    birlestirme += birlestirilebilirAdet(sahip[kart.kimlik] ?? 0);
  }
  return { birlestirme, harcanan: birlestirme * BIRLESTIRME_ADEDI };
}

/**
 * Bütün uygun kopyaları birleştirir: her karttan 1 kopya kalır, kalan kopyalar
 * 5'li gruplara bölünür. Başlangıçtaki envantere göre tek geçişte yapılır:
 * çıkan yeni kartlar aynı işlemde yeniden birleştirilmez (zincirleme olmaz).
 */
export function toptanBirlestir(db, {
  guildId, kullaniciId, rastgele = Math.random, simdi = Date.now(),
}) {
  return islem(db, () => {
    const sahip = envanter(db, guildId, kullaniciId);
    const sonuclar = [];
    let harcanan = 0;
    for (const kart of KARTLAR) {
      if (!birlestirilebilirMi(kart.kimlik)) continue;
      const kac = birlestirilebilirAdet(sahip[kart.kimlik] ?? 0);
      if (kac < 1) continue;
      const y = birlestirYaz(db, { guildId, kullaniciId, kart, kac, rastgele, simdi });
      harcanan += y.harcanan;
      sonuclar.push(...y.sonuclar);
    }
    return {
      ok: true, birlestirme: sonuclar.length, harcanan, sonuclar, yeniKart: sonuclar.filter((s) => s.yeniKart).length,
    };
  });
}
