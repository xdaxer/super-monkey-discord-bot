import {
  InteractionContextType, PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';

import { etiketsiz, gomu, PINGSIZ, sureAyristir, sureBicimle, zaman } from '../../lib/bicim.js';
import { moderasyonHazirlik, redYanit } from '../../lib/moderasyon.js';

export const sistem = 'moderasyon';

/** Discord'un timeout üst sınırı 28 gündür. */
export const EN_UZUN_MS = 28 * 86_400_000;

export const data = new SlashCommandBuilder()
  .setName('sustur')
  .setDescription('Bir kullanıcıyı belirli süre susturur (timeout).')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((o) => o
    .setName('uye').setDescription('Susturulacak kullanıcı').setRequired(true))
  .addStringOption((o) => o
    .setName('sure').setDescription('Örnek: 10dk, 2sa, 1g (en fazla 28g)').setRequired(true))
  .addStringOption((o) => o
    .setName('sebep').setDescription('Susturma gerekçesi').setMaxLength(400));

/**
 * Saf mantık: süre metnini doğrular ve sınırları uygular.
 * @returns {{ok: true, ms: number} | {ok: false, sebep: string}}
 */
export function sureDogrula(metin) {
  const ms = sureAyristir(metin);
  if (ms === null) {
    return { ok: false, sebep: 'Süreyi anlayamadım. Örnek: `10dk`, `2sa`, `1g`.' };
  }
  if (ms > EN_UZUN_MS) {
    return { ok: false, sebep: 'Discord en fazla 28 gün susturmaya izin veriyor.' };
  }
  return { ok: true, ms };
}

export async function execute(interaction) {
  const sure = sureDogrula(interaction.options.getString('sure'));
  if (!sure.ok) {
    await redYanit(interaction, sure.sebep);
    return;
  }

  const hazirlik = await moderasyonHazirlik(interaction, {
    yetkiler: [PermissionFlagsBits.ModerateMembers],
  });
  if (!hazirlik.ok) {
    await redYanit(interaction, hazirlik.sebep);
    return;
  }

  const { hedefUye, hedefKullanici } = hazirlik;
  const sebep = interaction.options.getString('sebep') ?? 'Gerekçe belirtilmedi';

  try {
    await hedefUye.timeout(sure.ms, `${interaction.user.tag}: ${sebep}`);
  } catch (error) {
    await redYanit(interaction, `Susturma başarısız: ${error.message}`);
    return;
  }

  const embed = gomu('uyari', 'Kullanıcı susturuldu')
    .addFields(
      { name: 'Kullanıcı', value: `<@${hedefKullanici.id}>`, inline: true },
      { name: 'Süre', value: sureBicimle(sure.ms), inline: true },
      { name: 'Bitiş', value: zaman(Date.now() + sure.ms), inline: true },
      { name: 'Gerekçe', value: etiketsiz(sebep) },
    );

  await interaction.reply({ embeds: [embed], ...PINGSIZ });
}
