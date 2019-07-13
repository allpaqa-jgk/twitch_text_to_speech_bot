const list = require('./src/list.js')
const forever = require('forever-monitor')

const path = require('path')
process.env.NODE_CONFIG_DIR = path.join(__dirname, './config')
const config = require('config')
console.info(config)

list.checkDataFiles()

console.log('//////////////////////')
console.log('//  Ctrl-C to exit  //')
console.log('//////////////////////')


// =================== tmp inport ===================

const execSync = require('child_process').execSync
let result
console.log(__dirname)
process.cwd = __dirname

result =  execSync('pwd').toString()
console.log(result)
result =  execSync(`cd ${__dirname}`).toString()
console.log(result)
result =  execSync('pwd').toString()
console.log(result)

// general
// console.info('import fs')
// const fs = require('fs')
// // const path = require('path')

// console.info('import grpc')
// const grpc = require('grpc')

// tw_bot
console.info('import tmi')
const tmi = require('tmi.js')
// // const list = require('./list.js')
// // const cloudTTS = require('./cloudTTS')
// console.info('import discordBot')
// const discordBot = require('./discord_bot')
// console.info('import execSync')
// const execSync = require('child_process').execSync
// console.info('import dice')
// const dice = require('./commands/dice')

// // cloudTTS
// console.info('import util')
// const util = require('util')
console.info('import player')
const player = require('play-sound')()
// // const path = require('path')
console.info('import textToSpeech')
const textToSpeech = require('@google-cloud/text-to-speech')

// // discord_bot
console.info('import discord')
const discord = require('discord.js')

// // list
console.info('import csv')
const csv = require('csv')
console.info('import csvSync')
const csvSync = require('csv-parse/lib/sync')
// =================== tmp inport ===================

if (config.ENV === 'development') {
  console.log('dev mode!')
  // something.js の子プロセスの初期化
  var child = new (forever.Monitor)(path.join(__dirname, './src/twitch_bot.js'), {
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
  require(path.join(__dirname, './src/twitch_bot.js'))
}
