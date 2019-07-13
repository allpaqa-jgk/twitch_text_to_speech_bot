// eslint-disable-next-line node/no-unpublished-require
const { compile } = require('nexe')
const path = require('path')

async function runBuild() {
  await compile({
    input: path.join(__dirname, './main.js'),
    // build: true, // required to use patches
    // targets: 'mac-x64-12.6.0',
    name: 'twitch_tts_bot-mac',
    loglevel: 'info',
  }).then(() => {
    console.log('success mac')
  })

  await compile({
    input: path.join(__dirname, './main.js'),
    // build: true, // required to use patches
    target: 'windows-x64-12.6.0',
    name: 'twitch_tts_bot-windows',
    // loglevel: 'info',
  }).then(() => {
    console.log('success win')
  })
}

runBuild()