import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';

import { ayarGetir } from '../../lib/ayarlar.js';
import { PINGSIZ } from '../../lib/bicim.js';
import { veritabani } from '../../lib/db.js';
import {
  DUELLO_SURE_MS, duelloAc, duelloBahisKontrol, mesajIdKaydet, rakipKontrol, secimBelirle, suresiDolaniIadeEt,
} from '../../lib/duello.js';
import { duelloButonlari, kapaliGomu, meydanGomusu } from '../../lib/duello-bilesen.js';
import { bakiye, miktarAyristir } from '../../lib/ekonomi.js';
import { BORC_YASAK, borcluMu } from '../../lib/kredi.js';
import { BAHIS_MIN, bahisTavani } from '../../lib/kumar.js';
import { kullaniciGetir } from '../../lib/seviye.js';

export const sistem = 'ekonomi';
export const modul = 'ekonomi';

export const data = new SlashCommandBuilder()
  .setName('duello')
  .setDescription('Bir üyeye muz bahsiyle düello meydan oku.')
  .setContexts(InteractionContextType.Guild)
  .addUserOption((o) => o
    .setName('uye').setDescription('Meydan okuyacağın üye').setRequired(true))
  .addStringOption((o) => o
    .setName('bahis').setDescription(`Her ikiniz de ne kadar yatırırsınız: en az ${BAHIS_MIN}; 500, 2.5k, yarı, hepsi`)
    .setRequired(true).setMaxLength(20))
  .addStringOption((o) => o
    .setName('oyun').setDescription('Hangi oyun').setRequired(true)
    .addChoices(
      { name: 'Zar (ikişer zar, büyük toplam kazanır)', value: 'zar' },
      { name: 'Yazı-tura', value: 'yazitura' },
      { name: 'At yarışı (iki at, biri senin biri rakibin)', value: 'at' },
      { name: 'XOX (sırayla oynanır, hamle başı 60 sn)', value: 'xox' },
    ))
  .addStringOption((o) => o
    .setName('secim').setDescription('Yazı-tura için senin seçimin (boşsa rastgele)')
    .addChoices({ name: 'Yazı', value: 'yazi' }, { name: 'Tura', value: 'tura' }));

function gizli(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

/**
 * Bahis metnini ayrıştırıp kumarla aynı sınırlara göre doğrular. Tavan iki
 * tarafın seviye tavanının küçüğü: yeni üye büyük bahse çekilemesin.
 */
function bahisCoz(db, interaction, rakip) {
  const g = interaction.guildId;
  const mevcut = bakiye(db, g, interaction.user.id);
  const ayar = ayarGetir(db, g, 'ekonomi.maksBahis');
  const maks = Math.min(
    bahisTavani(kullaniciGetir(db, g, interaction.user.id).seviye, ayar),
    bahisTavani(kullaniciGetir(db, g, rakip.id).seviye, ayar),
  );
  const ham = interaction.options.getString('bahis', true);

  const ayrisan = miktarAyristir(ham, mevcut);
  if (!ayrisan.ok) return ayrisan;

  // "hepsi" / "yarı" sınırı aşıyorsa sınırdan oynamak kullanıcının niyetine en yakın davranış.
  const goreli = !/\d/.test(ham);
  const miktar = goreli ? Math.min(ayrisan.miktar, maks) : ayrisan.miktar;

  const kontrol = duelloBahisKontrol(miktar, mevcut, maks);
  return kontrol.ok ? { ok: true, miktar } : kontrol;
}

export async function execute(interaction) {
  const db = veritabani();
  const guildId = interaction.guildId;
  const rakip = interaction.options.getUser('uye', true);

  if (borcluMu(db, guildId, interaction.user.id)) return gizli(interaction, BORC_YASAK);

  const kontrol = rakipKontrol(interaction.user.id, rakip);
  if (!kontrol.ok) {
    await gizli(interaction, kontrol.sebep);
    return;
  }

  const bahis = bahisCoz(db, interaction, rakip);
  if (!bahis.ok) {
    await gizli(interaction, bahis.sebep);
    return;
  }

  const oyun = interaction.options.getString('oyun', true);
  const secim = oyun === 'yazitura' ? secimBelirle(interaction.options.getString('secim')) : null;

  const acilan = duelloAc(db, {
    guildId, kanalId: interaction.channelId, meydanId: interaction.user.id, rakipId: rakip.id,
    bahis: bahis.miktar, oyun, secim,
  });
  if (!acilan.ok) {
    await gizli(interaction, acilan.sebep);
    return;
  }

  const { duello } = acilan;
  const yanit = await interaction.reply({
    content: `<@${rakip.id}>`,
    embeds: [meydanGomusu(duello)],
    components: [duelloButonlari(duello.id)],
    allowedMentions: { users: [rakip.id] },
    withResponse: true,
  });
  const mesajId = yanit?.resource?.message?.id;
  if (mesajId) mesajIdKaydet(db, duello.id, mesajId);

  // Süre dolunca emanet iade edilir ve mesaj kapatılır. Bot bu arada kapanırsa
  // açılıştaki toplu iade devreye girer; eski düğmeler "geçerli değil" der.
  setTimeout(async () => {
    try {
      const iade = suresiDolaniIadeEt(db, duello.id);
      if (!iade) return;
      await interaction.editReply({
        content: '',
        embeds: [kapaliGomu(iade, 'süre doldu')],
        components: [],
        ...PINGSIZ,
      });
    } catch (error) {
      console.error('Düello süre aşımı işlenemedi:', error.message);
    }
  }, DUELLO_SURE_MS + 500).unref();
}
