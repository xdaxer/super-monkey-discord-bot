import { BadgeCheck, Search, Store, Tag, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Bos } from '@/components/Durumlar.jsx';
import { Muz } from '@/components/Muz.jsx';
import { onayIste } from '@/components/Onay.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Alan, Giris } from '@/components/ui/giris.jsx';
import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { Pencere } from '@/components/ui/pencere.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { api } from '@/lib/api.js';
import { bildirimGoster } from '@/lib/bildirim.jsx';
import { useIslem } from '@/lib/kancalar.js';
import { bicim } from '@/lib/utils.js';

function RolAdi({ rol }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="size-3 shrink-0 rounded-full ring-1 ring-cizgi-guclu" style={{ background: rol.renk ?? 'var(--color-silik)' }} />
      <span className="truncate text-sm font-medium">{rol.ad ?? 'Silinmiş rol'}</span>
    </span>
  );
}

export default function MagazaRolleri({ veri, yenile }) {
  const [ara, setAra] = useState('');
  const [duzen, setDuzen] = useState(null);
  const [fiyat, setFiyat] = useState('');
  const [calistir, bekliyor] = useIslem();

  const satista = veri.roller.filter((r) => r.fiyat !== null).sort((a, b) => a.fiyat - b.fiyat);
  const aranan = ara.trim().toLocaleLowerCase('tr-TR');
  const diger = veri.roller
    .filter((r) => r.fiyat === null && (!aranan || (r.ad ?? '').toLocaleLowerCase('tr-TR').includes(aranan)))
    .sort((a, b) => Number(b.uygun) - Number(a.uygun));

  const ac = (rol) => { setDuzen(rol); setFiyat(rol.fiyat ? String(rol.fiyat) : ''); };

  const kaydet = () => calistir(async () => {
    const r = await api('/api/yonetim/magaza-rol', { govde: { rolId: duzen.id, fiyat: Number(String(fiyat).replace(/[.,\s]/g, '')) } });
    bildirimGoster(`**${duzen.ad}** ${r.guncellendi ? 'fiyatı güncellendi' : 'satışa kondu'}.`, 'basari');
    setDuzen(null);
    await yenile();
  });

  const kaldir = (rol) => calistir(async () => {
    const tamam = await onayIste({ baslik: 'Satıştan kaldırılsın mı?', metin: `**${rol.ad ?? 'Bu rol'}** satıştan kalkar. Daha önce alanlarda rol kalır.`, evet: 'Kaldır', tehlikeli: true });
    if (!tamam) return;
    await api('/api/yonetim/magaza-rol/kaldir', { govde: { rolId: rol.id } });
    bildirimGoster('Rol satıştan kaldırıldı.', 'bilgi');
    await yenile();
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
      <Kart>
        <KartBaslik ikon={Store} baslik="Satıştaki roller" aciklama={`${satista.length} rol satışta.`} />
        {satista.length === 0 ? <Bos ikon={Tag} baslik="Satışta rol yok" aciklama="Yandaki listeden bir rol seç." className="py-6" /> : (
          <ul className="flex flex-col divide-y divide-cizgi">
            {satista.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <RolAdi rol={r} />
                  {!r.uygun && <p className="mt-0.5 pl-5 text-xs text-kirmizi">{r.sebep}</p>}
                </div>
                <Muz miktar={r.fiyat} />
                <Button tur="hayalet" boyut="ikon" aria-label="Fiyatı değiştir" disabled={bekliyor || !r.uygun} onClick={() => ac(r)}><Tag /></Button>
                <Button tur="hayalet" boyut="ikon" aria-label="Kaldır" className="text-kirmizi hover:text-kirmizi" disabled={bekliyor} onClick={() => kaldir(r)}><Trash2 /></Button>
              </li>
            ))}
          </ul>
        )}
      </Kart>

      <Kart>
        <KartBaslik ikon={BadgeCheck} baslik="Sunucu rolleri" aciklama="Satışa koymak için bir rol seç." />
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-silik" />
          <Giris value={ara} onChange={(e) => setAra(e.target.value)} placeholder="Rol ara" className="pl-9" />
        </div>
        <ul className="flex max-h-[26rem] flex-col gap-0.5 overflow-y-auto">
          {diger.length === 0 && <li className="py-6 text-center text-sm text-silik">Rol bulunamadı.</li>}
          {diger.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-yuzey-3/60">
              <div className="min-w-0 flex-1">
                <RolAdi rol={r} />
                {!r.uygun && <p className="mt-0.5 pl-5 text-xs text-silik">{r.sebep}</p>}
              </div>
              {r.uygun ? <Button tur="ikincil" boyut="sm" onClick={() => ac(r)}>Satışa koy</Button> : <Rozet>Uygun değil</Rozet>}
            </li>
          ))}
        </ul>
      </Kart>

      <Pencere acik={Boolean(duzen)} degisti={(a) => { if (!a) setDuzen(null); }} baslik={duzen?.fiyat ? 'Fiyatı değiştir' : 'Rolü satışa koy'} aciklama={duzen?.ad}>
        <div className="flex flex-col gap-4">
          <Alan etiket="Fiyat (muz)" ipucu={`1 ile ${bicim(veri.fiyatMax)} arası.`}>
            <Giris autoFocus value={fiyat} onChange={(e) => setFiyat(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && fiyat) kaydet(); }} inputMode="numeric" placeholder="5000" className="sayi" />
          </Alan>
          <div className="flex justify-end gap-2">
            <Button tur="hayalet" onClick={() => setDuzen(null)}>Vazgeç</Button>
            <Button tur="ana" bekliyor={bekliyor} disabled={!fiyat.trim()} onClick={kaydet}>Kaydet</Button>
          </div>
        </div>
      </Pencere>
    </div>
  );
}
