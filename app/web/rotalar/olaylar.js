/**
 * Activity'nin açılır pencere olayları: Activity açıkken birkaç saniyede bir
 * yoklanır, yeni olay (cihazda görülmemiş kimlik) pencere ve ses açar.
 * Düello davetleri ayrıdır (`/api/davetler`, sosyal.js).
 */

import { aktifBoss, bossGorunumu, sonSavasOdemesi } from '../../lib/boss.js';
import { uyeninDuyurulari } from '../../lib/duyuru.js';
import { aktifEtkinlikler, ETKINLIKLER } from '../../lib/etkinlik.js';
import { uyeOzeti } from '../gorsel.js';
import { guncelFiyat, islemFiyati, sahipHaberleri, sirketBul } from '../../lib/hisse.js';

/** Sonuçlanan savaş bu kadar süre bildirilir (sonradan açan da ödülünü görsün). */
export const BOSS_SONUC_PENCERESI_MS = 24 * 3_600_000;
/** Elde tutulan hisselerin bu kadar eski haberleri bildirilir. */
export const HABER_PENCERESI_MS = 3_600_000;

export const rotalar = [
  {
    yontem: 'GET',
    yol: '/api/olaylar',
    calistir(b) {
      const savas = aktifBoss(b.db, b.guildId);
      const son = sonSavasOdemesi(b.db, { guildId: b.guildId, kullaniciId: b.kullaniciId, pencereMs: BOSS_SONUC_PENCERESI_MS });
      const haberler = sahipHaberleri(b.db, { guildId: b.guildId, kullaniciId: b.kullaniciId, pencereMs: HABER_PENCERESI_MS });

      const boss = (s) => {
        const g = bossGorunumu(s.boss, s.elit === 1);
        return {
          id: s.id, ad: g.ad, gorsel: b.gorsel(g), elit: s.elit === 1,
        };
      };
      return {
        // Yönetici bildirimleri (lib/duyuru.js): herkese ya da bu üyeye gönderilmiş, süresi dolmamış.
        duyurular: uyeninDuyurulari(b.db, b.guildId, b.kullaniciId).map((d) => ({
          id: d.id, baslik: d.baslik, metin: d.metin, ikon: d.ikon, zaman: d.zaman, gonderen: uyeOzeti(b.guild, d.gonderenId),
        })),
        // Etkin etkinlikler: kimlik başlangıçla birlikte (yeniden başlatılan etkinlik yeni pencere açar).
        etkinlikler: aktifEtkinlikler(b.db, b.guildId).filter((e) => ETKINLIKLER[e.tur]).map((e) => ({
          id: `${e.tur}-${e.baslangic}`, tur: e.tur, ad: ETKINLIKLER[e.tur].ad, simge: ETKINLIKLER[e.tur].simge,
          etki: ETKINLIKLER[e.tur].etki, bitis: e.bitis,
        })),
        boss: savas ? { ...boss(savas), bitis: savas.bitis, maxCan: savas.max_can } : null,
        bossSonuc: son ? {
          ...boss(son.savas),
          durum: son.savas.durum,
          katilimci: son.katilimci,
          muz: son.odeme.muz,
          hasar: son.odeme.hasar,
          sira: son.odeme.sira,
          sonVurus: son.odeme.sonVurus,
          kasalar: son.odeme.kasalar,
        } : null,
        haberler: haberler.flatMap((h) => {
          const sirket = sirketBul(h.sembol);
          if (!sirket) return [];
          const ham = guncelFiyat(b.db, b.guildId, h.sembol);
          return [{
            id: h.id,
            sembol: h.sembol,
            ad: sirket.ad,
            gorsel: b.gorsel(sirket),
            saat: h.saat,
            yuzde: h.yuzde,
            metin: h.metin,
            adet: h.adet,
            fiyat: ham === null ? null : islemFiyati(ham),
          }];
        }),
      };
    },
  },
];
