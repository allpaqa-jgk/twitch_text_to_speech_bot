const list = require('./src/list.js')
const forever = require('forever-monitor')
const path = require('path')
const fs = require('fs')

// init process.env
process.env.NODE_CONFIG_DIR = path.join(__dirname, './config')

list.checkDataFiles()

console.log('//////////////////////')
console.log('//  Ctrl-C to exit  //')
console.log('//////////////////////')

if(process.env.NODE_ENV === 'development') {
  console.log('//////////////////////')
  console.log('//    DEV mode!     //')
  console.log('//////////////////////')
  // something.js の子プロセスの初期化
  var child = new (forever.Monitor)(path.join(__dirname, './src/twitchBot.js'), {
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

  checkConfig()
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
  checkConfig()
  require(path.join(__dirname, './src/twitchBot.js'))
}

function checkConfig() {
  console.log('//////////////////////')
  console.log('// Checking config  //')
  console.log('//////////////////////')
  if (fs.existsSync(path.join(__dirname, './config/serviceAccount.json'))) {
    console.info('overwrite GOOGLE_APPLICATION_CREDENTIALS!')
    process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(__dirname, './config/serviceAccount.json')
  } else if (fs.existsSync(path.join(__dirname, './config/service_account.json'))) {
    console.info('overwrite GOOGLE_APPLICATION_CREDENTIALS!')
    process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(__dirname, './config/service_account.json')
  }
  // load config
  const config = require('config')
  // console.info(config)

  let configWarning = []
  if (!config.TW_OAUTH_TOKEN) {
    configWarning.push('TW_OAUTH_TOKEN are not found. please set it at config file')
  }
  if (!config.TW_CHANNEL_NAME) {
    configWarning.push('TW_CHANNEL_NAME are not found. please set it at config file')
  }
  if (config.TTS_MODE === 'CloudTTS' && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    configWarning.push('GOOGLE_APPLICATION_CREDENTIALS are not found. please set it at PATH or serviceAccount.json')
  }

  if (configWarning) {
    configWarning.forEach(warn => {
      console.log(`WARNING: ${warn}`)
    });
    console.log('')
  }
}
