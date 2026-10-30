/**
 * Banka (mevduat), kredi, piyango ve hisse rotaları. Kurallar lib/banka.js,
 * kredi.js, piyango.js ve hisse.js'te; slash komutlarla (commands/ekonomi/)
 * aynı lib çağrıları aynı sırayla yapılır.
 */

import {
  AKTIF_SINIRI, aktifMevduatlar, boz, ERKEN_CEZA_YUZDE, faizHesapla, kilitliToplam, MEVDUAT_MIN, mevduatTavani,
  TAVAN_MAKS, TAVAN_SEVIYE_BASINA, TAVAN_TABAN, VADELER as MEVDUAT_VADELERI, vadeGetir as mevduatVadesi,
  vadesiGelenleriOde, yatir,
} from '../../lib/banka.js';
import { bakiye, miktarAyristir } from '../../lib/ekonomi.js';
import {
  al, EMIR_ETKI_SINIRI, endeks, fiyatGecmisi, guncelle, ISLEM_BEKLEME_MS, KISI_BASI_ADET, KOMISYON_YUZDE, liste, portfoy, pozisyon,
  saatlikOynaklik, sat,
  sirketBul,
} from '../../lib/hisse.js';
import {
  aktifKredi, BORC_KESINTI_YUZDE, borcOzeti, CEZA_GUNLUK_YUZDE, CEZA_TAVAN_YUZDE, KREDI_MIN, KREDI_MIN_SEVIYE, krediAl, krediLimiti,
  krediOde, LIMIT_MAKS, LIMIT_SEVIYE_BASINA, LIMIT_TABAN, VADELER as KREDI_VADELERI, vadeGetir as krediVadesi,
  vadesiGelenleriIsle,
} from '../../lib/kredi.js';
import {
  BILET_FIYATI, biletAl, biletSayim, havuzDurumu, HAVUZ_YUZDE, kazanmaOlasiligi, KISI_BASI_BILET, sonKazanan, sonrakiCekilis,
  TABAN_IKRAMIYE,
} from '../../lib/piyango.js';
import { kullaniciGetir } from '../../lib/seviye.js';
import { uyeOzeti } from '../gorsel.js';
import {
  basarili, hata, metin, tamSayi,
} from '../yardimci.js';

const seviyeOku = (b) => kullaniciGetir(b.db, b.guildId, b.kullaniciId).seviye;
const cuzdan = (b) => bakiye(b.db, b.guildId, b.kullaniciId);

/** Miktar metnini lib `miktarAyristir` ile çözer (cüzdana göre: yarı, hepsi...). */
function miktarCoz(b, ad, sinir = null) {
  const ayrisan = miktarAyristir(metin(b.govde, ad), sinir ?? cuzdan(b));
  return basarili(ayrisan).miktar;
}

// ── Banka (mevduat) ────────────────────────────────────────────────────────

const mevduatSatiri = (m) => {
  const faiz = faizHesapla(m.anapara, m.faiz_yuzde);
  return {
    id: m.id, anapara: m.anapara, faizYuzde: m.faiz_yuzde, faiz, vadeSonuTutar: m.anapara + faiz, baslangic: m.baslangic, vade: m.vade,
  };
};

export const rotalar = [
  {
    yontem: 'GET',
    yol: '/api/banka',
    calistir(b) {
      // Vadesi dolmuş ama servis turunu beklemiş olan varsa önce o ödenir.
      const odenen = vadesiGelenleriOde(b.db, { guildId: b.guildId, kullaniciId: b.kullaniciId });
      const aktif = aktifMevduatlar(b.db, b.guildId, b.kullaniciId);
      return {
        aktif: aktif.map(mevduatSatiri),
        kilitli: kilitliToplam(b.db, b.guildId, b.kullaniciId),
        tavan: mevduatTavani(seviyeOku(b)),
        aktifSayisi: aktif.length,
        aktifSiniri: AKTIF_SINIRI,
        vadeler: MEVDUAT_VADELERI.map((v) => ({
          kimlik: v.kimlik, ad: v.ad, yuzde: v.yuzde, ms: v.ms,
        })),
        min: MEVDUAT_MIN,
        erkenCezaYuzde: ERKEN_CEZA_YUZDE,
        tavanKurali: { taban: TAVAN_TABAN, seviyeBasina: TAVAN_SEVIYE_BASINA, maks: TAVAN_MAKS },
        odenenler: odenen
          .filter((o) => o.kullanici_id === String(b.kullaniciId))
          .map((o) => ({ id: o.id, anapara: o.anapara, faiz: o.faiz })),
        bakiye: cuzdan(b),
      };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/banka/yatir',
    calistir(b) {
      const miktar = miktarCoz(b, 'miktar');
      const vade = mevduatVadesi(metin(b.govde, 'vade'));
      if (!vade) hata('Geçersiz vade.');
      const sonuc = basarili(yatir(b.db, {
        guildId: b.guildId, kullaniciId: b.kullaniciId, miktar, vade: vade.kimlik, seviye: seviyeOku(b),
      }));
      return {
        mevduat: mevduatSatiri(sonuc.mevduat),
        faiz: sonuc.faiz,
        vadeSonuTutar: sonuc.mevduat.anapara + sonuc.faiz,
        bakiye: sonuc.bakiye,
      };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/banka/boz',
    calistir(b) {
      const id = tamSayi(b.govde, 'id', { min: 1 });
      const sonuc = basarili(boz(b.db, { guildId: b.guildId, kullaniciId: b.kullaniciId, id }));
      return { iade: sonuc.iade, ceza: sonuc.ceza, bakiye: cuzdan(b) };
    },
  },

  // ── Kredi ──────────────────────────────────────────────────────────────

  {
    yontem: 'GET',
    yol: '/api/kredi',
    calistir(b) {
      // Vadesi gelmiş ama servis turunu beklemiş olan varsa önce o işlenir.
      vadesiGelenleriIsle(b.db, { guildId: b.guildId, kullaniciId: b.kullaniciId });
      const k = aktifKredi(b.db, b.guildId, b.kullaniciId);
      return {
        kredi: k ? {
          id: k.id, anapara: k.anapara, faizYuzde: k.faiz_yuzde, baslangic: k.baslangic, vade: k.vade, durum: k.durum,
          borc: borcOzeti(k),
        } : null,
        limit: krediLimiti(seviyeOku(b)),
        min: KREDI_MIN,
        seviye: seviyeOku(b),
        minSeviye: KREDI_MIN_SEVIYE,
        vadeler: KREDI_VADELERI.map((v) => ({
          kimlik: v.kimlik, ad: v.ad, yuzde: v.yuzde, ms: v.ms,
        })),
        kurallar: {
          borcKesintiYuzde: BORC_KESINTI_YUZDE,
          cezaGunlukYuzde: CEZA_GUNLUK_YUZDE,
          cezaTavanYuzde: CEZA_TAVAN_YUZDE,
          limitTaban: LIMIT_TABAN,
          limitSeviyeBasina: LIMIT_SEVIYE_BASINA,
          limitMaks: LIMIT_MAKS,
        },
        bakiye: cuzdan(b),
      };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/kredi/al',
    calistir(b) {
      const miktar = miktarCoz(b, 'miktar');
      const vade = krediVadesi(metin(b.govde, 'vade'));
      if (!vade) hata('Geçersiz vade.');
      const sonuc = basarili(krediAl(b.db, {
        guildId: b.guildId, kullaniciId: b.kullaniciId, miktar, vade: vade.kimlik, seviye: seviyeOku(b),
      }));
      const k = sonuc.kredi;
      return {
        kredi: {
          id: k.id, anapara: k.anapara, faizYuzde: k.faiz_yuzde, baslangic: k.baslangic, vade: k.vade, durum: k.durum,
        },
        faiz: sonuc.faiz,
        odenecek: k.anapara + sonuc.faiz,
        bakiye: sonuc.bakiye,
      };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/kredi/ode',
    calistir(b) {
      // Miktar boşsa hepsi; "hepsi" bakiyenin tamamıdır, borçtan fazlası lib'de kırpılır.
      const ham = metin(b.govde, 'miktar', { zorunlu: false });
      const miktar = ham === null ? null : miktarCoz(b, 'miktar');
      const sonuc = basarili(krediOde(b.db, { guildId: b.guildId, kullaniciId: b.kullaniciId, miktar }));
      return {
        odenen: sonuc.odenen, kalan: sonuc.kalan, kapandi: sonuc.kapandi, bakiye: cuzdan(b),
      };
    },
  },

  // ── Piyango ────────────────────────────────────────────────────────────

  {
    yontem: 'GET',
    yol: '/api/piyango',
    calistir(b) {
      const cekilis = sonrakiCekilis();
      const d = havuzDurumu(b.db, b.guildId, cekilis);
      const benim = biletSayim(b.db, b.guildId, b.kullaniciId, cekilis);
      const son = sonKazanan(b.db, b.guildId);
      return {
        havuz: d.havuz,
        toplamBilet: d.toplam,
        benim,
        olasilik: kazanmaOlasiligi(b.db, b.guildId, b.kullaniciId, cekilis),
        cekilis,
        biletFiyati: BILET_FIYATI,
        kisiBasi: KISI_BASI_BILET,
        havuzYuzde: HAVUZ_YUZDE,
        tabanIkramiye: TABAN_IKRAMIYE,
        sonKazanan: son ? { uye: uyeOzeti(b.guild, son.kazanan_id), havuz: son.havuz, cekilis: son.cekilis } : null,
        bakiye: cuzdan(b),
      };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/piyango/bilet',
    calistir(b) {
      const adet = tamSayi(b.govde, 'adet', {
        zorunlu: false, min: 1, max: KISI_BASI_BILET, varsayilan: 1,
      });
      const sonuc = basarili(biletAl(b.db, { guildId: b.guildId, kullaniciId: b.kullaniciId, adet }));
      const d = havuzDurumu(b.db, b.guildId, sonuc.cekilis);
      return {
        adet: sonuc.adet,
        tutar: sonuc.tutar,
        cekilis: sonuc.cekilis,
        benim: sonuc.sahip,
        havuz: d.havuz,
        toplamBilet: d.toplam,
        olasilik: kazanmaOlasiligi(b.db, b.guildId, b.kullaniciId, sonuc.cekilis),
        bakiye: sonuc.bakiye,
      };
    },
  },

  // ── Hisse ──────────────────────────────────────────────────────────────

  {
    yontem: 'GET',
    yol: '/api/hisse',
    calistir(b) {
      guncelle(b.db, { guildId: b.guildId });
      const p = portfoy(b.db, b.guildId, b.kullaniciId);
      const sahip = new Map(p.pozisyonlar.map((x) => [x.sirket.sembol, x.adet]));
      const son = b.db
        .prepare('SELECT MAX(zaman) AS zaman FROM hisse_islemleri WHERE guild_id = ? AND kullanici_id = ?')
        .get(String(b.guildId), String(b.kullaniciId)).zaman;
      const simdi = Date.now();
      const satirlar = liste(b.db, b.guildId, simdi);
      return {
        endeks: endeks(satirlar),
        sirketler: satirlar.map(({ sirket, fiyat, degisimYuzde }) => ({
          sembol: sirket.sembol,
          ad: sirket.ad,
          gorsel: b.gorsel(sirket),
          fiyat,
          degisimYuzde,
          gecmis: fiyatGecmisi(b.db, b.guildId, sirket.sembol).map((n) => ({ saat: n.saat, fiyat: n.fiyat })),
          oynaklik: saatlikOynaklik(sirket),
          derinlik: sirket.derinlik,
          sahip: sahip.get(sirket.sembol) ?? 0,
        })),
        portfoy: {
          pozisyonlar: p.pozisyonlar.map((x) => ({
            sembol: x.sirket.sembol,
            ad: x.sirket.ad,
            gorsel: b.gorsel(x.sirket),
            adet: x.adet,
            maliyet: x.maliyet,
            ortalama: x.ortalama,
            fiyat: x.fiyat,
            deger: x.deger,
            netDeger: x.netDeger,
            kar: x.kar,
          })),
          toplamDeger: p.toplamDeger,
          toplamMaliyet: p.toplamMaliyet,
          toplamKar: p.toplamKar,
        },
        komisyonYuzde: KOMISYON_YUZDE,
        etkiSiniri: EMIR_ETKI_SINIRI,
        kisiBasiAdet: KISI_BASI_ADET,
        beklemeMs: ISLEM_BEKLEME_MS,
        beklemeKalanMs: son === null ? 0 : Math.max(0, ISLEM_BEKLEME_MS - (simdi - son)),
        bakiye: cuzdan(b),
      };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/hisse/al',
    calistir(b) {
      const sirket = sirketBul(metin(b.govde, 'sembol'));
      if (!sirket) hata('Böyle bir hisse yok.');
      const varMi = (ad) => b.govde[ad] !== undefined && b.govde[ad] !== null && b.govde[ad] !== '';
      if (varMi('adet') === varMi('tutar')) hata('Ya `adet` ya da `tutar` yaz (ikisi birden olmaz).');
      const adet = varMi('adet') ? tamSayi(b.govde, 'adet', { min: 1, max: KISI_BASI_ADET }) : null;
      const tutar = varMi('tutar') ? miktarCoz(b, 'tutar') : null;

      const sonuc = basarili(al(b.db, {
        guildId: b.guildId, kullaniciId: b.kullaniciId, sembol: sirket.sembol, adet, tutar,
      }));
      return {
        sembol: sirket.sembol,
        adet: sonuc.adet,
        fiyat: sonuc.fiyat,
        komisyon: sonuc.komisyon,
        toplam: sonuc.toplam,
        bakiye: sonuc.bakiye,
        etkiYuzde: sonuc.etkiYuzde,
        yeniFiyat: sonuc.yeniFiyat,
      };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/hisse/sat',
    calistir(b) {
      const sirket = sirketBul(metin(b.govde, 'sembol'));
      if (!sirket) hata('Böyle bir hisse yok.');
      const sahip = pozisyon(b.db, b.guildId, b.kullaniciId, sirket.sembol).adet;
      const adet = miktarCoz(b, 'adet', sahip);

      const sonuc = basarili(sat(b.db, {
        guildId: b.guildId, kullaniciId: b.kullaniciId, sembol: sirket.sembol, adet,
      }));
      return {
        sembol: sirket.sembol,
        adet: sonuc.adet,
        fiyat: sonuc.fiyat,
        komisyon: sonuc.komisyon,
        gelir: sonuc.gelir,
        maliyet: sonuc.maliyet,
        kar: sonuc.kar,
        bakiye: sonuc.bakiye,
        etkiYuzde: sonuc.etkiYuzde,
        yeniFiyat: sonuc.yeniFiyat,
      };
    },
  },
];
