import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Botun canlı olduğunu ve gecikmesini bildirir.');

function gatewayMetni(client) {
  // client.ws.ping ilk heartbeat'ten önce -1 döner; sayı diye göstermeyelim.
  const ping = client.ws.ping;
  return ping < 0 ? 'henüz ölçülmedi' : `${Math.round(ping)} ms`;
}

export async function execute(interaction) {
  const response = await interaction.reply({ content: 'Pong! 🏓', withResponse: true });

  const detay = [`Gateway: ${gatewayMetni(interaction.client)}`];

  // Yanıt süresi İKİ Discord zaman damgasından hesaplanır: etkileşimin kendisi ve
  // Discord'un oluşturduğu yanıt mesajı. Her ikisi de snowflake'ten, yani Discord'un
  // saatinden gelir; botu çalıştıran makinenin saati kaymışsa sonuç bundan etkilenmez.
  // (Date.now() kullanan ilk sürüm, yerel saat 6 sn geri olduğu için "-6121 ms" yazıyordu.)
  const message = response?.resource?.message;
  if (message) {
    detay.push(`Yanıt süresi: ${message.createdTimestamp - interaction.createdTimestamp} ms`);
  }

  await interaction.editReply(`Pong! 🏓\n${detay.join(' · ')}`);
}
