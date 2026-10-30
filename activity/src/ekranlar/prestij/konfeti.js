import confetti from 'canvas-confetti';

/** Altın tonlu, ölçülü kutlama konfetisi. */
export function konfetiPatlat(yogun = false) {
  const renkler = ['#ffd43b', '#fff3b0', '#e8a400', '#f4efe6'];
  const vur = (aci, x) => confetti({
    particleCount: yogun ? 70 : 45, angle: aci, spread: 65, origin: { x, y: 0.75 }, colors: renkler, ticks: 220, scalar: 0.95,
  });
  vur(60, 0.1);
  vur(120, 0.9);
  if (yogun) setTimeout(() => confetti({ particleCount: 80, spread: 110, origin: { x: 0.5, y: 0.5 }, colors: renkler }), 250);
}
