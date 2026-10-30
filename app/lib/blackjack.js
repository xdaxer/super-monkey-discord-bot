/**
 * Blackjack (21): oyuncu kart çeker / durur / ikiye katlar / böler, kurpiyer
 * 17'ye kadar çeker (yumuşak 17'de durur).
 *
 * Bölme (2026-10-23): ilk iki kart aynı değerdeyse (10, J, Q, K hepsi 10)
 * bir kez bölünür; ikinci bahis düşülür, iki ele birer kart dağıtılır, eller
 * sırayla oynanır. Bölünmüş elde ikiye katlanabilir. Bölünen asa tek kart gelir
 * ve iki el de kendiliğinden durur. Bölünmüş eldeki 21 blackjack değildir (2x).
 *
 * Bahis başlangıçta düşülür, el blackjack_oyunlari tablosunda tutulur ki
 * butonlar bot yeniden başlasa da aynı eli bulsun. Açılışta kalan eller
 * iade edilir (acikElleriIadeEt): kimse yarım kalan el yüzünden muz kaybetmez.
 * Ödemeler: blackjack (ilk iki kart 21) 2,2x (6:5), kazanma 2x, beraberlik 1x.
 */

import { dus, ekle, islem, TURLER } from './ekonomi.js';
import { kumarCashback } from './kumar-cashback.js';

export const BJ_CARPAN = 2.2;
export const KAZANC_CARPAN = 2;
export const BERABERE_CARPAN = 1;
/** Bu süreden eski el, sahibi yeni el açmak isteyince kendiliğinden "dur"ulur. */
export const ZAMAN_ASIMI_MS = 5 * 60_000;

const RENKLER = ['♠', '♥', '♦', '♣'];
const DEGERLER = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/** Karıştırılmış 52'lik deste (Fisher–Yates). */
export function desteOlustur(rastgele = Math.random) {
  const deste = [];
  for (const renk of RENKLER) for (const deger of DEGERLER) deste.push(`${deger}${renk}`);
  for (let i = deste.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rastgele() * (i + 1));
    [deste[i], deste[j]] = [deste[j], deste[i]];
  }
  return deste;
}

export function kartDegeri(kart) {
  const deger = kart.slice(0, -1);
  if (deger === 'A') return 11;
  if (['J', 'Q', 'K'].includes(deger)) return 10;
  return Number(deger);
}

/** Elin değeri; aslar 21'i aşmamak için gerektiği kadar 1 sayılır. */
export function elDegeri(kartlar) {
  let toplam = 0;
  let aslar = 0;
  for (const kart of kartlar) {
    toplam += kartDegeri(kart);
    if (kart.startsWith('A')) aslar += 1;
  }
  while (toplam > 21 && aslar > 0) {
    toplam -= 10;
    aslar -= 1;
  }
  return toplam;
}

export function blackjackMi(kartlar) {
  return kartlar.length === 2 && elDegeri(kartlar) === 21;
}

/** Kurpiyer 17 ve üstünde durur. */
export function kurpiyerOyna(kurpiyer, deste) {
  const el = [...kurpiyer];
  while (elDegeri(el) < 17) el.push(deste.shift());
  return el;
}

/**
 * Elin sonucu ve çarpanı.
 * @returns {{sonuc: 'blackjack'|'kazandi'|'kaybetti'|'berabere'|'patladi', carpan: number}}
 */
export function sonucHesapla(oyuncu, kurpiyer, bolundu = false) {
  const o = elDegeri(oyuncu);
  const k = elDegeri(kurpiyer);
  const oBj = !bolundu && blackjackMi(oyuncu);
  const kBj = blackjackMi(kurpiyer);

  if (o > 21) return { sonuc: 'patladi', carpan: 0 };
  if (oBj && kBj) return { sonuc: 'berabere', carpan: BERABERE_CARPAN };
  if (oBj) return { sonuc: 'blackjack', carpan: BJ_CARPAN };
  if (kBj) return { sonuc: 'kaybetti', carpan: 0 };
  if (k > 21 || o > k) return { sonuc: 'kazandi', carpan: KAZANC_CARPAN };
  if (o === k) return { sonuc: 'berabere', carpan: BERABERE_CARPAN };
  return { sonuc: 'kaybetti', carpan: 0 };
}

/**
 * Tablo satırı: bölünmemiş elde `oyuncu` kart dizisidir, `bahis` o elin
 * bahsi. Bölününce `oyuncu` `{eller, aktif}` olur, `bahis` bütün ellerin
 * toplamıdır (açılış iadesi doğru tutarı geri versin diye).
 */
function satirOku(satir) {
  const ham = JSON.parse(satir.oyuncu);
  const bolunmus = !Array.isArray(ham);
  return elTamamla({
    guildId: satir.guild_id,
    kullaniciId: satir.kullanici_id,
    deste: JSON.parse(satir.deste),
    eller: bolunmus ? ham.eller : [{ kartlar: ham, bahis: satir.bahis, durdu: false }],
    aktif: bolunmus ? ham.aktif : 0,
    bolundu: bolunmus,
    kurpiyer: JSON.parse(satir.kurpiyer),
    mesajId: satir.mesaj_id,
    baslangic: satir.baslangic,
  });
}

/**
 * Türetilen alanlar: `bahis` bütün ellerin toplamı, `oyuncu` oynanan (el
 * bitince ilk) elin kartları. Tek elli oyunda ikisi de eskisi gibidir.
 */
function elTamamla(el) {
  el.bahis = el.eller.reduce((t, e) => t + e.bahis, 0);
  el.oyuncu = (el.eller[el.aktif] ?? el.eller[0]).kartlar;
  return el;
}

export function elGetir(db, guildId, kullaniciId) {
  const satir = db
    .prepare('SELECT * FROM blackjack_oyunlari WHERE guild_id = ? AND kullanici_id = ?')
    .get(String(guildId), String(kullaniciId));
  return satir ? satirOku(satir) : null;
}

function elYaz(db, el) {
  elTamamla(el);
  const oyuncu = el.bolundu ? { eller: el.eller, aktif: el.aktif } : el.eller[0].kartlar;
  db.prepare(
    `INSERT INTO blackjack_oyunlari (guild_id, kullanici_id, bahis, deste, oyuncu, kurpiyer, mesaj_id, baslangic)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(guild_id, kullanici_id) DO UPDATE SET
       bahis = excluded.bahis, deste = excluded.deste, oyuncu = excluded.oyuncu,
       kurpiyer = excluded.kurpiyer, mesaj_id = excluded.mesaj_id`,
  ).run(
    String(el.guildId), String(el.kullaniciId), el.bahis, JSON.stringify(el.deste),
    JSON.stringify(oyuncu), JSON.stringify(el.kurpiyer), el.mesajId ?? null, el.baslangic,
  );
}

function elSil(db, guildId, kullaniciId) {
  db.prepare('DELETE FROM blackjack_oyunlari WHERE guild_id = ? AND kullanici_id = ?')
    .run(String(guildId), String(kullaniciId));
}

export function mesajIdKaydet(db, guildId, kullaniciId, mesajId) {
  db.prepare('UPDATE blackjack_oyunlari SET mesaj_id = ? WHERE guild_id = ? AND kullanici_id = ?')
    .run(String(mesajId), String(guildId), String(kullaniciId));
}

/** Oynanan el bölünebilir mi (bakiye ayrıca denetlenir). */
export function bolunebilirMi(el) {
  const kartlar = el.eller[el.aktif]?.kartlar ?? [];
  return !el.bolundu && kartlar.length === 2 && kartDegeri(kartlar[0]) === kartDegeri(kartlar[1]);
}

/**
 * Eli kapatır: oyuncunun patlamamış eli varsa kurpiyer oynar, her el kendi
 * bahsiyle ödenir (tek defter kaydı), kayıt silinir.
 */
function kapat(db, el, simdi) {
  const ayakta = el.eller.some((e) => elDegeri(e.kartlar) <= 21);
  const kurpiyer = ayakta ? kurpiyerOyna(el.kurpiyer, el.deste) : el.kurpiyer;
  const eller = el.eller.map((e) => {
    const { sonuc, carpan } = sonucHesapla(e.kartlar, kurpiyer, el.bolundu);
    return { ...e, durdu: true, sonuc, odeme: Math.floor(e.bahis * carpan) };
  });
  const bahis = eller.reduce((t, e) => t + e.bahis, 0);
  const odeme = eller.reduce((t, e) => t + e.odeme, 0);

  elSil(db, el.guildId, el.kullaniciId);
  if (odeme > 0) {
    ekle(db, {
      guildId: el.guildId, kullaniciId: el.kullaniciId, miktar: odeme, tur: TURLER.kazanc, oyun: 'blackjack', simdi,
    });
  }

  const net = odeme - bahis;
  const cb = kumarCashback(db, { guildId: el.guildId, kullaniciId: el.kullaniciId, net, simdi });
  // Tek elde sonuç o elinki; bölünmüşte toplam nete göre.
  const sonuc = eller.length === 1 ? eller[0].sonuc : net > 0 ? 'kazandi' : net < 0 ? 'kaybetti' : 'berabere';
  return {
    ...el, eller, aktif: 0, oyuncu: eller[0].kartlar, kurpiyer, bitti: true, sonuc, bahis, odeme, net, cashback: cb?.iade ?? 0,
  };
}

/**
 * Oynanan el durdu ya da 21'e vardıysa sıradaki ele geçer; el kalmadıysa
 * kapatır, kaldıysa kaydeder.
 */
function ilerle(db, el, simdi) {
  while (el.aktif < el.eller.length) {
    const e = el.eller[el.aktif];
    if (!e.durdu && elDegeri(e.kartlar) < 21) break;
    e.durdu = true;
    el.aktif += 1;
  }
  if (el.aktif >= el.eller.length) return kapat(db, el, simdi);
  elYaz(db, el);
  return { ...el, bitti: false };
}

/**
 * Yeni el açar. Bahsi düşer, ikişer kart dağıtır; iki taraftan biri
 * blackjack yaptıysa el hemen kapanır.
 *
 * @returns {{ok: false, sebep: string, acik?: object} | {ok: true, el: object}}
 */
export function baslat(db, {
  guildId, kullaniciId, bahis, rastgele = Math.random, deste: verilen = null, simdi = Date.now(),
}) {
  return islem(db, () => {
    const acik = elGetir(db, guildId, kullaniciId);
    if (acik) return { ok: false, sebep: 'acik-el', acik };

    const kalan = dus(db, {
      guildId, kullaniciId, miktar: bahis, tur: TURLER.bahis, oyun: 'blackjack', simdi,
    });
    if (kalan === null) return { ok: false, sebep: 'Bakiyen bu bahse yetmiyor.' };

    // Testler sırası bilinen deste verebilir.
    const deste = verilen ? [...verilen] : desteOlustur(rastgele);
    const oyuncu = [deste.shift(), deste.shift()];
    const kurpiyer = [deste.shift(), deste.shift()];
    const el = elTamamla({
      guildId, kullaniciId, deste, eller: [{ kartlar: oyuncu, bahis, durdu: false }], aktif: 0, bolundu: false,
      kurpiyer, mesajId: null, baslangic: simdi,
    });

    if (blackjackMi(oyuncu) || blackjackMi(kurpiyer)) return { ok: true, el: kapat(db, el, simdi) };

    elYaz(db, el);
    return { ok: true, el: { ...el, bitti: false } };
  });
}

/**
 * Hamle oynanan ele uygulanır: 'cek' (kart çek), 'dur', 'katla' (o elin
 * bahsini ikiye katla, tek kart çek, dur), 'bol' (iki ele ayır). `hepsi`:
 * 'dur' bütün elleri durdurur (unutulmuş eli kapatmak için).
 *
 * @returns {{ok: false, sebep: string} | {ok: true, el: object}}
 */
export function hamle(db, {
  guildId, kullaniciId, tur, hepsi = false, simdi = Date.now(),
}) {
  return islem(db, () => {
    const el = elGetir(db, guildId, kullaniciId);
    if (!el) return { ok: false, sebep: 'Bu el bitmiş ya da hiç açılmamış.' };
    const oynanan = el.eller[el.aktif];

    if (tur === 'dur') {
      if (hepsi) for (const e of el.eller) e.durdu = true;
      oynanan.durdu = true;
      return { ok: true, el: ilerle(db, el, simdi) };
    }

    if (tur === 'katla') {
      if (oynanan.kartlar.length !== 2) return { ok: false, sebep: 'Yalnız ilk iki kartla ikiye katlayabilirsin.' };
      const kalan = dus(db, {
        guildId, kullaniciId, miktar: oynanan.bahis, tur: TURLER.bahis, oyun: 'blackjack', simdi,
      });
      if (kalan === null) return { ok: false, sebep: 'İkiye katlamaya bakiyen yetmiyor.' };
      oynanan.bahis *= 2;
      oynanan.kartlar.push(el.deste.shift());
      oynanan.durdu = true;
      return { ok: true, el: ilerle(db, el, simdi) };
    }

    if (tur === 'bol') {
      if (el.bolundu) return { ok: false, sebep: 'Bir el yalnız bir kez bölünebilir.' };
      if (!bolunebilirMi(el)) return { ok: false, sebep: 'Yalnız aynı değerde iki kartla bölebilirsin.' };
      const kalan = dus(db, {
        guildId, kullaniciId, miktar: oynanan.bahis, tur: TURLER.bahis, oyun: 'blackjack', simdi,
      });
      if (kalan === null) return { ok: false, sebep: 'Bölmeye bakiyen yetmiyor.' };
      const [ilk, ikinci] = oynanan.kartlar;
      // Bölünen asa tek kart gelir, iki el de durur.
      const as = ilk.startsWith('A');
      el.eller = [ilk, ikinci].map((k) => ({ kartlar: [k, el.deste.shift()], bahis: oynanan.bahis, durdu: as }));
      el.bolundu = true;
      el.aktif = 0;
      return { ok: true, el: ilerle(db, el, simdi) };
    }

    if (tur === 'cek') {
      oynanan.kartlar.push(el.deste.shift());
      // 21'e ulaşınca ya da patlayınca devam etmenin anlamı yok; ilerle durdurur.
      return { ok: true, el: ilerle(db, el, simdi) };
    }

    return { ok: false, sebep: `Bilinmeyen hamle: ${tur}` };
  });
}

/** El zaman aşımına uğradı mı (sahibi unutmuş olabilir). */
export function zamanAsimiMi(el, simdi = Date.now()) {
  return simdi - el.baslangic >= ZAMAN_ASIMI_MS;
}

/**
 * Açılışta yarım kalan bütün ellerin bahsini iade eder.
 * @returns {number} iade edilen el sayısı
 */
export function acikElleriIadeEt(db, simdi = Date.now()) {
  return islem(db, () => {
    const satirlar = db.prepare('SELECT * FROM blackjack_oyunlari').all();
    for (const satir of satirlar) {
      ekle(db, {
        guildId: satir.guild_id, kullaniciId: satir.kullanici_id, miktar: satir.bahis, tur: TURLER.iade, oyun: 'blackjack', simdi,
      });
    }
    db.prepare('DELETE FROM blackjack_oyunlari').run();
    return satirlar.length;
  });
}

/** Kartları gösterim için yazar; kurpiyerin ikinci kartı el sürerken kapalı. */
export function kartlarMetni(kartlar, gizli = false) {
  if (gizli) return `${kartlar[0]} 🂠`;
  return kartlar.join(' ');
}
