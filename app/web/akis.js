/**
 * Öne çıkanlar akışının web tarafı (kurallar lib/akis.js'te): rotalardan gelen
 * kumar ve kasa sonucunu Activity'nin yan barına (/api/akis) ekler ve
 * `ekonomi.akisKanal` ayarlıysa oraya duyurur. Bar her kasa düşüşünü gösterir
 * (CSGOCases gibi); kanala yalnız eşiği geçen kumar ve nadir kasa gider.
 * Hata atmaz: duyuru gidemezse oyun yine sorunsuz biter.
 */

import {
  akisDeposu, akisEsigi, duyuruMesaji, kasaSonucuDuyurulurMu, kumarOlayi, OYUN_ADLARI,
} from '../lib/akis.js';
import { ayarGetir } from '../lib/ayarlar.js';
import { emojiCozucu } from '../lib/kasa-bilesen.js';
import { uyeOzeti } from './gorsel.js';

/**
 * @param {object} o
 * @param {import('node:sqlite').DatabaseSync} o.db
 * @param {object|null} o.client discord.js istemcisi
 * @param {string} o.guildId
 */
export function akisYayinci({
  db, client, guildId, logger = console, depo = akisDeposu(),
}) {
  const sunucu = () => client?.guilds?.cache?.get(guildId) ?? null;

  async function kanalaGonder(mesaj) {
    const kanalId = ayarGetir(db, guildId, 'ekonomi.akisKanal');
    if (!kanalId) return;
    const kanal = sunucu()?.channels?.cache?.get(kanalId) ?? await client?.channels?.fetch?.(kanalId).catch(() => null);
    if (!kanal?.isTextBased?.()) return;
    await kanal.send(mesaj);
  }

  /**
   * Kanal duyurusu (lib/akis.js duyuruMesaji). `gecikmeMs`: sonuç animasyonu
   * bitene kadar bekler (bar kaydı da aynı `zaman`a kadar görünmez).
   */
  function duyur(kullaniciId, olay, { gecikmeMs = 0, kisiSiniri = true, simdi = Date.now() } = {}) {
    if (kisiSiniri && !depo.kanalaGidebilir(kullaniciId, simdi)) return;

    const guild = sunucu();
    const uye = guild?.members?.cache?.get(kullaniciId);
    const mesaj = duyuruMesaji(olay, {
      kullaniciId,
      ad: uyeOzeti(guild, kullaniciId).ad,
      avatarUrl: uye?.displayAvatarURL?.({ size: 64 }) ?? null,
      emoji: emojiCozucu(guild),
    });
    const gonder = () => kanalaGonder(mesaj).catch((e) => logger.error('Öne çıkanlar duyurusu gönderilemedi:', e.message));
    if (gecikmeMs > 0) setTimeout(gonder, gecikmeMs).unref();
    else void gonder();
  }

  return {
    /** Biten kumar oyunu: `{oyun, bahis, net, carpan, acilan?}`. Duyurulduysa olayı döner. */
    kumar(kullaniciId, veri, { gecikmeMs = 0, simdi = Date.now() } = {}) {
      const olay = kumarOlayi(veri, akisEsigi(db, guildId));
      if (!olay) return null;
      depo.ekle({
        ...olay, oyunAd: OYUN_ADLARI[olay.oyun] ?? olay.oyun, onemli: true, kullaniciId, zaman: simdi + gecikmeMs,
      });
      duyur(kullaniciId, olay, { gecikmeMs, simdi });
      return olay;
    },

    /**
     * Kasa açılışı. `sonuclar` kasaAc sonuçları (en iyisi önce), `ozetler` aynı
     * sırada ön yüz özetleri (ad, nadirlik, görsel); `kasa` kasanın özeti.
     * Her düşen bara girer; nadir olanlar kanala da (kişi sınırı yok, zaten seyrek).
     */
    kasa(kullaniciId, { kasa, sonuclar, ozetler }, { gecikmeMs = 0, simdi = Date.now() } = {}) {
      // En iyisi en son eklenir ki barın en üstünde dursun.
      for (let i = sonuclar.length - 1; i >= 0; i -= 1) {
        const o = ozetler[i];
        depo.ekle({
          tur: 'kasa',
          kasa,
          oge: {
            tur: o.tur, ad: o.ad ?? null, nadirlik: o.nadirlik, gorsel: o.gorsel ?? null, parlak: Boolean(o.parlak), miktar: o.miktar ?? null,
          },
          onemli: kasaSonucuDuyurulurMu(sonuclar[i]),
          kullaniciId,
          zaman: simdi + gecikmeMs,
        });
      }
      const nadir = sonuclar.filter(kasaSonucuDuyurulurMu);
      if (nadir.length === 0) return null;
      const olay = { tur: 'kasa', kasa, sonuclar: nadir };
      duyur(kullaniciId, olay, { gecikmeMs, simdi, kisiSiniri: false });
      return olay;
    },

    /** Görünür kayıtlar, en yenisi önce; üye adı ve avatarıyla. */
    liste(simdi = Date.now()) {
      return depo.liste(simdi).map(({ kullaniciId, ...o }) => ({ ...o, kullanici: uyeOzeti(sunucu(), kullaniciId) }));
    },
  };
}
