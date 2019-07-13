const config = require("./config")

config.checkDataFiles()

require('./twitch_bot')

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