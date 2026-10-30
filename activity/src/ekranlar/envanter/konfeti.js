import confetti from 'canvas-confetti';

const renk = (nadirlik) => getComputedStyle(document.documentElement).getPropertyValue(`--color-${nadirlik}`).trim() || '#ffd43b';

/** Mitik ve efsanevi sonuçlarda kutlama (diğerlerinde yok). */
export function konfeti(nadirlik) {
  if (nadirlik !== 'mitik' && nadirlik !== 'efsanevi') return;
  const mitik = nadirlik === 'mitik';
  const renkler = [renk(nadirlik), renk('muz'), '#ffffff'];
  const at = (aci, x) => confetti({
    particleCount: mitik ? 70 : 40,
    angle: aci,
    spread: 60,
    startVelocity: 55,
    origin: { x, y: 0.75 },
    colors: renkler,
    disableForReducedMotion: true,
    zIndex: 100,
  });
  at(60, 0.1);
  at(120, 0.9);
  if (mitik) setTimeout(() => confetti({ particleCount: 90, spread: 100, origin: { y: 0.5 }, colors: renkler, disableForReducedMotion: true, zIndex: 100 }), 250);
}
