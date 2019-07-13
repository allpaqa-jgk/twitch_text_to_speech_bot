const fs = require("fs")
const csv = require('csv');

const csvSync = require('csv-parse/lib/sync')
const messageConvertList = './data/messageConvertList.csv'
const messageIgnoreList = './data/messageIgnoreList.csv'
const usernameConvertList = './data/usernameConvertList.csv'

// データファイル初期化
function checkDataFileExists(key) {
  if (!fs.existsSync(configFileName(key))) {
    try {
      fs.writeFileSync(configFileName(key), '');
    } catch (error) {
      console.log(error)
      throw error;
    }
    // console.log(configFileName(key) + " created")
  } else {
    // console.log(configFileName(key) + " exist")
  }
}
function checkDataFiles() {
  console.log('checkDataFiles')
  checkDataFileExists('messageConvertList')
  checkDataFileExists('messageIgnoreList')
  checkDataFileExists('usernameConvertList')

  const keys = [
    'messageConvertList',
    'messageIgnoreList',
    'usernameConvertList'
  ]
  keys.forEach(key => {
    console.log(key);
    console.log(readList(key));
  });
}
module.exports.checkDataFiles = checkDataFiles

function configFileName(key) {
  switch (key) {
  case 'messageConvertList':
    return messageConvertList
  case 'messageIgnoreList':
    return messageIgnoreList
  case 'usernameConvertList':
    return usernameConvertList
  default:
    break;
  }
}
// 置換ファイル読み込み関数
function readList(key) {
  let data = fs.readFileSync(configFileName(key), 'utf8')
  let res = csvSync(data);

  return res
}
module.exports.readList = readList

// 置換ファイルの書き込み関数
function writeList(key, data) {
  csv.stringify(data, function(error,output) {
    if (error) {
      console.log(error.stack);
    }
    // console.log(output)
    fs.writeFile(configFileName(key), output, function(error) {
      if (error) {
        console.log(error.stack);
      }
    });
  });
}
module.exports.writeList = writeList

// 置換ファイル追記
function appendList(key, data) {
  const str = data + "\n"
  fs.appendFile(configFileName(key), str, function(err) {
    if (err) {
      throw err
    }
    // console.log(data)
  })
}
module.exports.appendList = appendList

function resetList(key) {
  fs.unlink(configFileName(key), function (err) {
    if (err) {
      throw err;
    }
  });
}
module.exports.resetList = resetList
