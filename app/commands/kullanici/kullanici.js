import { SlashCommandBuilder } from 'discord.js';

import { gomu, PINGSIZ, zaman } from '../../lib/bicim.js';

export const sistem = 'kullanici';

export const data = new SlashCommandBuilder()
  .setName('kullanici')
  .setDescription('Bir kullanıcının bilgilerini gösterir.')
  .addUserOption((o) => o
    .setName('uye').setDescription('Bilgisi gösterilecek kişi (boş bırakırsan sen)'));

/**
 * Saf mantık: gömme alanlarını üretir.
 * `uye` null olabilir (kullanıcı sunucuda değilse); o durumda üyeye özel
 * alanlar atlanır, komut yine çalışır.
 */
export function bilgiAlanlari(kullanici, uye) {
  const alanlar = [
    { name: 'Kullanıcı', value: `${kullanici.tag ?? kullanici.username} (\`${kullanici.id}\`)` },
    { name: 'Hesap oluşturuldu', value: zaman(kullanici.createdTimestamp) },
    { name: 'Bot mu', value: kullanici.bot ? 'Evet' : 'Hayır', inline: true },
  ];

  if (!uye) {
    alanlar.push({
      name: 'Sunucu üyeliği',
      value: 'Bu kullanıcı şu an sunucuda değil.',
    });
    return alanlar;
  }

  alanlar.push({
    name: 'Sunucuya katıldı',
    value: uye.joinedTimestamp ? zaman(uye.joinedTimestamp) : 'bilinmiyor',
  });

  const roller = [...(uye.roles?.cache?.values() ?? [])]
    .filter((rol) => rol.name !== '@everyone')
    .sort((a, b) => b.position - a.position);

  alanlar.push({
    name: `Roller (${roller.length})`,
    value: roller.length > 0
      ? roller.slice(0, 20).map((rol) => `<@&${rol.id}>`).join(' ')
        + (roller.length > 20 ? ` … +${roller.length - 20}` : '')
      : 'Rol yok',
  });

  if (uye.communicationDisabledUntilTimestamp
      && uye.communicationDisabledUntilTimestamp > Date.now()) {
    alanlar.push({
      name: 'Susturma bitişi',
      value: zaman(uye.communicationDisabledUntilTimestamp),
    });
  }

  return alanlar;
}

export async function execute(interaction) {
  const kullanici = interaction.options.getUser('uye') ?? interaction.user;

  // Kullanıcı sunucuda olmayabilir; fetch başarısız olursa üyesiz devam ediyoruz.
  let uye = null;
  try {
    uye = await interaction.guild?.members.fetch(kullanici.id);
  } catch {
    uye = null;
  }

  const embed = gomu('bilgi', kullanici.tag ?? kullanici.username)
    .addFields(bilgiAlanlari(kullanici, uye))
    .setThumbnail(kullanici.displayAvatarURL({ size: 256 }));

  await interaction.reply({ embeds: [embed], ...PINGSIZ });
}
