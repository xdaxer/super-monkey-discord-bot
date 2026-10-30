import {
  Award, FlaskConical, Package, Palette, ShieldCheck, Store,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { HataKutusu, Yukleniyor } from '@/components/Durumlar.jsx';
import { EkranBaslik } from '@/components/Bolum.jsx';
import { Gorsel } from '@/components/Gorsel.jsx';
import { Md } from '@/components/Md.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Rozet } from '@/components/ui/rozet.jsx';
import { SekmeIcerik, Sekmeler } from '@/components/ui/sekmeler.jsx';
import { api } from '@/lib/api.js';
import { useApi } from '@/lib/kancalar.js';
import { git } from '@/lib/store.js';
import { bicim } from '@/lib/utils.js';
import { alimBildirimi } from './magaza/bildirim.jsx';
import { KasaIcerikPenceresi } from './magaza/KasaIcerik.jsx';
import { RenkRolu } from './magaza/RenkRolu.jsx';
import { Roller } from './magaza/Roller.jsx';
import { UrunKarti } from './magaza/UrunKarti.jsx';

const SEKMELER = [
  { deger: 'kasa', ad: 'Kasalar', ikon: Package },
  { deger: 'takviye', ad: 'Takviyeler', ikon: FlaskConical },
  { deger: 'rozet', ad: 'Rozetler', ikon: Award },
  { deger: 'renk', ad: 'Renk rolü', ikon: Palette },
  { deger: 'rol', ad: 'Roller', ikon: ShieldCheck },
];
const gecerli = (s) => (SEKMELER.some((x) => x.deger === s) ? s : 'kasa');

export default function Ekran({ secenek }) {
  const {
    veri, hata, yukleniyor, yenile,
  } = useApi('/api/magaza');
  const [sekme, setSekme] = useState(gecerli(secenek?.sekme));
  const [son, setSon] = useState(null);
  const [icerik, setIcerik] = useState(null);

  useEffect(() => { if (secenek?.sekme) setSekme(gecerli(secenek.sekme)); }, [secenek?.sekme]);

  if (yukleniyor && !veri) return <Yukleniyor />;
  if (hata && !veri) return <HataKutusu hata={hata} tekrar={yenile} />;

  const al = async (e, adet) => {
    const r = await api('/api/magaza/al', { govde: { kimlik: e.kimlik, adet } });
    let metin;
    if (r.muz) metin = `**${e.ad}**: ${bicim(r.muz.miktar)} muz geri geldi${r.muz.yerine ? ' (zaten sendeydi)' : ''}.`;
    else if (r.tur === 'kasa') metin = `**${adet > 1 ? `${adet} × ` : ''}${e.ad}** envanterine eklendi (artık ${r.sahip} tane).`;
    else if (r.tur === 'enerji') metin = `**${e.ad}**: enerjin **${Math.floor(r.enerji)}** oldu, çalışmaya devam!`;
    else if (r.tur === 'rozet') metin = `**${e.ad}** rozeti koleksiyonunda.${r.rozetRolu ? ` Rol verildi: **${r.rozetRolu.ad ?? 'rozet rolü'}**.` : ''}`;
    else metin = `**${e.ad}** alındı.`;
    alimBildirimi(metin, r.tur === 'kasa');
    setSon({ metin, kasa: r.tur === 'kasa' });
    await yenile({ sessiz: true });
  };

  const kategori = (k) => veri.kategoriler.find((x) => x.kimlik === k)?.esyalar ?? [];
  const izgara = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3';
  const a = veri.altinRozet;

  return (
    <div className="flex flex-col gap-5">
      <EkranBaslik ikon={Store} baslik="Mağaza" aciklama="Muzlarını kasalara, takviyelere ve rozetlere harca." />
      {son && (
        <div className="yuzey-kart flex flex-wrap items-center justify-between gap-3 border-muz/30 px-4 py-3 text-sm">
          <span><Md metin={son.metin} /></span>
          {son.kasa && <Button tur="ana" boyut="sm" onClick={() => git('envanter', { sekme: 'kasalar' })}>Aç</Button>}
        </div>
      )}
      <Sekmeler deger={sekme} degisti={setSekme} liste={SEKMELER}>
        <SekmeIcerik deger="kasa">
          <div className={izgara}>
            {kategori('kasa').map((e) => <UrunKarti key={e.kimlik} e={e} onAl={al} kasaSiniri={veri.kasaAlimSiniri} onIcerik={setIcerik} />)}
          </div>
        </SekmeIcerik>
        <SekmeIcerik deger="takviye">
          <div className={izgara}>{kategori('takviye').map((e) => <UrunKarti key={e.kimlik} e={e} onAl={al} />)}</div>
        </SekmeIcerik>
        <SekmeIcerik deger="rozet">
          <div className="flex flex-col gap-4">
            <div className={izgara}>{kategori('rozet').map((e) => <UrunKarti key={e.kimlik} e={e} onAl={al} />)}</div>
            <div className="yuzey-kart flex items-center gap-4 px-5 py-4">
              <Gorsel g={a.gorsel} boyut={36} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{a.ad}</div>
                <p className="text-[13px] text-soluk">Satılmaz. {a.not}</p>
              </div>
              {a.sahip && <Rozet tur="yesil">Sende</Rozet>}
            </div>
          </div>
        </SekmeIcerik>
        <SekmeIcerik deger="renk"><RenkRolu veri={veri} yenile={yenile} onSon={setSon} /></SekmeIcerik>
        <SekmeIcerik deger="rol"><Roller veri={veri} yenile={yenile} onSon={setSon} /></SekmeIcerik>
      </Sekmeler>
      <KasaIcerikPenceresi kasa={icerik} degisti={setIcerik} />
    </div>
  );
}
