/**
 * Discord Activity'nin (activity/) konuştuğu HTTP API.
 *
 * Bot süreciyle aynı süreçte çalışır: aynı veritabanı bağlantısını, aynı bellek
 * içi beklemeleri (kumar 3 sn, hisse 30 sn) ve aynı Discord istemcisini (rol
 * verme, üye adları, emojiler) kullanır. Yalnız 127.0.0.1'i dinler; dışarıya
 * nginx açar (<Activity alan adı>/api/ → buraya). Ekonomi kuralları burada değil
 * lib/'tedir; rotalar slash komutlarla aynı lib fonksiyonlarını çağırır.
 *
 * Rota: `{yontem, yol, calistir(b), acik?, sistemsiz?, yonetici?}`. `yol` `:ad` parametresi
 * alabilir. `yonetici` yalnız Discord'da Yönetici izni olan üyeye açıktır
 * (slash komutlardaki yoneticiMi ile aynı). `acik` oturum istemez; `sistemsiz` ekonomi sistemi kapalıyken de
 * çalışır. `calistir` düz nesne döner (JSON) ya da `{ikili, tur}` (görsel).
 * Kullanıcı hatası için yardimci.js'teki `hata()`.
 *
 * Ekonomiden uzaklaştırılan üye (lib/ekonomi-uzak.js) `sistemsiz` olmayan hiçbir
 * rotaya giremez: 403 + `kod: 'ekonomi-uzak'` + `uzak` (sebep, zaman) döner;
 * Activity bunu görünce kapanmayan pencereyi açar. Engel burada olduğu için
 * pencere bir şekilde kapansa da işlem yapılamaz.
 */

import { createServer } from 'node:http';

import { PermissionFlagsBits } from 'discord.js';

import { acilisAl } from '../lib/arayuz-komut.js';
import { sistemAcikMi } from '../lib/ayarlar.js';
import { bakiye } from '../lib/ekonomi.js';
import { uzaklastirma } from '../lib/ekonomi-uzak.js';
import { akisYayinci } from './akis.js';
import { basarimBildirimleri, gorevBildirimleri } from './bildirim.js';
import {
  avatarGetir, emojiGetir, gorselCozucu, uyeOzeti,
} from './gorsel.js';
import { kodDegistir, kullaniciGetir } from './oturum.js';
import { hata, WebHatasi } from './yardimci.js';

const GOVDE_SINIRI = 16 * 1024;
/** Kişi başı istek sınırı: pencere içinde en çok bu kadar. */
const HIZ_PENCERE_MS = 10_000;
const HIZ_SINIRI = 60;

/** Rota yolunu parçalara ayırıp eşleştiren küçük yönlendirici. */
export function yonlendirici(rotalar) {
  const tanimlar = rotalar.map((r) => ({ ...r, parcalar: r.yol.split('/').filter(Boolean) }));
  return (yontem, yol) => {
    const parcalar = yol.split('/').filter(Boolean);
    for (const r of tanimlar) {
      if (r.yontem !== yontem || r.parcalar.length !== parcalar.length) continue;
      const params = {};
      const uyar = r.parcalar.every((p, i) => {
        if (p.startsWith(':')) {
          params[p.slice(1)] = decodeURIComponent(parcalar[i]);
          return true;
        }
        return p === parcalar[i];
      });
      if (uyar) return { rota: r, params };
    }
    return null;
  };
}

function govdeOku(istek) {
  return new Promise((coz, reddet) => {
    let boyut = 0;
    const parcalar = [];
    istek.on('data', (p) => {
      boyut += p.length;
      if (boyut > GOVDE_SINIRI) {
        reddet(new WebHatasi('İstek çok büyük.', 413));
        istek.destroy();
        return;
      }
      parcalar.push(p);
    });
    istek.on('end', () => {
      if (parcalar.length === 0) return coz({});
      try {
        const veri = JSON.parse(Buffer.concat(parcalar).toString('utf8'));
        coz(veri && typeof veri === 'object' && !Array.isArray(veri) ? veri : {});
      } catch {
        reddet(new WebHatasi('Geçersiz JSON.'));
      }
    });
    istek.on('error', reddet);
  });
}

/** Discord'da Yönetici izni var mı (komutlardaki yoneticiMi ile aynı ölçüt). */
/** Uzaklaştırma kaydının üyeye gösterilen kısmı; kayıt yoksa null. */
export function uzakOzeti(kayit) {
  return kayit ? { sebep: kayit.sebep, zaman: kayit.zaman } : null;
}

export function yoneticiMi(uye) {
  return Boolean(uye?.permissions?.has?.(PermissionFlagsBits.Administrator));
}

/** Ortak rotalar: giriş, kim olduğum, öne çıkanlar, emoji ve avatar vekili. */
function cekirdekRotalari({
  oturumlar, clientId, clientSecret, fetchFn, akis,
}) {
  return [
    {
      yontem: 'POST',
      yol: '/api/giris',
      acik: true,
      sistemsiz: true,
      async calistir(b) {
        const kod = typeof b.govde.kod === 'string' ? b.govde.kod : '';
        if (!kod || kod.length > 200) hata('Giriş kodu eksik.');
        if (!clientSecret) hata('Sunucuda clientSecret ayarlı değil.', 500);
        const erisim = await kodDegistir(kod, { clientId, clientSecret, fetchFn });
        if (!erisim) hata('Discord girişi doğrulanamadı.', 401);
        const kullanici = await kullaniciGetir(erisim, { fetchFn });
        if (!kullanici) hata('Discord kullanıcısı okunamadı.', 401);
        const uye = await b.guild?.members.fetch(kullanici.id).catch(() => null);
        if (!uye) hata('Bu uygulama yalnız sunucu üyelerine açık.', 403);
        return {
          erisim,
          oturum: oturumlar.olustur(kullanici.id),
          kullanici: uyeOzeti(b.guild, kullanici.id),
        };
      },
    },
    {
      yontem: 'GET',
      yol: '/api/ben',
      sistemsiz: true,
      calistir: async (b) => ({
        yonetici: yoneticiMi(await b.uye()),
        kullanici: uyeOzeti(b.guild, b.kullaniciId),
        ekonomiAcik: sistemAcikMi(b.db, b.guildId, 'ekonomi'),
        uzak: uzakOzeti(uzaklastirma(b.db, b.guildId, b.kullaniciId)),
        // Arayüz bir slash komutla açıldıysa gidilecek ekran (lib/arayuz-komut.js).
        acilis: acilisAl(b.kullaniciId),
      }),
    },
    {
      // Canlı akış şeridi: son büyük kazanç/kayıp ve nadir kasalar (web/akis.js).
      yontem: 'GET',
      yol: '/api/akis',
      calistir: () => ({ olaylar: akis.liste(), simdi: Date.now() }),
    },
    {
      yontem: 'GET',
      yol: '/api/emoji/:id',
      acik: true,
      sistemsiz: true,
      async calistir(b) {
        const g = await emojiGetir(b.params.id, b.sorgu.get('a') === '1', fetchFn);
        if (!g) hata('Emoji bulunamadı.', 404);
        return { ikili: g.veri, tur: g.tur };
      },
    },
    {
      yontem: 'GET',
      yol: '/api/avatar/:id',
      acik: true,
      sistemsiz: true,
      async calistir(b) {
        const g = await avatarGetir(b.guild, b.params.id, fetchFn);
        if (!g) hata('Avatar bulunamadı.', 404);
        return { ikili: g.veri, tur: g.tur, onbellekSn: 3600 };
      },
    },
  ];
}

/**
 * İstek işleyicisini kurar (dinlemez; testler doğrudan kullanır).
 *
 * @param {object} o
 * @param {import('node:sqlite').DatabaseSync} o.db
 * @param {object|null} o.client discord.js istemcisi (testte sahte nesne)
 * @param {string} o.guildId izinli sunucu
 * @param {ReturnType<import('./oturum.js').oturumDeposu>} o.oturumlar
 * @param {Array<object>} o.rotalar alan rotaları (web/rotalar/index.js)
 */
export function istekIsleyicisi({
  db, client, guildId, oturumlar, rotalar, clientId = null, clientSecret = null, logger = console, fetchFn = fetch,
}) {
  const akis = akisYayinci({
    db, client, guildId, logger,
  });
  const bul = yonlendirici([...cekirdekRotalari({
    oturumlar, clientId, clientSecret, fetchFn, akis,
  }), ...rotalar]);
  const hizlar = new Map();

  function hizAsildiMi(kullaniciId, simdi = Date.now()) {
    const k = hizlar.get(kullaniciId);
    if (!k || simdi - k.baslangic > HIZ_PENCERE_MS) {
      hizlar.set(kullaniciId, { baslangic: simdi, sayi: 1 });
      if (hizlar.size > 5000) hizlar.clear();
      return false;
    }
    k.sayi += 1;
    return k.sayi > HIZ_SINIRI;
  }

  function gonder(yanit, durum, govde) {
    const veri = Buffer.from(JSON.stringify(govde));
    yanit.writeHead(durum, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': veri.length,
      'Cache-Control': 'no-store',
    });
    yanit.end(veri);
  }

  return async function istekIsle(istek, yanit) {
    try {
      const url = new URL(istek.url, 'http://yerel');
      const bulunan = bul(istek.method, url.pathname);
      if (!bulunan) hata('Böyle bir yol yok.', 404);
      const { rota, params } = bulunan;

      let kullaniciId = null;
      if (!rota.acik) {
        const baslik = istek.headers.authorization ?? '';
        kullaniciId = oturumlar.dogrula(baslik.startsWith('Bearer ') ? baslik.slice(7) : null);
        if (!kullaniciId) hata('Oturum yok ya da süresi doldu.', 401);
        if (hizAsildiMi(kullaniciId)) hata('Çok hızlısın; birkaç saniye bekle.', 429);
      }
      if (!rota.sistemsiz && !sistemAcikMi(db, guildId, 'ekonomi')) {
        hata('Ekonomi sistemi bu sunucuda kapalı.', 403);
      }
      if (kullaniciId && !rota.sistemsiz) {
        const uzak = uzaklastirma(db, guildId, kullaniciId);
        if (uzak) {
          gonder(yanit, 403, { sebep: 'Ekonomiden uzaklaştırıldın.', kod: 'ekonomi-uzak', uzak: uzakOzeti(uzak) });
          return;
        }
      }

      const govde = istek.method === 'POST' ? await govdeOku(istek) : {};
      const guild = client?.guilds?.cache?.get(guildId) ?? null;
      const bildirimler = [];
      let uyeSozu = null;
      const b = {
        db,
        guildId,
        kullaniciId,
        govde,
        sorgu: url.searchParams,
        params,
        client,
        guild,
        gorsel: gorselCozucu(guild),
        /** Kullanıcının GuildMember'ı (rol verme için); bulunamazsa null. */
        uye: () => {
          uyeSozu ??= guild?.members.fetch(kullaniciId).catch(() => null) ?? Promise.resolve(null);
          return uyeSozu;
        },
        /** Görev olayları (lib/gorev-bilesen.js ile aynı türler). */
        gorev: (olaylar) => bildirimler.push(...gorevBildirimleri(db, guildId, kullaniciId, olaylar)),
        /** Başarımları şimdi kontrol et (POST'larda sonunda zaten yapılır). */
        basarimKontrol: () => bildirimler.push(...basarimBildirimleri(db, guildId, kullaniciId)),
        /** Öne çıkanlar akışı (web/akis.js): biten oyun ve kasa sonucu. */
        akis: {
          kumar: (veri, secenek) => akis.kumar(kullaniciId, veri, secenek),
          kasa: (veri, secenek) => akis.kasa(kullaniciId, veri, secenek),
        },
        /** Yanıtla birlikte gösterilecek ek bilgi. */
        bildir: (metin, tur = 'bilgi') => bildirimler.push({ tur, metin }),
      };

      if (rota.yonetici && !yoneticiMi(await b.uye())) hata('Bu bölüm yalnız **Yönetici** iznine açık.', 403);

      const sonuc = await rota.calistir(b);

      if (sonuc?.ikili) {
        yanit.writeHead(200, {
          'Content-Type': sonuc.tur,
          'Content-Length': sonuc.ikili.length,
          'Cache-Control': `public, max-age=${sonuc.onbellekSn ?? 86400}`,
        });
        yanit.end(sonuc.ikili);
        return;
      }
      if (istek.method === 'POST' && kullaniciId && !rota.sistemsiz) b.basarimKontrol();
      // Görev ya da başarım ödülü muz verdiyse yanıttaki bakiye eskimiş olabilir.
      if (bildirimler.length > 0 && typeof sonuc?.bakiye === 'number') sonuc.bakiye = bakiye(db, guildId, kullaniciId);
      gonder(yanit, 200, bildirimler.length > 0 ? { ...sonuc, bildirimler } : (sonuc ?? {}));
    } catch (e) {
      if (e instanceof WebHatasi) {
        gonder(yanit, e.durum, { sebep: e.message });
        return;
      }
      logger.error(`Web API hatası (${istek.method} ${istek.url}):`, e);
      if (!yanit.headersSent) gonder(yanit, 500, { sebep: 'Sunucuda bir hata oluştu.' });
    }
  };
}

/** HTTP sunucusunu başlatır; kapatma fonksiyonu döner. */
export function webSunucusuBaslat(secenekler, { port, host = '127.0.0.1', logger = console } = {}) {
  const sunucu = createServer(istekIsleyicisi({ ...secenekler, logger }));
  sunucu.on('error', (e) => logger.error(`Web API dinleyemedi (${host}:${port}):`, e.message));
  sunucu.listen(port, host, () => logger.log(`Web API: http://${host}:${port}`));
  return () => new Promise((coz) => { sunucu.close(() => coz()); });
}
