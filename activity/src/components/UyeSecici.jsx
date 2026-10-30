import { Search, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Avatar } from '@/components/Avatar.jsx';
import { Giris } from '@/components/ui/giris.jsx';
import { Pencere } from '@/components/ui/pencere.jsx';
import { api } from '@/lib/api.js';

/**
 * Üye seçici pencere (/api/uyeler). `acik`/`degisti` denetimli; seçilince
 * `sec({id, ad, avatar})` çağrılır ve pencere kapanır.
 */
export function UyeSecici({
  acik, degisti, sec, baslik = 'Üye seç',
}) {
  const [q, setQ] = useState('');
  const [uyeler, setUyeler] = useState(null);
  const [hata, setHata] = useState(null);

  useEffect(() => {
    if (!acik) {
      setQ('');
      setUyeler(null);
      return undefined;
    }
    const aranan = q.trim();
    if (!aranan) {
      setUyeler(null);
      return undefined;
    }
    const t = setTimeout(async () => {
      try {
        const v = await api(`/api/uyeler?q=${encodeURIComponent(aranan)}`);
        setUyeler(v.uyeler);
        setHata(null);
      } catch (e) {
        setHata(e.message);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q, acik]);

  return (
    <Pencere acik={acik} degisti={degisti} baslik={baslik}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-silik" />
        <Giris autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Üye adı yaz" className="pl-9" />
      </div>
      <div className="mt-3 flex max-h-72 flex-col gap-0.5 overflow-y-auto">
        {hata && <p className="py-6 text-center text-sm text-kirmizi">{hata}</p>}
        {!hata && uyeler === null && (
          <p className="flex flex-col items-center gap-2 py-8 text-sm text-silik"><UserRound className="size-6" />Adını yazmaya başla.</p>
        )}
        {!hata && uyeler?.length === 0 && <p className="py-8 text-center text-sm text-silik">Bulunamadı.</p>}
        {uyeler?.map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() => { sec(u); degisti(false); }}
            className="flex items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-yuzey-3"
          >
            <Avatar uye={u} boyut={32} />
            <span className="truncate font-medium">{u.ad}</span>
          </button>
        ))}
      </div>
    </Pencere>
  );
}
