/**
 * Kısa bildirim sesleri (Web Audio; dosya yok). Tarayıcı, kullanıcı bir kez
 * dokunmadan ses çalmaya izin vermez: ilk etkileşimde ses bağlamı açılır,
 * öncesinde çalma isteği sessizce geçer.
 */

let baglam = null;

function ac() {
  if (baglam) return;
  try {
    const Sinif = window.AudioContext ?? window.webkitAudioContext;
    if (Sinif) baglam = new Sinif();
  } catch {
    baglam = null;
  }
}

for (const olay of ['pointerdown', 'keydown', 'touchstart']) {
  window.addEventListener(olay, () => {
    ac();
    baglam?.resume?.().catch(() => {});
  }, { passive: true });
}

/** Tek nota: frekans (Hz), başlangıç gecikmesi ve süre (sn). */
function nota(frekans, gecikme, sure, ses = 0.18, dalga = 'triangle') {
  const t = baglam.currentTime + gecikme;
  const osc = baglam.createOscillator();
  const kazanc = baglam.createGain();
  osc.type = dalga;
  osc.frequency.setValueAtTime(frekans, t);
  kazanc.gain.setValueAtTime(0.0001, t);
  kazanc.gain.exponentialRampToValueAtTime(ses, t + 0.02);
  kazanc.gain.exponentialRampToValueAtTime(0.0001, t + sure);
  osc.connect(kazanc).connect(baglam.destination);
  osc.start(t);
  osc.stop(t + sure + 0.05);
}

/** Nota dizisi: [frekans, gecikme, süre, ses?, dalga?]. Ses bağlamı açık değilse sessiz geçer. */
function cal(notalar) {
  if (!baglam || baglam.state !== 'running') return;
  try {
    for (const n of notalar) nota(...n);
  } catch {
    // Ses yalnız süs; çalamazsa pencere yine açılır.
  }
}

/** Davet sesi: yükselen üç nota (düello çağrısı). */
export const davetSesi = () => cal([[659, 0, 0.18], [880, 0.12, 0.18], [1319, 0.24, 0.32]]);

/** Boss çıktı: alçak, tok üç vuruş ve yükselen uyarı. */
export const bossSesi = () => cal([
  [110, 0, 0.35, 0.22, 'sawtooth'], [110, 0.28, 0.35, 0.22, 'sawtooth'], [147, 0.56, 0.6, 0.2, 'sawtooth'], [294, 0.56, 0.6, 0.08],
]);

/** Boss yenildi: kısa zafer fanfarı. */
export const zaferSesi = () => cal([[523, 0, 0.14], [659, 0.12, 0.14], [784, 0.24, 0.14], [1047, 0.36, 0.5], [784, 0.36, 0.5, 0.08]]);

/** Boss kaçtı: inen iki nota. */
export const kacisSesi = () => cal([[392, 0, 0.25], [311, 0.22, 0.45]]);

/** Hisse haberi: iki kısa "ding". */
export const haberSesi = () => cal([[1175, 0, 0.12, 0.14], [1568, 0.1, 0.25, 0.14]]);

/** Grev oyunu: maymunu bastırma "bonk"u; kombo yükseldikçe incelir. */
export const bonkSesi = (kombo = 1) => {
  const f = 260 + Math.min(kombo, 15) * 35;
  cal([[f, 0, 0.07, 0.2, 'square'], [f * 2, 0.03, 0.09, 0.08]]);
};

/** Grev oyunu: maymun kapıdan kaçtı. */
export const kapiSesi = () => cal([[196, 0, 0.16, 0.2, 'sawtooth'], [131, 0.1, 0.3, 0.2, 'sawtooth']]);

/** Grev oyunu: güçlendirme (altın muz, zam). */
export const gucSesi = () => cal([[784, 0, 0.1], [988, 0.07, 0.1], [1175, 0.14, 0.1], [1568, 0.21, 0.3]]);

/** Grev oyunu geri sayımı: 3-2-1 kısa, başla uzun. */
export const sayimSesi = (son = false) => cal([[son ? 988 : 659, 0, son ? 0.3 : 0.1, 0.16]]);
