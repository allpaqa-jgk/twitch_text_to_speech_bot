// const encoding = 'LINEAR16'
// const sampleRateHertz = 16000
// const languageCode = 'ja-JP'

"use strict";

// const Audio = require('audio')
const fs = require("fs");
const util = require("util");
const player = require("play-sound")();
const path = require("path");
const filenamePrefix = path.join(__dirname, "../tmp/output");

// [START tts_quickstart]
// Imports the Google Cloud client library
const textToSpeech = require("@google-cloud/text-to-speech");

// Import other required libraries
async function say(text, voiceOptions, playOptions, callback) {
  if (voiceOptions === undefined) {
    voiceOptions = {
      languageCode: "ja-JP",
      name: "ja-JP-Wavenet-A",
      ssmlGender: "NEUTRAL",
    };
  }
  if (playOptions === undefined) {
    playOptions = {};
  }

  // Creates a client
  const client = new textToSpeech.TextToSpeechClient();

  // Construct the request
  const request = {
    input: {
      text: text,
    },
    // Select the language and SSML Voice Gender (optional)
    voice: voiceOptions,
    // Select the type of audio encoding
    audioConfig: {
      audioEncoding: "MP3",
      speakingRate: 1, // [0.25, 4.0]
      pitch: 0, // [0.25, 4.0]
      volumeGainDb: 0, //  [0.25, 4.0]
      effectsProfileId: [],
    },
  };

  // Performs the Text-to-Speech request
  return Promise.resolve(request)
    .then(function(request) {
      return new Promise(function(resolve, reject) {
        client.synthesizeSpeech(request, (err, response) => {
          if (err) {
            console.error("ERROR:", err);
            reject(err);
          }
          resolve(response);
        });
      });
    })
    .then(function(response) {
      return new Promise(function(resolve, reject) {
        const len = 20;
        const filenameHash = Math.random()
          .toString(36)
          .slice(-len)
          .replace(/\./, "");
        // const filenameHash = ''
        const filename = filenamePrefix + "_" + filenameHash + ".mp3";

        const writeFile = util.promisify(fs.writeFile);
        writeFile(filename, response.audioContent, "binary", function() {
          resolve(filename);
        });
      });
    })
    .then(function(filename) {
      return new Promise(function(resolve, reject) {
        player.play(filename, playOptions, function() {
          resolve(filename);
        });
      });
    })
    .then(function(filename) {
      return new Promise(function(resolve, reject) {
        fs.unlink(filename, function(err) {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    })
    .catch(function(err) {
      console.error("error", err);
    });
}
module.exports.say = say;

// [END tts_quickstart]
// say().catch(console.error)
