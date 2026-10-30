import {
  ChannelType, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';

import {
  gomu, PINGSIZ, sureAyristir, zaman,
} from '../../lib/bicim.js';
import { veritabani } from '../../lib/db.js';
import {
  aktifEtkinlikler, ETKINLIK_TURLERI, ETKINLIKLER, etkinlikAdi, etkinlikBaslat, etkinlikBitir, etkinlikGecmisi,
} from '../../lib/etkinlik.js';
import { kanalYetkisiKontrol } from '../../lib/izin.js';
import { yoneticiMi } from './ekonomi-yonet.js';

export const sistem = 'ekonomi';
/** Yönetici komutu: ekonomi kanal sınırından muaf (lib/kanal-siniri.js). */
export const kanalMuaf = true;
export const modul = 'ekonomi';

/** `/ekonomi-etkinlik durum`da gösterilen geçmiş satırı. */
const GECMIS_ADEDI = 10;

const turSecenekleri = ETKINLIK_TURLERI.map((tur) => ({ name: etkinlikAdi(tur).replace(/^\S+ /u, ''), value: tur }));

export const data = new SlashCommandBuilder()
  .setName('ekonomi-etkinlik')
  .setDescription('(Yönetici) Süreli ekonomi etkinlikleri: 2x muz, 2x XP, kasa indirimi, seviye kasası.')
  .setContexts(InteractionContextType.Guild)
  // Yalnız Yönetici: etkinlikler ekonominin tamamını etkiler.
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((s) => s
    .setName('baslat').setDescription('Bir etkinliği başlatır; aynı tür etkinse süresi güncellenir.')
    .addStringOption((o) => o
      .setName('tur').setDescription('Hangi etkinlik').setRequired(true).addChoices(...turSecenekleri))
    .addStringOption((o) => o
      .setName('sure').setDescription('Ne kadar sürsün: 10dk – 7g (örnek: 2sa, 1g)').setRequired(true).setMaxLength(8))
    .addChannelOption((o) => o
      .setName('duyuru_kanali').setDescription('Duyurunun gideceği kanal (boşsa bu kanal)')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
  .addSubcommand((s) => s.setName('durum').setDescription('Etkin etkinlikleri ve son 10 etkinliği gösterir.'))
  .addSubcommand((s) => s
    .setName('bitir').setDescription('Bir etkinliği erkenden bitirir.')
    .addStringOption((o) => o
      .setName('tur').setDescription('Hangi etkinlik').setRequired(true).addChoices(...turSecenekleri)));

/** Duyuru embed'i: etkinlik adı, etkisi, bitiş. */
export function duyuruEmbed(tur, bitis) {
  return gomu('basari', `🎉 Etkinlik başladı: ${etkinlikAdi(tur)}`)
    .setDescription(`${ETKINLIKLER[tur].etki}\n\nBitiş: ${zaman(bitis, 'R')} (${zaman(bitis, 'F')})`);
}

export async function execute(interaction) {
  if (!yoneticiMi(interaction)) {
    await interaction.reply({ content: '⛔ Bu komutu yalnız **Yönetici** yetkisi olanlar kullanabilir.', flags: MessageFlags.Ephemeral });
    return;
  }

  const db = veritabani();
  const guildId = interaction.guildId;
  const alt = interaction.options.getSubcommand();
  const yanit = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral, ...PINGSIZ });

  if (alt === 'durum') {
    const liste = aktifEtkinlikler(db, guildId);
    const gecmis = etkinlikGecmisi(db, guildId, { limit: GECMIS_ADEDI });
    const embed = gomu('bilgi', '🎉 Etkinlikler').setDescription(liste.length > 0
      ? liste.map((e) => `${etkinlikAdi(e.tur)} — ${ETKINLIKLER[e.tur].etki}\nBitiş: ${zaman(e.bitis, 'R')} · başlatan <@${e.baslatan}>`).join('\n\n')
      : 'Etkin etkinlik yok. Başlatmak için `/ekonomi-etkinlik baslat`.');
    if (gecmis.length > 0) {
      embed.addFields({
        name: `Son ${gecmis.length} etkinlik`,
        value: gecmis.map((e) => `${etkinlikAdi(e.tur)} · ${zaman(e.baslangic, 'f')} → ${zaman(e.bitis, 'f')}`
          + `${e.erken ? ' (erken bitti)' : ''} · <@${e.baslatan}>`).join('\n').slice(0, 1024),
      });
    }
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral, ...PINGSIZ });
    return;
  }

  const tur = interaction.options.getString('tur', true);

  if (alt === 'bitir') {
    await yanit(etkinlikBitir(db, guildId, tur)
      ? `${etkinlikAdi(tur)} etkinliği bitirildi.`
      : `${etkinlikAdi(tur)} zaten etkin değildi.`);
    return;
  }

  const sureMs = sureAyristir(interaction.options.getString('sure', true));
  if (sureMs === null) {
    await yanit('Süreyi anlayamadım. Örnek: `30dk`, `2sa`, `1g` (en az 10 dakika, en çok 7 gün).');
    return;
  }
  const sonuc = etkinlikBaslat(db, { guildId, tur, sureMs, baslatanId: interaction.user.id });
  if (!sonuc.ok) {
    await yanit(sonuc.sebep);
    return;
  }

  // Duyuru: seçilen kanala, yoksa komutun yazıldığı kanala; kimse etiketlenmez.
  const kanal = interaction.options.getChannel('duyuru_kanali') ?? interaction.channel;
  const botUye = interaction.guild?.members?.me;
  const gonderilebilir = kanal?.isTextBased?.()
    && (!botUye || kanalYetkisiKontrol(kanal, botUye, PermissionFlagsBits.SendMessages).ok);
  const gonderildi = gonderilebilir
    ? await kanal.send({ embeds: [duyuruEmbed(tur, sonuc.bitis)], ...PINGSIZ }).then(() => true, () => false)
    : false;

  await yanit(`${etkinlikAdi(tur)} ${sonuc.guncellendi ? 'süresi güncellendi' : 'başlatıldı'}, bitiş ${zaman(sonuc.bitis, 'R')}.`
    + (gonderildi ? ` Duyuru <#${kanal.id}> kanalına gönderildi.` : ' Duyuru gönderilemedi (kanal yetkisini kontrol et).'));
}
