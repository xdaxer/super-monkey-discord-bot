import { EmbedBuilder } from 'discord.js';

export const RENK = {
  bilgi: 0x5865f2,
  basari: 0x57f287,
  uyari: 0xfee75c,
  hata: 0xed4245,
  notr: 0x99aab5,
};

export function gomu(tur, baslik, aciklama) {
  const embed = new EmbedBuilder().setColor(RENK[tur] ?? RENK.notr).setTimestamp();
  if (baslik) embed.setTitle(baslik);
  if (aciklama) embed.setDescription(aciklama);
  return embed;
}

/** Discord'un yerel zaman göstergesi: okuyanın saat dilimine göre görünür. */
export function zaman(msVeyaTarih, stil = 'F') {
  const ms = msVeyaTarih instanceof Date ? msVeyaTarih.getTime() : msVeyaTarih;
  return `<t:${Math.floor(ms / 1000)}:${stil}>`;
}

/**
 * Kullanıcıdan gelen metni yankılarken kimsenin etiketlenmemesini sağlar.
 * Yalnız görünümü bozar; asıl koruma gönderirken allowedMentions ile yapılır.
 */
export function etiketsiz(metin) {
  return String(metin).replaceAll('@', '@​');
}

/** Bir embed alanının taşıyabileceği en fazla karakter (Discord sınırı). */
export const ALAN_SINIRI = 1024;

/**
 * Satır listesini embed alanlarına böler. Tek alana sığmayan liste kırpılıp
 * yarım satırla bitmesin diye: taşan satırlar "(devam)" başlıklı alana geçer.
 *
 * @returns {Array<{name: string, value: string}>}
 */
export function alanlaraBol(baslik, satirlar, sinir = ALAN_SINIRI) {
  const alanlar = [];
  let parca = [];
  let uzunluk = 0;

  for (const satir of satirlar) {
    const eklenecek = satir.length + (parca.length > 0 ? 1 : 0);
    if (parca.length > 0 && uzunluk + eklenecek > sinir) {
      alanlar.push(parca);
      parca = [];
      uzunluk = 0;
    }
    parca.push(satir);
    uzunluk += parca.length > 1 ? satir.length + 1 : satir.length;
  }
  if (parca.length > 0) alanlar.push(parca);

  return alanlar.map((satirlar_, sira) => ({
    name: sira === 0 ? baslik : `${baslik} (devam)`,
    // Tek satırın kendisi sınırı aşıyorsa kırpmaktan başka seçenek yok.
    value: satirlar_.join('\n').slice(0, sinir),
  }));
}

/** Hiç kimseyi ping'lemeyen mesaj seçenekleri. */
export const PINGSIZ = { allowedMentions: { parse: [] } };

export function sureBicimle(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'bilinmiyor';

  const birimler = [
    ['gün', 86_400_000],
    ['saat', 3_600_000],
    ['dakika', 60_000],
    ['saniye', 1000],
  ];

  const parcalar = [];
  let kalan = ms;
  for (const [ad, boyut] of birimler) {
    const adet = Math.floor(kalan / boyut);
    if (adet > 0) {
      parcalar.push(`${adet} ${ad}`);
      kalan -= adet * boyut;
    }
    if (parcalar.length === 2) break;
  }

  return parcalar.length > 0 ? parcalar.join(' ') : '1 saniyeden az';
}

/**
 * "10d", "2sa", "1g" gibi süreleri milisaniyeye çevirir.
 * @returns {number|null} geçersizse null
 */
export function sureAyristir(metin) {
  const eslesme = /^(\d+)\s*(sn|dk|sa|g|s|d|h|m)$/i.exec(String(metin).trim());
  if (!eslesme) return null;

  const miktar = Number(eslesme[1]);
  const birim = eslesme[2].toLowerCase();
  const carpanlar = {
    sn: 1000, s: 1000,
    dk: 60_000, d: 60_000, m: 60_000,
    sa: 3_600_000, h: 3_600_000,
    g: 86_400_000,
  };

  const ms = miktar * carpanlar[birim];
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}
