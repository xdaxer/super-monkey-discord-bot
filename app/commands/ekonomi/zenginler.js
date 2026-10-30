import { InteractionContextType, SlashCommandBuilder } from 'discord.js';

import { gomu, PINGSIZ, zaman } from '../../lib/bicim.js';
import { veritabani } from '../../lib/db.js';
import { muz } from '../../lib/ekonomi.js';
import {
  degerMetni, haftaBaslangici, kendiSirasi, SIRALAMA_KIMLIKLERI, SIRALAMA_TURLERI, siralama,
} from '../../lib/siralamalar.js';

export const sistem = 'ekonomi';
export const modul = 'ekonomi';

export const SIRALAMA_ADEDI = 10;

export const data = new SlashCommandBuilder()
  .setName('zenginler')
  .setDescription(`Sunucunun ilk ${SIRALAMA_ADEDI} üyesi: muz, servet, seviye, koleksiyon, seri, prestij ya da haftalık kumar.`)
  .setContexts(InteractionContextType.Guild)
  .addStringOption((o) => o
    .setName('tur').setDescription('Neye göre sıralansın (varsayılan: muz)')
    .addChoices(...SIRALAMA_KIMLIKLERI.map((k) => ({ name: `${SIRALAMA_TURLERI[k].simge} ${SIRALAMA_TURLERI[k].ad}`, value: k }))));

export async function execute(interaction) {
  const db = veritabani();
  const tur = interaction.options.getString('tur') ?? 'muz';
  const bilgi = SIRALAMA_TURLERI[tur] ?? SIRALAMA_TURLERI.muz;
  const guildId = interaction.guildId;
  const simdi = Date.now();

  const liste = siralama(db, guildId, tur, { limit: SIRALAMA_ADEDI, simdi });
  if (liste.length === 0) {
    await interaction.reply({ content: bilgi.bos });
    return;
  }

  const madalya = ['🥇', '🥈', '🥉'];
  const satirlar = liste.map((k, i) => {
    const isaret = madalya[i] ?? `\`#${String(i + 1).padStart(2, ' ')}\``;
    return `${isaret} <@${k.kullanici_id}> — ${degerMetni(tur, k, muz)}`;
  });

  // Kullanıcı ilk 10'da değilse sırası altta ayrıca gösterilir.
  const kendi = kendiSirasi(db, guildId, tur, interaction.user.id, { simdi });
  if (kendi && kendi.sira > SIRALAMA_ADEDI) {
    satirlar.push('', `\`#${kendi.sira}\` <@${kendi.kullanici_id}> — ${degerMetni(tur, kendi, muz)}`);
  }
  if (tur === 'kumar') {
    satirlar.push('', `-# ${zaman(haftaBaslangici(simdi), 'f')} tarihinden (Pazartesi 00:00) beri bahis ve kumar kazancı farkı; kasa ödülleri sayılmaz.`);
  }

  const embed = gomu('bilgi', `${interaction.guild.name} — ${bilgi.baslik}`).setDescription(satirlar.join('\n'));
  // On bir kişi etiketleniyor; PINGSIZ olmasa hepsine bildirim giderdi.
  await interaction.reply({ embeds: [embed], ...PINGSIZ });
}
