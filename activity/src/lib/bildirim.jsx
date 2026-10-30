import { CircleAlert, CircleCheck, Info, Target, Trophy } from 'lucide-react';
import { toast } from 'sonner';

import { Md } from '@/components/Md.jsx';

const IKON = {
  basari: <CircleCheck className="size-5 text-yesil" />,
  hata: <CircleAlert className="size-5 text-kirmizi" />,
  bilgi: <Info className="size-5 text-mavi" />,
  gorev: <Target className="size-5 text-yesil" />,
  basarim: <Trophy className="size-5 text-muz" />,
};

/**
 * Kısa bildirim. `metin` lib'in markdown metni olabilir.
 * tur: basari | hata | bilgi | gorev | basarim
 */
export function bildirimGoster(metin, tur = 'bilgi', sure = undefined) {
  // Hata okunmadan kaybolmasın (HIG: süreli öğeleri azalt): daha uzun durur, elle kapatılır.
  toast(<Md metin={metin} />, {
    icon: IKON[tur] ?? IKON.bilgi,
    closeButton: tur === 'hata',
    duration: sure ?? (tur === 'hata' ? 8000 : tur === 'basarim' || tur === 'gorev' ? 6500 : 4000),
    className: tur === 'basarim' ? 'bildirim-basarim' : undefined,
  });
}

/** ApiHatasi ya da herhangi bir hatayı bildirim olarak gösterir. */
export function hataGoster(e) {
  bildirimGoster(e?.message ?? String(e), 'hata');
}
