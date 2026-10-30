import {
  InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';

import { botYetkisiKontrol } from '../../lib/izin.js';
import { redYanit } from '../../lib/moderasyon.js';

export const sistem = 'moderasyon';

/** Discord toplu silmede 2-100 mesaj ve en fazla 14 günlük mesaj kabul eder. */
export const EN_FAZLA = 100;
export const EN_ESKI_MS = 14 * 86_400_000;

export const data = new SlashCommandBuilder()
  .setName('temizle')
  .setDescription('Kanaldaki son mesajları toplu siler.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addIntegerOption((o) => o
    .setName('adet').setDescription('Kaç mesaj silinsin (1-100)').setRequired(true)
    .setMinValue(1).setMaxValue(EN_FAZLA))
  .addUserOption((o) => o
    .setName('uye').setDescription('Yalnız bu kullanıcının mesajları silinsin'));

/**
 * Saf mantık: 14 günden eski mesajları ve isteğe bağlı kullanıcı filtresini uygular.
 * Discord bulkDelete 14 günden eski mesajı reddettiği için önce biz eliyoruz.
 */
export function silinecekleriSec(mesajlar, { kullaniciId = null, adet = EN_FAZLA, simdi = Date.now() } = {}) {
  return mesajlar
    .filter((m) => simdi - m.createdTimestamp < EN_ESKI_MS)
    .filter((m) => (kullaniciId ? m.author?.id === kullaniciId : true))
    .slice(0, adet);
}

export async function execute(interaction) {
  const botYetki = botYetkisiKontrol(
    interaction.guild.members.me,
    PermissionFlagsBits.ManageMessages,
  );
  if (!botYetki.ok) {
    await redYanit(interaction, botYetki.sebep);
    return;
  }

  const adet = interaction.options.getInteger('adet');
  const kullanici = interaction.options.getUser('uye');

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Filtre varsa daha geniş bir pencere çekiyoruz ki adet kadarını bulabilelim.
  const cekilecek = kullanici ? Math.min(EN_FAZLA, adet * 4) : adet;
  const mesajlar = await interaction.channel.messages.fetch({ limit: cekilecek });

  const secilen = silinecekleriSec([...mesajlar.values()], {
    kullaniciId: kullanici?.id ?? null,
    adet,
  });

  if (secilen.length === 0) {
    await interaction.editReply(
      'Silinecek mesaj bulamadım. 14 günden eski mesajlar toplu silinemez.',
    );
    return;
  }

  try {
    const silinen = await interaction.channel.bulkDelete(secilen, true);
    const atlanan = secilen.length - silinen.size;

    await interaction.editReply(
      `🧹 ${silinen.size} mesaj silindi.`
      + (atlanan > 0 ? ` ${atlanan} mesaj çok eski olduğu için atlandı.` : ''),
    );
  } catch (error) {
    await interaction.editReply(`Silme başarısız: ${error.message}`);
  }
}
