/**
 * Koleksiyon setleri: kartlar temalı gruplara ve nadirliklere ayrılır; bir
 * set tamamlanınca (envanterde her karttan en az bir tane) muz + kasa ödülü
 * bir kez alınır.
 *
 * Ödül alındığında set_oduller tablosuna yazılır; kart sonradan satılsa da
 * ödül geri alınmaz ve aynı set ikinci kez ödül vermez. Ödül, kontrol ve
 * kayıt tek işlemde yapılır: iki butona aynı anda basılsa da bir kez verilir.
 *
 * Ödüller setin satış değerine göre ayarlıdır (docs/para.md "Set ödülleri"):
 * muz + kasa mağaza fiyatı toplamı, kartların toplam satış değerinin kabaca
 * %18-58 kadardır (kolay setlerde oran yüksek, zor setlerde düşük); kolay
 * setler Ahşap/Demir, zor setler Altın/Elmas kasa verir.
 */

import { ekle, islem, muz, TURLER } from './ekonomi.js';
import { envanter } from './envanter.js';
import { esyaGetir } from './esyalar.js';
import {
  KARTLAR, kartSahibiMi, kasaVer, NADIRLIK_SIRASI, NADIRLIKLER,
} from './kasalar.js';

/** İlerleme çubuğunun uzunluğu (`Kahramanlar 12/17 ▰▰▰▰▱`). */
export const CUBUK_UZUNLUGU = 5;

const kartlariAl = (...kisaKimlikler) => kisaKimlikler.map((k) => `kart-${k}`);

/**
 * Temalı setler: her kart tam bir temalı sete girer (testle denetlenir).
 * `odul`: { muz, kasalar: { kasaKimligi: adet } }.
 */
const TEMALI = [
  {
    kimlik: 'temel-kuleler', ad: 'Temel Kuleler', simge: '🏹',
    kartlar: kartlariAl(
      'dart_monkey', 'boomerang', 'bomb_shooter', 'tack_shooter', 'ice_monkey', 'glue_gunner', 'sniper',
      'wizard', 'ninja', 'super_monkey',
    ),
    odul: { muz: 2_000, kasalar: { 'kasa-ahsap': 1 } },
  },
  {
    kimlik: 'askeri-kuleler', ad: 'Askeri Kuleler', simge: '🪖',
    kartlar: kartlariAl('sub', 'buccaneer', 'ace', 'heli', 'mortar', 'dartling', 'desperado'),
    odul: { muz: 1_000, kasalar: { 'kasa-ahsap': 1 } },
  },
  {
    kimlik: 'destek-maymunlari', ad: 'Destek Maymunları', simge: '🛠️',
    kartlar: kartlariAl(
      'alchemist', 'druid', 'mermonkey', 'banana_farm', 'spike_factory', 'village', 'engineer', 'beast_handler',
    ),
    odul: { muz: 3_000, kasalar: { 'kasa-demir': 1 } },
  },
  {
    kimlik: 'balonlar', ad: 'Balonlar', simge: '🎈',
    kartlar: kartlariAl('white', 'purple', 'zebra', 'lead', 'camo', 'regrow', 'fortified', 'RGB_Balon'),
    odul: { muz: 20_000, kasalar: { 'kasa-elmas': 1 } },
  },
  {
    kimlik: 'kahramanlar', ad: 'Kahramanlar', simge: '🦸',
    kartlar: kartlariAl(
      'quincy', 'gwendolin', 'striker_jones', 'obyn', 'churchill', 'benjamin', 'ezili', 'pat_fusty', 'adora',
      'brickell', 'etienne', 'sauda', 'psi', 'geraldo', 'corvus', 'rosalia', 'silas',
    ),
    odul: { muz: 15_000, kasalar: { 'kasa-altin': 1 } },
  },
  {
    kimlik: 'bosslar', ad: 'Bosslar', simge: '👹',
    kartlar: kartlariAl('bloonarius', 'lych', 'vortex', 'dreadbloon', 'phayze', 'blastapopoulos', 'ddt'),
    odul: { muz: 30_000, kasalar: { 'kasa-elmas': 1 } },
  },
  {
    kimlik: 'elit-bosslar', ad: 'Elit Bosslar', simge: '💀',
    kartlar: kartlariAl(
      'bloonarius_elite', 'lych_elite', 'vortex_elite', 'dreadbloon_elite', 'phayze_elite', 'blasta_elite',
    ),
    odul: { muz: 100_000, kasalar: { 'kasa-elmas': 2 } },
  },
].map((s) => ({ ...s, tur: 'tema' }));

/** Nadirlik setleri: bir nadirliğin bütün kartları. */
const NADIRLIK_ODULLERI = {
  siradan: { muz: 1_500, kasalar: { 'kasa-ahsap': 1 } },
  nadir: { muz: 5_000, kasalar: { 'kasa-demir': 1 } },
  destansi: { muz: 20_000, kasalar: { 'kasa-altin': 1 } },
  efsanevi: { muz: 20_000, kasalar: { 'kasa-altin': 1 } },
  mitik: { muz: 150_000, kasalar: { 'kasa-elmas': 3 } },
};

const NADIRLIK_SETLERI = NADIRLIK_SIRASI.map((nadirlik) => ({
  kimlik: `nadirlik-${nadirlik}`,
  ad: `${NADIRLIKLER[nadirlik].ad} Koleksiyonu`,
  simge: NADIRLIKLER[nadirlik].simge,
  tur: 'nadirlik',
  kartlar: KARTLAR.filter((k) => k.nadirlik === nadirlik).map((k) => k.kimlik),
  odul: NADIRLIK_ODULLERI[nadirlik],
}));

export const SETLER = Object.freeze([...TEMALI, ...NADIRLIK_SETLERI]);

const SET_HARITASI = new Map(SETLER.map((s) => [s.kimlik, s]));

export function setGetir(kimlik) {
  return SET_HARITASI.get(kimlik) ?? null;
}

/** Setteki kartların toplam satış değeri (ödülü ayarlarken ölçü). */
export function setDegeri(set) {
  const harita = new Map(KARTLAR.map((k) => [k.kimlik, k]));
  return set.kartlar.reduce((t, kimlik) => t + NADIRLIKLER[harita.get(kimlik).nadirlik].deger, 0);
}

/** Ödülün mağaza fiyatıyla muz karşılığı (kasa fiyatları esyalar.js'ten). */
export function odulDegeri(odul) {
  return odul.muz + Object.entries(odul.kasalar).reduce((t, [kasa, n]) => t + (esyaGetir(kasa).fiyat ?? 0) * n, 0);
}

/**
 * `▰▰▰▱▱` çubuğu. Tamamlanmadıkça asla dolu görünmez; en az bir kart varsa
 * en az bir dilim dolar.
 */
export function ilerlemeCubugu(sahip, toplam, uzunluk = CUBUK_UZUNLUGU) {
  let dolu = toplam > 0 ? Math.round((sahip / toplam) * uzunluk) : 0;
  if (sahip > 0) dolu = Math.max(1, dolu);
  if (sahip < toplam) dolu = Math.min(uzunluk - 1, dolu);
  return '▰'.repeat(dolu) + '▱'.repeat(uzunluk - dolu);
}

/** Setteki kartlardan envanterde (normal ya da parlak) bulunanların sayısı. */
export function setIlerlemesi(sahip, set) {
  // Kartın normal ya da parlak sürümü yeterli: parlak, normalin yerine geçen
  // daha nadir bir kopyadır; set tamamlamayı cezalandırmamalı.
  const var_ = set.kartlar.filter((kimlik) => kartSahibiMi(sahip, kimlik)).length;
  return { sahip: var_, toplam: set.kartlar.length, tamam: var_ === set.kartlar.length };
}

/** Ödülü alınmış setlerin kimlikleri. */
export function alinanSetler(db, guildId, kullaniciId) {
  return new Set(
    db.prepare('SELECT set_kimligi FROM set_oduller WHERE guild_id = ? AND kullanici_id = ?')
      .all(String(guildId), String(kullaniciId))
      .map((s) => s.set_kimligi),
  );
}

/**
 * Bütün setlerin durumu: ilerleme, çubuk, ödül alındı mı, şimdi alınabilir mi.
 * @returns {Array<{set: object, sahip: number, toplam: number, tamam: boolean, alindi: boolean, alinabilir: boolean, cubuk: string}>}
 */
export function setDurumlari(db, guildId, kullaniciId) {
  const sahip = envanter(db, guildId, kullaniciId);
  const alinan = alinanSetler(db, guildId, kullaniciId);
  return SETLER.map((set) => {
    const ilerleme = setIlerlemesi(sahip, set);
    const alindi = alinan.has(set.kimlik);
    return {
      set,
      ...ilerleme,
      alindi,
      alinabilir: ilerleme.tamam && !alindi,
      cubuk: ilerlemeCubugu(ilerleme.sahip, ilerleme.toplam),
    };
  });
}

/** `2.000 🍌 + 1 × Ahşap Kasa` biçiminde ödül metni. */
export function odulMetni(odul) {
  const kasalar = Object.entries(odul.kasalar).map(([kasa, n]) => {
    const esya = esyaGetir(kasa);
    return `${esya.yedek} ${n} × ${esya.ad}`;
  });
  return [muz(odul.muz), ...kasalar].join(' + ');
}

/**
 * Tamamlanmış setin ödülünü verir. Tek işlemde: tamamlık ve "alındı" kontrolü,
 * kayıt, muz ve kasalar birlikte yazılır ya da hiçbiri yazılmaz.
 *
 * @returns {{ok: false, sebep: string} | {ok: true, set: object, odul: object, bakiye: number}}
 */
export function setOduluAl(db, {
  guildId, kullaniciId, setKimligi, simdi = Date.now(),
}) {
  const set = setGetir(setKimligi);
  if (!set) return { ok: false, sebep: 'Böyle bir set yok.' };

  return islem(db, () => {
    const alindi = db
      .prepare('SELECT 1 FROM set_oduller WHERE guild_id = ? AND kullanici_id = ? AND set_kimligi = ?')
      .get(String(guildId), String(kullaniciId), set.kimlik);
    if (alindi) return { ok: false, sebep: `**${set.ad}** ödülünü zaten aldın.` };

    const ilerleme = setIlerlemesi(envanter(db, guildId, kullaniciId), set);
    if (!ilerleme.tamam) {
      return { ok: false, sebep: `**${set.ad}** henüz tamam değil: ${ilerleme.sahip}/${ilerleme.toplam}.` };
    }

    db.prepare('INSERT INTO set_oduller (guild_id, kullanici_id, set_kimligi, zaman) VALUES (?, ?, ?, ?)')
      .run(String(guildId), String(kullaniciId), set.kimlik, simdi);
    const bakiye = ekle(db, {
      guildId, kullaniciId, miktar: set.odul.muz, tur: TURLER.setOdul, karsiId: set.kimlik, simdi,
    });
    for (const [kasa, n] of Object.entries(set.odul.kasalar)) {
      for (let i = 0; i < n; i += 1) kasaVer(db, { guildId, kullaniciId, kasa, tur: TURLER.setOdul, simdi });
    }
    return { ok: true, set, odul: set.odul, bakiye };
  });
}
