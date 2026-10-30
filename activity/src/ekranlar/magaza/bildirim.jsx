import { CircleCheck } from 'lucide-react';
import { toast } from 'sonner';

import { Md } from '@/components/Md.jsx';
import { git } from '@/lib/store.js';

/** Satın alma bildirimi; kasa alındıysa "Aç" eylemi envantere götürür. */
export function alimBildirimi(metin, kasa) {
  toast(<Md metin={metin} />, {
    icon: <CircleCheck className="size-5 text-yesil" />,
    duration: kasa ? 8000 : 3500,
    action: kasa ? { label: 'Aç', onClick: () => git('envanter', { sekme: 'kasalar' }) } : undefined,
    classNames: { actionButton: '!rounded-lg !bg-muz !font-semibold !text-muz-metin' },
  });
}
