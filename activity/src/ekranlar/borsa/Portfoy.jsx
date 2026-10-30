import { Briefcase } from 'lucide-react';

import { Bos } from '@/components/Durumlar.jsx';
import { Gorsel } from '@/components/Gorsel.jsx';
import { Muz } from '@/components/Muz.jsx';
import { Kart, KartBaslik } from '@/components/ui/kart.jsx';
import { bicim, cn, yuzde } from '@/lib/utils.js';

const renk = (n) => (n > 0 ? 'text-yesil' : n < 0 ? 'text-kirmizi' : 'text-soluk');
const oranHesap = (x) => (x.maliyet > 0 ? (x.kar / x.maliyet) * 100 : 0);

function KarHucresi({ kar, oran, className }) {
  return (
    <span className={cn('sayi inline-flex flex-col items-end leading-tight', renk(kar), className)}>
      <span className="font-medium">{kar >= 0 ? '+' : '−'}{bicim(Math.abs(kar))}</span>
      <span className="text-[11px] opacity-80">{yuzde(oran)}</span>
    </span>
  );
}

export default function Portfoy({ portfoy, komisyonYuzde, sec }) {
  const p = portfoy;
  const toplamOran = p.toplamMaliyet > 0 ? (p.toplamKar / p.toplamMaliyet) * 100 : 0;
  return (
    <Kart>
      <KartBaslik ikon={Briefcase} baslik="Portföyüm" aciklama={`Kâr/zarar, hepsi şimdi satılsaydı (%${komisyonYuzde} komisyon düşülmüş) hesaplanır.`} />
      {p.pozisyonlar.length === 0 ? (
        <Bos ikon={Briefcase} baslik="Portföyün boş" aciklama="Bir şirket seçip hisse al." />
      ) : (
        <>
          <table className="hidden w-full text-sm sm:table">
            <thead>
              <tr className="border-b border-cizgi text-xs uppercase tracking-wide text-silik">
                <th className="py-2 text-left font-medium">Şirket</th>
                <th className="py-2 text-right font-medium">Adet</th>
                <th className="py-2 text-right font-medium">Ort. maliyet</th>
                <th className="py-2 text-right font-medium">Fiyat</th>
                <th className="py-2 text-right font-medium">Değer</th>
                <th className="py-2 text-right font-medium">Kâr / zarar</th>
              </tr>
            </thead>
            <tbody>
              {p.pozisyonlar.map((x) => (
                <tr key={x.sembol} onClick={() => sec(x.sembol)} className="cursor-pointer border-b border-cizgi/60 transition-colors hover:bg-yuzey-3/50">
                  <td className="py-3"><span className="flex items-center gap-2.5"><Gorsel g={x.gorsel} boyut={24} /><b className="sayi">{x.sembol}</b></span></td>
                  <td className="sayi py-3 text-right">{bicim(x.adet)}</td>
                  <td className="sayi py-3 text-right text-soluk">{bicim(Math.round(x.ortalama))}</td>
                  <td className="sayi py-3 text-right text-soluk">{bicim(x.fiyat)}</td>
                  <td className="sayi py-3 text-right">{bicim(x.deger)}</td>
                  <td className="py-3 text-right"><KarHucresi kar={x.kar} oran={oranHesap(x)} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="text-sm font-semibold">
                <td className="py-3" colSpan={2}>Toplam</td>
                <td className="sayi py-3 text-right text-soluk" colSpan={2}>Maliyet {bicim(p.toplamMaliyet)}</td>
                <td className="sayi py-3 text-right">{bicim(p.toplamDeger)}</td>
                <td className="py-3 text-right"><KarHucresi kar={p.toplamKar} oran={toplamOran} /></td>
              </tr>
            </tfoot>
          </table>

          <div className="flex flex-col gap-2 sm:hidden">
            {p.pozisyonlar.map((x) => (
              <button key={x.sembol} type="button" onClick={() => sec(x.sembol)} className="flex flex-col gap-3 rounded-2xl border border-cizgi bg-yuzey-2 p-3.5 text-left">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2"><Gorsel g={x.gorsel} boyut={24} /><b className="sayi">{x.sembol}</b></span>
                  <KarHucresi kar={x.kar} oran={oranHesap(x)} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {[['Adet', bicim(x.adet)], ['Ort. maliyet', bicim(Math.round(x.ortalama))], ['Değer', bicim(x.deger)]].map(([e, d]) => (
                    <div key={e}><div className="text-silik">{e}</div><div className="sayi mt-0.5 text-sm">{d}</div></div>
                  ))}
                </div>
              </button>
            ))}
            <div className="flex items-center justify-between rounded-2xl border border-cizgi-guclu bg-yuzey-3/40 p-3.5 text-sm font-semibold">
              <span>Toplam <Muz miktar={p.toplamDeger} className="ml-1" /></span>
              <KarHucresi kar={p.toplamKar} oran={toplamOran} />
            </div>
          </div>
        </>
      )}
    </Kart>
  );
}
