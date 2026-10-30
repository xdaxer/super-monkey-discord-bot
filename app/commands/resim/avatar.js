import { SlashCommandBuilder } from 'discord.js';

import { gomu, PINGSIZ } from '../../lib/bicim.js';

export const sistem = 'resim';

export const data = new SlashCommandBuilder()
  .setName('avatar')
  .setDescription('Bir kullanıcının avatarını gösterir.')
  .addUserOption((o) => o
    .setName('uye').setDescription('Avatarı gösterilecek kişi (boş bırakırsan sen)'))
  .addIntegerOption((o) => o
    .setName('boyut').setDescription('Piksel boyutu')
    .addChoices(
      { name: '128', value: 128 }, { name: '256', value: 256 },
      { name: '512', value: 512 }, { name: '1024', value: 1024 }, { name: '4096', value: 4096 },
    ));

/**
 * Global avatar ile sunucuya özel avatarı ayırt eder.
 * Saf mantık: sahte nesnelerle test edilebilir.
 */
export function avatarBaglantilari(kullanici, uye, boyut = 1024) {
  const global = kullanici.displayAvatarURL({ size: boyut });

  // uye.avatar yalnız sunucuya özel avatar varsa doludur.
  const sunucuya_ozel = uye?.avatar ? uye.avatarURL({ size: boyut }) : null;

  return {
    global,
    sunucuya_ozel,
    gosterilecek: sunucuya_ozel ?? global,
    farkliMi: Boolean(sunucuya_ozel),
  };
}

export async function execute(interaction) {
  const kullanici = interaction.options.getUser('uye') ?? interaction.user;
  const boyut = interaction.options.getInteger('boyut') ?? 1024;

  let uye = null;
  try {
    uye = await interaction.guild?.members.fetch(kullanici.id);
  } catch {
    uye = null;
  }

  const baglantilar = avatarBaglantilari(kullanici, uye, boyut);

  const embed = gomu('bilgi', `${kullanici.tag ?? kullanici.username} — avatar`)
    .setImage(baglantilar.gosterilecek);

  const satirlar = [`[Global avatar](${baglantilar.global})`];
  if (baglantilar.farkliMi) {
    satirlar.unshift(`[Sunucuya özel avatar](${baglantilar.sunucuya_ozel})`);
  }
  embed.setDescription(satirlar.join(' · '));

  await interaction.reply({ embeds: [embed], ...PINGSIZ });
}
