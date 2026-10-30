import {
  InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';

import {
  anketHazirla, bitirilebilirMi, EN_COK_SECENEK, mesajHedefi, saateCevir,
  seceneklerAyristir, SORU_SINIRI, VARSAYILAN_SAAT,
} from '../../lib/anket.js';
import { PINGSIZ, sureAyristir } from '../../lib/bicim.js';

export const sistem = 'anket';
export const modul = 'anket';

export const data = new SlashCommandBuilder()
  .setName('anket')
  .setDescription('Bu kanalda seçenekli anket açar veya açık bir anketi bitirir.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addSubcommand((s) => s
    .setName('olustur').setDescription('Komutu yazdığın kanalda anket açar.')
    .addStringOption((o) => o
      .setName('soru').setDescription('Anket sorusu').setRequired(true).setMaxLength(SORU_SINIRI))
    .addStringOption((o) => o
      .setName('secenekler')
      .setDescription(`Virgülle ya da | ile ayır (2-${EN_COK_SECENEK}): Pizza | Lahmacun | Döner`)
      .setRequired(true)
      .setMaxLength(1000))
    .addStringOption((o) => o
      .setName('sure').setDescription(`Süre: 2sa, 3g gibi (varsayılan ${VARSAYILAN_SAAT}sa, en çok 32g)`))
    .addBooleanOption((o) => o
      .setName('coklu').setDescription('Birden fazla seçenek işaretlenebilsin mi (varsayılan hayır)')))
  .addSubcommand((s) => s
    .setName('bitir').setDescription('Açık bir anketi süresi dolmadan kapatır.')
    .addStringOption((o) => o
      .setName('mesaj').setDescription('Anket mesajının bağlantısı veya kimliği').setRequired(true)));

export async function execute(interaction) {
  const alt = interaction.options.getSubcommand();

  if (alt === 'olustur') {
    const sureMetni = interaction.options.getString('sure');
    const saat = sureMetni ? saateCevir(sureAyristir(sureMetni)) : VARSAYILAN_SAAT;

    const hazir = anketHazirla({
      soru: interaction.options.getString('soru'),
      secenekler: seceneklerAyristir(interaction.options.getString('secenekler')),
      saat,
      coklu: interaction.options.getBoolean('coklu') ?? false,
    });
    if (!hazir.ok) {
      await interaction.reply({ content: hazir.sebep, flags: MessageFlags.Ephemeral });
      return;
    }

    // Anket komutun yanıtı olarak gönderiliyor: yazıldığı kanala düşüyor ve
    // üstünde kimin açtığı görünüyor. Botun kanalda ayrıca mesaj gönderme
    // yetkisi olması gerekmiyor.
    await interaction.reply({ poll: hazir.poll, ...PINGSIZ });
    return;
  }

  if (alt === 'bitir') {
    const hedef = mesajHedefi(interaction.options.getString('mesaj'));
    if (!hedef) {
      await interaction.reply({
        content: 'Geçerli bir mesaj bağlantısı veya kimliği ver (mesaja sağ tık → Bağlantıyı Kopyala).',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const kanal = hedef.kanalId
      ? await interaction.guild.channels.fetch(hedef.kanalId).catch(() => null)
      : interaction.channel;
    const mesaj = kanal?.isTextBased?.()
      ? await kanal.messages.fetch(hedef.mesajId).catch(() => null)
      : null;

    if (!mesaj) {
      await interaction.reply({
        content: 'Mesaj bulunamadı. Başka kanaldaysa kimlik yerine mesaj bağlantısını ver.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const uygun = bitirilebilirMi(mesaj, interaction.client.user.id);
    if (!uygun.ok) {
      await interaction.reply({ content: uygun.sebep, flags: MessageFlags.Ephemeral });
      return;
    }

    await mesaj.poll.end();
    await interaction.reply({
      content: `🗳️ Anket bitirildi: ${mesaj.url}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
