// ログイン処理
const discord = require('discord.js');
const client = new discord.Client();
module.exports.client = client
const config = require('../config.js')

const token = config.DISCORD_TOKEN;

client.on('message', onMessageHandler);
client.on('ready', onConnectedHandler);

if (token) {
  client.login(token)
} else {
  console.info('DISCORD_TOKEN is not found. please set it at config file')
}

// Bot自身の発言を無視する呪い
function onMessageHandler(message) {
  // eslint-disable-next-line no-empty
  if(message.author.bot){}
  // ↓ここに後述のコードをコピペする↓
  // console.log(message)
  // ↑ここに後述のコードをコピペする↑
}

function onConnectedHandler() {
  console.log('* discord bot is ready...');
}
