const list = require('../list.js')
const config = require('config')

function remember(msg, target, client) {
  try {
    let key = getConfigKey(msg)
    let arr = list.readList(key)
    let attr = getConvertAttributes(msg)
    console.debug('attr')
    console.debug(attr)
    if (!attr) {
      client.say(target, `something wrong! "!${config.COMMENT_REMEMVER_COMMAND} <keyword>=<converted string>"`)
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
    infalidConvertCommand(target, client)
  }
}
module.exports.remember = remember

function forget(msg, target, client) {
  try {
    let key = getConfigKey(msg)
    let arr = list.readList(key)
    let attr = getConvertAttributes(msg)

    // // debug
    // console.log('attr')
    // console.log(attr)
    if (!attr) {
      client.say(target, `something wrong! "!${config.COMMENT_FORGET_COMMAND} <keyword>"`)
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
    infalidConvertCommand(target, client)
  }
}
module.exports.forget = forget

function getConfigKey(msg) {
  const regexp = new RegExp(`^!(${config.COMMENT_REMEMVER_COMMAND}U|${config.COMMENT_FORGET_COMMAND}U)`)
  if (msg.match(regexp)) {
    return 'usernameConvertList'
  } else {
    return 'messageConvertList'
  }
}

function getConvertAttributes(msg) {
  const regexpRemember = new RegExp(`^!(${config.COMMENT_REMEMVER_COMMAND}U?) (.+)=(.+)$`)
  const regexpForget = new RegExp(`^!(${config.COMMENT_FORGET_COMMAND}U?) (.+)$`)
  return msg.match(regexpRemember) || msg.match(regexpForget)
}

function infalidConvertCommand(target, client) {
  client.say(target, `Invalid. commands are "!${config.COMMENT_REMEMVER_COMMAND} <keyword>=<how_to_read>" to add/update
  and "!forget <keyword>" to remove.
  e.g. "!${config.COMMENT_REMEMVER_COMMAND} hoge=fuga", "!${config.COMMENT_REMEMVER_COMMAND}U hoge"
  for "username", add "U" to command, e.g. "!${config.COMMENT_REMEMVER_COMMAND}U hoge=fuga"`)
}