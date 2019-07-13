const tmi = require('tmi.js')
const config = require('./config.js')
require('dotenv').config()

const cloudTTS = require('./cloudTTS')

const discordBot = require('./discord_bot.js')
const execSync = require('child_process').execSync
let client

function botUsername() {
  return process.env.BOT_USERNAME || process.env.TW_CHANNEL_NAME + "_bot"
}
// Define configuration options
let opts
if (process.env.TW_OAUTH_TOKEN && process.env.TW_CHANNEL_NAME) {
  opts = {
    identity: {
      username: botUsername(),
      password: process.env.TW_OAUTH_TOKEN
    },
    channels: [
      process.env.TW_CHANNEL_NAME
    ]
  }

  // Create a client with our options
  // eslint-disable-next-line new-cap
  client = new tmi.client(opts)

  // Register our event handlers (defined below)
  client.on('message', onMessageHandler)
  client.on('connected', onConnectedHandler)
  console.log('//////////////////////')
  console.log('//  Ctrl-C to exit  //')
  console.log('//////////////////////')

  // Connect to Twitch:
  client.connect()
} else {
  console.info('TW_OAUTH_TOKEN or TW_CHANNEL_NAME are not found. please set it at ".env" file')
}

// Called every time a message comes in
function onMessageHandler (target, context, msg, self) {
  let displayName = modifiedUsername(context.username)
  console.log(displayName + ": " + msg)
  if (self) { return } // Ignore messages from the bot

  // // DEBUG
  // console.log('target')
  // console.log(target)
  // console.log('context')
  // console.log(context)
  // console.log('msg')
  // console.log(msg)

  // Remove whitespace from chat message
  const commandName = msg.trim()

  // If the command is known, let's execute it
  let isUnknownCommand = false
  if (commandName === '!dice') {
    const num = rollDice()
    client.say(target, `You rolled a ${num}`)
  } else if (process.env.COMMENT_REMEMVER_AVAILABLE === 'true' && commandName.match(/^!(remember|教育)/)) {
    remember(msg, target)
  } else if (process.env.COMMENT_REMEMVER_AVAILABLE === 'true' && commandName.match(/^!(forget|忘却)/)) {
    forget(msg, target)
  } else {
    isUnknownCommand = true
  }
  if (!isUnknownCommand) {
    console.log(`* Executed ${commandName} command`)
  }

  let segment = modifiedMessage(msg)
  let discordSegment, ttsSegment

  if (process.env.READ_USERNAME === 'true') {
    discordSegment = "`" + displayName + "`: " + msg
    ttsSegment = displayName + ": " + segment
  } else {
    discordSegment = msg
    ttsSegment = segment
  }

  // // debug
  // console.log("displayName && segment && !isIgnored")
  // console.log(!!displayName)
  // console.log(!!segment)
  // console.log(!isIgnoredMessage(msg))
  if (displayName && !isIgnoredMessage(msg)) {
    sendToDiscord(discordSegment)
    // TTS
    sendToTts(ttsSegment)
  }
}

function remember(msg, target) {
  try {
    let key = getConfigKey(msg)
    let arr = config.readList(key)
    let attr = getConvertAttributes(msg)
    // console.log('attr')
    // console.log(attr)
    if (!attr) {
      client.say(target, "something wrong!")
      return
    }

    let string = key.includes('username') ? simpleUsername(attr[1]) : attr[1]
    let read = attr[2]

    let index = arr.findIndex(function(record) {
      // console.log(record[0])
      return record[0] === string
    })

    // console.log('index')
    // console.log(index)
    let oldRead = ''
    if (index >= 0) {
      arr[index] = [string, read]
      oldRead = arr[index][1]
      config.writeList(key, arr)

      // // debug
      // console.info('read === oldRead')
      // console.info(read === oldRead)
      // console.info(read)
      // console.info(oldRead)
      if (read === oldRead) {
        client.say(target, string + " is not changed")
      } else {
        client.say(target, string + " is updated" + "(" + oldRead + " => " + read)
      }
    } else {
      arr.push([string, read])
      config.writeList(key, arr)
      client.say(target, string + " is added" + "(=" + read)
    }
  } catch (error) {
    console.error(error)
    infalidConvertCommand(target)
  }
}
function forget(msg, target) {
  try {
    let key = getConfigKey(msg)
    let arr = config.readList(key)
    let attr = getConvertAttributes(msg)

    // // debug
    // console.log('attr')
    // console.log(attr)
    if (!attr) {
      client.say(target, "something wrong!")
      return
    }

    let string = key.includes('username') ? simpleUsername(attr[1]) : attr[1]

    let index = arr.findIndex(function(record) {
      return record[0] === string
    })

    // console.log('index')
    // console.log(index)
    if (index >= 0) {
      let oldRead = arr[index][1]
      arr.splice(index,1)
      config.writeList(key, arr)
      client.say(target, string + "=" + oldRead + " is removed")
    } else {
      client.say(target, string + " is not found")
    }
  } catch (error) {
    console.log(error)
    infalidConvertCommand(target)
  }
}
function getConfigKey(msg) {
  if (msg.match(/^!(rememberU|教育U|forgetU|忘却U)/)) {
    return 'usernameConvertList'
  } else {
    return 'messageConvertList'
  }
}
function getConvertAttributes(msg) {
  const message = msg.trim()
  let res = message.split(' ')
  if (
    (res.length >= 3 && message.match(/^!(remember|教育)/)) ||
    (res.length >= 2 && message.match(/^!(forget|忘却)/))
  ) {
    return res
  }
  return null
}
function infalidConvertCommand(target) {
  client.say(target, `Invalid. commands are "!remember/教育 <keyword> <how_to_read>" to add/update
  and "!forget/忘却 <keyword>" to remove.
  e.g. "!remember hoge fuga", "!rememberU hoge"
  for "username", add "U" to command, e.g. "!rememberU hoge fuga"`)
}

function sendToDiscord(msg) {
  if (!msg) {
    // send to discord
    // console.log('active message')
    return
  }
  const channel = discordBot.client.channels.get(process.env.DISCORD_CHANNEL_ID)
  // console.log('channel')
  // console.log(channel)
  if (channel) {
    channel.send(msg)
  }
}

function splitMessageByWordType(string) {
  let textList = []
  let isEnglish = false
  string.split(' ').filter(v => v).forEach(function(v) {
    let tmpIsEnglish = !!v.match(/^[A-Za-z;:,./'"`@#$%%^&*()_+\-=[]<>{}!?]+$/)
    // console.log(tmpIsEnglish)
    if (isEnglish === tmpIsEnglish && textList.length > 0) {
      textList[textList.length-1] += ' ' + v
    } else {
      textList.push(v)
    }
    isEnglish = tmpIsEnglish
  })
  // console.log(textList)
  return textList
}

async function sendToTts(segment) {
  if (!segment) {
    return
  }

  // for Mac mode
  const SPEAKER_ENGLISH = process.env.SPEAKER_ENGLISH
  const RATE_ENGLISH = process.env.RATE_ENGLISH
  const SPEAKER_JAPANESE = process.env.SPEAKER_JAPANESE
  const RATE_JAPANESE = process.env.RATE_JAPANESE

  let textList = [segment]
  if (process.env.BILINGAL_MODE === 'true') {
    textList = splitMessageByWordType(segment)
  }

  // console.log("Mode: " + process.env.TTS_MODE)
  switch (process.env.TTS_MODE) {
  case 'Mac':
    // console.log('start')
    textList.forEach(function(v) {
      // console.log(!!v.match(/^[A-Za-z:'"` ]+$/))
      if (v.match(/^[A-Za-z:'"` ]+$/)) {
        let option = "[[RATE " + RATE_ENGLISH + "]]"
        segment = v.replace("'", "'\\''")
        execSync("echo '" + option + " " + segment + "' | say -v '" + SPEAKER_ENGLISH + "'")
      } else {
        let option = "[[RATE " + RATE_JAPANESE + "]]"
        segment = v.replace("'", "'\\''")
        execSync("echo '" + option + " " + segment + "' | say -v '" + SPEAKER_JAPANESE + "'")
      }
    })
    // console.log('end')
    break
  case 'CloudTTS':
    // console.log('bilingal: ' + process.env.BILINGAL_MODE)
    if (process.env.BILINGAL_MODE === 'true' ) {
      // for (let index in textList) {
      //   console.log(textList[index])
      // }
      for (let index in textList) {
        // console.log(textList[index])
        // console.log(!!textList[index].match(/^[A-Za-z:'"` ]+$/))
        if (textList[index].match(/^[A-Za-z:'"` ]+$/)) {
          let voideOptions = {
            languageCode: 'en-US',
            name: 'en-US-Wavenet-F',
            ssmlGender: 'FEMALE'
          }
          let playOptions = {}
          await cloudTTS.say(textList[index], voideOptions, playOptions)
        } else {
          let voideOptions = {
            languageCode: 'ja-JP',
            name: 'ja-JP-Wavenet-A',
            ssmlGender: 'FEMALE'
          }
          let playOptions = {}
          await cloudTTS.say(textList[index], voideOptions, playOptions)
        }
      }
    } else {
      // console.log('segment: ' + segment)
      let voideOptions = {
        languageCode: 'ja-JP',
        name: 'ja-JP-Wavenet-A',
        ssmlGender: 'FEMALE'
      }
      let playOptions = {}
      cloudTTS.say(segment, voideOptions, playOptions)
    }
    break
  default:
    break
  }
  // console.log(result)
}

function simpleUsername(username) {
  return username.replace(/_?\d+$/, '')
}
function modifiedUsername(username) {
  let string = simpleUsername(username)
  let def = config.readList('usernameConvertList').find(function(element){
    return element[0] === string
  })
  if (def) {
    return def[1]
  } else {
    return username
  }
}

function modifiedMessage(msg) {
  let message = msg
  let list = config.readList('messageConvertList')
  list.forEach(function(element) {
    let myregex = new RegExp(element[0], 'g')
    message = message.replace(myregex, element[1])
    // console.log(myregex)
    // console.log(message)
  })
  return message
}
function isIgnoredMessage(msg) {
  let list = config.readList('messageIgnoreList')
  let res = list.find(function(element){
    let myregex = new RegExp(element)
    return msg.match(myregex)
  })
  return !!res
}

// Function called when the "dice" command is issued
function rollDice () {
  const sides = 6
  return Math.floor(Math.random() * sides) + 1
}

// Called every time the bot connects to Twitch chat
function onConnectedHandler (addr, port) {
  console.log(`* Connected to ${addr}:${port}`)
}