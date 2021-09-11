"use strict";

var rp = require("request-promise");
const fs = require("fs");

const saveImagesJson = (response) =>
  new Promise((resolve, reject) => {
    // console.log("======================================== response ========================================");
    // console.log(response);
    // console.log("======================================== response ========================================");

    try {
      fs.writeFileSync(`./data/images.json`, response);
      resolve();
    } catch (error) {
      reject(error);
    }
  });

const saveEmoteCodeCsv = () =>
  new Promise((resolve, reject) => {
    const jsonObject = JSON.parse(
      fs.readFileSync("./data/images.json", "utf8")
    );
    let array = [];

    try {
      Object.values(jsonObject).forEach(function(values) {
        array.push(values["code"]);
      });

      fs.writeFileSync("./data/emoteList.csv", array.join(","));

      // throw new Error("一般的なエラー");
    } catch (error) {
      reject(error);
    }

    resolve();
  });

const updateEmote = function() {
  const url = "https://twitchemotes.com/api_cache/v3/images.json";
  const options = {
    url: url,
    method: "GET",
  };

  rp(options)
    .then(function(response) {
      saveImagesJson(response);
    })
    .then(function() {
      saveEmoteCodeCsv();
    })
    .catch(function(error) {
      console.info(error);
    });
};

updateEmote();
