import * as Popover from '@radix-ui/react-popover';
import * as Tooltip from '@radix-ui/react-tooltip';

import { useEslesme } from '@/lib/kancalar.js';

const icerikSinifi = 'z-50 max-w-64 rounded-lg border border-cizgi-guclu bg-yuzey-3 px-2.5 py-1.5 text-xs text-metin shadow-xl data-[state=open]:animate-belir';

/** Dokunmatik ekran mı (fare yok)? Üzerine gelme orada olmaz. */
const useDokunmatik = () => useEslesme('(hover: none) and (pointer: coarse)');

/**
 * Kısa açıklama: farede üzerine gelince, dokunmatikte dokununca açılır
 * (HIG: bilgiyi yalnız üzerine gelmeye bağlama).
 */
export function Ipucu({ metin, children, yan = 'top' }) {
  const dokunmatik = useDokunmatik();
  if (!metin) return children;
  if (dokunmatik) {
    return (
      <Popover.Root>
        <Popover.Trigger asChild>{children}</Popover.Trigger>
        <Popover.Portal>
          <Popover.Content side={yan} sideOffset={6} collisionPadding={12} className={icerikSinifi}>
            {metin}
            <Popover.Arrow className="fill-yuzey-3" />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  }
  return (
    <Tooltip.Root delayDuration={200}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side={yan} sideOffset={6} collisionPadding={12} className={icerikSinifi}>
          {metin}
          <Tooltip.Arrow className="fill-yuzey-3" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export const IpucuSaglayici = Tooltip.Provider;
