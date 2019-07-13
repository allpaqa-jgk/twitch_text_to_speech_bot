const list = require('./list.js')
const forever = require('forever-monitor')
const path = require('path')

const config = require('../config.js')
console.info(config)

list.checkDataFiles()

console.log('//////////////////////')
console.log('//  Ctrl-C to exit  //')
console.log('//////////////////////')

if (config === 'development') {
  // something.js の子プロセスの初期化
  var child = new (forever.Monitor)(path.join(__dirname, './twitch_bot.js'), {
  //
  // Options for restarting on watched files.
  //
    'watch': true,               // Value indicating if we should watch files.
    'watchDirectory': 'src',      // Top-level directory to watch from.
  })
  // イベントを定義できます
  child.on('watch:restart', function(info) {
    console.error('Restaring script because ' + info.file + ' changed')
  })
  child.on('restart', function() {
    console.error('Forever restarting script for ' + child.times + ' time')
  })
  child.on('exit:code', function(code) {
    console.error('Forever detected script exited with code ' + code)
  })
  // プロセススタート
  child.start()

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
} else {
  require(path.join(__dirname, './twitch_bot.js'))
}
