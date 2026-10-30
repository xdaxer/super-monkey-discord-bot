import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';

import { SECENEK_SINIRI } from '../../lib/ayarlar.js';
import { PINGSIZ } from '../../lib/bicim.js';
import { veritabani } from '../../lib/db.js';
import { esyaGetir } from '../../lib/esyalar.js';
import { BORC_YASAK, borcluMu } from '../../lib/kredi.js';
import { emojiCozucu } from '../../lib/kasa-bilesen.js';
import { kartGetir, NADIRLIKLER } from '../../lib/kasalar.js';
import {
  ADET_SINIRI, esyaAdi, mesajBagla, SURE_MS, suresiDolanlariKapat, takasEsyalari, teklifGetir, teklifOlustur,
} from '../../lib/takas.js';
import { takasButonlari, takasGomusu } from '../../lib/takas-bilesen.js';

export const sistem = 'ekonomi';
export const modul = 'ekonomi';

export const data = new SlashCommandBuilder()
  .setName('takas')
  .setDescription('Başka bir üyeyle kart/kasa ve muz takası.')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) => s
    .setName('teklif').setDescription('Bir üyeye takas teklif eder (10 dakika geçerli).')
    .addUserOption((o) => o.setName('uye').setDescription('Kiminle').setRequired(true))
    .addStringOption((o) => o.setName('ver').setDescription('Vereceğin kart/kasa').setAutocomplete(true))
    .addIntegerOption((o) => o
      .setName('ver_adet').setDescription('Kaç tane (varsayılan 1)').setMinValue(1).setMaxValue(ADET_SINIRI))
    .addStringOption((o) => o.setName('iste').setDescription('İstediğin kart/kasa').setAutocomplete(true))
    .addIntegerOption((o) => o
      .setName('iste_adet').setDescription('Kaç tane (varsayılan 1)').setMinValue(1).setMaxValue(ADET_SINIRI))
    .addIntegerOption((o) => o.setName('muz_ver').setDescription('Vereceğin muz (vergiye tabi)').setMinValue(0))
    .addIntegerOption((o) => o.setName('muz_iste').setDescription('İstediğin muz (vergiye tabi)').setMinValue(0)));

/** Otomatik tamamlama satırı: kart/kasa adı ve sahip olunan adet. */
function secenek({ kimlik, adet }) {
  const kart = kartGetir(kimlik);
  const simge = kart ? NADIRLIKLER[kart.nadirlik].simge : esyaGetir(kimlik).yedek;
  return { name: `${simge} ${esyaAdi(kimlik)} ×${adet}`.slice(0, 100), value: kimlik };
}

export async function autocomplete(interaction) {
  const odak = interaction.options.getFocused(true);
  const aranan = String(odak.value ?? '').toLocaleLowerCase('tr-TR');

  // "iste" için karşı tarafın envanteri; üye henüz seçilmediyse boş liste.
  let sahipId = interaction.user.id;
  if (odak.name === 'iste') {
    sahipId = interaction.options.get('uye')?.value;
    if (!sahipId) {
      await interaction.respond([]);
      return;
    }
  }

  const secenekler = takasEsyalari(veritabani(), interaction.guildId, sahipId)
    .map(secenek)
    .filter((s) => !aranan || s.name.toLocaleLowerCase('tr-TR').includes(aranan))
    .slice(0, SECENEK_SINIRI);
  await interaction.respond(secenekler);
}

export async function execute(interaction) {
  const db = veritabani();
  const alici = interaction.options.getUser('uye', true);
  const gizli = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral, ...PINGSIZ });

  if (alici.bot) {
    await gizli('Botlarla takas yapamazsın.');
    return;
  }

  if (interaction.options.getInteger('muz_ver') > 0 && borcluMu(db, interaction.guildId, interaction.user.id)) return gizli(BORC_YASAK);

  // Bakım: süresi dolanları kapat ki açık teklif sınırı doğru sayılsın.
  suresiDolanlariKapat(db);

  const sonuc = teklifOlustur(db, {
    guildId: interaction.guildId,
    tekliEdenId: interaction.user.id,
    karsiId: alici.id,
    verEsya: interaction.options.getString('ver'),
    verAdet: interaction.options.getInteger('ver_adet') ?? 1,
    isteEsya: interaction.options.getString('iste'),
    isteAdet: interaction.options.getInteger('iste_adet') ?? 1,
    muzVer: interaction.options.getInteger('muz_ver') ?? 0,
    muzIste: interaction.options.getInteger('muz_iste') ?? 0,
  });
  if (!sonuc.ok) {
    await gizli(sonuc.sebep);
    return;
  }

  const { teklif } = sonuc;
  const emoji = emojiCozucu(interaction.guild);
  await interaction.reply({
    content: `<@${alici.id}>, <@${interaction.user.id}> sana bir takas teklif etti.`,
    embeds: [takasGomusu(teklif, emoji)],
    components: [takasButonlari(teklif.id)],
    // Yalnız karşı tarafa bildirim gitsin.
    allowedMentions: { users: [alici.id] },
  });

  const mesaj = await interaction.fetchReply().catch(() => null);
  if (!mesaj) return;
  mesajBagla(db, teklif.id, mesaj.channelId, mesaj.id);

  // Süre dolunca mesajı kapat (en iyi çaba; yeniden başlatmada kaybolur,
  // butonlar basıldığında süreyi yine de denetler).
  setTimeout(async () => {
    const guncel = teklifGetir(db, teklif.id);
    if (guncel?.durum !== 'acik') return;
    suresiDolanlariKapat(db);
    await mesaj.edit({
      embeds: [takasGomusu({ ...guncel, durum: 'suresi' }, emoji)], components: [],
    }).catch(() => null);
  }, SURE_MS + 1000).unref();
}
