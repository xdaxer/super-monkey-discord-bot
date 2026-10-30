/**
 * Topluluk pazarı rotaları: vitrin, kart sayfası (ilanlar, fiyat geçmişi),
 * üyenin ilanları ve geçmişi, ilan açma/kaldırma ve satın alma. Kurallar
 * lib/pazar.js'tedir; burada yalnız doğrulama ve okunur özet yapılır.
 *
 * `/api/yonetim/pazar*` rotaları yalnız yöneticiye açıktır: özet, bütün
 * ilanlar ve satışlar, ayarlar, ilan düzenle/kaldır, satışı geri al, işlem
 * günlüğü. Etkilenen üyelere DM gider (kapalıysa sessizce düşer).
 */

import { bakiye as bakiyeOku, muz } from '../../lib/ekonomi.js';
import { DONEMLER, donemAraligi } from '../../lib/ekonomi-panel.js';
import { emojiCozucu } from '../../lib/kasa-bilesen.js';
import { kartDegeri, kartGetir, kartMi } from '../../lib/kasalar.js';
import { serbestEnvanter } from '../../lib/envanter.js';
import { yetkiliKimlikler } from '../../lib/izin.js';
import {
  alimIstegiAc, alimIstegiIptal, fiyatAraligi, fiyatGecmisi, gecmisim, ILAN_ADET_SINIRI, ilanAc, ilanGetir, ilanIptal,
  ilanlarim, istekDmIcerigi, isteklereSat, isteklerim, kartIlanlari, kartIstekleri, yoneticiIstekKaldir, yonetimIstekleri,
  PAHALI_KAT, PAZAR_KAPALI_SEBEBI, pazarAyarla, pazarAyarlari, pazardanAl, satisDmIcerigi, satisGeriAl, sonSatislar, vitrin,
  YONETICI_PAZAR_SEBEBI, yoneticiIlanDuzenle, yoneticiIlanKaldir, yonetimGunlugu, yonetimIlanlari, yonetimOzeti,
  yonetimSatislari,
} from '../../lib/pazar.js';
import { yoneticiUyeArasi } from '../../lib/yonetici-carpan.js';
import { uyeOzeti } from '../gorsel.js';
import {
  basarili, hata, metin, tamSayi,
} from '../yardimci.js';

/** Satış satırı: kart, adet, birim fiyat, iki taraf. */
function satisOzeti(b, s) {
  return {
    id: s.id, kart: s.kart, adet: s.adet, fiyat: s.fiyat, zaman: s.zaman,
    satici: uyeOzeti(b.guild, s.saticiId), alici: uyeOzeti(b.guild, s.aliciId),
  };
}

/** Bakan üye bu ilanı neden alamaz (alabiliyorsa null). */
function alinamazSebebi(b, ilan, yoneticiler, acik) {
  if (ilan.saticiId === b.kullaniciId) return 'Senin ilanın';
  if (!acik) return PAZAR_KAPALI_SEBEBI;
  if (yoneticiUyeArasi(ilan.saticiId, b.kullaniciId, yoneticiler)) return YONETICI_PAZAR_SEBEBI;
  return null;
}

function kartKimligi(b) {
  const kimlik = b.params?.kimlik ?? metin(b.govde, 'kimlik', { uzunluk: 64 });
  if (!kartMi(kimlik)) hata('Pazarda yalnız kartlar var.', 404);
  return kimlik;
}

/** Satıcıya satış DM'i (ilanından alındı). */
function saticiyaHaber(b, {
  kart: kimlik, saticiId, aliciId, adet, fiyat, kesinti, kalan,
}) {
  const kart = kartGetir(kimlik);
  dmGonder(b, saticiId, satisDmIcerigi({
    kart, emoji: emojiCozucu(b.guild)(kart) ?? '', adet, fiyat, kesinti, yuzde: pazarAyarlari(b.db, b.guildId).kesintiYuzde, aliciId, kalan,
  }));
}

/** Alıcıya DM (alım isteği karşılandı). */
function aliciyaHaber(b, {
  kart: kimlik, saticiId, aliciId, adet, fiyat, kalan,
}) {
  const kart = kartGetir(kimlik);
  dmGonder(b, aliciId, istekDmIcerigi({
    kart, emoji: emojiCozucu(b.guild)(kart) ?? '', adet, fiyat, saticiId, kalan,
  }));
}

/** Beklenmeyen DM; kapalıysa ya da hata olursa sessizce düşer. */
function dmGonder(b, uyeId, icerik) {
  void b.client?.users?.fetch(uyeId)
    .then((u) => u.send({ allowedMentions: { parse: [] }, ...icerik }))
    .catch(() => {});
}

/** Ayarlar ve üst sınırlar (her yanıtta; ön yüz kesinti ve aralığı buradan okur). */
function ortak(b) {
  const a = pazarAyarlari(b.db, b.guildId);
  return {
    acik: a.acik, kesintiYuzde: a.kesintiYuzde, ilanSiniri: a.ilanSiniri, tavanCarpani: a.tavanCarpani, adetSiniri: ILAN_ADET_SINIRI,
  };
}

export const rotalar = [
  {
    yontem: 'GET',
    yol: '/api/pazar',
    calistir(b) {
      const o = ortak(b);
      return {
        ...o,
        vitrin: vitrin(b.db, b.guildId).map(({ kart, ...v }) => ({ kimlik: kart, ...v })),
        sonSatislar: sonSatislar(b.db, b.guildId, { limit: 12 }).map((s) => satisOzeti(b, s)),
        acikIlanim: ilanlarim(b.db, b.guildId, b.kullaniciId).length,
      };
    },
  },
  {
    yontem: 'GET',
    yol: '/api/pazar/kart/:kimlik',
    calistir(b) {
      const kimlik = kartKimligi(b);
      const yoneticiler = yetkiliKimlikler();
      const o = ortak(b);
      return {
        ...o,
        kimlik,
        aralik: fiyatAraligi(kimlik, o.tavanCarpani),
        sahip: serbestEnvanter(b.db, b.guildId, b.kullaniciId)[kimlik] ?? 0,
        ilanlar: kartIlanlari(b.db, b.guildId, kimlik).map((i) => ({
          id: i.id, adet: i.adet, fiyat: i.fiyat, olusturma: i.olusturma,
          satici: uyeOzeti(b.guild, i.saticiId), benim: i.saticiId === b.kullaniciId, alinamaz: alinamazSebebi(b, i, yoneticiler, o.acik),
        })),
        istekler: kartIstekleri(b.db, b.guildId, kimlik),
        gecmis: fiyatGecmisi(b.db, b.guildId, kimlik),
        sonSatislar: sonSatislar(b.db, b.guildId, { kimlik, limit: 10 }).map((s) => satisOzeti(b, s)),
      };
    },
  },
  {
    // Üyenin açık ilanları, alım-satım geçmişi ve ilana koyabileceği (serbest) kartları.
    yontem: 'GET',
    yol: '/api/pazar/benim',
    calistir(b) {
      const serbest = serbestEnvanter(b.db, b.guildId, b.kullaniciId);
      const o = ortak(b);
      return {
        ...o,
        ilanlar: ilanlarim(b.db, b.guildId, b.kullaniciId).map((i) => ({
          id: i.id, kart: i.kart, adet: i.adet, ilkAdet: i.ilkAdet, fiyat: i.fiyat, olusturma: i.olusturma,
        })),
        istekler: isteklerim(b.db, b.guildId, b.kullaniciId).map((i) => ({
          id: i.id, kart: i.kart, adet: i.adet, ilkAdet: i.ilkAdet, fiyat: i.fiyat, olusturma: i.olusturma, emanet: i.fiyat * i.adet,
        })),
        gecmis: gecmisim(b.db, b.guildId, b.kullaniciId).map((s) => {
          const satis = s.saticiId === b.kullaniciId;
          return {
            id: s.id, kart: s.kart, adet: s.adet, fiyat: s.fiyat, zaman: s.zaman, yon: satis ? 'satis' : 'alis', geriAlindi: Boolean(s.geriZaman),
            // Satıcının eline geçen kesintili tutardır; alıcı tamamını öder.
            tutar: satis ? s.fiyat * s.adet - s.kesinti : s.fiyat * s.adet,
            karsi: uyeOzeti(b.guild, satis ? s.aliciId : s.saticiId),
          };
        }),
        kartlar: Object.entries(serbest)
          .filter(([kimlik, n]) => n > 0 && kartMi(kimlik))
          .map(([kimlik, n]) => ({ kimlik, adet: n, aralik: fiyatAraligi(kimlik, o.tavanCarpani) })),
      };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/pazar/ilan',
    calistir(b) {
      const kimlik = kartKimligi(b);
      const kac = tamSayi(b.govde, 'adet', {
        zorunlu: false, min: 1, max: ILAN_ADET_SINIRI, varsayilan: 1,
      });
      const fiyat = tamSayi(b.govde, 'fiyat', { min: 1, max: Number.MAX_SAFE_INTEGER });
      const sonuc = basarili(ilanAc(b.db, {
        guildId: b.guildId, saticiId: b.kullaniciId, kimlik, adet: kac, fiyat,
      }));
      // İlan uyan alım isteklerini hemen karşıladıysa alıcılara haber.
      for (const d of sonuc.satilan) aliciyaHaber(b, d);
      return {
        ilan: sonuc.ilan,
        ad: kartGetir(kimlik).ad,
        hemenSatilan: sonuc.satilan.reduce((t, d) => t + d.adet, 0),
        hemenNet: sonuc.satilan.reduce((t, d) => t + d.net, 0),
        bakiye: bakiyeOku(b.db, b.guildId, b.kullaniciId),
      };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/pazar/ilan/:id/iptal',
    calistir(b) {
      const id = Number(b.params.id);
      if (!Number.isSafeInteger(id) || id < 1) hata('İlan kimliği geçersiz.');
      const sonuc = basarili(ilanIptal(b.db, { guildId: b.guildId, kullaniciId: b.kullaniciId, id }));
      return { adet: sonuc.adet, kart: sonuc.ilan.kart, ad: kartGetir(sonuc.ilan.kart)?.ad ?? sonuc.ilan.kart };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/pazar/al',
    calistir(b) {
      const id = tamSayi(b.govde, 'id', { min: 1 });
      const kac = tamSayi(b.govde, 'adet', {
        zorunlu: false, min: 1, max: ILAN_ADET_SINIRI, varsayilan: 1,
      });
      const sonuc = basarili(pazardanAl(b.db, {
        guildId: b.guildId, aliciId: b.kullaniciId, id, adet: kac,
      }));
      saticiyaHaber(b, {
        kart: sonuc.ilan.kart, saticiId: sonuc.ilan.saticiId, aliciId: b.kullaniciId, adet: sonuc.adet, fiyat: sonuc.ilan.fiyat, kesinti: sonuc.kesinti, kalan: sonuc.ilan.adet,
      });
      return {
        adet: sonuc.adet,
        toplam: sonuc.toplam,
        kart: sonuc.ilan.kart,
        ad: kartGetir(sonuc.ilan.kart)?.ad ?? sonuc.ilan.kart,
        satici: uyeOzeti(b.guild, sonuc.ilan.saticiId),
        bakiye: sonuc.bakiye,
      };
    },
  },

  {
    // Alım isteği: önce uyan ilanlar alınır, kalanı emanetle bekler.
    yontem: 'POST',
    yol: '/api/pazar/istek',
    calistir(b) {
      const kimlik = kartKimligi(b);
      const kac = tamSayi(b.govde, 'adet', {
        zorunlu: false, min: 1, max: ILAN_ADET_SINIRI, varsayilan: 1,
      });
      const fiyat = tamSayi(b.govde, 'fiyat', { min: 1, max: Number.MAX_SAFE_INTEGER });
      const sonuc = basarili(alimIstegiAc(b.db, {
        guildId: b.guildId, aliciId: b.kullaniciId, kimlik, adet: kac, fiyat,
      }));
      for (const d of sonuc.alinan) saticiyaHaber(b, d);
      return {
        istek: sonuc.istek,
        ad: kartGetir(kimlik).ad,
        hemenAlinan: sonuc.alinan.reduce((t, d) => t + d.adet, 0),
        hemenOdenen: sonuc.alinan.reduce((t, d) => t + d.toplam, 0),
        emanet: sonuc.emanet,
        bakiye: sonuc.bakiye,
      };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/pazar/istek/:id/iptal',
    calistir(b) {
      const id = Number(b.params.id);
      if (!Number.isSafeInteger(id) || id < 1) hata('İstek kimliği geçersiz.');
      const sonuc = basarili(alimIstegiIptal(b.db, { guildId: b.guildId, kullaniciId: b.kullaniciId, id }));
      return { iade: sonuc.iade, ad: kartGetir(sonuc.istek.kart)?.ad ?? sonuc.istek.kart, bakiye: sonuc.bakiye };
    },
  },
  {
    // Elindeki kartları en yüksek alım isteklerine hemen sat.
    yontem: 'POST',
    yol: '/api/pazar/isteklere-sat',
    calistir(b) {
      const kimlik = kartKimligi(b);
      const kac = tamSayi(b.govde, 'adet', {
        zorunlu: false, min: 1, max: ILAN_ADET_SINIRI, varsayilan: 1,
      });
      const enAz = tamSayi(b.govde, 'enAz', { zorunlu: false, min: 1, varsayilan: 1 });
      const sonuc = basarili(isteklereSat(b.db, {
        guildId: b.guildId, saticiId: b.kullaniciId, kimlik, adet: kac, enAz,
      }));
      for (const d of sonuc.satilan) aliciyaHaber(b, d);
      return {
        adet: sonuc.adet, net: sonuc.net, ad: kartGetir(kimlik).ad, bakiye: sonuc.bakiye,
      };
    },
  },
  ...yonetimRotalari(),
];

// ── Yönetim ────────────────────────────────────────────────────────────────

const DURUMLAR = ['acik', 'bitti', 'iptal', 'kaldirildi'];

function ilanKimligi(b) {
  const id = Number(b.params.id);
  if (!Number.isSafeInteger(id) || id < 1) hata('Kimlik geçersiz.');
  return id;
}

function donemSorgusu(b) {
  const donem = b.sorgu.get('donem') || '30g';
  if (donem !== 'tumu' && !DONEMLER[donem]) hata('`donem` bugun, 7g, 30g ya da tumu olmalı.');
  return { donem, ...(donem === 'tumu' ? { baslangic: null, bitis: null } : donemAraligi(donem)) };
}

function uyeSorgusu(b) {
  const uye = b.sorgu.get('uye') ?? '';
  if (uye && !/^\d{5,25}$/.test(uye)) hata('`uye` geçersiz.');
  return uye || null;
}

function kartSorgusu(b) {
  const kart = b.sorgu.get('kart') ?? '';
  if (kart && !kartMi(kart)) hata('`kart` geçersiz.');
  return kart || null;
}

function yonetimIlani(b, i) {
  return {
    id: i.id, kart: i.kart, adet: i.adet, ilkAdet: i.ilkAdet, fiyat: i.fiyat, durum: i.durum, olusturma: i.olusturma, kapanis: i.kapanis,
    satici: uyeOzeti(b.guild, i.saticiId),
  };
}

function yonetimSatisi(b, s) {
  const kart = kartGetir(s.kart);
  return {
    id: s.id, ilanId: s.ilanId, istekId: s.istekId, kart: s.kart, adet: s.adet, fiyat: s.fiyat, kesinti: s.kesinti, toplam: s.fiyat * s.adet, zaman: s.zaman,
    satici: uyeOzeti(b.guild, s.saticiId), alici: uyeOzeti(b.guild, s.aliciId),
    geriZaman: s.geriZaman, geriAlan: s.geriAlan ? uyeOzeti(b.guild, s.geriAlan) : null,
    pahali: Boolean(kart) && s.fiyat >= kartDegeri(kart) * PAHALI_KAT,
  };
}

/** Yönetici metninde kart adı (emojisiyle). */
function kartMetni(b, kimlik) {
  const kart = kartGetir(kimlik);
  const emoji = kart ? emojiCozucu(b.guild)(kart) : '';
  return `${emoji ? `${emoji} ` : ''}**${kart?.ad ?? kimlik}**`;
}

function yonetimRotalari() {
  return [
    {
      // Özet, ayarlar ve işlem günlüğü.
      yontem: 'GET',
      yol: '/api/yonetim/pazar',
      yonetici: true,
      calistir(b) {
        const { donem, baslangic, bitis } = donemSorgusu(b);
        const haric = b.sorgu.get('yoneticiGizle') === '1' ? yetkiliKimlikler() : [];
        const o = yonetimOzeti(b.db, b.guildId, { baslangic, bitis, haric });
        const uye = (id) => uyeOzeti(b.guild, id);
        return {
          donem,
          ayarlar: pazarAyarlari(b.db, b.guildId),
          pahaliKat: PAHALI_KAT,
          satis: o.satis,
          geriAlinan: o.geriAlinan,
          acikIlanlar: o.acik,
          acikIstekler: o.istek,
          kartlar: o.kartlar,
          saticilar: o.saticilar.map(({ uye: id, ...x }) => ({ ...uye(id), ...x })),
          alicilar: o.alicilar.map(({ uye: id, ...x }) => ({ ...uye(id), ...x })),
          ciftler: o.ciftler.map((c) => ({ ...c, satici: uye(c.saticiId), alici: uye(c.aliciId) })),
          pahali: o.pahali.map((s) => yonetimSatisi(b, s)),
          gunluk: yonetimGunlugu(b.db, b.guildId, 30).map((g) => ({
            id: g.id, eylem: g.eylem, hedefId: g.hedefId, ayrinti: g.ayrinti, zaman: g.zaman,
            yonetici: uye(g.yoneticiId), uye: g.uyeId ? uye(g.uyeId) : null,
          })),
        };
      },
    },
    {
      yontem: 'GET',
      yol: '/api/yonetim/pazar/ilanlar',
      yonetici: true,
      calistir(b) {
        const durum = b.sorgu.get('durum') || null;
        if (durum && !DURUMLAR.includes(durum)) hata('`durum` acik, bitti, iptal ya da kaldirildi olmalı.');
        const r = yonetimIlanlari(b.db, b.guildId, {
          durum, uyeId: uyeSorgusu(b), kart: kartSorgusu(b), sayfa: Number(b.sorgu.get('sayfa')) || 1,
        });
        return { ...r, satirlar: r.satirlar.map((i) => yonetimIlani(b, i)), aralikCarpani: pazarAyarlari(b.db, b.guildId).tavanCarpani };
      },
    },
    {
      yontem: 'GET',
      yol: '/api/yonetim/pazar/istekler',
      yonetici: true,
      calistir(b) {
        const durum = b.sorgu.get('durum') || null;
        if (durum && !DURUMLAR.includes(durum)) hata('`durum` acik, bitti, iptal ya da kaldirildi olmalı.');
        const r = yonetimIstekleri(b.db, b.guildId, {
          durum, uyeId: uyeSorgusu(b), kart: kartSorgusu(b), sayfa: Number(b.sorgu.get('sayfa')) || 1,
        });
        return {
          ...r,
          satirlar: r.satirlar.map((i) => ({
            id: i.id, kart: i.kart, adet: i.adet, ilkAdet: i.ilkAdet, fiyat: i.fiyat, durum: i.durum, olusturma: i.olusturma, kapanis: i.kapanis,
            emanet: i.durum === 'acik' ? i.fiyat * i.adet : 0, alici: uyeOzeti(b.guild, i.aliciId),
          })),
        };
      },
    },
    {
      yontem: 'POST',
      yol: '/api/yonetim/pazar/istek/:id/kaldir',
      yonetici: true,
      calistir(b) {
        const id = ilanKimligi(b);
        const sebep = metin(b.govde, 'sebep', { zorunlu: false, uzunluk: 300 });
        const r = basarili(yoneticiIstekKaldir(b.db, {
          guildId: b.guildId, yoneticiId: b.kullaniciId, id, sebep,
        }));
        dmGonder(b, r.istek.aliciId, {
          content: [
            `🛠️ Topluluk Pazarı'ndaki ${r.istek.adet} × ${kartMetni(b, r.istek.kart)} alım isteğin bir yönetici tarafından kaldırıldı.`,
            `• Emanetteki **${muz(r.iade)}** bakiyene iade edildi.`,
            ...(sebep ? [`• Sebep: ${sebep}`] : []),
          ].join('\n'),
        });
        return { iade: r.iade };
      },
    },
    {
      yontem: 'GET',
      yol: '/api/yonetim/pazar/satislar',
      yonetici: true,
      calistir(b) {
        const { baslangic, bitis } = donemSorgusu(b);
        const r = yonetimSatislari(b.db, b.guildId, {
          uyeId: uyeSorgusu(b), kart: kartSorgusu(b), baslangic, bitis, sayfa: Number(b.sorgu.get('sayfa')) || 1,
        });
        return { ...r, satirlar: r.satirlar.map((s) => yonetimSatisi(b, s)) };
      },
    },
    {
      yontem: 'POST',
      yol: '/api/yonetim/pazar/ayarlar',
      yonetici: true,
      calistir(b) {
        const degisiklik = {};
        if (b.govde?.acik !== undefined) degisiklik.acik = b.govde.acik;
        for (const alan of ['kesintiYuzde', 'tavanCarpani', 'ilanSiniri']) {
          if (b.govde?.[alan] !== undefined) degisiklik[alan] = Number(b.govde[alan]);
        }
        const r = basarili(pazarAyarla(b.db, { guildId: b.guildId, yoneticiId: b.kullaniciId, degisiklik }));
        return { ayarlar: r.ayarlar, degisti: r.degisti };
      },
    },
    {
      yontem: 'POST',
      yol: '/api/yonetim/pazar/ilan/:id/duzenle',
      yonetici: true,
      calistir(b) {
        const id = ilanKimligi(b);
        const fiyat = tamSayi(b.govde, 'fiyat', { zorunlu: false, min: 1, max: Number.MAX_SAFE_INTEGER });
        const adet = tamSayi(b.govde, 'adet', { zorunlu: false, min: 1, max: ILAN_ADET_SINIRI });
        const once = ilanGetir(b.db, b.guildId, id);
        const r = basarili(yoneticiIlanDuzenle(b.db, {
          guildId: b.guildId, yoneticiId: b.kullaniciId, id, fiyat, adet,
        }));
        if (r.degisti) {
          const satirlar = [`🛠️ Topluluk Pazarı'ndaki ${kartMetni(b, r.ilan.kart)} ilanın bir yönetici tarafından düzenlendi.`];
          if (once.fiyat !== r.ilan.fiyat) satirlar.push(`• Birim fiyat: ${muz(once.fiyat)} → **${muz(r.ilan.fiyat)}**`);
          if (once.adet !== r.ilan.adet) satirlar.push(`• İlandaki kopya: ${once.adet} → **${r.ilan.adet}** (${once.adet - r.ilan.adet} kopya envanterine döndü)`);
          dmGonder(b, r.ilan.saticiId, { content: satirlar.join('\n') });
        }
        return { ilan: yonetimIlani(b, r.ilan), degisti: r.degisti };
      },
    },
    {
      yontem: 'POST',
      yol: '/api/yonetim/pazar/ilan/:id/kaldir',
      yonetici: true,
      calistir(b) {
        const id = ilanKimligi(b);
        const iade = b.govde?.iade !== false;
        const sebep = metin(b.govde, 'sebep', { zorunlu: false, uzunluk: 300 });
        const r = basarili(yoneticiIlanKaldir(b.db, {
          guildId: b.guildId, yoneticiId: b.kullaniciId, id, iade, sebep,
        }));
        dmGonder(b, r.ilan.saticiId, {
          content: [
            `🛠️ Topluluk Pazarı'ndaki ${r.adet} × ${kartMetni(b, r.ilan.kart)} ilanın bir yönetici tarafından kaldırıldı.`,
            iade ? '• Kartlar envanterine geri döndü.' : '• Kartlar iade edilmedi (el konuldu).',
            ...(sebep ? [`• Sebep: ${sebep}`] : []),
          ].join('\n'),
        });
        return { adet: r.adet, iade: r.iade };
      },
    },
    {
      yontem: 'POST',
      yol: '/api/yonetim/pazar/satis/:id/geri-al',
      yonetici: true,
      calistir(b) {
        const id = ilanKimligi(b);
        const sebep = metin(b.govde, 'sebep', { zorunlu: false, uzunluk: 300 });
        const r = basarili(satisGeriAl(b.db, {
          guildId: b.guildId, yoneticiId: b.kullaniciId, id, sebep,
        }));
        const s = r.satis;
        const ek = sebep ? [`• Sebep: ${sebep}`] : [];
        dmGonder(b, s.aliciId, {
          content: [`🛠️ Topluluk Pazarı'nda aldığın ${s.adet} × ${kartMetni(b, s.kart)} bir yönetici tarafından geri alındı.`,
            `• Ödediğin **${muz(r.toplam)}** iade edildi; kartlar satıcıya döndü.`, ...ek].join('\n'),
        });
        dmGonder(b, s.saticiId, {
          content: [`🛠️ Topluluk Pazarı'nda sattığın ${s.adet} × ${kartMetni(b, s.kart)} bir yönetici tarafından geri alındı.`,
            `• Eline geçen **${muz(r.net)}** geri alındı; kartlar envanterine döndü.`, ...ek].join('\n'),
        });
        return { satis: yonetimSatisi(b, s), toplam: r.toplam, net: r.net };
      },
    },
  ];
}
