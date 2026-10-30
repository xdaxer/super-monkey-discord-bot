import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';

import { veritabani } from '../../lib/db.js';
import { prestijDurumu } from '../../lib/prestij.js';
import { bilgiGomusu, onayGomusu, prestijButonlari } from '../../lib/prestij-bilesen.js';

export const sistem = 'ekonomi';
export const modul = 'ekonomi';

export const data = new SlashCommandBuilder()
  .setName('prestij')
  .setDescription('Ekonomi ilerlemeni sıfırla, karşılığında kalıcı muz kazanç çarpanı al.')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) => s
    .setName('bilgi').setDescription('Prestijini, çarpanını, eşiğe ilerlemeni ve neyin sıfırlanacağını gösterir.'))
  .addSubcommand((s) => s
    .setName('yap').setDescription('Prestij yapar (geri dönüşsüz): ilerlemeni sıfırlar, çarpan ve kasa verir. Onay ister.'));

const gizli = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

export async function execute(interaction) {
  const db = veritabani();
  const durum = prestijDurumu(db, interaction.guildId, interaction.user.id);

  if (interaction.options.getSubcommand() === 'bilgi') {
    await interaction.reply({ embeds: [bilgiGomusu(durum)], flags: MessageFlags.Ephemeral });
    return;
  }

  if (durum.enUst) {
    await gizli(interaction, 'En üst prestijdesin, daha fazlası yok.');
    return;
  }
  if (durum.engeller.length > 0) {
    await gizli(interaction, `⛔ Şu an prestij yapamazsın:\n${durum.engeller.map((e) => `• ${e}`).join('\n')}`);
    return;
  }
  if (durum.emek < durum.esik) {
    await gizli(
      interaction,
      `Henüz hazır değilsin: son prestijinden beri **${durum.emek.toLocaleString('tr-TR')}** / `
      + `**${durum.esik.toLocaleString('tr-TR')}** muz emek geliri (günlük, sohbet, çalışma, görev, sefer) kazandın.`,
    );
    return;
  }

  await interaction.reply({
    embeds: [onayGomusu(durum)],
    components: [prestijButonlari(interaction.user.id, durum.seviye)],
    flags: MessageFlags.Ephemeral,
  });
}
