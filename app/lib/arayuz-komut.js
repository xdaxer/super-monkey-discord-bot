import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';

/**
 * Ekonomi yalnız Activity arayüzünden oynanır. Aşağıdaki komutların eski
 * işleyicileri commands/ekonomi/ içinde olduğu gibi durur ama yüklenmez:
 * komut adı seçeneksiz kaydedilir ve çalıştırılınca arayüzü başlatır.
 * Bir komutu eski haline döndürmek için buradaki listeden çıkarmak yeter.
 *
 * `ekran`/`secenek`: arayüz açılınca gidilecek ekran (activity/src/ekranlar).
 */
export const ARAYUZ_KOMUTLARI = {
  cuzdan: { ekran: 'ana' },
  gunluk: { ekran: 'ana' },
  calis: { ekran: 'ana' },
  maymun: { ekran: 'maymunlar' },
  gonder: { ekran: 'ana' },
  profil: { ekran: 'ana' },
  gorev: { ekran: 'gorevler' },
  basarim: { ekran: 'gorevler', secenek: { sekme: 'basarimlar' } },
  zenginler: { ekran: 'siralama' },
  kumar: { ekran: 'kumar' },
  duello: { ekran: 'sosyal', secenek: { sekme: 'duello' } },
  takas: { ekran: 'sosyal', secenek: { sekme: 'takas' } },
  boss: { ekran: 'boss' },
  magaza: { ekran: 'magaza' },
  envanter: { ekran: 'envanter' },
  kasa: { ekran: 'envanter', secenek: { sekme: 'kasalar' } },
  hisse: { ekran: 'borsa' },
  banka: { ekran: 'finans', secenek: { sekme: 'mevduat' } },
  kredi: { ekran: 'finans', secenek: { sekme: 'kredi' } },
  piyango: { ekran: 'finans', secenek: { sekme: 'piyango' } },
  prestij: { ekran: 'prestij' },
};

/** Hiç kaydedilmeyen komutlar: işlerini arayüzün Yönetim ekranı yapıyor. */
export const KAPALI_KOMUTLAR = new Set(['ekonomi-yonet', 'ekonomi-etkinlik', 'ekonomi-panel']);

// Komutla açılan arayüz hangi ekrana gitsin: kullanıcı → { ekran, secenek, zaman }.
// Bellekte durur; arayüz açılışta bir kez okur. Bot yeniden başlarsa arayüz
// son kalınan ekrandan açılır, başka bir şey kaybolmaz.
const acilislar = new Map();
const ACILIS_OMRU_MS = 2 * 60_000;

export function acilisYaz(kullaniciId, ekran, secenek = {}, simdi = Date.now()) {
  acilislar.set(kullaniciId, { ekran, secenek, zaman: simdi });
}

/** İsteği okur ve siler; süresi geçmişse ya da yoksa null. */
export function acilisAl(kullaniciId, simdi = Date.now()) {
  const kayit = acilislar.get(kullaniciId);
  acilislar.delete(kullaniciId);
  if (!kayit || simdi - kayit.zaman > ACILIS_OMRU_MS) return null;
  return { ekran: kayit.ekran, secenek: kayit.secenek };
}

/**
 * Eski komutun yerine geçen başlatıcı: adı ve açıklaması aynı, seçeneği yok.
 * Sistem ve kanal denetimi (lib/interactions.js) eskisi gibi uygulanır.
 */
export function arayuzKomutu(asil) {
  const ad = asil.data.name;
  const { ekran, secenek } = ARAYUZ_KOMUTLARI[ad];
  const data = new SlashCommandBuilder()
    .setName(ad)
    .setDescription(`${asil.data.description}`.slice(0, 100))
    .setContexts(InteractionContextType.Guild);

  async function execute(interaction) {
    acilisYaz(interaction.user.id, ekran, secenek);
    try {
      await interaction.launchActivity();
    } catch (error) {
      // Activity bu kanalda/istemcide açılamıyorsa üye sessiz kalmasın.
      console.warn(`/${ad}: arayüz başlatılamadı: ${error.message}`);
      await interaction.reply({
        content: 'Ekonomi artık yalnız **Muz Ekonomisi** arayüzünden oynanıyor ama arayüz burada açılamadı. '
          + 'Sohbet kutusundaki 🚀 Etkinlikler menüsünden aç.',
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
    }
  }

  return { data, execute };
}
