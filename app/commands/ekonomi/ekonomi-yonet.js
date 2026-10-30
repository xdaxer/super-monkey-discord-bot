import {
  InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';

import { PINGSIZ } from '../../lib/bicim.js';
import { veritabani } from '../../lib/db.js';
import {
  bakiye, dus, ekle, muz, sifirla, TURLER,
} from '../../lib/ekonomi.js';

export const sistem = 'ekonomi';
/** Yönetici komutu: ekonomi kanal sınırından muaf (lib/kanal-siniri.js). */
export const kanalMuaf = true;
export const modul = 'ekonomi';

const MIKTAR_MAX = 100_000_000;

export const data = new SlashCommandBuilder()
  .setName('ekonomi-yonet')
  .setDescription('(Yönetici) Muz verir, alır ya da sıfırlar; kimseden kesilmez, deftere yazılır.')
  .setContexts(InteractionContextType.Guild)
  // Yalnız Yönetici: muz basmak ekonominin tamamını etkiler.
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((s) => s
    .setName('ver').setDescription('Üyeye yazılan miktarda muz verir; hiçbir yerden kesilmez.')
    .addUserOption((o) => o.setName('uye').setDescription('Kime').setRequired(true))
    .addIntegerOption((o) => o
      .setName('miktar').setDescription('Ne kadar').setRequired(true).setMinValue(1).setMaxValue(MIKTAR_MAX)))
  .addSubcommand((s) => s
    .setName('al').setDescription('Üyeden muz alır (bakiyesinden fazlası alınmaz).')
    .addUserOption((o) => o.setName('uye').setDescription('Kimden').setRequired(true))
    .addIntegerOption((o) => o
      .setName('miktar').setDescription('Ne kadar').setRequired(true).setMinValue(1).setMaxValue(MIKTAR_MAX)))
  .addSubcommand((s) => s
    .setName('sifirla').setDescription('Üyenin bakiyesini sıfırlar.')
    .addUserOption((o) => o.setName('uye').setDescription('Kimin').setRequired(true)));

/**
 * Varsayılan izin, sunucu ayarlarındaki Entegrasyonlar sekmesinden başka
 * rollere açılabilir; komutun kendisi de Yönetici yetkisini arar.
 */
export function yoneticiMi(interaction) {
  return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.Administrator));
}

export async function execute(interaction) {
  if (!yoneticiMi(interaction)) {
    await interaction.reply({ content: '⛔ Bu komutu yalnız **Yönetici** yetkisi olanlar kullanabilir.', flags: MessageFlags.Ephemeral });
    return;
  }

  const db = veritabani();
  const guildId = interaction.guildId;
  const alt = interaction.options.getSubcommand();
  const hedef = interaction.options.getUser('uye', true);
  const yanit = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral, ...PINGSIZ });

  if (hedef.bot) {
    await yanit('Botların bakiyesi tutulmuyor.');
    return;
  }

  const ortak = { guildId, kullaniciId: hedef.id, tur: TURLER.yonetici, karsiId: interaction.user.id };

  if (alt === 'ver') {
    const miktar = interaction.options.getInteger('miktar', true);
    const yeni = ekle(db, { ...ortak, miktar });
    await yanit(`<@${hedef.id}> hesabına **${muz(miktar)}** eklendi. Yeni bakiye: ${muz(yeni)}`);
    return;
  }

  if (alt === 'al') {
    const miktar = Math.min(interaction.options.getInteger('miktar', true), bakiye(db, guildId, hedef.id));
    if (miktar === 0) {
      await yanit(`<@${hedef.id}> hesabında muz yok.`);
      return;
    }
    const yeni = dus(db, { ...ortak, miktar });
    await yanit(`<@${hedef.id}> hesabından **${muz(miktar)}** alındı. Yeni bakiye: ${muz(yeni)}`);
    return;
  }

  const silinen = sifirla(db, { guildId, kullaniciId: hedef.id, yoneticiId: interaction.user.id });
  await yanit(silinen > 0
    ? `<@${hedef.id}> bakiyesi sıfırlandı (${muz(silinen)} silindi).`
    : `<@${hedef.id}> bakiyesi zaten 0.`);
}
