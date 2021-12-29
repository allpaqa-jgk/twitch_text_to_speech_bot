const tmi = require("tmi.js");
const list = require("./list.js");
const config = require("config");

const cloudTTS = require("./cloudTTS");

const discordBot = require("./discordBot.js");
const execSync = require("child_process").execSync;

// commands
const dice = require("./commands/dice.js");
const updateConvertList = require("./commands/updateConvertList.js");

let client;

function botUsername() {
  return config.BOT_USERNAME || config.TW_CHANNEL_NAME + "_bot";
}
// Define configuration options
let opts;
if (config.TW_OAUTH_TOKEN && config.TW_CHANNEL_NAME) {
  opts = {
    identity: {
      username: botUsername(),
      password: config.TW_OAUTH_TOKEN,
    },
    channels: [config.TW_CHANNEL_NAME],
  };

  // Create a client with our options
  // eslint-disable-next-line new-cap
  client = new tmi.client(opts);

  // Register our event handlers (defined below)
  client.on("message", onMessageHandler);
  client.on("connected", onConnectedHandler);
  client.on("disconnected", onDisconnectedHandler);

  // Connect to Twitch:
  client.connect().catch((e) => {
    console.info(e);
  });
}

// Called every time a message comes in
function onMessageHandler(target, context, msg, self) {
  if (self) {
    return;
  } // Ignore messages from the bot

  // // DEBUG
  // console.log('target')
  // console.log(target)
  // console.log('context')
  // console.log(context)
  // console.log('msg')
  // console.log(msg)

  // Remove whitespace from chat message
  const comment = msg.trim();

  // If the command is known, let's execute it
  if (comment.match(/^!dice/)) {
    console.debug("command was triggered: dice");
    const message = dice.rollDice(comment);
    client.say(target, message);
  } else if (config.COMMENT_REMEMVER_AVAILABLE) {
    const regexpRemember = new RegExp(
      `^!(${config.COMMENT_REMEMVER_COMMAND}U?)`
    );
    const regexpForget = new RegExp(`^!(${config.COMMENT_FORGET_COMMAND}U?)`);
    const regexpUser = new RegExp(
      `^!(${config.COMMENT_REMEMVER_COMMAND}U|${config.COMMENT_FORGET_COMMAND}U)`
    );
    const convertType = comment.match(regexpUser) ? "user" : "comment";

    if (comment.match(regexpRemember)) {
      console.debug(`command was triggered: remember ${convertType}`);
      updateConvertList.remember(msg, target, client);
    }
    if (comment.match(regexpForget)) {
      console.debug(`command was triggered: forget ${convertType}`);
      updateConvertList.forget(msg, target, client);
    }
  } else if (comment.match(/^[!/]/)) {
    console.log(`* Executed ${comment} command`);
  }

  let displayName = modifiedUsername(context.username);
  console.log(`${displayName}: ${msg}`);
  let segment = modifiedMessage(msg);
  let discordSegment, ttsSegment;

  if (config.READ_USERNAME) {
    discordSegment = "`" + displayName + "`: " + escapeMassMension(msg);
    ttsSegment = displayName + ": " + escapeTtsErrorString(segment);
  } else {
    discordSegment = escapeMassMension(msg);
    ttsSegment = escapeTtsErrorString(segment);
  }

  // // debug
  // console.log("displayName && segment && !isIgnored")
  // console.log(!!displayName)
  // console.log(!!segment)
  // console.log(!isIgnoredMessage(msg))
  if (displayName && !isIgnoredMessage(msg)) {
    sendToDiscord(discordSegment);
    // TTS
    sendToTts(ttsSegment);
  } else {
    // console.debug(`ignored: ${msg}`);
  }
}

function sendToDiscord(msg) {
  if (!msg) {
    // send to discord
    console.log("message is empty");
    return;
  }
  if (!config.DISCORD_TRANSFER_ENABLED) {
    // send to discord
    // console.log("message is empty");
    return;
  }
  discordBot.client.channels
    .fetch(config.DISCORD_CHANNEL_ID)
    .then((channel) => {
      // console.log("channel", channel.name);
      if (channel) {
        return channel.send(msg).catch((e) => {
          console.info(e);
        });
      }
    })
    .catch(console.error);
}

function isEnglishString(string) {
  // console.log(
  //   `isEnglishString: ${string} => ${!!string.match(/^[A-Za-z,.!? ]+$/)}`
  // );
  return !!string.match(/^[A-Za-z,.!? ]+$/);
}

function splitMessageByWordType(string) {
  // console.log("splitMessageByWordType");
  let textList = [];
  let isEnglish = false;
  string
    .replace(/([a-zA-Z]+)/g, "$1 ")
    .replace(/(\s)+/g, "$1")
    .split(" ")
    .filter((v) => v)
    .forEach(function(v) {
      let tmpIsEnglish = isEnglishString(v);
      // console.log(tmpIsEnglish, textList.length);
      if (
        textList.length === 0 ||
        (textList.length === 1 && textList.slice(-1)[0].slice(-1) === ":")
      ) {
        textList.push(v);
      } else if (isEnglish === tmpIsEnglish && textList.length > 0) {
        textList[textList.length - 1] += " " + v;
      } else {
        textList.push(v);
      }
      isEnglish = tmpIsEnglish;
    });
  // console.log("textList", textList);
  return textList;
}

async function sendToTts(segment) {
  if (!segment) {
    return;
  }

  // for Mac mode
  const SPEAKER_ENGLISH = config.SPEAKER_ENGLISH;
  const RATE_ENGLISH = config.RATE_ENGLISH;
  const SPEAKER_JAPANESE = config.SPEAKER_JAPANESE;
  const RATE_JAPANESE = config.RATE_JAPANESE;

  let textList = [segment];
  if (config.BILINGAL_MODE) {
    textList = splitMessageByWordType(segment);
  }

  if (!config.ENABLE_TTS || config.DISABLE_TTS) {
    return false;
  }
  // console.log("Mode: " + config.TTS_MODE)
  switch (config.TTS_MODE) {
    case "Mac":
      // console.log('start')
      textList.forEach(function(v) {
        const isEnglish = isEnglishString(v);
        // console.log("isEnglish:", isEnglish);
        if (isEnglish) {
          const option = "[[RATE " + RATE_ENGLISH + "]]";
          segment = v.replace("'", "'\\''");
          execSync(
            "echo '" +
              option +
              " " +
              segment +
              "' | say -v '" +
              SPEAKER_ENGLISH +
              "'"
          );
        } else {
          const option = "[[RATE " + RATE_JAPANESE + "]]";
          segment = v.replace("'", "'\\''");
          const command =
            "echo '" +
            option +
            " " +
            segment +
            "' | say -v '" +
            SPEAKER_JAPANESE +
            "'";
          // console.log(command)
          execSync(command);
        }
      });
      // console.log('end')
      break;
    case "CloudTTS":
      // console.log('bilingal: ' + config.BILINGAL_MODE)
      if (config.BILINGAL_MODE) {
        console.log(textList);
        // for (let index in textList) {
        //   console.log(textList[index])
        // }
        for (let index in textList) {
          console.log(textList[index]);
          // console.log(!!textList[index].match(/^[A-Za-z:'"` ]+$/))
          if (textList[index].match(/^[A-Za-z:'"` ]+$/)) {
            let voideOptions = {
              languageCode: "en-US",
              name: "en-US-Wavenet-F",
              ssmlGender: "FEMALE",
            };
            let playOptions = {};
            await cloudTTS.say(textList[index], voideOptions, playOptions);
          } else {
            let voideOptions = {
              languageCode: "ja-JP",
              name: "ja-JP-Wavenet-B",
              ssmlGender: "FEMALE",
            };
            let playOptions = {};
            await cloudTTS.say(textList[index], voideOptions, playOptions);
          }
        }
      } else {
        // console.log('segment: ' + segment)
        let voideOptions = {
          languageCode: "ja-JP",
          name: "ja-JP-Wavenet-B",
          ssmlGender: "FEMALE",
        };
        let playOptions = {};
        Promise.resolve(
          await await cloudTTS.say(segment, voideOptions, playOptions)
        );
      }
      break;
    default:
      break;
  }
  // console.log(result)
}

function simpleUsername(username) {
  if (config.USE_SIMPLE_NAME) {
    return username.replace(/(_[\d|\w]+)|(\d+)$/, "");
  } else {
    return username;
  }
}
function modifiedUsername(username) {
  let def = list.readList("usernameConvertList").find(function(element) {
    return element[0] === username;
  });
  if (def) {
    return def[1];
  } else {
    return simpleUsername(username);
  }
}

function escapeMassMension(msg) {
  return msg.replace("@", "`@`");
}

function escapeTtsErrorString(msg) {
  return msg.replace(/[!?！？`]/g, "");
}

function modifiedMessage(msg) {
  let message = msg;
  let messageConvertList = list.readList("messageConvertList");
  messageConvertList.forEach(function(element) {
    let myregex = new RegExp(element[0], "g");
    message = message.replace(myregex, element[1]);
    // console.log(myregex)
    // console.log(message)
  });
  return message;
}
function isIgnoredMessage(msg) {
  let messageIgnoreList = list.readList("messageIgnoreList");
  let res = messageIgnoreList.find(function(element) {
    let myregex = new RegExp(element);
    return msg.match(myregex);
  });
  return !!res;
}

// Called every time the bot connects to Twitch chat
function onConnectedHandler(addr, port) {
  console.log(`* Connected to ${addr}:${port}`);
}

// onDisconnectedHandler(reason: string)
function onDisconnectedHandler(reason) {
  console.info(`* Disconnected to ${reason}`);
  setTimeout(() => {
    if (typeof client.reconnect === "function")
      client.reconnect().catch((e) => {
        console.info(e);
      });
  }, 5000);
}
