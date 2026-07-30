"use strict";

const modernModule = require("brace-expansion-modern");
const expand =
  typeof modernModule === "function"
    ? modernModule
    : modernModule.expand ?? modernModule.default;

if (typeof expand !== "function") {
  throw new TypeError("brace-expansion 5.0.9 did not expose an expand function");
}

module.exports = expand;
module.exports.expand = expand;
