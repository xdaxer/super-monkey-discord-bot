/**
 * Kasa sistemi: dört sınıf kasa, BTD koleksiyon kartları, açma, satma, hediye.
 *
 * Kasa içerikleri ve kart değerleri docs/para.md ile birebir aynıdır. Açma
 * tek işlemde yapılır ve sonuç veritabanına yazıldıktan sonra gösterilir;
 * animasyon sırasında bot kapansa da ödül kaybolmaz.
 */

import {
  ekle, islem, muz, trGunBaslangici, TURLER,
} from './ekonomi.js';
import {
  adet, envanter, esyaDus, esyaEkle, esyaHareketi, hareketToplami, kilitliEsya, serbestEnvanter,
} from './envanter.js';
import { esyaGetir, esyaVer } from './esyalar.js';
import { YONETICI_AKTARIM_SEBEBI, yoneticiUyeArasi } from './yonetici-carpan.js';
import { uzakAktarimSebebi } from './ekonomi-uzak.js';

/** Nadirlik kademeleri, düşükten yükseğe. `deger`: kartın satış fiyatı. */
/** `tepki`: kasa açılınca sonucun yanında gösterilen sunucu emojisi. */
export const NADIRLIKLER = {
  siradan: { ad: 'Sıradan', renk: 0x99aab5, simge: '⚪', deger: 400, tepki: 'btd_shrug' },
  nadir: { ad: 'Nadir', renk: 0x3498db, simge: '🔵', deger: 1_500, tepki: 'btd_thumbsup' },
  destansi: { ad: 'Destansı', renk: 0x9b59b6, simge: '🟣', deger: 6_000, tepki: 'btd_cool' },
  efsanevi: { ad: 'Efsanevi', renk: 0xf1c40f, simge: '🟡', deger: 25_000, tepki: 'btd_shock' },
  mitik: { ad: 'Mitik', renk: 0xe74c3c, simge: '🔴', deger: 100_000, tepki: 'btd_love' },
};
export const NADIRLIK_SIRASI = Object.keys(NADIRLIKLER);

/** [emoji adı (btd_ öneksiz), kart adı] — emojiler sunucudaki BTD emojileri. */
const KART_LISTESI = {
  siradan: [
    ['dart_monkey', 'Dart Maymunu'], ['boomerang', 'Bumerang Maymunu'], ['bomb_shooter', 'Bomba Atıcı'],
    ['tack_shooter', 'Raptiye Atıcı'], ['ice_monkey', 'Buz Maymunu'], ['glue_gunner', 'Yapıştırıcı Maymun'],
    ['sniper', 'Keskin Nişancı'], ['sub', 'Maymun Denizaltı'], ['buccaneer', 'Maymun Korsan'],
    ['ace', 'As Pilot'], ['heli', 'Helikopter Pilotu'], ['mortar', 'Havan Maymunu'], ['dartling', 'Dartling Topçusu'],
  ],
  nadir: [
    ['wizard', 'Büyücü Maymun'], ['super_monkey', 'Süper Maymun'], ['ninja', 'Ninja Maymun'],
    ['alchemist', 'Simyacı'], ['druid', 'Druid'], ['mermonkey', 'Mermaymun'], ['banana_farm', 'Muz Çiftliği'],
    ['spike_factory', 'Diken Fabrikası'], ['village', 'Maymun Köyü'], ['engineer', 'Mühendis Maymun'],
    ['beast_handler', 'Hayvan Terbiyecisi'], ['desperado', 'Desperado'],
    ['white', 'Beyaz Balon'], ['purple', 'Mor Balon'], ['zebra', 'Zebra Balon'], ['lead', 'Kurşun Balon'],
  ],
  destansi: [
    ['quincy', 'Quincy'], ['gwendolin', 'Gwendolin'], ['striker_jones', 'Striker Jones'], ['obyn', 'Obyn Greenfoot'],
    ['churchill', 'Kaptan Churchill'], ['benjamin', 'Benjamin'], ['ezili', 'Ezili'], ['pat_fusty', 'Pat Fusty'],
    ['adora', 'Adora'], ['brickell', 'Amiral Brickell'], ['etienne', 'Etienne'], ['sauda', 'Sauda'],
    ['psi', 'Psi'], ['geraldo', 'Geraldo'], ['corvus', 'Corvus'], ['rosalia', 'Rosalia'], ['silas', 'Silas'],
    ['camo', 'Kamuflaj Balon'], ['regrow', 'Yenilenen Balon'], ['fortified', 'Güçlendirilmiş Balon'],
  ],
  efsanevi: [
    ['bloonarius', 'Bloonarius'], ['lych', 'Lych'], ['vortex', 'Vortex'], ['dreadbloon', 'Dreadbloon'],
    ['phayze', 'Phayze'], ['blastapopoulos', 'Blastapopoulos'], ['ddt', 'D.D.T.'],
  ],
  mitik: [
    ['bloonarius_elite', 'Elit Bloonarius'], ['lych_elite', 'Elit Lych'], ['vortex_elite', 'Elit Vortex'],
    ['dreadbloon_elite', 'Elit Dreadbloon'], ['phayze_elite', 'Elit Phayze'], ['blasta_elite', 'Elit Blastapopoulos'],
    ['RGB_Balon', 'RGB Balon'],
  ],
};

export const KARTLAR = NADIRLIK_SIRASI.flatMap((nadirlik) => KART_LISTESI[nadirlik].map(([emoji, ad]) => ({
  kimlik: `kart-${emoji}`, ad, nadirlik, emojiAdi: `btd_${emoji}`, yedek: NADIRLIKLER[nadirlik].simge,
})));

/** Parlak (✨) kart: kasadan %1 ihtimalle çıkar, satış değeri normalin 5 katıdır. */
export const PARLAK_ONEK = 'parlak:';
export const PARLAK_SANS = 0.01;
export const PARLAK_CARPANI = 5;

/** Normal kartın parlak sürümünün envanter kimliği (`parlak:kart-quincy`). */
export const parlakKimlik = (kimlik) => `${PARLAK_ONEK}${kimlik}`;

const KART_HARITASI = new Map(KARTLAR.map((k) => [k.kimlik, k]));

/**
 * Parlak sürümler normal kartın kopyasıdır (aynı emoji ve nadirlik); `ad`ın
 * başına ✨ gelir, böylece hediye/takas/satış mesajları ek kodsuz ayırt eder.
 * Böylece kartGetir/kartMi parlak kimlikleri de tanır ve satış, hediye, takas
 * yolları parlak kartı kendiliğinden destekler.
 */
const PARLAK_HARITASI = new Map(KARTLAR.map((k) => [parlakKimlik(k.kimlik), {
  ...k, kimlik: parlakKimlik(k.kimlik), temelKimlik: k.kimlik, ad: `✨ ${k.ad}`, temelAd: k.ad, parlak: true,
}]));

export function kartGetir(kimlik) {
  return KART_HARITASI.get(kimlik) ?? PARLAK_HARITASI.get(kimlik) ?? null;
}

export function kartMi(kimlik) {
  return KART_HARITASI.has(kimlik) || PARLAK_HARITASI.has(kimlik);
}

export function parlakMi(kimlik) {
  return PARLAK_HARITASI.has(kimlik);
}

/** Kartın (normal ya da parlak) tek adetlik satış değeri. */
export function kartDegeri(kart) {
  return NADIRLIKLER[kart.nadirlik].deger * (kart.parlak ? PARLAK_CARPANI : 1);
}

export function kasaMi(kimlik) {
  return esyaGetir(kimlik)?.tur === 'kasa';
}

export const KASA_KIMLIKLERI = ['kasa-gunluk', 'kasa-ahsap', 'kasa-demir', 'kasa-altin', 'kasa-elmas'];
/** Her günlük ödülle gelen, satılmayan ve hediye edilemeyen zayıf kasa. */
export const GUNLUK_KASA = 'kasa-gunluk';

/**
 * Kasa içerikleri (ağırlık toplamı her kasada 1000 = %100,0).
 * `muz`: aralıktan rastgele; `kart`: o nadirlikten rastgele kart;
 * `esya`: takviye ya da rozet (sınırdaysa yerine fiyatı kadar muz);
 * `kasa`: bir üst sınıf kasa.
 */
export const KASA_ICERIKLERI = {
  'kasa-gunluk': [
    { agirlik: 600, tur: 'muz', min: 50, max: 250 },
    { agirlik: 320, tur: 'kart', nadirlik: 'siradan' },
    { agirlik: 60, tur: 'kart', nadirlik: 'nadir' },
    { agirlik: 10, tur: 'esya', kimlik: 'muz-ciftligi' },
    { agirlik: 8, tur: 'esya', kimlik: 'seri-koruyucu' },
    { agirlik: 2, tur: 'kart', nadirlik: 'destansi' },
  ],
  // 2026-10-24 dengesi: satın alınan kasaların garanti dahil beklenen
  // satılabilir değeri fiyatın %86–90'ı (önce %63–72); Altın'daki nadir kart
  // dilimi destansı/efsanevi'ye kaydı. Bedava kasa artmasın diye tek
  // seviyeler artık Günlük Kasa verir (seviyeKasasi).
  'kasa-ahsap': [
    { agirlik: 330, tur: 'muz', min: 400, max: 1_000 },
    { agirlik: 415, tur: 'kart', nadirlik: 'siradan' },
    { agirlik: 185, tur: 'kart', nadirlik: 'nadir' },
    { agirlik: 25, tur: 'esya', kimlik: 'muz-ciftligi' },
    { agirlik: 20, tur: 'esya', kimlik: 'seri-koruyucu' },
    { agirlik: 20, tur: 'kart', nadirlik: 'destansi' },
    { agirlik: 4, tur: 'kasa', kimlik: 'kasa-demir' },
    { agirlik: 1, tur: 'kart', nadirlik: 'efsanevi' },
  ],
  'kasa-demir': [
    { agirlik: 220, tur: 'muz', min: 1_500, max: 3_500 },
    { agirlik: 120, tur: 'kart', nadirlik: 'siradan' },
    { agirlik: 352, tur: 'kart', nadirlik: 'nadir' },
    { agirlik: 200, tur: 'kart', nadirlik: 'destansi' },
    { agirlik: 40, tur: 'esya', kimlik: 'xp-iksiri' },
    { agirlik: 30, tur: 'esya', kimlik: 'seri-koruyucu' },
    { agirlik: 30, tur: 'kart', nadirlik: 'efsanevi' },
    { agirlik: 6, tur: 'kasa', kimlik: 'kasa-altin' },
    { agirlik: 2, tur: 'kart', nadirlik: 'mitik' },
  ],
  'kasa-altin': [
    { agirlik: 200, tur: 'muz', min: 5_000, max: 10_000 },
    { agirlik: 570, tur: 'kart', nadirlik: 'destansi' },
    { agirlik: 120, tur: 'kart', nadirlik: 'efsanevi' },
    { agirlik: 70, tur: 'esya', kimlik: 'xp-iksiri' },
    { agirlik: 15, tur: 'esya', kimlik: 'rozet-altin' },
    { agirlik: 10, tur: 'kasa', kimlik: 'kasa-elmas' },
    { agirlik: 15, tur: 'kart', nadirlik: 'mitik' },
  ],
  'kasa-elmas': [
    { agirlik: 250, tur: 'muz', min: 15_000, max: 30_000 },
    { agirlik: 310, tur: 'kart', nadirlik: 'destansi' },
    { agirlik: 300, tur: 'kart', nadirlik: 'efsanevi' },
    { agirlik: 100, tur: 'kart', nadirlik: 'mitik' },
    { agirlik: 30, tur: 'esya', kimlik: 'rozet-altin' },
    { agirlik: 10, tur: 'esya', kimlik: 'xp-iksiri' },
  ],
};

/**
 * Kasa garantisi: üst üste `esik` açılışta `nadirlik` ya da üstü kart (ya da
 * rozet) çıkmazsa sonuncusu o nadirlikten rastgele bir kart olur. Sayaç kişi
 * ve kasa başınadır (`kasa_garantileri`); hedef çıkınca sıfırlanır.
 */
export const KASA_GARANTI = Object.freeze({
  'kasa-ahsap': { nadirlik: 'destansi', esik: 20 },
  'kasa-altin': { nadirlik: 'efsanevi', esik: 10 },
});

/** Zaten sahip olunan rozet kasadan çıkarsa yerine verilen muz. */
export const ROZET_YERINE_MUZ = 15_000;

/** Bir kişinin bir günde (Türkiye günü) hediye edebileceği en çok eşya. */
export const HEDIYE_GUNLUK = 10;
/** Bu seviyeden sonra tek seviyeler de Günlük yerine Ahşap Kasa verir. */
export const SEVIYE_AHSAP_ESIGI = 20;
/** Tek komutta açılabilecek en çok kasa. */
export const COKLU_ACMA = 10;

/**
 * Seviye atlama kasası: 25'in katı Elmas, 10'un katı Altın, 5'in katı Demir,
 * kalan çift seviyeler Ahşap, tek seviyeler Günlük Kasa (2026-10-24'ten beri;
 * kasalar zenginleşince bedava kasa akışı yarıya indi). 20'den sonra seviye
 * atlamak yavaşladığı için tek seviyeler de Ahşap verir (2026-10-26).
 */
export function seviyeKasasi(seviye) {
  if (seviye > 0 && seviye % 25 === 0) return 'kasa-elmas';
  if (seviye > 0 && seviye % 10 === 0) return 'kasa-altin';
  if (seviye > 0 && seviye % 5 === 0) return 'kasa-demir';
  return seviye % 2 === 0 || seviye > SEVIYE_AHSAP_ESIGI ? 'kasa-ahsap' : GUNLUK_KASA;
}

function agirlikliSec(liste, rastgele) {
  const toplam = liste.reduce((t, o) => t + o.agirlik, 0);
  let kalan = rastgele() * toplam;
  for (const oge of liste) {
    kalan -= oge.agirlik;
    if (kalan < 0) return oge;
  }
  return liste[liste.length - 1];
}

export function rastgeleKart(nadirlik, rastgele) {
  const havuz = KARTLAR.filter((k) => k.nadirlik === nadirlik);
  return havuz[Math.min(havuz.length - 1, Math.floor(rastgele() * havuz.length))];
}

/** Bir kartın parlak ihtimaliyle ağırlıklı beklenen satış çarpanı (= 1,04). */
export const PARLAK_BEKLENEN_CARPAN = (1 - PARLAK_SANS) + PARLAK_SANS * PARLAK_CARPANI;

/** Tek içerik satırının değeri: `satilabilir` muz/kart/kasa, `tum` buna eşyaların mağaza fiyatını ekler. */
function odulDegeri(o) {
  if (o.tur === 'muz') {
    const ort = (o.min + o.max) / 2;
    return { satilabilir: ort, tum: ort };
  }
  if (o.tur === 'kart') {
    // Parlak ihtimali beklenen değeri (1 - s) + 5s = 1,04 katına çıkarır.
    const deger = NADIRLIKLER[o.nadirlik].deger * PARLAK_BEKLENEN_CARPAN;
    return { satilabilir: deger, tum: deger };
  }
  if (o.tur === 'kasa') return garantiliBeklenen(o.kimlik);
  return { satilabilir: 0, tum: esyaGetir(o.kimlik).fiyat ?? ROZET_YERINE_MUZ };
}

/** Ödül garantinin hedefini karşılıyor mu: hedef nadirlik ya da üstü kart, ya da rozet. */
function garantiTutar(odul, garanti) {
  if (odul.tur === 'kart') return NADIRLIK_SIRASI.indexOf(odul.nadirlik) >= NADIRLIK_SIRASI.indexOf(garanti.nadirlik);
  return odul.tur === 'esya' && esyaGetir(odul.kimlik)?.tur === 'rozet';
}

/**
 * Kasanın tek açılıştaki beklenen değeri (garantisiz): `satilabilir` muz +
 * kartların satış değeri (+ içinden çıkan kasanın değeri); `tum` buna
 * eşyaların mağaza fiyatını ekler.
 */
export function kasaBeklenen(kimlik) {
  const icerik = KASA_ICERIKLERI[kimlik];
  const toplam = icerik.reduce((t, o) => t + o.agirlik, 0);
  let satilabilir = 0;
  let tum = 0;
  for (const o of icerik) {
    const p = o.agirlik / toplam;
    const d = odulDegeri(o);
    satilabilir += p * d.satilabilir;
    tum += p * d.tum;
  }
  return { satilabilir, tum };
}

/**
 * Garanti dahil uzun vadeli açılış başına beklenen değer. Döngü = hedef
 * çıkana ya da garanti verilene kadarki açılışlar. p hedefin olasılığı, n
 * eşik: döngü ortalama (1 − (1−p)^n) / p açılış sürer, (1−p)^n olasılıkla
 * garantiyle biter; döngüdeki diğer açılışlar hedef dışı ortalamayı getirir.
 */
export function garantiliBeklenen(kimlik) {
  const temel = kasaBeklenen(kimlik);
  const g = KASA_GARANTI[kimlik];
  if (!g) return temel;
  const icerik = KASA_ICERIKLERI[kimlik];
  const toplam = icerik.reduce((t, o) => t + o.agirlik, 0);
  let p = 0;
  const hedef = { satilabilir: 0, tum: 0 };
  for (const o of icerik) {
    if (!garantiTutar(o, g)) continue;
    const q = o.agirlik / toplam;
    const d = odulDegeri(o);
    p += q;
    hedef.satilabilir += q * d.satilabilir;
    hedef.tum += q * d.tum;
  }
  const zorla = (1 - p) ** g.esik;
  const dongu = (1 - zorla) / p;
  const garantiKarti = NADIRLIKLER[g.nadirlik].deger * PARLAK_BEKLENEN_CARPAN;
  const hesap = (taban, hedefPayi) => {
    const digerOrt = (taban - hedefPayi) / (1 - p);
    return ((dongu - 1) * digerOrt + (1 - zorla) * (hedefPayi / p) + zorla * garantiKarti) / dongu;
  };
  return { satilabilir: hesap(temel.satilabilir, hedef.satilabilir), tum: hesap(temel.tum, hedef.tum) };
}

function garantiSayaci(db, guildId, kullaniciId, kasa) {
  return db
    .prepare('SELECT sayac FROM kasa_garantileri WHERE guild_id = ? AND kullanici_id = ? AND kasa = ?')
    .get(String(guildId), String(kullaniciId), kasa)?.sayac ?? 0;
}

function garantiYaz(db, guildId, kullaniciId, kasa, sayac) {
  db.prepare(
    `INSERT INTO kasa_garantileri (guild_id, kullanici_id, kasa, sayac) VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id, kullanici_id, kasa) DO UPDATE SET sayac = excluded.sayac`,
  ).run(String(guildId), String(kullaniciId), kasa, sayac);
}

/**
 * Garantinin durumu: `kalan` açılış içinde hedef kesinleşir (1 = bir sonraki açılış).
 * @returns {{nadirlik: string, esik: number, kalan: number} | null} garantisi olmayan kasada null
 */
export function garantiDurumu(db, guildId, kullaniciId, kasa) {
  const g = KASA_GARANTI[kasa];
  if (!g) return null;
  return { nadirlik: g.nadirlik, esik: g.esik, kalan: g.esik - garantiSayaci(db, guildId, kullaniciId, kasa) };
}

/** Bir sonucun gösterimdeki nadirliği (animasyon rengi ve başlığı için). */
export function sonucNadirligi(sonuc) {
  if (sonuc.tur === 'kart') return kartGetir(sonuc.kimlik).nadirlik;
  if (sonuc.tur === 'muz') return sonuc.miktar >= 10_000 ? 'efsanevi' : sonuc.miktar >= 3_000 ? 'destansi' : 'siradan';
  if (sonuc.kimlik === 'rozet-altin') return 'mitik';
  if (sonuc.tur === 'kasa') return 'efsanevi';
  return 'nadir';
}

/** Ödülü verir; açma işlemi içinden çağrılır. */
function odulVer(db, { guildId, kullaniciId, kasa, odul, rastgele, simdi }) {
  if (odul.tur === 'muz') {
    const miktar = odul.min + Math.floor(rastgele() * (odul.max - odul.min + 1));
    ekle(db, { guildId, kullaniciId, miktar, tur: TURLER.kazanc, karsiId: kasa, simdi });
    return { tur: 'muz', miktar };
  }

  if (odul.tur === 'kart' || odul.tur === 'kasa') {
    const temel = odul.tur === 'kart' ? rastgeleKart(odul.nadirlik, rastgele).kimlik : odul.kimlik;
    const parlak = odul.tur === 'kart' && rastgele() < PARLAK_SANS;
    const kimlik = parlak ? parlakKimlik(temel) : temel;
    // "Yeni": kartın normal ya da parlak sürümü daha önce hiç yoktu.
    const onceki = odul.tur === 'kart'
      ? adet(db, guildId, kullaniciId, temel) + adet(db, guildId, kullaniciId, parlakKimlik(temel))
      : 0;
    const yeni = esyaEkle(db, guildId, kullaniciId, kimlik);
    esyaHareketi(db, { guildId, kullaniciId, esya: kimlik, adet: 1, tur: 'kasa-odul', karsiId: kasa, simdi });
    return {
      tur: odul.tur, kimlik, adet: yeni, yeniKart: odul.tur === 'kart' && onceki === 0, ...(parlak ? { parlak: true } : {}),
    };
  }

  // Eşya: rozet zaten varsa ya da takviye sınırdaysa yerine muz.
  const esya = esyaGetir(odul.kimlik);
  if (esya.tur === 'rozet' && adet(db, guildId, kullaniciId, esya.kimlik) > 0) {
    ekle(db, { guildId, kullaniciId, miktar: ROZET_YERINE_MUZ, tur: TURLER.kazanc, karsiId: esya.kimlik, simdi });
    return { tur: 'muz', miktar: ROZET_YERINE_MUZ, yerine: esya.kimlik };
  }
  const verilen = esyaVer(db, { guildId, kullaniciId, esya, simdi });
  if (verilen.tur === 'esya') {
    esyaHareketi(db, { guildId, kullaniciId, esya: esya.kimlik, adet: 1, tur: 'kasa-odul', karsiId: kasa, simdi });
  }
  return verilen;
}

/**
 * Envanterdeki bir kasayı açar. Garantili kasada sayaç işler; garantiyle
 * gelen kartın sonucunda `garanti: true` olur.
 * @returns {{ok: false, sebep: string}
 *   | {ok: true, sonuc: object, kalan: number, garanti: {nadirlik: string, esik: number, kalan: number} | null}}
 */
export function kasaAc(db, {
  guildId, kullaniciId, kasa, rastgele = Math.random, simdi = Date.now(),
}) {
  if (!KASA_ICERIKLERI[kasa]) return { ok: false, sebep: 'Böyle bir kasa yok.' };

  return islem(db, () => {
    if (!esyaDus(db, guildId, kullaniciId, kasa)) {
      return { ok: false, sebep: `Envanterinde **${esyaGetir(kasa).ad}** yok. Mağazadan alabilir ya da seviye atlayarak kazanabilirsin.` };
    }
    esyaHareketi(db, { guildId, kullaniciId, esya: kasa, adet: -1, tur: 'kasa-ac', simdi });

    let odul = agirlikliSec(KASA_ICERIKLERI[kasa], rastgele);
    let garantili = false;
    const garanti = KASA_GARANTI[kasa];
    if (garanti) {
      const sayac = garantiSayaci(db, guildId, kullaniciId, kasa) + 1;
      if (!garantiTutar(odul, garanti) && sayac >= garanti.esik) {
        odul = { tur: 'kart', nadirlik: garanti.nadirlik };
        garantili = true;
      }
      garantiYaz(db, guildId, kullaniciId, kasa, garantiTutar(odul, garanti) ? 0 : sayac);
    }
    const sonuc = odulVer(db, { guildId, kullaniciId, kasa, odul, rastgele, simdi });
    if (garantili) sonuc.garanti = true;
    return {
      ok: true, sonuc, kalan: adet(db, guildId, kullaniciId, kasa), garanti: garantiDurumu(db, guildId, kullaniciId, kasa),
    };
  });
}

/** Garanti satırı (Discord): "🎯 En geç 3 kasa içinde 🟣 Destansı garanti"; garantisiz kasada null. */
export function garantiMetni(garanti) {
  if (!garanti) return null;
  const n = NADIRLIKLER[garanti.nadirlik];
  return garanti.kalan <= 1
    ? `🎯 Sıradaki kasada ${n.simge} **${n.ad}** garanti!`
    : `🎯 En geç **${garanti.kalan}** kasa içinde ${n.simge} **${n.ad}** garanti`;
}

/** Kasayı (seviye ödülü gibi) envantere ekler. */
export function kasaVer(db, {
  guildId, kullaniciId, kasa, tur, simdi = Date.now(),
}) {
  const yeni = esyaEkle(db, guildId, kullaniciId, kasa);
  esyaHareketi(db, { guildId, kullaniciId, esya: kasa, adet: 1, tur, simdi });
  return yeni;
}

/** "Elinde yok" metni; eksik kopya çalışmaya ya da sefere kilitliyse onu söyler. */
function yetersizMetni(db, guildId, kullaniciId, kimlik, kac, ad) {
  if (adet(db, guildId, kullaniciId, kimlik) < kac) return `Elinde ${kac} tane **${ad}** yok.`;
  return kilitliEsya(db, guildId, kullaniciId) === kimlik
    ? `**${ad}** kartının bir kopyası çalışmaya kilitli. Önce \`/calis maymun\` ile bırak ya da başka maymun seç.`
    : `**${ad}** kartının bir kopyası seferde. Dönmesini bekle ya da \`/maymun geri\` ile geri çağır.`;
}

/** Kartları satar; yetmiyorsa hiçbir şey yazmaz. */
export function kartSat(db, {
  guildId, kullaniciId, kimlik, adet: kac = 1, simdi = Date.now(),
}) {
  const kart = kartGetir(kimlik);
  if (!kart) return { ok: false, sebep: 'Böyle bir kart yok.' };
  if (!Number.isSafeInteger(kac) || kac < 1) return { ok: false, sebep: 'Geçersiz adet.' };

  return islem(db, () => {
    if (!esyaDus(db, guildId, kullaniciId, kimlik, kac)) {
      return { ok: false, sebep: yetersizMetni(db, guildId, kullaniciId, kimlik, kac, kart.ad) };
    }
    const tutar = kartDegeri(kart) * kac;
    esyaHareketi(db, { guildId, kullaniciId, esya: kimlik, adet: -kac, tur: 'sat', simdi });
    const bakiye = ekle(db, { guildId, kullaniciId, miktar: tutar, tur: TURLER.satis, karsiId: kimlik, simdi });
    return { ok: true, kart, adet: kac, tutar, bakiye };
  });
}

/** Her karttan birer tane bırakıp kopyaları satar. */
export function kopyalariSat(db, { guildId, kullaniciId, simdi = Date.now() }) {
  return islem(db, () => {
    let tutar = 0;
    let adetToplam = 0;
    for (const [kimlik, sahip] of Object.entries(envanter(db, guildId, kullaniciId))) {
      if (!kartMi(kimlik) || sahip < 2) continue;
      const satis = kartSat(db, { guildId, kullaniciId, kimlik, adet: sahip - 1, simdi });
      tutar += satis.tutar;
      adetToplam += satis.adet;
    }
    return { adet: adetToplam, tutar };
  });
}

/** Toptan satış seçimi: 'hepsi' ya da 'hepsi:<nadirlik>'. */
export const TOPTAN_HEPSI = 'hepsi';

/** @returns {{nadirlik: string|null} | null} toptan seçim değilse null */
export function toptanAyristir(deger) {
  if (deger === TOPTAN_HEPSI) return { nadirlik: null };
  const [onek, nadirlik] = String(deger ?? '').split(':');
  if (onek === TOPTAN_HEPSI && NADIRLIKLER[nadirlik]) return { nadirlik };
  return null;
}

/** Toptan satışta gidecek kartların sayısı ve değeri (yazmadan). */
export function toptanOnizleme(sahip, nadirlik = null) {
  let adetToplam = 0;
  let tutar = 0;
  for (const [kimlik, n] of Object.entries(sahip)) {
    const kart = kartGetir(kimlik);
    if (!kart || n < 1 || (nadirlik && kart.nadirlik !== nadirlik)) continue;
    adetToplam += n;
    tutar += n * kartDegeri(kart);
  }
  return { adet: adetToplam, tutar };
}

/** Bütün kartları (ya da bir nadirliğin bütün kartlarını) son kopyasına kadar satar. */
export function toptanSat(db, {
  guildId, kullaniciId, nadirlik = null, simdi = Date.now(),
}) {
  return islem(db, () => {
    let tutar = 0;
    let adetToplam = 0;
    // Çalışmaya kilitli maymun kopyası satılmaz.
    for (const [kimlik, sahip] of Object.entries(serbestEnvanter(db, guildId, kullaniciId))) {
      const kart = kartGetir(kimlik);
      if (!kart || sahip < 1 || (nadirlik && kart.nadirlik !== nadirlik)) continue;
      const satis = kartSat(db, { guildId, kullaniciId, kimlik, adet: sahip, simdi });
      tutar += satis.tutar;
      adetToplam += satis.adet;
    }
    return { adet: adetToplam, tutar };
  });
}

/** Envanterdeki açılmamış kasalar, ucuzdan pahalıya: [{ kimlik, adet }]. */
export function acilmamisKasalar(db, guildId, kullaniciId) {
  const sahip = envanter(db, guildId, kullaniciId);
  return KASA_KIMLIKLERI.filter((k) => sahip[k] > 0).map((kimlik) => ({ kimlik, adet: sahip[kimlik] }));
}

/** Hediye edilebilen eşyalar: kasalar ve kartlar. */
export function hediyeEdilirMi(kimlik) {
  // Günlük kasa hediye edilemez: yan hesaplarla toplanıp aktarılmasın.
  return (kasaMi(kimlik) && kimlik !== GUNLUK_KASA) || kartMi(kimlik);
}

/**
 * Kasa ya da kart hediye eder. Günlük sınır alt hesaplarla kasa toplamayı
 * zorlaştırır; yönetici ile üye arasında hediye yoktur.
 */
export function hediyeEt(db, {
  guildId, gonderenId, aliciId, kimlik, adet: kac = 1, simdi = Date.now(), yoneticiler = undefined,
}) {
  if (String(gonderenId) === String(aliciId)) return { ok: false, sebep: 'Kendine hediye edemezsin.' };
  if (yoneticiUyeArasi(gonderenId, aliciId, yoneticiler)) return { ok: false, sebep: YONETICI_AKTARIM_SEBEBI };
  const uzak = uzakAktarimSebebi(db, guildId, gonderenId, aliciId);
  if (uzak) return { ok: false, sebep: uzak };
  if (!hediyeEdilirMi(kimlik)) return { ok: false, sebep: 'Yalnız kasalar (Günlük Kasa hariç) ve kartlar hediye edilebilir.' };
  if (!Number.isSafeInteger(kac) || kac < 1) return { ok: false, sebep: 'Geçersiz adet.' };

  return islem(db, () => {
    const bugun = hareketToplami(db, guildId, gonderenId, 'hediye-ver', trGunBaslangici(simdi));
    if (bugun + kac > HEDIYE_GUNLUK) {
      return { ok: false, sebep: `Günde en çok ${HEDIYE_GUNLUK} eşya hediye edebilirsin; bugün ${bugun} verdin.` };
    }
    if (!esyaDus(db, guildId, gonderenId, kimlik, kac)) {
      return { ok: false, sebep: yetersizMetni(db, guildId, gonderenId, kimlik, kac, kartGetir(kimlik)?.ad ?? esyaGetir(kimlik)?.ad ?? kimlik) };
    }
    esyaEkle(db, guildId, aliciId, kimlik, kac);
    esyaHareketi(db, { guildId, kullaniciId: gonderenId, esya: kimlik, adet: -kac, tur: 'hediye-ver', karsiId: aliciId, simdi });
    esyaHareketi(db, { guildId, kullaniciId: aliciId, esya: kimlik, adet: kac, tur: 'hediye-al', karsiId: gonderenId, simdi });
    return { ok: true, adet: kac, kalanHak: HEDIYE_GUNLUK - bugun - kac };
  });
}

/** Kartın normal ya da parlak sürümü envanterde var mı (set ve koleksiyon sayımı). */
export function kartSahibiMi(sahip, kimlik) {
  return (sahip[kimlik] ?? 0) > 0 || (sahip[parlakKimlik(kimlik)] ?? 0) > 0;
}

/**
 * Koleksiyon durumu: her nadirlikte sahip olunan farklı kart / toplam,
 * kopyalar ve kartların toplam satış değeri.
 */
export function koleksiyon(db, guildId, kullaniciId) {
  const sahip = envanter(db, guildId, kullaniciId);
  const kademeler = NADIRLIK_SIRASI.map((nadirlik) => {
    const kartlar = KARTLAR.filter((k) => k.nadirlik === nadirlik);
    // Bir kart normal ya da parlak sürümüyle sayılır.
    return { nadirlik, sahip: kartlar.filter((k) => kartSahibiMi(sahip, k.kimlik)).length, toplam: kartlar.length };
  });
  let deger = 0;
  let kartSayisi = 0;
  for (const [kimlik, n] of Object.entries(sahip)) {
    const kart = kartGetir(kimlik);
    if (!kart) continue;
    kartSayisi += n;
    deger += n * kartDegeri(kart);
  }
  const farkli = kademeler.reduce((t, k) => t + k.sahip, 0);
  return { kademeler, farkli, toplam: KARTLAR.length, kartSayisi, deger };
}

/** Sonucu tek satır metne çevirir. `emoji(nesne)` eşya/kart emojisini döner. */
export function sonucMetni(sonuc, emoji) {
  if (sonuc.tur === 'muz') {
    const yerine = sonuc.yerine ? ` _(${esyaGetir(sonuc.yerine).ad} zaten sendeydi)_` : '';
    return `**${muz(sonuc.miktar)}**${yerine}`;
  }
  if (sonuc.tur === 'kart') {
    const kart = kartGetir(sonuc.kimlik);
    const n = NADIRLIKLER[kart.nadirlik];
    const parlak = kart.parlak ? '✨ **PARLAK!** ' : '';
    const garanti = sonuc.garanti ? ' · 🎯 **garanti**' : '';
    return `${parlak}${emoji(kart)} **${kart.ad}** kartı · ${n.simge} ${n.ad}${sonuc.yeniKart ? ' · 🆕 **YENİ**' : ` · ${sonuc.adet}. kopya`}${garanti}`;
  }
  const esya = esyaGetir(sonuc.kimlik);
  if (sonuc.tur === 'kasa') return `${emoji(esya)} **${esya.ad}**! (envanterinde ${sonuc.adet})`;
  if (sonuc.bitis) return `${emoji(esya)} **${esya.ad}** (etkin, <t:${Math.floor(sonuc.bitis / 1000)}:R> bitiyor)`;
  if (esya.tur === 'rozet') return `${emoji(esya)} **${esya.ad}** rozeti!`;
  return `${emoji(esya)} **${esya.ad}** (${sonuc.adet} tane)`;
}
