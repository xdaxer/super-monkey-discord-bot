/**
 * Profil kartı: `/profil` komutunun veri toplama ve görsel çizim katmanı.
 *
 * Veri toplama (`profilVerisi`) saf: yalnız veritabanını okur, düz nesne döner.
 * Çizim (`profilKarti`) @napi-rs/canvas'ı isteğe bağlı yükler (lib/gorsel.js ile
 * aynı yaklaşım): kütüphane yoksa ya da çizim hata verirse null döner ve komut
 * aynı bilgileri embed olarak gösterir. Görselleri indirme işi dışarıdan
 * verilebilir (`indir`), böylece testler ağa çıkmaz.
 */

import { kilitliToplam } from './banka.js';
import { hesapGetir, zenginlikSirasi } from './ekonomi.js';
import { prestijSeviyesi } from './prestij-carpan.js';
import { envanter } from './envanter.js';
import { puanSatiri } from './envanter-gorunum.js';
import { rozetler } from './esyalar.js';
import {
  kartDegeri, kartGetir, KARTLAR, koleksiyon, NADIRLIK_SIRASI, NADIRLIKLER, parlakKimlik,
} from './kasalar.js';
import { kullaniciGetir, seviyeHesapla, sira } from './seviye.js';
import { kademeBul } from './seviye-rol.js';

export const GENISLIK = 1000;
export const YUKSEKLIK = 450;

/** Kartta gösterilen en değerli kart ve rozet sayıları. */
export const KART_ADEDI = 6;
export const ROZET_ADEDI = 13;

/** Seviye rolü olmayanlar için vurgu rengi (muz sarısı). */
const MUZ_SARISI = 0xffd33d;

/**
 * Bir kullanıcının profil kartındaki bütün sayıları ve listeleri.
 * En değerli kartlar: nadirlik değerine, eşitse elde bulunan adede, o da eşitse
 * katalog sırasına göre azalan. Rozetler: en değerlisi (katalogda sonda) önce.
 */
export function profilVerisi(db, guildId, kullaniciId) {
  const xpKaydi = kullaniciGetir(db, guildId, kullaniciId);
  const { seviye, suAnki, sonraki } = seviyeHesapla(xpKaydi.xp);
  const hesap = hesapGetir(db, guildId, kullaniciId);
  const kademe = kademeBul(seviye);

  const sahip = envanter(db, guildId, kullaniciId);
  const kol = koleksiyon(db, guildId, kullaniciId);
  const { puan } = puanSatiri(sahip);

  // Parlak sürümler ayrı girdidir ve 5 katı değerle öne geçer.
  const enDegerli = KARTLAR.flatMap((kart) => [kart, kartGetir(parlakKimlik(kart.kimlik))])
    .map((kart, katalogSirasi) => ({ kart, katalogSirasi, adet: sahip[kart.kimlik] ?? 0 }))
    .filter((o) => o.adet > 0)
    .sort((a, b) => (
      kartDegeri(b.kart) - kartDegeri(a.kart)
      || b.adet - a.adet
      || a.katalogSirasi - b.katalogSirasi
    ))
    .slice(0, KART_ADEDI)
    .map(({ kart, adet }) => ({
      kimlik: kart.kimlik, ad: kart.ad, nadirlik: kart.nadirlik, emojiAdi: kart.emojiAdi, adet,
    }));

  return {
    kullaniciId: String(kullaniciId),
    xp: xpKaydi.xp,
    seviye,
    suAnki,
    sonraki,
    xpSirasi: sira(db, guildId, kullaniciId),
    kademe: kademe ? { ad: kademe.ad, renk: kademe.renk } : null,
    bakiye: hesap.bakiye,
    zenginlikSirasi: zenginlikSirasi(db, guildId, kullaniciId),
    bankada: kilitliToplam(db, guildId, kullaniciId),
    seri: hesap.gunluk_seri,
    prestij: prestijSeviyesi(db, guildId, kullaniciId),
    koleksiyon: {
      farkli: kol.farkli,
      toplam: kol.toplam,
      puan,
      kademeler: NADIRLIK_SIRASI.map((nadirlik) => {
        const k = kol.kademeler.find((o) => o.nadirlik === nadirlik);
        return {
          nadirlik, ad: NADIRLIKLER[nadirlik].ad, renk: NADIRLIKLER[nadirlik].renk, sahip: k.sahip, toplam: k.toplam,
        };
      }),
    },
    enDegerliKartlar: enDegerli,
    rozetler: rozetler(db, guildId, kullaniciId).reverse().slice(0, ROZET_ADEDI)
      .map((r) => ({ kimlik: r.kimlik, ad: r.ad, emojiAdi: r.emojiAdi })),
  };
}

/** Sunucudaki özel emojinin PNG adresi; yoksa null. */
export function emojiUrlCozucu(guild) {
  return (emojiAdi) => {
    const emoji = guild?.emojis?.cache?.find((e) => e.name === emojiAdi);
    return emoji?.imageURL?.({ extension: 'png', size: 64 }) ?? null;
  };
}

const ONBELLEK_SINIRI = 200;
const onbellek = new Map();

/**
 * Adresi indirip Buffer döner; hata olursa null. Başarılı sonuçlar bellekte
 * tutulur (emojiler nadiren değişir), önbellek dolunca en eski silinir.
 */
export async function varsayilanIndir(url) {
  if (!url) return null;
  if (onbellek.has(url)) return onbellek.get(url);

  try {
    const yanit = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!yanit.ok) return null;
    const tampon = Buffer.from(await yanit.arrayBuffer());
    if (onbellek.size >= ONBELLEK_SINIRI) onbellek.delete(onbellek.keys().next().value);
    onbellek.set(url, tampon);
    return tampon;
  } catch {
    return null;
  }
}

let canvasModulu;

async function canvasYukle() {
  if (canvasModulu !== undefined) return canvasModulu;
  try {
    canvasModulu = await import('@napi-rs/canvas');
  } catch {
    canvasModulu = null;
  }
  return canvasModulu;
}

export async function profilGorseliUretilebilirMi() {
  return (await canvasYukle()) !== null;
}

const YAZI = '"Segoe UI", "DejaVu Sans", sans-serif';
const yazi = (boyut, kalin = false) => `${kalin ? 'bold ' : ''}${boyut}px ${YAZI}`;

const RENK = {
  zeminUst: '#12151c',
  zeminAlt: '#1f2433',
  kutu: '#262c3d',
  yazi: '#ffffff',
  soluk: '#9aa3b8',
  muz: '#ffd33d',
};

const hex = (sayi) => `#${sayi.toString(16).padStart(6, '0')}`;

function yuvarlakDikdortgen(ctx, x, y, g, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + g, y, x + g, y + h, r);
  ctx.arcTo(x + g, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + g, y, r);
  ctx.closePath();
}

function metniKisalt(ctx, metin, enFazlaGenislik) {
  if (ctx.measureText(metin).width <= enFazlaGenislik) return metin;
  let kesilmis = metin;
  while (kesilmis.length > 1 && ctx.measureText(`${kesilmis}…`).width > enFazlaGenislik) {
    kesilmis = kesilmis.slice(0, -1);
  }
  return `${kesilmis}…`;
}

/** Sayıyı "12.345" biçiminde yazar. */
const sayi = (n) => Math.trunc(Number(n) || 0).toLocaleString('tr-TR');

/** Dar kutular için: milyondan büyükleri "2,5 Mn" diye kısaltır. */
function kisalt(n) {
  const m = Math.trunc(Number(n) || 0);
  if (m >= 1_000_000) return `${(m / 1_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} Mn`;
  return sayi(m);
}

/** Küçük etiket + büyük değer içeren istatistik kutusu. */
function istatistikKutusu(ctx, x, y, g, h, etiket, deger, vurgu) {
  ctx.fillStyle = RENK.kutu;
  yuvarlakDikdortgen(ctx, x, y, g, h, 12);
  ctx.fill();
  ctx.fillStyle = vurgu;
  ctx.fillRect(x + 14, y + 12, 22, 4);

  ctx.fillStyle = RENK.soluk;
  ctx.font = yazi(14, true);
  ctx.fillText(etiket, x + 14, y + 36);

  ctx.fillStyle = RENK.yazi;
  ctx.font = yazi(26, true);
  ctx.fillText(metniKisalt(ctx, deger, g - 28), x + 14, y + 64);
}

/** Görseli kare alana çizer; yoksa `yedek(ctx)` çalışır. */
function resimCiz(ctx, resim, x, y, boyut, yedek) {
  if (resim) ctx.drawImage(resim, x, y, boyut, boyut);
  else yedek(ctx);
}

/**
 * Profil kartını PNG olarak üretir.
 *
 * @param {object} p
 * @param {object} p.veri `profilVerisi` çıktısı
 * @param {string} p.gorunenAd üyenin görünen adı
 * @param {string} [p.avatarUrl]
 * @param {(emojiAdi: string) => string|null} [p.emojiUrl]
 * @param {(url: string) => Promise<Buffer|null>} [p.indir] test için değiştirilebilir
 * @returns {Promise<Buffer|null>} kütüphane yoksa veya hata olursa null
 */
export async function profilKarti({
  veri, gorunenAd, avatarUrl = null, emojiUrl = () => null, indir = varsayilanIndir,
}) {
  const canvas = await canvasYukle();
  if (!canvas) return null;

  try {
    const { createCanvas, loadImage } = canvas;

    // İndirilemeyen ya da bozuk görsel kartı bozmasın: null döner, yedek çizilir.
    const yukle = async (url) => {
      try {
        const tampon = url ? await indir(url) : null;
        return tampon ? await loadImage(tampon) : null;
      } catch {
        return null;
      }
    };

    const [avatar, kartResimleri, rozetResimleri] = await Promise.all([
      yukle(avatarUrl),
      Promise.all(veri.enDegerliKartlar.map((k) => yukle(emojiUrl(k.emojiAdi)))),
      Promise.all(veri.rozetler.map((r) => yukle(emojiUrl(r.emojiAdi)))),
    ]);

    const yuzey = createCanvas(GENISLIK, YUKSEKLIK);
    const ctx = yuzey.getContext('2d');
    ctx.textBaseline = 'alphabetic';
    const vurgu = hex(veri.kademe?.renk ?? MUZ_SARISI);

    // Zemin
    const zemin = ctx.createLinearGradient(0, 0, GENISLIK, YUKSEKLIK);
    zemin.addColorStop(0, RENK.zeminUst);
    zemin.addColorStop(1, RENK.zeminAlt);
    ctx.fillStyle = zemin;
    ctx.fillRect(0, 0, GENISLIK, YUKSEKLIK);

    // Üstte muz sarısı şerit, altta rol renginde ince çizgi
    ctx.fillStyle = RENK.muz;
    ctx.fillRect(0, 0, GENISLIK, 8);
    ctx.fillStyle = vurgu;
    ctx.fillRect(0, YUKSEKLIK - 4, GENISLIK, 4);

    // Avatar: yuvarlak, seviye rolü renginde çerçeve
    const avatarBoyut = 140;
    const avatarX = 40;
    const avatarY = 34;
    const mx = avatarX + avatarBoyut / 2;
    const my = avatarY + avatarBoyut / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(mx, my, avatarBoyut / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    resimCiz(ctx, avatar, avatarX, avatarY, avatarBoyut, (c) => {
      c.fillStyle = RENK.kutu;
      c.fillRect(avatarX, avatarY, avatarBoyut, avatarBoyut);
    });
    ctx.restore();
    ctx.strokeStyle = vurgu;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(mx, my, avatarBoyut / 2 + 1, 0, Math.PI * 2);
    ctx.stroke();

    // Ad ve seviye rolü
    const metinX = 210;
    const sagKenar = GENISLIK - 40;
    ctx.fillStyle = RENK.yazi;
    ctx.font = yazi(38, true);
    ctx.fillText(metniKisalt(ctx, gorunenAd, 560), metinX, 78);

    ctx.fillStyle = vurgu;
    ctx.font = yazi(20, true);
    const kademeMetni = veri.kademe ? veri.kademe.ad : 'Seviye rolü yok';
    ctx.fillText(kademeMetni, metinX, 108);

    // Prestij göstergesi: altın yıldız + ×n, seviye rolünün yanında (yazı tipi emoji gerektirmesin diye çizilir).
    if (veri.prestij > 0) {
      const sx = metinX + ctx.measureText(kademeMetni).width + 28;
      ctx.fillStyle = '#f1c40f';
      ctx.beginPath();
      for (let i = 0; i < 10; i += 1) {
        const yaricap = i % 2 === 0 ? 12 : 5;
        const aci = -Math.PI / 2 + (i * Math.PI) / 5;
        ctx[i === 0 ? 'moveTo' : 'lineTo'](sx + yaricap * Math.cos(aci), 101 + yaricap * Math.sin(aci));
      }
      ctx.closePath();
      ctx.fill();
      ctx.font = yazi(20, true);
      ctx.fillText(`×${veri.prestij}`, sx + 18, 108);
    }

    // Sağ üst: seviye ve XP sırası
    ctx.textAlign = 'right';
    ctx.fillStyle = RENK.muz;
    ctx.font = yazi(40, true);
    ctx.fillText(`SV ${veri.seviye}`, sagKenar, 78);
    ctx.fillStyle = RENK.soluk;
    ctx.font = yazi(18, true);
    ctx.fillText(veri.xpSirasi ? `XP sırası #${veri.xpSirasi}` : 'XP sırası yok', sagKenar, 108);
    ctx.textAlign = 'left';

    // XP çubuğu
    const cubukX = metinX;
    const cubukY = 126;
    const cubukG = sagKenar - cubukX;
    const cubukH = 26;
    const oran = veri.sonraki > 0 ? Math.min(1, Math.max(0, veri.suAnki / veri.sonraki)) : 0;
    ctx.fillStyle = RENK.kutu;
    yuvarlakDikdortgen(ctx, cubukX, cubukY, cubukG, cubukH, cubukH / 2);
    ctx.fill();
    if (oran > 0) {
      const dolu = Math.max(cubukH, cubukG * oran);
      const dolgu = ctx.createLinearGradient(cubukX, 0, cubukX + cubukG, 0);
      dolgu.addColorStop(0, RENK.muz);
      dolgu.addColorStop(1, vurgu);
      ctx.fillStyle = dolgu;
      yuvarlakDikdortgen(ctx, cubukX, cubukY, dolu, cubukH, cubukH / 2);
      ctx.fill();
    }
    ctx.fillStyle = RENK.soluk;
    ctx.font = yazi(15);
    ctx.fillText(`${sayi(veri.suAnki)} / ${sayi(veri.sonraki)} XP`, cubukX, cubukY + cubukH + 20);
    ctx.textAlign = 'right';
    ctx.fillText(
      `Sonraki seviyeye ${sayi(Math.max(0, veri.sonraki - veri.suAnki))} XP · toplam ${sayi(veri.xp)}`,
      sagKenar,
      cubukY + cubukH + 20,
    );
    ctx.textAlign = 'left';

    // Muz istatistikleri
    const kutuY = 210;
    const kutuH = 76;
    const aralik = 14;
    const kutuG = (GENISLIK - 80 - aralik * 3) / 4;
    const kutular = [
      ['MUZ BAKİYESİ', kisalt(veri.bakiye), RENK.muz],
      ['ZENGİNLİK SIRASI', veri.zenginlikSirasi ? `#${veri.zenginlikSirasi}` : '—', '#57f287'],
      ['BANKADA KİLİTLİ', kisalt(veri.bankada), '#5dade2'],
      ['GÜNLÜK SERİ', `${veri.seri} gün`, '#ed7d31'],
    ];
    kutular.forEach(([etiket, deger, renk], i) => {
      istatistikKutusu(ctx, 40 + i * (kutuG + aralik), kutuY, kutuG, kutuH, etiket, deger, renk);
    });

    // Koleksiyon bölümü (sol): başlık, puan, nadirlik sayaçları
    const kolY = 306;
    ctx.fillStyle = RENK.yazi;
    ctx.font = yazi(22, true);
    ctx.fillText(`Koleksiyon ${veri.koleksiyon.farkli}/${veri.koleksiyon.toplam}`, 40, kolY + 14);
    ctx.fillStyle = RENK.muz;
    ctx.font = yazi(16, true);
    ctx.fillText(`Puan ${sayi(veri.koleksiyon.puan)}`, 40, kolY + 40);

    // Sayaçlar tek sırada: nadirlik renginde nokta ve "sahip/toplam"
    const sayacG = 82;
    veri.koleksiyon.kademeler.slice().reverse().forEach((k, i) => {
      const sx = 40 + i * sayacG;
      const sy = kolY + 70;
      ctx.fillStyle = hex(k.renk);
      ctx.beginPath();
      ctx.arc(sx + 7, sy - 5, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = RENK.yazi;
      ctx.font = yazi(15, true);
      ctx.fillText(`${k.sahip}/${k.toplam}`, sx + 20, sy);
    });

    // En değerli kartlar (sağ): nadirlik renginde çerçeve
    const kartBoyut = 64;
    const kartAralik = 12;
    const kartlarX = sagKenar - (KART_ADEDI * kartBoyut + (KART_ADEDI - 1) * kartAralik);
    const kartY = kolY + 4;
    ctx.fillStyle = RENK.soluk;
    ctx.font = yazi(14, true);
    ctx.fillText('EN DEĞERLİ KARTLAR', kartlarX, kolY - 2);
    if (veri.enDegerliKartlar.length === 0) {
      ctx.font = yazi(16);
      ctx.fillText('Henüz kart yok. Kasa açınca burada görünür.', kartlarX, kartY + 46);
    }
    veri.enDegerliKartlar.forEach((kart, i) => {
      const kx = kartlarX + i * (kartBoyut + kartAralik);
      const ky = kartY + 8;
      const renk = hex(NADIRLIKLER[kart.nadirlik].renk);
      ctx.fillStyle = RENK.kutu;
      yuvarlakDikdortgen(ctx, kx, ky, kartBoyut, kartBoyut, 12);
      ctx.fill();
      resimCiz(ctx, kartResimleri[i], kx + 6, ky + 6, kartBoyut - 12, (c) => {
        c.fillStyle = renk;
        c.beginPath();
        c.arc(kx + kartBoyut / 2, ky + kartBoyut / 2, 16, 0, Math.PI * 2);
        c.fill();
      });
      ctx.strokeStyle = renk;
      ctx.lineWidth = 3;
      yuvarlakDikdortgen(ctx, kx, ky, kartBoyut, kartBoyut, 12);
      ctx.stroke();
      if (kart.adet > 1) {
        ctx.fillStyle = renk;
        yuvarlakDikdortgen(ctx, kx + kartBoyut - 30, ky + kartBoyut - 12, 34, 20, 10);
        ctx.fill();
        ctx.fillStyle = '#111111';
        ctx.font = yazi(13, true);
        ctx.textAlign = 'center';
        ctx.fillText(`×${kart.adet}`, kx + kartBoyut - 13, ky + kartBoyut + 3);
        ctx.textAlign = 'left';
      }
    });

    // Rozetler: en değerlisi solda
    const rozetY = 398;
    const rozetBoyut = 34;
    ctx.fillStyle = RENK.soluk;
    ctx.font = yazi(14, true);
    ctx.fillText('ROZETLER', 40, rozetY + 22);
    if (veri.rozetler.length === 0) {
      ctx.font = yazi(15);
      ctx.fillText('Henüz rozet yok.', 140, rozetY + 22);
    }
    veri.rozetler.forEach((r, i) => {
      const rx = 140 + i * (rozetBoyut + 8);
      resimCiz(ctx, rozetResimleri[i], rx, rozetY, rozetBoyut, (c) => {
        c.fillStyle = RENK.muz;
        c.beginPath();
        c.arc(rx + rozetBoyut / 2, rozetY + rozetBoyut / 2, 12, 0, Math.PI * 2);
        c.fill();
      });
    });

    return await yuzey.encode('png');
  } catch {
    return null;
  }
}
