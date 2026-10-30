/**
 * Karşılama / uğurlama görseli üretimi.
 *
 * @napi-rs/canvas önceden derlenmiş ikili kullanır (derleyici gerekmez), ama
 * yine de isteğe bağlı tutuyoruz: kütüphane yoksa veya görsel üretimi hata
 * verirse karşılama mesajı düz metin olarak yine gönderilsin.
 */

const GENISLIK = 1000;
const YUKSEKLIK = 300;

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

export async function gorselUretilebilirMi() {
  return (await canvasYukle()) !== null;
}

function metniKisalt(ctx, metin, enFazlaGenislik) {
  if (ctx.measureText(metin).width <= enFazlaGenislik) return metin;

  let kesilmis = metin;
  while (kesilmis.length > 1 && ctx.measureText(`${kesilmis}…`).width > enFazlaGenislik) {
    kesilmis = kesilmis.slice(0, -1);
  }
  return `${kesilmis}…`;
}

/**
 * Karşılama/uğurlama kartı üretir.
 *
 * @returns {Promise<Buffer|null>} kütüphane yoksa veya hata olursa null
 */
export async function karsilamaKarti({
  avatarUrl, baslik, kullaniciAdi, altYazi, vurgu = '#5865f2',
}) {
  const canvas = await canvasYukle();
  if (!canvas) return null;

  try {
    const { createCanvas, loadImage } = canvas;
    const yuzey = createCanvas(GENISLIK, YUKSEKLIK);
    const ctx = yuzey.getContext('2d');

    // Arka plan
    const zemin = ctx.createLinearGradient(0, 0, GENISLIK, YUKSEKLIK);
    zemin.addColorStop(0, '#1e2124');
    zemin.addColorStop(1, '#2c2f33');
    ctx.fillStyle = zemin;
    ctx.fillRect(0, 0, GENISLIK, YUKSEKLIK);

    // Sol kenarda vurgu şeridi
    ctx.fillStyle = vurgu;
    ctx.fillRect(0, 0, 10, YUKSEKLIK);

    // Avatar: daire maskesi içine çiziliyor
    const avatarBoyut = 180;
    const avatarX = 60;
    const avatarY = (YUKSEKLIK - avatarBoyut) / 2;
    const merkezX = avatarX + avatarBoyut / 2;
    const merkezY = avatarY + avatarBoyut / 2;
    const yaricap = avatarBoyut / 2;

    ctx.save();
    ctx.beginPath();
    ctx.arc(merkezX, merkezY, yaricap, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    const yanit = await fetch(avatarUrl);
    if (!yanit.ok) throw new Error(`avatar indirilemedi: HTTP ${yanit.status}`);
    const resim = await loadImage(Buffer.from(await yanit.arrayBuffer()));
    ctx.drawImage(resim, avatarX, avatarY, avatarBoyut, avatarBoyut);
    ctx.restore();

    // Avatar çerçevesi
    ctx.strokeStyle = vurgu;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(merkezX, merkezY, yaricap, 0, Math.PI * 2);
    ctx.stroke();

    // Yazılar
    const metinX = avatarX + avatarBoyut + 50;
    const enFazla = GENISLIK - metinX - 50;

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 46px "Segoe UI", "DejaVu Sans", sans-serif';
    ctx.fillText(metniKisalt(ctx, baslik, enFazla), metinX, 115);

    ctx.fillStyle = vurgu;
    ctx.font = 'bold 38px "Segoe UI", "DejaVu Sans", sans-serif';
    ctx.fillText(metniKisalt(ctx, kullaniciAdi, enFazla), metinX, 170);

    if (altYazi) {
      ctx.fillStyle = '#b9bbbe';
      ctx.font = '28px "Segoe UI", "DejaVu Sans", sans-serif';
      ctx.fillText(metniKisalt(ctx, altYazi, enFazla), metinX, 218);
    }

    return await yuzey.encode('png');
  } catch {
    // Görsel üretilemezse karşılama yine metin olarak gitsin.
    return null;
  }
}

/**
 * Şablondaki yer tutucuları doldurur. Saf fonksiyon, testte doğrudan çağrılıyor.
 * Bilinmeyen yer tutucular olduğu gibi bırakılır ki yazım hatası sessizce kaybolmasın.
 */
export function sablonDoldur(sablon, veriler) {
  return String(sablon).replaceAll(/\{(\w+)\}/g, (tam, anahtar) => (
    Object.hasOwn(veriler, anahtar) ? String(veriler[anahtar]) : tam
  ));
}
