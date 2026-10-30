import {
  InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';

import { ayarGetir } from '../../lib/ayarlar.js';
import { gomu } from '../../lib/bicim.js';
import { veritabani } from '../../lib/db.js';
import { kanalYetkisiKontrol } from '../../lib/izin.js';
import { ASAGI, YUKARI, gecmisiOyla } from '../../lib/oylama.js';

export const sistem = 'oylama';
export const modul = 'oylama';

/** Geçmiş taramasının varsayılan ve en çok tarayacağı mesaj sayısı. */
export const VARSAYILAN_ADET = 1000;
export const EN_FAZLA_ADET = 10_000;

/** İlerleme yazısı bu aralıktan sık güncellenmez; etkileşim düzenleme kotası dar. */
export const ILERLEME_ARALIGI_MS = 5000;

export const data = new SlashCommandBuilder()
  .setName('oylama')
  .setDescription('Oylama kanalındaki tepki düğmelerini yönetir.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addSubcommand((s) => s
    .setName('durum').setDescription('Oylama kanalını ve tepkileri gösterir.'))
  .addSubcommand((s) => s
    .setName('gecmis')
    .setDescription('Kanaldaki eski mesajlara da oy tepkilerini ekler.')
    .addIntegerOption((o) => o
      .setName('adet')
      .setDescription(`Kaç mesaj geriye taransın (varsayılan ${VARSAYILAN_ADET})`)
      .setMinValue(1).setMaxValue(EN_FAZLA_ADET)));

/** Tarama sonucunu tek satırlık özete çevirir. */
export function ozetMetni(sayac) {
  const parcalar = [
    `${sayac.taranan} mesaj tarandı`,
    `${sayac.islenen} mesaja ${sayac.eklenen} tepki eklendi`,
  ];
  if (sayac.kendiOyu > 0) parcalar.push(`${sayac.kendiOyu} kendi oyu kaldırıldı`);
  if (sayac.atlanan > 0) parcalar.push(`${sayac.atlanan} mesaj atlandı (bot/sistem mesajı)`);
  if (sayac.hata > 0) parcalar.push(`${sayac.hata} mesajda hata`);
  return parcalar.join(', ') + '.';
}

/**
 * Ayarlı kanalı çözer ve tepki bırakmaya yetip yetmediğini söyler.
 * @returns {Promise<{ok: true, kanal: object} | {ok: false, sebep: string}>}
 */
async function oylamaKanali(interaction, ...bayraklar) {
  const kanalId = ayarGetir(veritabani(), interaction.guildId, 'oylama.kanal');
  if (!kanalId) {
    return {
      ok: false,
      sebep: 'Oylama kanalı ayarlı değil: `/ayar ayarla anahtar:oylama.kanal kanal:#kanal`.',
    };
  }

  const kanal = await interaction.guild.channels.fetch(kanalId).catch(() => null);
  if (!kanal) {
    return { ok: false, sebep: `Ayarlı oylama kanalı (\`${kanalId}\`) bulunamadı veya silinmiş.` };
  }

  const yetki = kanalYetkisiKontrol(kanal, interaction.guild.members.me, ...bayraklar);
  if (!yetki.ok) return { ok: false, sebep: yetki.sebep };

  return { ok: true, kanal };
}

export async function execute(interaction) {
  const alt = interaction.options.getSubcommand();

  if (alt === 'durum') {
    const kanalId = ayarGetir(veritabani(), interaction.guildId, 'oylama.kanal');
    const embed = gomu('bilgi', 'Oylama')
      .addFields(
        { name: 'Kanal', value: kanalId ? `<#${kanalId}>` : '_ayarlanmamış_' },
        { name: 'Tepkiler', value: `${YUKARI} ${ASAGI}` },
        {
          name: 'Kendine oy',
          value: 'Engelli. Üye kendi mesajına oy basarsa tepkisi hemen geri alınır; '
            + 'böylece sıralama kimin önce kendine oy verdiğiyle belirlenmez.',
        },
        {
          name: 'Geçmiş',
          value: '`/oylama gecmis` eski mesajlara da tepkileri ekler ve daha önce '
            + 'verilmiş kendi oylarını temizler; zaten tepki bırakılmış mesajlar atlanır.',
        },
      );

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  const adet = interaction.options.getInteger('adet') ?? VARSAYILAN_ADET;

  const hedef = await oylamaKanali(
    interaction,
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AddReactions,
    // Kendi oylarını temizlemek başkasının tepkisini kaldırmak demek.
    PermissionFlagsBits.ManageMessages,
  );
  if (!hedef.ok) {
    await interaction.reply({ content: hedef.sebep, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Tepki eklemek mesaj başına iki istek; binlerce mesajda tarama dakikalarca
  // sürebilir, o yüzden arada ilerleme yazıyoruz.
  let sonYazim = 0;
  const ilerleme = ({ taranan, islenen }) => {
    const simdi = Date.now();
    if (simdi - sonYazim < ILERLEME_ARALIGI_MS) return;
    sonYazim = simdi;
    interaction.editReply(
      `⏳ ${hedef.kanal} taranıyor: ${taranan}/${adet} mesaj, ${islenen} mesaja tepki eklendi...`,
    ).catch(() => {});
  };

  try {
    const sayac = await gecmisiOyla(hedef.kanal, {
      botId: interaction.client?.user?.id ?? null,
      adet,
      ilerleme,
    });

    await interaction.editReply(`${YUKARI}${ASAGI} ${hedef.kanal} — ${ozetMetni(sayac)}`);
  } catch (error) {
    await interaction.editReply(`Tarama yarıda kaldı: ${error.message}`);
  }
}
