const tmi = require('tmi.js')
const list = require('./list.js')
const config = require('config')

const cloudTTS = require('./cloudTTS')

const discordBot = require('./discord_bot.js')
const execSync = require('child_process').execSync

// commands
const dice = require('./commands/dice.js')

let client

function botUsername() {
  return config.BOT_USERNAME || config.TW_CHANNEL_NAME + "_bot"
}
// Define configuration options
let opts
if (config.TW_OAUTH_TOKEN && config.TW_CHANNEL_NAME) {
  opts = {
    identity: {
      username: botUsername(),
      password: config.TW_OAUTH_TOKEN
    },
    channels: [
      config.TW_CHANNEL_NAME
    ]
  }

  // Create a client with our options
  // eslint-disable-next-line new-cap
  client = new tmi.client(opts)

  // Register our event handlers (defined below)
  client.on('message', onMessageHandler)
  client.on('connected', onConnectedHandler)

  // Connect to Twitch:
  client.connect()
} else {
  console.info('TW_OAUTH_TOKEN or TW_CHANNEL_NAME are not found. please set it at config file')
}

// Called every time a message comes in
function onMessageHandler (target, context, msg, self) {
  if (self) { return } // Ignore messages from the bot

  // // DEBUG
  // console.log('target')
  // console.log(target)
  // console.log('context')
  // console.log(context)
  // console.log('msg')
  // console.log(msg)

  // Remove whitespace from chat message
  const comment = msg.trim()

  // If the command is known, let's execute it
  if (comment.match(/^!dice/)) {
    console.debug('command was triggered: dice')
    const message = dice.rollDice(comment)
    client.say(target, message)
  } else if (config.COMMENT_REMEMVER_AVAILABLE) {
    if (comment.match(/^!remember/)) {
      console.debug('command was triggered: remember')
      remember(msg, target)
    }
    if (comment.match(/^!forget/)) {
      console.debug('command was triggered: forget')
      forget(msg, target)
    }
  } else if (comment.match(/^[!/]/)) {
    console.log(`* Executed ${comment} command`)
  }

  let displayName = modifiedUsername(context.username)
  console.log(`\n${displayName}: ${msg}`)
  let segment = modifiedMessage(msg)
  let discordSegment, ttsSegment

  if (config.READ_USERNAME === 'true') {
    discordSegment = "`" + displayName + "`: " + escapeMassMension(msg)
    ttsSegment = displayName + ": " + escapeTtsErrorString(segment)
  } else {
    discordSegment = escapeMassMension(msg)
    ttsSegment = escapeTtsErrorString(segment)
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
  } else {
    // console.debug(`ignored: ${msg}`);
  }
}

function remember(msg, target) {
  try {
    let key = getConfigKey(msg)
    let arr = list.readList(key)
    let attr = getConvertAttributes(msg)
    console.debug('attr')
    console.debug(attr)
    if (!attr) {
      client.say(target, "something wrong! `!remember <keyword> <converted string>`")
      return
    }

    let string = attr[2]
    let read = attr[3]

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
      list.writeList(key, arr)

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
      list.writeList(key, arr)
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
    let arr = list.readList(key)
    let attr = getConvertAttributes(msg)

    // // debug
    // console.log('attr')
    // console.log(attr)
    if (!attr) {
      client.say(target, "something wrong! `!keyword <keyword>`")
      return
    }

    let string = attr[2]

    let index = arr.findIndex(function(record) {
      return record[0] === string
    })

    // console.log('index')
    // console.log(index)
    if (index >= 0) {
      let oldRead = arr[index][1]
      arr.splice(index,1)
      list.writeList(key, arr)
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
  if (msg.match(/^!(rememberU|forgetU)/)) {
    return 'usernameConvertList'
  } else {
    return 'messageConvertList'
  }
}
function getConvertAttributes(msg) {
  return msg.match(/^!(remember) (.+)=(.+)$/) || msg.match(/^!(forget) (.+)$/)
}
function infalidConvertCommand(target) {
  client.say(target, `Invalid. commands are "!remember <keyword>=<how_to_read>" to add/update
  and "!forget <keyword>" to remove.
  e.g. "!remember hoge=fuga", "!rememberU hoge"
  for "username", add "U" to command, e.g. "!rememberU hoge=fuga"`)
}

function sendToDiscord(msg) {
  if (!msg) {
    // send to discord
    // console.log('active message')
    return
  }
  const channel = discordBot.client.channels.get(config.DISCORD_CHANNEL_ID)
  // console.log('channel')
  // console.log(channel)
  if (channel) {
    channel.send(msg)
  }
}

function isEnglishString(string) {
  console.log(`isEnglishString: ${string} => ${!!string.match(/^[A-Za-z,.!?]+$/)}`)
  return !!string.match(/^[A-Za-z,.!?]+$/)
}

function splitMessageByWordType(string) {
  console.log('splitMessageByWordType')
  let textList = []
  let isEnglish = false
  string
    .replace(/([a-zA-Z]+)/g, '$1 ')
    .replace(/(\s)+/g, '$1')
    .split(' ')
    .filter(v => v)
    .forEach(function(v) {
      let tmpIsEnglish = isEnglishString(v)
      console.log(tmpIsEnglish)
      if (textList.length === 0 || (textList.length === 1 && textList.slice(-1)[0].slice(-1) === ':')) {
        textList.push(v)
      } else if (isEnglish === tmpIsEnglish && textList.length > 0) {
        textList[textList.length-1] += ' ' + v
      } else {
        textList.push(v)
      }
      isEnglish = tmpIsEnglish
    })
  console.log(textList)
  return textList
}

async function sendToTts(segment) {
  if (!segment) {
    return
  }

  // for Mac mode
  const SPEAKER_ENGLISH = config.SPEAKER_ENGLISH
  const RATE_ENGLISH = config.RATE_ENGLISH
  const SPEAKER_JAPANESE = config.SPEAKER_JAPANESE
  const RATE_JAPANESE = config.RATE_JAPANESE

  let textList = [segment]
  if (config.BILINGAL_MODE) {
    textList = splitMessageByWordType(segment)
  }

  // console.log("Mode: " + config.TTS_MODE)
  switch (config.TTS_MODE) {
  case 'Mac':
    // console.log('start')
    textList.forEach(function(v) {
      // console.log(isEnglishString(v))
      if (isEnglishString(v)) {
        const option = "[[RATE " + RATE_ENGLISH + "]]"
        segment = v.replace("'", "'\\''")
        execSync("echo '" + option + " " + segment + "' | say -v '" + SPEAKER_ENGLISH + "'")
      } else {
        const option = "[[RATE " + RATE_JAPANESE + "]]"
        segment = v.replace("'", "'\\''")
        const command = "echo '" + option + " " + segment + "' | say -v '" + SPEAKER_JAPANESE + "'"
        // console.log(command)
        execSync(command)
      }
    })
    // console.log('end')
    break
  case 'CloudTTS':
    // console.log('bilingal: ' + config.BILINGAL_MODE)
    if ( config.BILINGAL_MODE ) {
      console.log(textList)
      // for (let index in textList) {
      //   console.log(textList[index])
      // }
      for (let index in textList) {
        console.log(textList[index])
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
            name: 'ja-JP-Wavenet-B',
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
        name: 'ja-JP-Wavenet-B',
        ssmlGender: 'FEMALE'
      }
      let playOptions = {}
      Promise.resolve(
        await await cloudTTS.say(segment, voideOptions, playOptions)
      )
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
  let def = list.readList('usernameConvertList').find(function(element){
    return element[0] === string
  })
  if (def) {
    return def[1]
  } else {
    return username
  }
}

function escapeMassMension(msg) {
  return msg.replace('@', '`@`')
}

function escapeTtsErrorString(msg) {
  return msg.replace(/[!?！？`]/g, '')
}

function modifiedMessage(msg) {
  let message = msg
  let messageConvertList = list.readList('messageConvertList')
  messageConvertList.forEach(function(element) {
    let myregex = new RegExp(element[0], 'g')
    message = message.replace(myregex, element[1])
    // console.log(myregex)
    // console.log(message)
  })
  return message
}
function isIgnoredMessage(msg) {
  let messageIgnoreList = list.readList('messageIgnoreList')
  let res = messageIgnoreList.find(function(element){
    let myregex = new RegExp(element)
    return msg.match(myregex)
  })
  return !!res
}

// Called every time the bot connects to Twitch chat
function onConnectedHandler (addr, port) {
  console.log(`* Connected to ${addr}:${port}`)
}