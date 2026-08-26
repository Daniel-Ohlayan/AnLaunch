const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const version = require("../package.json").version;
const dir = path.join(__dirname, "..", "release");
const ymlPath = path.join(dir, "latest.yml");

if (!fs.existsSync(dir)) {
  console.error("release/ folder is missing — electron-builder did not produce output");
  process.exit(1);
}

const exeName = fs.readdirSync(dir).find((f) => /^AnLaunch-Setup-.*\.exe$/i.test(f));
if (!exeName) {
  console.error("AnLaunch-Setup-*.exe not found in release/. Contents:", fs.readdirSync(dir).join(", "));
  process.exit(1);
}

if (fs.existsSync(ymlPath)) {
  console.log("latest.yml already exists");
  process.exit(0);
}

const exePath = path.join(dir, exeName);
const buf = fs.readFileSync(exePath);
const sha512 = crypto.createHash("sha512").update(buf).digest("base64");
const size = buf.length;
const releaseDate = new Date().toISOString();

const yml = [
  `version: ${version}`,
  "files:",
  `  - url: ${exeName}`,
  `    sha512: ${sha512}`,
  `    size: ${size}`,
  `path: ${exeName}`,
  `sha512: ${sha512}`,
  `releaseDate: '${releaseDate}'`,
  "",
].join("\n");

fs.writeFileSync(ymlPath, yml);
console.log("wrote", ymlPath, "for", exeName);
