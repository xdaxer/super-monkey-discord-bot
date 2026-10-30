/**
 * Botun web API'sine (app/web/) istemci. Activity içinde göreli `/api/...`
 * istekleri Discord proxy'si üzerinden Activity alan adına (nginx) gider.
 *
 *   const veri = await api('/api/ozet');                    // GET
 *   const sonuc = await api('/api/gunluk', { govde: {} });  // POST
 *
 * Hata: `ApiHatasi` (mesaj lib'in `sebep`i, markdown). Yanıttaki `bildirimler`
 * kendiliğinden toast olur, `bakiye` üst çubuğu günceller.
 * `keepalive: true`: sayfa gizlenirken/kapanırken de gönderilir (nabız).
 * `bakiyeErtele: true`: üst çubuk güncellenmez (animasyonlu oyunlar sonucu
 * erkenden ele vermesin); çağıran animasyon bitince `bakiyeGuncelle` çağırır.
 * 403 + `kod: 'ekonomi-uzak'`: üye ekonomiden uzaklaştırıldı; store'a yazılır ve
 * App kapanmayan pencereyi açar (components/UzakPenceresi.jsx).
 */

import { bildirimGoster } from './bildirim.jsx';
import { bakiyeGuncelle, useUygulama } from './store.js';

export class ApiHatasi extends Error {
  constructor(mesaj, durum, kod = null) {
    super(mesaj);
    this.durum = durum;
    this.kod = kod;
  }
}

let oturum = null;
let yenidenGiris = null;

export function oturumAyarla(belirtec) {
  oturum = belirtec;
}

/** 401'de çalışacak giriş fonksiyonu (oturumu yeniden kurar). */
export function yenidenGirisAyarla(f) {
  yenidenGiris = f;
}

function gonder(yol, { govde, yontem, keepalive = false }) {
  return fetch(yol, {
    method: yontem ?? (govde === undefined ? 'GET' : 'POST'),
    headers: {
      ...(govde === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(oturum ? { Authorization: `Bearer ${oturum}` } : {}),
    },
    body: govde === undefined ? undefined : JSON.stringify(govde),
    keepalive,
  });
}

export async function api(yol, secenek = {}) {
  let yanit = await gonder(yol, secenek);
  // Bot yeniden başladıysa oturum düşmüştür: sessizce yeniden giriş.
  if (yanit.status === 401 && yenidenGiris) {
    await yenidenGiris();
    yanit = await gonder(yol, secenek);
  }
  let veri = null;
  try {
    veri = await yanit.json();
  } catch {
    veri = null;
  }
  if (!yanit.ok) {
    if (veri?.kod === 'ekonomi-uzak') useUygulama.getState().setUzak(veri.uzak);
    throw new ApiHatasi(veri?.sebep ?? `Sunucu hatası (${yanit.status}).`, yanit.status, veri?.kod ?? null);
  }
  if (veri && typeof veri.bakiye === 'number' && !secenek.bakiyeErtele) bakiyeGuncelle(veri.bakiye);
  for (const b of veri?.bildirimler ?? []) bildirimGoster(b.metin, b.tur === 'basarim' ? 'basarim' : 'gorev');
  return veri;
}
