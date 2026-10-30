/**
 * Cüzdan alanı: özet (/cuzdan + /profil), günlük ödül, çalış, muz gönder,
 * görevler, başarımlar ve sıralama. Kurallar lib/'tedir; burada slash
 * komutlarla (commands/ekonomi/) aynı çağrılar aynı sırada yapılır.
 */

import { ayarGetir } from '../../lib/ayarlar.js';
import { kilitliToplam, vadesiGelenleriOde } from '../../lib/banka.js';
import {
  basarimDurumlari, basarimOzeti, KADEMELER, KATEGORILER, odulMetni as basarimOdulMetni,
} from '../../lib/basarimlar.js';
import {
  bakiye as bakiyeOku, bugunGonderilen, gonder, gunlukAl, gunlukLimit, HAFTA_GUNU, hesapGetir, miktarAyristir, muz,
  SERI_KORUYUCU, sonrakiGunBaslangici, TRANSFER_MIN, trGunu, zenginlikSirasi,
} from '../../lib/ekonomi.js';
import { adet, etkinEtkiler } from '../../lib/envanter.js';
import { acilmamisKasalar } from '../../lib/kasalar.js';
import { aktifEtkinlikler, etkinlikAdi } from '../../lib/etkinlik.js';
import { olayCoz } from '../../lib/calis-olay.js';
import {
  tikAyristir, yoklamaBekleyen, yoklamaCevapla, yoklamaDenetle,
} from '../../lib/calis-yoklama.js';
import {
  grevBaslat, grevBekleyen, grevBitir, grevTestYetkisi, grevZari,
} from '../../lib/grev.js';
import {
  esyaGetir, gunlukAlim, rozetCalisBonusu, rozetler,
} from '../../lib/esyalar.js';
import { etkinlikFiyati } from '../../lib/etkinlik.js';
import {
  GUNLUK_BONUS, gorevleriGetir, odulMetni as gorevOdulMetni,
} from '../../lib/gorevler.js';
import { kartGetir } from '../../lib/kasalar.js';
import { aktifKredi, borcOzeti } from '../../lib/kredi.js';
import { maymunBirak, maymunKilitle, maymunlar } from '../../lib/maymun.js';
import {
  acikMeslekler, BEKLEME_MS, BONUS_AHSAP, BONUS_DEMIR, calis, calismaDurumu, calismaGetir, ENERJI_DOLUM_MS,
  gecerliMeslek, MESLEKLER, meslekSec, OTOMATIK, sonrakiMeslek, YORGUNLUK,
} from '../../lib/meslekler.js';
import { prestijSeviyesi, seviyeCarpani } from '../../lib/prestij-carpan.js';
import { profilVerisi } from '../../lib/profil-gorsel.js';
import { hazirSeferSayisi } from '../../lib/sefer.js';
import { kullaniciGetir } from '../../lib/seviye.js';
import {
  degerMetni, haftaBaslangici, kendiSirasi, SIRALAMA_KIMLIKLERI, SIRALAMA_TURLERI, siralama,
} from '../../lib/siralamalar.js';
import { uyelikKademesi } from '../../lib/uyelik-carpan.js';
import { YONETICI_CARPAN, yoneticiCarpani } from '../../lib/yonetici-carpan.js';
import { uyeOzeti } from '../gorsel.js';
import {
  basarili, hata, kimlikMi, metin,
} from '../yardimci.js';
import { promoKullan } from '../../lib/promo.js';

const SIRALAMA_ADEDI = 10;

/** Renk sayısı (0xrrggbb) → CSS rengi. */
const renk = (sayi) => `#${Number(sayi).toString(16).padStart(6, '0')}`;

/** Ödül nesnesi ({muz} ya da {kasa}) → ön yüz verisi. */
function odulVerisi(b, odul) {
  const kasa = odul.kasa ? esyaGetir(odul.kasa) : null;
  return {
    muz: odul.muz ?? null,
    kasa: kasa ? { kimlik: kasa.kimlik, ad: kasa.ad, gorsel: b.gorsel(kasa) } : null,
  };
}

/** Kasa kimliği → {kimlik, ad, gorsel}. */
function kasaVerisi(b, kimlik) {
  const e = esyaGetir(kimlik);
  return e ? { kimlik, ad: e.ad, gorsel: b.gorsel(e) } : { kimlik, ad: kimlik, gorsel: b.gorsel(null) };
}

/** Mesleğin ön yüz verisi. */
function meslekVerisi(b, m) {
  return {
    kimlik: m.kimlik, ad: m.ad, seviye: m.seviye, min: m.min, max: m.max, gorsel: b.gorsel(m),
  };
}

/** Maymun durumunun ön yüz verisi (maymunsuzsa kart null). */
export function maymunVerisi(b, m) {
  return {
    kart: m.kart ? { kimlik: m.kart.kimlik, ad: m.kart.ad, nadirlik: m.kart.nadirlik, parlak: Boolean(m.kart.parlak), gorsel: b.gorsel(m.kart) } : null,
    seviye: m.seviye,
    xp: m.mevcut,
    gereken: m.gereken,
    oran: m.oran,
    direnc: m.direnc,
    yollar: m.yollar,
    etki: m.etki,
    ...(m.adet !== undefined ? { adet: m.adet } : {}),
    ...(m.seviyeAtladi !== undefined ? { seviyeAtladi: m.seviyeAtladi } : {}),
  };
}

/** Olayın ön yüz verisi (anlık olay sonucu ya da bekleyen seçim). */
function olayVerisi(b, o) {
  return {
    kimlik: o.kimlik,
    ad: o.ad,
    emoji: o.emoji,
    metin: o.metin,
    muz: o.muz ?? null,
    enerji: o.enerji ?? null,
    xp: o.xp ? { seviye: o.xp.seviye, xp: o.xp.mevcut, gereken: o.xp.gereken } : null,
    kasa: o.kasa ? kasaVerisi(b, o.kasa) : null,
    secenekler: o.secenekler ?? null,
    bitis: o.bitis ?? null,
  };
}

/** Enerji Totemi: fiyatı ve bugün kalan alım hakkı. */
function totemVerisi(b) {
  const esya = esyaGetir('enerji-totemi');
  return {
    kimlik: esya.kimlik,
    ad: esya.ad,
    gorsel: b.gorsel(esya),
    fiyat: etkinlikFiyati(b.db, b.guildId, esya).fiyat,
    kalan: Math.max(0, esya.gunluk - gunlukAlim(b.db, b.guildId, b.kullaniciId, esya.kimlik)),
    gunluk: esya.gunluk,
  };
}

/** Enerji ve maymun durumu (her çalış yanıtında). */
function enerjiVerisi(b) {
  const d = calismaDurumu(b.db, b.guildId, b.kullaniciId);
  const bekleyen = d.bekleyenOlay;
  return {
    olaySansi: d.olaySansi,
    bekleyenOlay: bekleyen ? olayVerisi(b, {
      ...bekleyen.olay, secenekler: bekleyen.olay.secenekler, bitis: bekleyen.bitis,
    }) : null,
    hazirSefer: hazirSeferSayisi(b.db, b.guildId, b.kullaniciId),
    totem: totemVerisi(b),
    enerji: d.enerji,
    enerjiMaks: d.enerjiMaks,
    bedel: d.bedel,
    enerjiMs: d.enerjiMs,
    tamDolumMs: d.tamDolumMs,
    dolumMs: ENERJI_DOLUM_MS,
    yorgunluk: YORGUNLUK,
    rozetBonus: d.rozetBonus,
    maymun: maymunVerisi(b, d.maymun),
    beklemeKalanMs: d.beklemeMs,
  };
}

/** Bekleyen grev ve (yetkiliye) gizli test işareti. */
function grevAlanlari(b) {
  const grev = grevBekleyen(b.db, b.guildId, b.kullaniciId);
  return {
    ...(grev ? { grev } : {}),
    ...(grevTestYetkisi(b.kullaniciId) ? { grevTest: true } : {}),
  };
}

/**
 * Bekleyen ustabaşı yoklaması: hedefin adı ve karışık seçenekler. Hangi
 * seçeneğin doğru olduğu ve yoklamanın sebebi istemciye gönderilmez.
 * Ceza beklemesi `kalanMs` olarak gider (üyenin saati sunucuyla aynı olmayabilir).
 */
function yoklamaVerisi(b, y) {
  const meslek = (kimlik) => MESLEKLER.find((m) => m.kimlik === kimlik);
  return {
    id: y.id,
    hedef: meslek(y.hedef).ad,
    secenekler: y.secenekler.map((k) => ({ kimlik: k, ad: meslek(k).ad, gorsel: b.gorsel(meslek(k)) })),
    kalanMs: Math.max(0, y.acilis - Date.now()),
  };
}

/** Mesleklerin durumu (/calis bilgi: true). */
function calisBilgisi(b) {
  const seviye = kullaniciGetir(b.db, b.guildId, b.kullaniciId).seviye;
  const secim = calismaGetir(b.db, b.guildId, b.kullaniciId).meslek;
  const aktif = gecerliMeslek(seviye, secim);
  const sonraki = sonrakiMeslek(seviye);
  const enerji = enerjiVerisi(b);
  return {
    seviye,
    secim: secim && gecerliMeslek(seviye, secim).kimlik === secim ? 'manuel' : 'otomatik',
    aktif: aktif.kimlik,
    meslekler: MESLEKLER.map((m) => ({
      ...meslekVerisi(b, m), acik: m.seviye <= seviye, aktif: m.kimlik === aktif.kimlik,
    })),
    acikAdet: acikMeslekler(seviye).length,
    sonraki: sonraki ? { kimlik: sonraki.kimlik, ad: sonraki.ad, seviye: sonraki.seviye } : null,
    bonus: { ahsap: BONUS_AHSAP, demir: BONUS_DEMIR },
    beklemeMs: BEKLEME_MS,
    kalanMs: enerji.beklemeKalanMs,
    ...enerji,
    // Yalnız grev varken / test yetkisi olanda alan bulunur; diğerlerinin yanıtında iz yok.
    ...grevAlanlari(b),
    yoklama: yoklamaAlani(b),
  };
}

function yoklamaAlani(b) {
  const y = yoklamaBekleyen(b.db, b.guildId, b.kullaniciId);
  return y ? yoklamaVerisi(b, y) : null;
}

/** Kredi borcunun veri özeti; borç yoksa null (metin biçimlendirmesi ön yüzde). */
function borcVerisi(db, guildId, kullaniciId) {
  const k = aktifKredi(db, guildId, kullaniciId);
  if (!k) return null;
  return { ...borcOzeti(k), vade: k.vade };
}

/** /cuzdan + /profil birleşik özeti. */
function ozetVer(b) {
  const { db, guildId, kullaniciId } = b;
  // Vadesi dolmuş mevduat varsa bakiye gösterilmeden önce ödenir; başarım ödülü de bakiyeye girer.
  vadesiGelenleriOde(db, { guildId, kullaniciId });
  b.basarimKontrol();

  const profil = profilVerisi(db, guildId, kullaniciId);
  const hesap = hesapGetir(db, guildId, kullaniciId);
  const prestij = prestijSeviyesi(db, guildId, kullaniciId);
  const kademe = uyelikKademesi(db, guildId, kullaniciId);
  const limit = gunlukLimit(kullaniciGetir(db, guildId, kullaniciId).seviye);
  const koruyucu = adet(db, guildId, kullaniciId, SERI_KORUYUCU);

  const takviyeler = Object.entries(etkinEtkiler(db, guildId, kullaniciId))
    .map(([tur, bitis]) => ({ tur, esya: esyaGetir(tur), bitis }))
    .filter((t) => t.esya)
    .map(({ tur, esya, bitis }) => ({ tur, ad: esya.ad, bitis, gorsel: b.gorsel(esya) }));

  return {
    bakiye: hesap.bakiye,
    kullanici: uyeOzeti(b.guild, kullaniciId),
    sira: zenginlikSirasi(db, guildId, kullaniciId),
    seri: hesap.gunluk_seri,
    gunlukAlindi: hesap.son_gunluk === trGunu(),
    sonrakiGunMs: sonrakiGunBaslangici(),
    haftaGunu: HAFTA_GUNU,
    bankada: kilitliToplam(db, guildId, kullaniciId),
    borc: borcVerisi(db, guildId, kullaniciId),
    rozetler: rozetler(db, guildId, kullaniciId).reverse()
      .map((r) => ({ kimlik: r.kimlik, ad: r.ad, calisBonus: r.calisBonus, gorsel: b.gorsel(r) })),
    rozetBonus: rozetCalisBonusu(db, guildId, kullaniciId),
    acilmamisKasa: acilmamisKasalar(db, guildId, kullaniciId).reduce((t, k) => t + k.adet, 0),
    prestij: { seviye: prestij, carpan: seviyeCarpani(prestij) },
    uyelik: kademe?.yuzde > 0
      ? { ad: b.guild?.roles?.cache?.get(kademe.rolId)?.name ?? `Kademe ${kademe.no}`, yuzde: kademe.yuzde }
      : null,
    yonetici: yoneticiCarpani(kullaniciId) > 1 ? { carpan: YONETICI_CARPAN } : null,
    takviyeler,
    seriKoruyucu: koruyucu,
    etkinlikler: aktifEtkinlikler(db, guildId).map((e) => ({ tur: e.tur, ad: etkinlikAdi(e.tur), bitis: e.bitis })),
    gonderim: {
      limit,
      kalan: Math.max(0, limit - bugunGonderilen(db, guildId, kullaniciId)),
      vergiYuzde: ayarGetir(db, guildId, 'ekonomi.vergiYuzde'),
      min: TRANSFER_MIN,
    },
    calis: calisBilgisi(b),
    profil: {
      seviye: profil.seviye,
      xp: profil.xp,
      suAnki: profil.suAnki,
      sonraki: profil.sonraki,
      xpSirasi: profil.xpSirasi,
      kademe: profil.kademe ? { ad: profil.kademe.ad, renk: renk(profil.kademe.renk) } : null,
      koleksiyon: {
        farkli: profil.koleksiyon.farkli,
        toplam: profil.koleksiyon.toplam,
        puan: profil.koleksiyon.puan,
        kademeler: profil.koleksiyon.kademeler.map((k) => ({ ...k, renk: renk(k.renk) })),
      },
      enDegerliKartlar: profil.enDegerliKartlar.map((k) => ({
        kimlik: k.kimlik, ad: k.ad, nadirlik: k.nadirlik, adet: k.adet, gorsel: b.gorsel(kartGetir(k.kimlik)),
      })),
    },
  };
}

/** Görev dönemi (günlük/haftalık) → ön yüz verisi. */
function donemVerisi(b, donem) {
  return {
    bitis: donem.bitis,
    gorevler: donem.gorevler.map((g) => ({
      sira: g.sira,
      kimlik: g.tanim.kimlik,
      tur: g.tanim.tur,
      ad: g.tanim.ad,
      hedef: g.tanim.hedef,
      ilerleme: Math.min(g.ilerleme, g.tanim.hedef),
      bitti: g.bitti > 0,
      odul: odulVerisi(b, g.tanim.odul),
      odulMetni: gorevOdulMetni(g.tanim.odul, muz),
    })),
  };
}

export const rotalar = [
  {
    yontem: 'GET',
    yol: '/api/ozet',
    calistir: (b) => ozetVer(b),
  },

  // ── Günlük ödül (commands/ekonomi/gunluk.js) ───────────────────────────
  {
    yontem: 'POST',
    yol: '/api/gunluk',
    calistir(b) {
      const sonuc = gunlukAl(b.db, { guildId: b.guildId, kullaniciId: b.kullaniciId });
      if (!sonuc.verildi) {
        return { verildi: false, kalanMs: sonuc.kalanMs, sonrakiGunMs: sonrakiGunBaslangici(), bakiye: bakiyeOku(b.db, b.guildId, b.kullaniciId) };
      }
      b.gorev([{ tur: 'gunluk' }]);
      b.basarimKontrol();
      return {
        verildi: true,
        toplam: sonuc.toplam,
        taban: sonuc.taban,
        ek: sonuc.ek,
        seri: sonuc.seri,
        korunan: sonuc.korunan,
        etkinlik: sonuc.etkinlik,
        prestij: sonuc.prestij,
        uyelik: sonuc.uyelik,
        yonetici: yoneticiCarpani(b.kullaniciId) > 1 ? YONETICI_CARPAN : 1,
        borcKesilen: sonuc.borcKesilen,
        haftalik: sonuc.haftalik,
        kasalar: sonuc.kasalar.map((k) => kasaVerisi(b, k)),
        kalanGun: HAFTA_GUNU - (sonuc.seri % HAFTA_GUNU),
        sonrakiGunMs: sonrakiGunBaslangici(),
        bakiye: bakiyeOku(b.db, b.guildId, b.kullaniciId),
      };
    },
  },

  // ── Çalış (commands/ekonomi/calis.js) ──────────────────────────────────
  {
    yontem: 'GET',
    yol: '/api/calis',
    calistir: (b) => ({ ...calisBilgisi(b), bakiye: bakiyeOku(b.db, b.guildId, b.kullaniciId) }),
  },
  {
    yontem: 'POST',
    yol: '/api/calis',
    // Gövde: düğmeye göre tık izi { x, y, klavye, guvenli } (lib/calis-yoklama.js tikAyristir).
    calistir(b) {
      if (grevBekleyen(b.db, b.guildId, b.kullaniciId)) hata('Maymunlar grevde, önce onları bastır.');
      // Yoklama bekliyorsa çalışılmaz; hata değil, ön yüz pencereyi bilgi.yoklama'dan açar.
      if (yoklamaBekleyen(b.db, b.guildId, b.kullaniciId)) {
        return {
          calisti: false, yorgun: false, kalanMs: 0, bilgi: calisBilgisi(b), bakiye: bakiyeOku(b.db, b.guildId, b.kullaniciId),
        };
      }
      const sonuc = calis(b.db, { guildId: b.guildId, kullaniciId: b.kullaniciId });
      if (sonuc.ok && grevZari()) grevBaslat(b.db, { guildId: b.guildId, kullaniciId: b.kullaniciId });
      if (sonuc.ok) {
        yoklamaDenetle(b.db, { guildId: b.guildId, kullaniciId: b.kullaniciId, tik: tikAyristir(b.govde) });
      }
      if (!sonuc.ok) {
        return {
          calisti: false, yorgun: sonuc.yorgun, kalanMs: sonuc.kalanMs, bilgi: calisBilgisi(b), bakiye: bakiyeOku(b.db, b.guildId, b.kullaniciId),
        };
      }
      b.basarimKontrol();
      return {
        calisti: true,
        meslek: meslekVerisi(b, sonuc.meslek),
        olay: sonuc.olay,
        taban: sonuc.taban,
        kazanc: sonuc.kazanc,
        etkinlik: sonuc.etkinlik,
        prestij: sonuc.prestij,
        uyelik: sonuc.uyelik,
        yonetici: yoneticiCarpani(b.kullaniciId) > 1 ? YONETICI_CARPAN : 1,
        borcKesilen: sonuc.borcKesilen,
        kasa: sonuc.kasa ? kasaVerisi(b, sonuc.kasa) : null,
        rozet: sonuc.rozet,
        bedel: sonuc.bedel,
        maymun: sonuc.maymun ? maymunVerisi(b, sonuc.maymun) : null,
        olayEtkisi: sonuc.olayEtkisi ? olayVerisi(b, sonuc.olayEtkisi) : null,
        kalanMs: sonuc.kalanMs,
        bilgi: calisBilgisi(b),
        bakiye: bakiyeOku(b.db, b.guildId, b.kullaniciId),
      };
    },
  },
  {
    // { kazandi: boolean, vurulan?: number }: mini oyunun sonucu. Kaybedilirse enerji sıfırlanır.
    yontem: 'POST',
    yol: '/api/calis/grev',
    calistir(b) {
      const sonuc = grevBitir(b.db, {
        guildId: b.guildId, kullaniciId: b.kullaniciId, kazandi: b.govde.kazandi === true, vurulan: b.govde.vurulan,
      });
      if (!sonuc.ok) hata('Böyle bir yol yok.', 404);
      return {
        kazandi: sonuc.kazandi, bilgi: calisBilgisi(b), bakiye: bakiyeOku(b.db, b.guildId, b.kullaniciId),
      };
    },
  },
  {
    // { secim: meslek kimliği, bosTik?: number }: ustabaşı yoklamasının cevabı.
    // Yanlışsa ceza beklemeli yeni yoklama bilgi.yoklama'da gelir.
    yontem: 'POST',
    yol: '/api/calis/yoklama',
    calistir(b) {
      const sonuc = basarili(yoklamaCevapla(b.db, {
        guildId: b.guildId,
        kullaniciId: b.kullaniciId,
        secim: metin(b.govde, 'secim', { uzunluk: 30 }),
        bosTik: Number(b.govde.bosTik) || 0,
      }));
      return { dogru: sonuc.dogru, cezaMs: sonuc.cezaMs, bilgi: calisBilgisi(b) };
    },
  },
  {
    // Yalnız .env'deki üyeler; diğerleri için yol hiç yokmuş gibi davranır.
    yontem: 'POST',
    yol: '/api/calis/grev-test',
    calistir(b) {
      if (!grevTestYetkisi(b.kullaniciId)) hata('Böyle bir yol yok.', 404);
      grevBaslat(b.db, { guildId: b.guildId, kullaniciId: b.kullaniciId, test: true });
      return { bilgi: calisBilgisi(b) };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/calis/meslek',
    calistir(b) {
      const kimlik = metin(b.govde, 'kimlik', { uzunluk: 30 });
      if (kimlik !== OTOMATIK && !MESLEKLER.some((m) => m.kimlik === kimlik)) hata('Böyle bir meslek yok.');
      const sonuc = basarili(meslekSec(b.db, { guildId: b.guildId, kullaniciId: b.kullaniciId, kimlik }));
      return {
        otomatik: sonuc.otomatik,
        meslek: meslekVerisi(b, sonuc.meslek),
        bilgi: calisBilgisi(b),
      };
    },
  },
  {
    // Bekleyen seçimli olayı çözer: { secim: "vur" | "durt" | "kovala" | "birak" }.
    yontem: 'POST',
    yol: '/api/calis/olay',
    calistir(b) {
      const sonuc = basarili(olayCoz(b.db, {
        guildId: b.guildId, kullaniciId: b.kullaniciId, secim: metin(b.govde, 'secim', { uzunluk: 20 }),
      }));
      return {
        olay: { kimlik: sonuc.olay.kimlik, ad: sonuc.olay.ad, emoji: sonuc.olay.emoji },
        secim: sonuc.secim,
        basarili: sonuc.basarili,
        muz: sonuc.muz,
        metin: sonuc.metin,
        bilgi: calisBilgisi(b),
        bakiye: bakiyeOku(b.db, b.guildId, b.kullaniciId),
      };
    },
  },
  {
    yontem: 'GET',
    yol: '/api/calis/maymunlar',
    calistir: (b) => ({
      maymunlar: maymunlar(b.db, b.guildId, b.kullaniciId).map((m) => maymunVerisi(b, m)),
      bilgi: calisBilgisi(b),
    }),
  },
  {
    // { kimlik: "kart-..." } kilitler; { kimlik: null } bırakır.
    yontem: 'POST',
    yol: '/api/calis/maymun',
    calistir(b) {
      const kimlik = b.govde.kimlik ?? null;
      if (kimlik === null) {
        maymunBirak(b.db, { guildId: b.guildId, kullaniciId: b.kullaniciId });
      } else {
        basarili(maymunKilitle(b.db, { guildId: b.guildId, kullaniciId: b.kullaniciId, kimlik: metin(b.govde, 'kimlik', { uzunluk: 60 }) }));
      }
      return { bilgi: calisBilgisi(b) };
    },
  },

  // ── Muz gönder (commands/ekonomi/gonder.js) ────────────────────────────
  {
    // Promosyon kodu (lib/promo.js): bir kez, süresi içinde.
    yontem: 'POST',
    yol: '/api/promo',
    calistir(b) {
      const sonuc = basarili(promoKullan(b.db, {
        guildId: b.guildId, kullaniciId: b.kullaniciId, kod: metin(b.govde, 'kod', { uzunluk: 40 }),
      }));
      return { kod: sonuc.kod, odul: sonuc.odul, bakiye: sonuc.bakiye };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/gonder',
    async calistir(b) {
      const aliciId = metin(b.govde, 'aliciId', { uzunluk: 25 });
      if (!kimlikMi(aliciId)) hata('Alıcı geçersiz.');
      const miktarMetni = metin(b.govde, 'miktar', { uzunluk: 20 });

      // Alıcı sunucu üyesi olmalı ve bot olmamalı (slash komutta Discord seçici bunu sağlar).
      const uye = await b.guild?.members.fetch(aliciId).catch(() => null);
      if (!uye) hata('Alıcı bu sunucunun üyesi değil.');
      if (uye.user?.bot) hata('Botlara muz gönderemezsin.');

      const { db, guildId, kullaniciId } = b;
      const ayrisan = basarili(miktarAyristir(miktarMetni, bakiyeOku(db, guildId, kullaniciId)));
      const sonuc = basarili(gonder(db, {
        guildId,
        gonderenId: kullaniciId,
        aliciId,
        miktar: ayrisan.miktar,
        seviye: kullaniciGetir(db, guildId, kullaniciId).seviye,
        vergiYuzde: ayarGetir(db, guildId, 'ekonomi.vergiYuzde'),
      }));

      b.gorev([{ tur: 'gonder', miktar: ayrisan.miktar }]);
      b.basarimKontrol();
      return {
        miktar: ayrisan.miktar,
        vergi: sonuc.vergi,
        net: sonuc.net,
        kalanLimit: sonuc.kalanLimit,
        alici: uyeOzeti(b.guild, aliciId),
        bakiye: bakiyeOku(db, guildId, kullaniciId),
      };
    },
  },

  // ── Görevler (commands/ekonomi/gorev.js) ───────────────────────────────
  {
    yontem: 'GET',
    yol: '/api/gorevler',
    calistir(b) {
      const { gunluk, haftalik } = gorevleriGetir(b.db, { guildId: b.guildId, kullaniciId: b.kullaniciId });
      const gunlukVeri = donemVerisi(b, gunluk);
      return {
        gunluk: {
          ...gunlukVeri,
          bonus: {
            alindi: gunluk.bonus > 0,
            biten: gunlukVeri.gorevler.filter((g) => g.bitti).length,
            toplam: gunlukVeri.gorevler.length,
            odul: odulVerisi(b, GUNLUK_BONUS),
            odulMetni: gorevOdulMetni(GUNLUK_BONUS, muz),
          },
        },
        haftalik: donemVerisi(b, haftalik),
      };
    },
  },

  // ── Başarımlar (commands/ekonomi/basarim.js) ───────────────────────────
  {
    yontem: 'GET',
    yol: '/api/basarimlar',
    calistir(b) {
      // Komutta yalnız kendi başarımları için kontrol edilir; burada hep kendisi.
      b.basarimKontrol();
      const { db, guildId, kullaniciId } = b;
      const durumlar = basarimDurumlari(db, guildId, kullaniciId);
      return {
        ozet: basarimOzeti(db, guildId, kullaniciId),
        kademeler: Object.entries(KADEMELER).map(([kimlik, k]) => ({ kimlik, ad: k.ad, simge: k.simge, puan: k.puan })),
        kategoriler: Object.entries(KATEGORILER).map(([kimlik, kategori]) => {
          const liste = durumlar.filter((d) => d.tanim.kategori === kimlik);
          return {
            kimlik,
            ad: kategori.ad,
            simge: kategori.simge,
            biten: liste.filter((d) => d.zaman).length,
            toplam: liste.length,
            basarimlar: liste.map(({ tanim, zaman, deger }) => ({
              kimlik: tanim.kimlik,
              ad: tanim.ad,
              aciklama: tanim.aciklama,
              kademe: tanim.kademe,
              kademeSimge: KADEMELER[tanim.kademe].simge,
              puan: KADEMELER[tanim.kademe].puan,
              hedef: tanim.hedef,
              deger,
              zaman,
              odul: odulVerisi(b, tanim.odul),
              odulMetni: basarimOdulMetni(tanim.odul, muz),
            })),
          };
        }),
      };
    },
  },

  // ── Sıralama (commands/ekonomi/zenginler.js) ───────────────────────────
  {
    yontem: 'GET',
    yol: '/api/siralama',
    calistir(b) {
      const tur = b.sorgu.get('tur') || 'muz';
      if (!SIRALAMA_KIMLIKLERI.includes(tur)) hata('Böyle bir sıralama türü yok.');
      const { db, guildId, kullaniciId } = b;
      const simdi = Date.now();
      const bilgi = SIRALAMA_TURLERI[tur];

      const satir = (k, sira) => ({
        sira,
        uye: uyeOzeti(b.guild, k.kullanici_id),
        deger: k.deger,
        degerMetni: degerMetni(tur, k, muz),
        ben: k.kullanici_id === kullaniciId,
      });
      const liste = siralama(db, guildId, tur, { limit: SIRALAMA_ADEDI, simdi }).map((k, i) => satir(k, i + 1));
      const kendi = kendiSirasi(db, guildId, tur, kullaniciId, { simdi });

      return {
        tur,
        turler: SIRALAMA_KIMLIKLERI.map((k) => ({
          kimlik: k, ad: SIRALAMA_TURLERI[k].ad, simge: SIRALAMA_TURLERI[k].simge,
        })),
        baslik: bilgi.baslik,
        bos: bilgi.bos,
        satirlar: liste,
        kendi: kendi ? satir(kendi, kendi.sira) : null,
        haftaBaslangic: tur === 'kumar' ? haftaBaslangici(simdi) : null,
      };
    },
  },
];
