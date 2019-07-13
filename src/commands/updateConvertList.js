const list = require('../list.js')

function remember(msg, target, client) {
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
    infalidConvertCommand(target, client)
  }
}
module.exports.forget = forget

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

function infalidConvertCommand(target, client) {
  client.say(target, `Invalid. commands are "!remember <keyword>=<how_to_read>" to add/update
  and "!forget <keyword>" to remove.
  e.g. "!remember hoge=fuga", "!rememberU hoge"
  for "username", add "U" to command, e.g. "!rememberU hoge=fuga"`)
}