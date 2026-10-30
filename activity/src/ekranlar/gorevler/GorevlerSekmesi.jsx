import { HataKutusu, Yukleniyor } from '@/components/Durumlar.jsx';
import { useApi } from '@/lib/kancalar.js';
import { DonemKarti } from './GorevListesi.jsx';

export function GorevlerSekmesi() {
  const { veri, hata, yukleniyor, yenile } = useApi('/api/gorevler');
  if (hata && !veri) return <HataKutusu hata={hata} tekrar={() => yenile()} />;
  if (yukleniyor && !veri) return <Yukleniyor satir={2} />;
  const sessiz = () => yenile({ sessiz: true });
  return (
    <div className="flex flex-col gap-3">
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <DonemKarti baslik="Günlük görevler" aciklama="Gece yarısı yenilenir" donem={veri.gunluk} bonus={veri.gunluk.bonus} yenile={sessiz} />
        <DonemKarti baslik="Haftalık görevler" aciklama="Pazartesi 00:00'da yenilenir" donem={veri.haftalik} yenile={sessiz} />
      </div>
      <p className="text-xs text-silik">Ödüller görev bitince kendiliğinden verilir. Saatler Türkiye saatidir.</p>
    </div>
  );
}
