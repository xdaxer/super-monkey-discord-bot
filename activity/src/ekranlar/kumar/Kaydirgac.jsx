import * as Slider from '@radix-ui/react-slider';

/** Tek tutamaçlı Radix kaydırıcı (Mines mayın sayısı). */
export function Kaydirgac({
  deger, degisti, min, maks, disabled = false,
}) {
  return (
    <Slider.Root
      className="relative flex h-6 w-full touch-none select-none items-center data-[disabled]:opacity-50"
      value={[deger]}
      onValueChange={([v]) => degisti(v)}
      min={min}
      max={maks}
      step={1}
      disabled={disabled}
    >
      <Slider.Track className="relative h-2 grow rounded-full bg-yuzey-3">
        <Slider.Range className="absolute h-full rounded-full bg-muz" />
      </Slider.Track>
      <Slider.Thumb aria-label="Mayın sayısı" className="block size-6 rounded-full border-2 border-muz bg-metin shadow-[0_4px_12px_rgb(0_0_0/0.5)] transition-transform hover:scale-110 focus-visible:scale-110" />
    </Slider.Root>
  );
}
