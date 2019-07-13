const config = require("./config")
config.checkDataFiles()

var forever = require('forever-monitor');
// something.js の子プロセスの初期化
var child = new (forever.Monitor)('src/twitch_bot.js', {
  'args': [
    '-some', 'thing' // 子プロセスのパラメータ
  ]
});
// イベントを定義できます
child.on('watch:restart', function(info) {
  console.error('Restaring script because ' + info.file + ' changed');
});
child.on('restart', function() {
  console.error('Forever restarting script for ' + child.times + ' time');
});
child.on('exit:code', function(code) {
  console.error('Forever detected script exited with code ' + code);
});
// プロセススタート
child.start();

// for debug
// const cloudTTS = require('./cloudTTS')
// let voideOptionsJp = {
//   languageCode: 'ja-JP',
//   name: 'ja-JP-Wavenet-A',
//   ssmlGender: 'NEUTRAL'
// }
// let voideOptionsUs = {
//   languageCode: 'en-US',
//   name: 'en-US-Wavenet-F',
//   ssmlGender: 'FEMALE'
// }
// let playOptions = {}
// cloudTTS.say('あいうえお', voideOptionsJp, playOptions)
// cloudTTS.say('sample', voideOptionsUs, playOptions)