// eslint-disable-next-line node/no-unpublished-require
const { compile } = require("nexe");
const path = require("path");
const execSync = require("child_process").execSync;

async function runBuild() {
  let options;
  options = {
    targetNode: "mac-x64-12.6.0",
    targetDir: "twitch_tts_bot_for_mac",
    name: "twitch_tts_bot",
  };

  await makeReleaseFiles(options);

  options = {
    targetNode: "windows-x64-12.6.0",
    targetDir: "twitch_tts_bot_for_win",
    name: "twitch_tts_bot",
  };
  await makeReleaseFiles(options);
}

async function makeReleaseFiles(options) {
  const targetNode = options.targetNode;
  const targetDir = options.targetDir;
  const name = options.name;

  console.info("clean up dist");
  let command;

  command = `rm -rf ${path.join(__dirname, `./dist/${targetDir}`)}`;
  console.info(command);
  console.log(execSync(command).toString());

  const dirList = [
    { name: "./", addKeepFile: false },
    { name: "./node_modules", addKeepFile: false },
    { name: "./config", addKeepFile: false },
    { name: "./data", addKeepFile: true },
    { name: "./tmp", addKeepFile: true },
  ];

  dirList.forEach((dir) => {
    command = `mkdir -p ${path.join(
      __dirname,
      `./dist/${targetDir}/${dir.name}`
    )}`;
    console.info(command);
    console.log(execSync(command).toString());

    if (dir.addKeepFile) {
      command = `touch ${path.join(
        __dirname,
        `./dist/${targetDir}/${dir.name}/.keep`
      )}`;
      console.info(command);
      console.log(execSync(command).toString());
    }
  });

  await compile({
    input: path.join(__dirname, "./main.js"),
    // build: true, // required to use patches
    target: targetNode,
    name: name,
    // loglevel: 'info',Node
    output: `./dist/${targetDir}/${name}`,
    resource: [path.join(__dirname, "./src/**/*")],
  })
    .then(() => {
      console.log("success build for mac");
    })
    .then(() => {
      console.log("adding release files for mac");

      const copyFiles = [
        { name: "./config/default.js.sample", option: "" },
        { name: "./config/serviceAccount.json.sample", option: "" },
        { name: "./data/messageIgnoreList.csv", option: "" },

        // for test of build artifacts
        // {name: './config/default.js', option: ''},
        // {name: './config/serviceAccount.json', option: ''},

        // @TODO: remove this
        // I don't know why, but only google-gax is not available from default nexe build flow.
        { name: "./node_modules/google-gax", option: "-pr" },
      ];

      copyFiles.forEach((target) => {
        command = `cp ${target.option} ${path.join(
          __dirname,
          target.name
        )} ${path.join(__dirname, `./dist/${targetDir}`, target.name)}`;
        console.info(command);
        console.log(execSync(command).toString());
      });
    })
    .then(() => {
      console.log("success output release files for mac");
    });
}

runBuild();
