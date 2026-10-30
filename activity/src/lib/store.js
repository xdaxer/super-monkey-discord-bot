import { create } from 'zustand';

/**
 * Uygulama geneli durum: giriş yapan üye, katalog (kart/eşya/para görselleri)
 * ve canlı bakiye. Bakiye API yanıtındaki üst düzey `bakiye` alanından
 * kendiliğinden güncellenir (lib/api.js).
 */
export const useUygulama = create((set) => ({
  kullanici: null,
  katalog: null,
  bakiye: null,
  ekran: 'ana',
  ekranSecenek: {},
  // Bekleyen grev ({bitis}) ya da null; grevSayac her grev bitişinde artar (çalış kartı yenilensin).
  grev: null,
  grevSayac: 0,
  // Ekonomiden uzaklaştırma ({sebep, zaman}) ya da null; `uzakOnizleme` yöneticinin
  // pencereyi kendi önünde denemesi (kapatılabilir, işlem yapmaz).
  uzak: null,
  uzakOnizleme: null,
  setUzak: (uzak) => set({ uzak }),
  uzakOnizle: (uzakOnizleme) => set({ uzakOnizleme }),
  grevAyarla: (grev) => set({ grev }),
  grevBitir: () => set((s) => ({ grev: null, grevSayac: s.grevSayac + 1 })),
  setKullanici: (kullanici) => set({ kullanici }),
  // Para simgesi sunucuda bir Discord emojisi (resim); arayüz emoji kullanmaz,
  // Gorsel onu muz ikonuyla çizer (lib/emoji.jsx).
  setKatalog: (k) => set({
    katalog: { ...k, para: { url: null, metin: '🍌' }, kartlarHarita: new Map(k.kartlar.map((x) => [x.kimlik, x])), esyalarHarita: new Map(k.esyalar.map((x) => [x.kimlik, x])) },
  }),
  setBakiye: (bakiye) => set((s) => (typeof bakiye === 'number' && bakiye !== s.bakiye ? { bakiye } : s)),
  /** Başka ekrana geç: git('envanter', { sekme: 'kasalar' }) */
  git: (ekran, ekranSecenek = {}) => set({ ekran, ekranSecenek }),
}));

/** React dışından (api.js, animasyon sonları) bakiye güncellemesi. */
export const bakiyeGuncelle = (b) => useUygulama.getState().setBakiye(b);
export const git = (ekran, secenek) => useUygulama.getState().git(ekran, secenek);

/** Katalogdan kart ya da eşya (kimlikle); yoksa null. */
export function nesne(kimlik) {
  const k = useUygulama.getState().katalog;
  return k?.kartlarHarita.get(kimlik) ?? k?.esyalarHarita.get(kimlik) ?? null;
}

export function nadirlik(kimlik) {
  return useUygulama.getState().katalog?.nadirlikler.find((n) => n.kimlik === kimlik) ?? null;
}
