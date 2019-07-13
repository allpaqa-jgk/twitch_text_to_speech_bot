// eslint-disable-next-line node/no-unpublished-require
const { compile } = require('nexe')

compile({
  input: './src/main.js',
  build: true, // required to use patches
  // target: ['mac-x64-12.6.0', 'windows-x64-12.6.0'], // for mac and windows
  // target: ['mac-x64-12.6.0'], // for mac
  // target: ['windows-x64-12.6.0'], // for windows
  // patches: [
  //   async (compiler, next) => {
  //     await compiler.setFileContentsAsync(
  //       'lib/new-native-module.js',
  //       'module.exports = 42'
  //     )
  //     return next()
  //   }
  // ]
}).then(() => {
  console.log('success')
})
