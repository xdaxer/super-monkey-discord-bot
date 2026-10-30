/**
 * Discord SDK örneği (main.jsx girişte ayarlar). Önizlemede (Discord dışı) yoktur;
 * o zaman bağlantı yeni sekmede açılır.
 */
let sdk = null;

export function sdkAyarla(s) {
  sdk = s;
}

/** Bağlantıyı Discord'un kendi açıcısıyla açar (Discord kanal bağlantısı uygulama içinde açılır). */
export async function baglantiAc(url) {
  if (sdk) {
    await sdk.commands.openExternalLink({ url }).catch(() => window.open(url, '_blank'));
    return;
  }
  window.open(url, '_blank', 'noopener');
}
