import {
  AutoModerationActionType, AutoModerationRuleEventType, AutoModerationRuleKeywordPresetType,
  AutoModerationRuleTriggerType, InteractionContextType, MessageFlags, PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';

import { gomu, PINGSIZ } from '../../lib/bicim.js';
import { botYetkisiKontrol } from '../../lib/izin.js';

export const sistem = 'guvenlik';

/**
 * ÖNEMLİ: Bu komut Discord'un YERLEŞİK AutoMod'unu REST üzerinden yönetir.
 * Filtreleme Discord tarafında yapıldığı için botun MessageContent intent'ine
 * ihtiyacı yoktur — ayrıcalıklı intent kapalıyken de çalışır.
 */
export const SABLONLAR = {
  kufur: {
    etiket: 'Küfür ve hakaret filtresi',
    kur: () => ({
      name: 'Küfür filtresi',
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.KeywordPreset,
      triggerMetadata: {
        presets: [
          AutoModerationRuleKeywordPresetType.Profanity,
          AutoModerationRuleKeywordPresetType.SexualContent,
          AutoModerationRuleKeywordPresetType.Slurs,
        ],
      },
      actions: [{ type: AutoModerationActionType.BlockMessage }],
      enabled: true,
    }),
  },
  spam: {
    etiket: 'Spam filtresi',
    kur: () => ({
      name: 'Spam filtresi',
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.Spam,
      actions: [{ type: AutoModerationActionType.BlockMessage }],
      enabled: true,
    }),
  },
  mentionbaskini: {
    etiket: 'Etiket baskını koruması (5 etiket sınırı)',
    kur: () => ({
      name: 'Etiket baskını koruması',
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.MentionSpam,
      triggerMetadata: { mentionTotalLimit: 5 },
      actions: [{ type: AutoModerationActionType.BlockMessage }],
      enabled: true,
    }),
  },
};

export const data = new SlashCommandBuilder()
  .setName('automod')
  .setDescription('Discord yerleşik AutoMod kurallarını yönetir.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((s) => s
    .setName('liste').setDescription('Sunucudaki AutoMod kurallarını listeler.'))
  .addSubcommand((s) => s
    .setName('kur').setDescription('Hazır bir AutoMod kuralı oluşturur.')
    .addStringOption((o) => o
      .setName('sablon').setDescription('Hangi koruma').setRequired(true)
      .addChoices(...Object.entries(SABLONLAR).map(([ad, t]) => ({ name: t.etiket, value: ad })))))
  .addSubcommand((s) => s
    .setName('sil').setDescription('Bir AutoMod kuralını siler.')
    .addStringOption((o) => o
      .setName('id').setDescription('Kural kimliği (/automod liste ile öğren)').setRequired(true)));

const TRIGGER_ADLARI = {
  [AutoModerationRuleTriggerType.Keyword]: 'Anahtar kelime',
  [AutoModerationRuleTriggerType.Spam]: 'Spam',
  [AutoModerationRuleTriggerType.KeywordPreset]: 'Hazır kelime listesi',
  [AutoModerationRuleTriggerType.MentionSpam]: 'Etiket baskını',
};

export async function execute(interaction) {
  const botYetki = botYetkisiKontrol(interaction.guild.members.me, PermissionFlagsBits.ManageGuild);
  if (!botYetki.ok) {
    await interaction.reply({ content: `⛔ ${botYetki.sebep}`, flags: MessageFlags.Ephemeral });
    return;
  }

  const alt = interaction.options.getSubcommand();

  if (alt === 'liste') {
    const kurallar = await interaction.guild.autoModerationRules.fetch();

    if (kurallar.size === 0) {
      await interaction.reply({
        content: 'Bu sunucuda hiç AutoMod kuralı yok. `/automod kur` ile ekleyebilirsin.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const satirlar = [...kurallar.values()].map((k) => (
      `${k.enabled ? '🟢' : '⚪'} **${k.name}** — ${TRIGGER_ADLARI[k.triggerType] ?? k.triggerType}\n`
      + `\`${k.id}\``
    ));

    const embed = gomu('bilgi', `AutoMod kuralları (${kurallar.size})`)
      .setDescription(satirlar.join('\n\n').slice(0, 4000));

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral, ...PINGSIZ });
    return;
  }

  if (alt === 'kur') {
    const sablonAdi = interaction.options.getString('sablon');
    const sablon = SABLONLAR[sablonAdi];

    try {
      const kural = await interaction.guild.autoModerationRules.create({
        ...sablon.kur(),
        reason: `${interaction.user.tag} /automod kur ${sablonAdi}`,
      });

      await interaction.reply({
        content: `✅ **${sablon.etiket}** kuruldu.\nKural kimliği: \`${kural.id}\``,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      await interaction.reply({
        content: `⛔ Kural oluşturulamadı: ${error.message}`,
        flags: MessageFlags.Ephemeral,
      });
    }
    return;
  }

  if (alt === 'sil') {
    const id = interaction.options.getString('id');

    try {
      await interaction.guild.autoModerationRules.delete(id, `${interaction.user.tag} /automod sil`);
      await interaction.reply({
        content: `🗑️ \`${id}\` kuralı silindi.`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      await interaction.reply({
        content: `⛔ Silinemedi: ${error.message}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
