/**
 * Kumar rotaları: slot, yazı-tura, zar, rulet, at yarışı, mines ve blackjack.
 * Akış slash komutla (commands/ekonomi/kumar.js, lib/mines-bilesen.js,
 * lib/ekonomi-bilesen.js) aynıdır: borç → bahis ayrıştırma → seçim doğrulama →
 * bekleme → oyun → görev olayları. Oyun bitmeden gizli veri (mayın yerleri,
 * deste, kurpiyerin kapalı kartı) yanıta girmez.
 */

import { bahisCoz, kullaniciBahisTavani } from '../../lib/bahis.js';
import { sureBicimle } from '../../lib/bicim.js';
import {
  baslat, BJ_CARPAN, BERABERE_CARPAN, bolunebilirMi, elDegeri, elGetir, hamle, KAZANC_CARPAN, zamanAsimiMi, ZAMAN_ASIMI_MS,
} from '../../lib/blackjack.js';
import { ANIMASYON_PAYI_MS } from '../../lib/akis.js';
import { bakiye } from '../../lib/ekonomi.js';
import { kumarOlaylari } from '../../lib/gorev-bilesen.js';
import { BORC_YASAK, borcluMu } from '../../lib/kredi.js';
import {
  ATLAR, atYarisi, bahisBeklemesi, bahisOyna, BAHIS_MIN, KIRMIZILAR, odemeHesapla, RULET_RENK_CARPAN,
  RULET_SAYI_CARPAN, ruletCevir, ruletSecimi, slotCevir, SLOT_SEMBOLLERI, YAZITURA_CARPAN, yaziTura,
  ZAR_BERABERE, ZAR_KAZANC, zarOyna,
} from '../../lib/kumar.js';
import {
  kullaniciOyunu, MAYIN_MAKS, MAYIN_MIN, MAYIN_VARSAYILAN, MINES_HUCRE, MINES_MAKS_CARPAN, MINES_SUTUN,
  MINES_ZAMAN_ASIMI_MS, minesAc, minesBaslat, minesCarpani, minesCek, minesKareSiniri,
} from '../../lib/mines.js';
import { basarili, hata, metin, tamSayi } from '../yardimci.js';

/** Avrupa çarkındaki sayı dizilimi (saat yönünde); ön yüz çarkı bununla çizer. */
const RULET_CARK = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7,
  28, 12, 35, 3, 26,
];

/** Mayın sayısına göre `acilan` = 1…güvenli kare için çarpan tablosu. */
function minesTablosu() {
  const tablo = {};
  for (let m = MAYIN_MIN; m <= MAYIN_MAKS; m += 1) {
    // Tavana (9x) varan kareden sonrası oynanmaz.
    tablo[m] = Array.from({ length: minesKareSiniri(m) }, (_, i) => minesCarpani(m, i + 1));
  }
  return tablo;
}

function oyunTanimlari() {
  return {
    slot: {
      semboller: SLOT_SEMBOLLERI.map((s) => ({
        simge: s.simge, agirlik: s.agirlik, uclu: s.uclu, ikili: s.ikili,
      })),
    },
    yazitura: { carpan: YAZITURA_CARPAN },
    zar: { kazanc: ZAR_KAZANC, berabere: ZAR_BERABERE },
    rulet: {
      renkCarpan: RULET_RENK_CARPAN,
      sayiCarpan: RULET_SAYI_CARPAN,
      kirmizilar: [...KIRMIZILAR].sort((a, b) => a - b),
      cark: RULET_CARK,
    },
    at: { atlar: ATLAR.map((a) => ({ no: a.no, ad: a.ad, sans: a.sans, carpan: a.carpan })) },
    mines: {
      hucre: MINES_HUCRE,
      sutun: MINES_SUTUN,
      min: MAYIN_MIN,
      maks: MAYIN_MAKS,
      varsayilan: MAYIN_VARSAYILAN,
      tablo: minesTablosu(),
      maksCarpan: MINES_MAKS_CARPAN,
    },
    blackjack: {
      blackjack: BJ_CARPAN, kazanc: KAZANC_CARPAN, berabere: BERABERE_CARPAN, zamanAsimiMs: ZAMAN_ASIMI_MS,
    },
  };
}

// ── Gizli veriden arındırılmış görünümler ──────────────────────────────────

/** Süren mines oyunu: mayın yerleri HİÇ gönderilmez. */
function minesGorunumu(oyun) {
  const acilan = oyun.acilan.length;
  return {
    id: oyun.id,
    bahis: oyun.bahis,
    mayin: oyun.mayin,
    acilan: oyun.acilan,
    carpan: minesCarpani(oyun.mayin, acilan),
    sonraki: minesCarpani(oyun.mayin, acilan + 1),
    cekilecek: acilan > 0 ? odemeHesapla(oyun.bahis, minesCarpani(oyun.mayin, acilan)) : 0,
    baslangic: oyun.baslangic,
    zamanAsimi: Date.now() - oyun.baslangic >= MINES_ZAMAN_ASIMI_MS,
  };
}

/** Biten mines oyununun özeti (bu noktada mayınları göstermek serbest). */
function minesBitisi(oyun, bitti) {
  return {
    tur: bitti.tur,
    patlayan: bitti.patlayan ?? null,
    carpan: bitti.carpan,
    odeme: bitti.odeme,
    net: bitti.net,
    cashback: bitti.cashback ?? 0,
    bahis: oyun.bahis,
    mayin: oyun.mayin,
    acilan: oyun.acilan,
    mayinlar: oyun.mayinlar,
  };
}

/**
 * Blackjack eli: deste yok; el sürerken kurpiyerin yalnız ilk kartı açık.
 * `oyuncu`/`bahis` oynanan elin kartları ve toplam bahis; `eller` bölünmüşse
 * iki eli (bitince her birinin sonucu ve ödemesiyle) taşır.
 */
function elGorunumu(el, guncelBakiye) {
  const bitti = Boolean(el.bitti);
  const oynanan = el.eller[el.aktif] ?? el.eller[0];
  return {
    bahis: el.bahis,
    oyuncu: el.oyuncu,
    oyuncuDeger: elDegeri(el.oyuncu),
    eller: el.eller.map((e, i) => ({
      kartlar: e.kartlar,
      deger: elDegeri(e.kartlar),
      bahis: e.bahis,
      oynaniyor: !bitti && i === el.aktif,
      sonuc: bitti ? e.sonuc : null,
      odeme: bitti ? e.odeme : null,
    })),
    aktif: el.aktif,
    bolundu: Boolean(el.bolundu),
    kurpiyer: bitti ? el.kurpiyer : el.kurpiyer.slice(0, 1),
    kurpiyerDeger: bitti ? elDegeri(el.kurpiyer) : null,
    kapaliKart: !bitti,
    bitti,
    sonuc: bitti ? el.sonuc : null,
    odeme: bitti ? el.odeme : null,
    net: bitti ? el.net : null,
    cashback: bitti ? el.cashback : 0,
    katlayabilir: !bitti && oynanan.kartlar.length === 2 && guncelBakiye >= oynanan.bahis,
    bolebilir: !bitti && bolunebilirMi(el) && guncelBakiye >= oynanan.bahis,
    baslangic: el.baslangic,
    zamanAsimi: !bitti && zamanAsimiMi(el),
  };
}

// ── Ortak denetimler ───────────────────────────────────────────────────────

function borcDenetle(b) {
  if (borcluMu(b.db, b.guildId, b.kullaniciId)) hata(BORC_YASAK, 403);
}

function bahisAl(b) {
  return basarili(bahisCoz(b.db, {
    guildId: b.guildId, kullaniciId: b.kullaniciId, ham: metin(b.govde, 'bahis') ?? '',
  })).miktar;
}

function beklemeDenetle(b) {
  const kalan = bahisBeklemesi(b.guildId, b.kullaniciId);
  if (kalan > 0) hata(`Biraz yavaş: ${sureBicimle(kalan)} sonra tekrar dene.`, 429);
}

const cuzdan = (b) => bakiye(b.db, b.guildId, b.kullaniciId);

// ── Tek atışlık oyunlar ────────────────────────────────────────────────────

/** Seçimi doğrular (bekleme süresi yanmasın diye bahisten sonra, beklemeden önce). */
const OYUNLAR = {
  slot: { hazirla: () => ({ oyun: () => slotCevir() }) },
  yazitura: {
    hazirla(govde) {
      const secim = metin(govde, 'secim');
      if (secim !== 'yazi' && secim !== 'tura') hata('Seçim `yazi` ya da `tura` olmalı.');
      return { oyun: () => yaziTura(secim) };
    },
  },
  zar: { hazirla: () => ({ oyun: () => zarOyna() }) },
  rulet: {
    hazirla(govde) {
      const secim = ruletSecimi(metin(govde, 'secim'));
      if (!secim) hata('Seçimi anlayamadım: `kirmizi`, `siyah`, `tek`, `cift` ya da 0–36 arası bir sayı.');
      return { oyun: () => ruletCevir(secim) };
    },
  },
  at: {
    hazirla(govde) {
      const no = tamSayi(govde, 'at', { min: 1, max: ATLAR.length });
      return { oyun: () => atYarisi(no) };
    },
  },
};

async function oyna(b) {
  const oyun = metin(b.govde, 'oyun');
  const tanim = Object.hasOwn(OYUNLAR, oyun) ? OYUNLAR[oyun] : null;
  if (!tanim) hata('Bilinmeyen oyun.');

  borcDenetle(b);
  const bahis = bahisAl(b);
  const hazir = tanim.hazirla(b.govde);
  beklemeDenetle(b);

  const s = basarili(bahisOyna(b.db, {
    guildId: b.guildId, kullaniciId: b.kullaniciId, bahis, oyun: hazir.oyun, oyunAdi: oyun,
  }));
  b.gorev(kumarOlaylari({ bahis, biten: { bahis, net: s.net } }));
  // Tek atışlık oyunların hepsi sonucu animasyonla açar.
  b.akis.kumar({
    oyun, bahis, net: s.net, carpan: s.sonuc.carpan,
  }, { gecikmeMs: ANIMASYON_PAYI_MS });
  return {
    oyun, bahis, sonuc: s.sonuc, carpan: s.sonuc.carpan, odeme: s.odeme, net: s.net, cashback: s.cashback, bakiye: s.bakiye,
  };
}

// ── Mines ──────────────────────────────────────────────────────────────────

function minesBaslatRota(b) {
  borcDenetle(b);
  const bahis = bahisAl(b);
  const mayin = tamSayi(b.govde, 'mayin', {
    zorunlu: false, min: MAYIN_MIN, max: MAYIN_MAKS, varsayilan: MAYIN_VARSAYILAN,
  });
  beklemeDenetle(b);

  const s = basarili(minesBaslat(b.db, {
    guildId: b.guildId, kullaniciId: b.kullaniciId, bahis, mayin,
  }));
  b.gorev(kumarOlaylari({
    bahis, biten: s.eski ? { bahis: s.eski.oyun.bahis, net: s.eski.bitti.net } : null,
  }));
  return {
    oyun: minesGorunumu(s.oyun),
    // Unutulan eski oyun kendiliğinden çekildi / iade edildi.
    eski: s.eski ? {
      tur: s.eski.bitti.tur, bahis: s.eski.oyun.bahis, carpan: s.eski.bitti.carpan, odeme: s.eski.bitti.odeme, net: s.eski.bitti.net,
    } : null,
    bakiye: s.bakiye,
  };
}

/** Kare açma ve çekme ortak: süren oyunu bulur, sonucu görünüme çevirir. */
function minesHamle(b, islem) {
  const mevcut = kullaniciOyunu(b.db, b.guildId, b.kullaniciId);
  if (!mevcut) hata('Süren bir mines oyunun yok.');
  const s = basarili(islem(mevcut.id));
  if (s.bitti) {
    b.gorev(kumarOlaylari({ biten: { bahis: s.oyun.bahis, net: s.bitti.net } }));
    b.akis.kumar({
      oyun: 'mines', bahis: s.oyun.bahis, net: s.bitti.net, carpan: s.bitti.carpan, acilan: s.oyun.acilan.length,
    });
  }
  return {
    oyun: s.bitti ? null : minesGorunumu(s.oyun),
    bitti: s.bitti ? minesBitisi(s.oyun, s.bitti) : null,
    bakiye: cuzdan(b),
  };
}

// ── Blackjack ──────────────────────────────────────────────────────────────

/** Kurpiyerin kartları sırayla açılır; duyuru onları beklesin. */
const BJ_ANIMASYON_MS = 3_000;

/** Biten el: çarpan, ödemenin bahse oranı (katlamada bahis zaten ikiye katlanmıştır). */
function blackjackAkisi(b, el) {
  b.akis.kumar({
    oyun: 'blackjack', bahis: el.bahis, net: el.net, carpan: el.bahis > 0 ? el.odeme / el.bahis : 0,
  }, { gecikmeMs: BJ_ANIMASYON_MS });
}

function blackjackBaslatRota(b) {
  borcDenetle(b);
  const bahis = bahisAl(b);
  beklemeDenetle(b);

  const { db, guildId, kullaniciId } = b;
  let sonuc = baslat(db, { guildId, kullaniciId, bahis });
  let eski = null;

  if (!sonuc.ok && sonuc.acik) {
    // Süren el: ön yüz devam ettirebilsin diye eli de döndür.
    if (!zamanAsimiMi(sonuc.acik)) {
      return {
        zatenAcik: true,
        sebep: 'Zaten süren bir elin var; önce onu bitir.',
        el: elGorunumu({ ...sonuc.acik, bitti: false }, cuzdan(b)),
        bakiye: cuzdan(b),
      };
    }
    // Unutulmuş el: önce durup sonuçlandırıyoruz, sonra yenisini açıyoruz.
    const eskiSonuc = hamle(db, {
      guildId, kullaniciId, tur: 'dur', hepsi: true,
    });
    if (eskiSonuc.ok) eski = elGorunumu(eskiSonuc.el, cuzdan(b));
    sonuc = baslat(db, { guildId, kullaniciId, bahis });
  }
  basarili(sonuc);

  const { el } = sonuc;
  b.gorev(kumarOlaylari({ bahis, biten: el.bitti ? el : null }));
  if (el.bitti) blackjackAkisi(b, el);
  return { el: elGorunumu(el, cuzdan(b)), eski, bakiye: cuzdan(b) };
}

function blackjackHamleRota(b) {
  const tur = metin(b.govde, 'tur');
  if (!['cek', 'dur', 'katla', 'bol'].includes(tur)) hata('Hamle `cek`, `dur`, `katla` ya da `bol` olmalı.');

  const { el } = basarili(hamle(b.db, { guildId: b.guildId, kullaniciId: b.kullaniciId, tur }));
  b.gorev(kumarOlaylari({ biten: el.bitti ? el : null }));
  if (el.bitti) blackjackAkisi(b, el);
  return { el: elGorunumu(el, cuzdan(b)), bakiye: cuzdan(b) };
}

export const rotalar = [
  {
    yontem: 'GET',
    yol: '/api/kumar',
    calistir(b) {
      const mines = kullaniciOyunu(b.db, b.guildId, b.kullaniciId);
      const el = elGetir(b.db, b.guildId, b.kullaniciId);
      const guncel = cuzdan(b);
      return {
        bakiye: guncel,
        tavan: kullaniciBahisTavani(b.db, b.guildId, b.kullaniciId),
        min: BAHIS_MIN,
        borclu: borcluMu(b.db, b.guildId, b.kullaniciId),
        oyunlar: oyunTanimlari(),
        mines: mines ? minesGorunumu(mines) : null,
        blackjack: el ? elGorunumu({ ...el, bitti: false }, guncel) : null,
      };
    },
  },
  { yontem: 'POST', yol: '/api/kumar/oyna', calistir: oyna },
  { yontem: 'POST', yol: '/api/kumar/mines/baslat', calistir: minesBaslatRota },
  {
    yontem: 'POST',
    yol: '/api/kumar/mines/ac',
    calistir(b) {
      const hucre = tamSayi(b.govde, 'hucre', { min: 0, max: MINES_HUCRE - 1 });
      return minesHamle(b, (id) => minesAc(b.db, { id, kullaniciId: b.kullaniciId, hucre }));
    },
  },
  {
    yontem: 'POST',
    yol: '/api/kumar/mines/cek',
    calistir: (b) => minesHamle(b, (id) => minesCek(b.db, { id, kullaniciId: b.kullaniciId })),
  },
  { yontem: 'POST', yol: '/api/kumar/blackjack/baslat', calistir: blackjackBaslatRota },
  { yontem: 'POST', yol: '/api/kumar/blackjack/hamle', calistir: blackjackHamleRota },
];
