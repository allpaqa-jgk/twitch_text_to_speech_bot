// eslint-disable-next-line node/no-unpublished-require
const { compile } = require('nexe')
const path = require('path')
const execSync = require('child_process').execSync

async function runBuild() {
  let options
  options = {
    targetNode: 'process',
    targetDir: 'mac',
    name: 'twitch_tts_bot-mac',
  }

  await makeReleaseFiles(options)

  // options = {
  //   targetNode: 'windows-x64-12.6.0',
  //   targetDir: 'win',
  //   name: 'twitch_tts_bot-win',
  // }
  // await makeReleaseFiles(options)

}

async function makeReleaseFiles(options) {
  const targetNode = options.targetNode
  const targetDir = options.targetDir
  const name = options.name

  console.info('clean up dist')
  console.info(`rm -rf ${path.join(__dirname, `./dist/${targetDir}`)}`)
  let result = execSync(`rm -rf ${path.join(__dirname, `./dist/${targetDir}`)}`).toString()
  console.log(result)

  const dirList = [
    './node_modules',
    './config',
    './data',
    './tmp',
  ]

  console.info(`mkdir -p ${path.join(__dirname, `./dist/${targetDir}/`)}`)
  result = execSync(`mkdir -p ${path.join(__dirname, `./dist/${targetDir}/`)}`).toString()
  dirList.forEach((dir) => {
    console.info(`mkdir -p ${path.join(__dirname, `./dist/${targetDir}/${dir}`)}`)
    result = execSync(`mkdir -p ${path.join(__dirname, `./dist/${targetDir}/${dir}`)}`).toString()

    console.info(`touch ${path.join(__dirname, `./dist/${targetDir}/${dir}/.keep`)}`)
    result = execSync(`touch ${path.join(__dirname, `./dist/${targetDir}/${dir}/.keep`)}`).toString()
  })

  await compile({
    input: path.join(__dirname, './main.js'),
    // build: true, // required to use patches
    target: targetNode,
    name: name,
    // loglevel: 'info',Node
    output: `./dist/${targetDir}/${name}`,
    resource: [
      path.join(__dirname, './src/**/*'),
    ]
  }).then(() => {
    console.log('success build for mac')
  }).then(() => {
    console.log('adding release files for mac')

    // @TODO: remove this
    // I don't know why, but only google-proto-files and grpc is not available from default nexe build flow.
    console.info(`cp -pr ${path.join(__dirname, './node_modules/google-proto-files')} ${path.join(__dirname, `./dist/${targetDir}/node_modules/`)}`)
    result = execSync(`cp -pr ${path.join(__dirname, './node_modules/google-proto-files')} ${path.join(__dirname, `./dist/${targetDir}/node_modules/`)}`).toString()
    console.info(`cp -pr ${path.join(__dirname, './node_modules/grpc')} ${path.join(__dirname, `./dist/${targetDir}/node_modules/`)}`)
    result = execSync(`cp -pr ${path.join(__dirname, './node_modules/grpc')} ${path.join(__dirname, `./dist/${targetDir}/node_modules/`)}`).toString()

    // console.info(`cp ${path.join(__dirname, './config/default.js')} ${path.join(__dirname, `./dist/${targetDir}/config/default.js`)}`)
    // result = execSync(`cp ${path.join(__dirname, './config/default.js')} ${path.join(__dirname, `./dist/${targetDir}/config/default.js`)}`).toString()
    console.info(`cp ${path.join(__dirname, './config/default.js.sample')} ${path.join(__dirname, `./dist/${targetDir}/config/default.js.sample`)}`)
    result = execSync(`cp ${path.join(__dirname, './config/default.js.sample')} ${path.join(__dirname, `./dist/${targetDir}/config/default.js.sample`)}`).toString()
    console.info(`cp ${path.join(__dirname, './data/messageIgnoreList.csv')} ${path.join(__dirname, `./dist/${targetDir}/data/messageIgnoreList.csv`)}`)
    result = execSync(`cp ${path.join(__dirname, './data/messageIgnoreList.csv')} ${path.join(__dirname, `./dist/${targetDir}/data/messageIgnoreList.csv`)}`).toString()
  }).then(() => {
    console.log('success output release files for mac')
  })
}

runBuild()