/**
 * Boss savaşı ve prestij rotaları. Kurallar lib/boss.js ve lib/prestij.js'te;
 * saldırı sonrası Discord'daki canlı boss mesajı komuttaki gibi güncellenir.
 */

import { ayarGetir } from '../../lib/ayarlar.js';
import {
  aktifBoss, bossGorunumu, hasarSirasi, kartGucu, kisiDurumu, saldir, SALDIRI_BEKLEME_MS, sonrakiCikis,
  sonrakiSaldiri,
} from '../../lib/boss.js';
import { guncellemeIste } from '../../lib/boss-bilesen.js';
import { bakiye } from '../../lib/ekonomi.js';
import { envanter } from '../../lib/envanter.js';
import { esyaGetir } from '../../lib/esyalar.js';
import {
  CARPAN_YUZDE, DEVREDILENLER, KORUNANLAR, MAKS_PRESTIJ, prestijDurumu, prestijYap, SIFIRLANACAKLAR,
} from '../../lib/prestij.js';
import { prestijRoluVer } from '../../lib/prestij-rol.js';
import { uyeOzeti } from '../gorsel.js';
import { basarili, hata, tamSayi } from '../yardimci.js';

/** Prestij ödül kasası: kimlik, ad ve görsel (ön yüz kasayı resmiyle gösterir). */
function esyaOzeti(b, kimlik) {
  const e = esyaGetir(kimlik);
  return { kimlik, ad: e?.ad ?? kimlik, gorsel: e ? b.gorsel(e) : null };
}

/** "1 sa 5 dk" gibi kısa süre (hata metni için). */
function sureMetni(ms) {
  const sn = Math.max(1, Math.ceil(ms / 1000));
  const sa = Math.floor(sn / 3600);
  const dk = Math.floor((sn % 3600) / 60);
  if (sa > 0) return `${sa} sa ${dk} dk`;
  if (dk > 0) return `${dk} dk ${sn % 60} sn`;
  return `${sn} sn`;
}

export const rotalar = [
  {
    yontem: 'GET',
    yol: '/api/boss',
    calistir(b) {
      const savas = aktifBoss(b.db, b.guildId);
      if (!savas) return { aktif: false, sonrakiCikis: sonrakiCikis() };

      const g = bossGorunumu(savas.boss, savas.elit === 1);
      const kisi = kisiDurumu(b.db, savas.id, b.kullaniciId);
      const sonraki = sonrakiSaldiri(kisi.sonSaldiri);
      return {
        aktif: true,
        id: savas.id,
        ad: g.ad,
        gorsel: b.gorsel(g),
        elit: savas.elit === 1,
        can: savas.can,
        maxCan: savas.max_can,
        baslangic: savas.baslangic,
        bitis: savas.bitis,
        siralama: hasarSirasi(b.db, savas.id, 10).map((s, i) => ({
          sira: i + 1, uye: uyeOzeti(b.guild, s.kullanici_id), hasar: s.hasar, saldiri: s.saldiri,
        })),
        ben: {
          hasar: kisi.hasar, saldiri: kisi.saldiri, sira: kisi.sira, katilimci: kisi.katilimci,
        },
        sonrakiSaldiri: sonraki,
        bekleme: SALDIRI_BEKLEME_MS,
        guc: kartGucu(envanter(b.db, b.guildId, b.kullaniciId)),
      };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/boss/saldir',
    async calistir(b) {
      const s = saldir(b.db, { guildId: b.guildId, kullaniciId: b.kullaniciId });

      // Komuttaki saldiriAkisi gibi: Discord'daki boss mesajı güncellenir; savaş bittiyse hemen.
      const sonuc = s.ok ? s.sonuc : s.bitti;
      const savasId = sonuc?.savas?.id ?? aktifBoss(b.db, b.guildId)?.id;
      if (savasId) {
        try {
          await guncellemeIste(b.client, b.db, savasId, { hemen: Boolean(sonuc) });
        } catch {
          // Mesaj güncellenemese de saldırı yazıldı.
        }
      }

      if (!s.ok) {
        if (s.kalanMs) hata(`Henüz dinleniyorsun; ${sureMetni(s.kalanMs)} sonra tekrar saldırabilirsin.`);
        basarili(s);
      }
      const odeme = sonuc?.odemeler?.find((o) => o.kullaniciId === String(b.kullaniciId)) ?? null;
      return {
        hasar: s.hasar,
        kritik: s.kritik,
        guc: s.guc,
        sonVurus: s.sonVurus,
        can: s.can,
        maxCan: s.maxCan,
        sonrakiSaldiri: s.sonrakiSaldiri,
        bitti: Boolean(sonuc),
        durum: sonuc?.durum ?? null,
        odul: odeme ? {
          muz: odeme.muz, sira: odeme.sira, sonVurus: odeme.sonVurus, kasalar: odeme.kasalar,
        } : null,
        bakiye: bakiye(b.db, b.guildId, b.kullaniciId),
      };
    },
  },

  // ── Prestij ────────────────────────────────────────────────────────────

  {
    yontem: 'GET',
    yol: '/api/prestij',
    calistir(b) {
      const d = prestijDurumu(b.db, b.guildId, b.kullaniciId);
      return {
        seviye: d.seviye,
        carpan: d.carpan,
        enUst: d.enUst,
        esik: d.esik,
        emek: d.emek,
        sonrakiCarpan: d.sonrakiCarpan,
        odulKasa: d.odulKasa ? esyaOzeti(b, d.odulKasa) : null,
        engeller: d.engeller,
        bakiye: d.bakiye,
        ciftlikDevri: d.ciftlikDevri,
        sifirlanacaklar: SIFIRLANACAKLAR.map((s) => ({ kod: s.kod, ad: s.ad, birim: s.birim })),
        devredilenler: [...DEVREDILENLER],
        korunanlar: [...KORUNANLAR],
        maksPrestij: MAKS_PRESTIJ,
        carpanYuzde: CARPAN_YUZDE,
      };
    },
  },
  {
    yontem: 'POST',
    yol: '/api/prestij/yap',
    async calistir(b) {
      // Eski bir onay ikinci kez prestij yaptırmasın diye ekran seviyeyi geri gönderir.
      const beklenenSeviye = tamSayi(b.govde, 'beklenenSeviye', { min: 0, max: MAKS_PRESTIJ });
      const sonuc = basarili(prestijYap(b.db, { guildId: b.guildId, kullaniciId: b.kullaniciId, beklenenSeviye }));

      // Rol süstür: verilemese de prestij yazıldı.
      await prestijRoluVer(await b.uye(), sonuc.seviye, (anahtar) => ayarGetir(b.db, b.guildId, anahtar)).catch(() => null);
      return {
        seviye: sonuc.seviye,
        carpan: sonuc.carpan,
        kasa: esyaOzeti(b, sonuc.kasa),
        devir: sonuc.devir,
        ozet: sonuc.ozet.map((o) => ({
          kod: o.kod, ad: o.ad, birim: o.birim, miktar: o.miktar,
        })),
        bakiye: bakiye(b.db, b.guildId, b.kullaniciId),
      };
    },
  },
];
