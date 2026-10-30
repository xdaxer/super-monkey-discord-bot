import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';

import { ayarGetir } from '../../lib/ayarlar.js';
import { veritabani } from '../../lib/db.js';
import { bakiye, gonder, miktarAyristir, muz } from '../../lib/ekonomi.js';
import { gorevBildir } from '../../lib/gorev-bilesen.js';
import { kullaniciGetir } from '../../lib/seviye.js';

export const sistem = 'ekonomi';
export const modul = 'ekonomi';

export const data = new SlashCommandBuilder()
  .setName('gonder')
  .setDescription('Başka bir üyeye muz gönderir (vergi kesilir).')
  .setContexts(InteractionContextType.Guild)
  .addUserOption((o) => o.setName('uye').setDescription('Kime').setRequired(true))
  .addStringOption((o) => o
    .setName('miktar').setDescription('Ne kadar: 500, 2.5k, yarı, hepsi').setRequired(true).setMaxLength(20));

export async function execute(interaction) {
  const db = veritabani();
  const guildId = interaction.guildId;
  const alici = interaction.options.getUser('uye', true);
  const gizli = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

  if (alici.bot) {
    await gizli('Botlara muz gönderemezsin.');
    return;
  }

  const ayrisan = miktarAyristir(interaction.options.getString('miktar', true), bakiye(db, guildId, interaction.user.id));
  if (!ayrisan.ok) {
    await gizli(ayrisan.sebep);
    return;
  }

  const sonuc = gonder(db, {
    guildId,
    gonderenId: interaction.user.id,
    aliciId: alici.id,
    miktar: ayrisan.miktar,
    seviye: kullaniciGetir(db, guildId, interaction.user.id).seviye,
    vergiYuzde: ayarGetir(db, guildId, 'ekonomi.vergiYuzde'),
  });

  if (!sonuc.ok) {
    await gizli(sonuc.sebep);
    return;
  }

  const vergi = sonuc.vergi > 0 ? ` (${muz(sonuc.vergi)} vergi kesildi)` : '';
  await interaction.reply({
    content: `💸 <@${interaction.user.id}> → <@${alici.id}>: **${muz(sonuc.net)}**${vergi}`,
    // Yalnız alıcıya bildirim gitsin.
    allowedMentions: { users: [alici.id] },
  });
  await gorevBildir(interaction, [{ tur: 'gonder', miktar: ayrisan.miktar }]);
}
