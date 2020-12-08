"use strict"

const crypto = require("crypto")

function makeHash(str) {
  const hash = crypto.createHash("sha256")
  hash.update(str)
  return hash.digest("hex")
}

function create(str) {
  const hash = makeHash(str).slice(0,12)
  const uInt = parseInt('0x'+hash)

  return uInt
}
module.exports.create = create
