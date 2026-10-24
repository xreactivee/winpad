import { readFileSync, writeFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const installer = `WinPad_${version}_x64-setup.exe`;
const signature = readFileSync(`src-tauri/target/release/bundle/nsis/${installer}.sig`, "utf8").trim();
const manifest = {
  version,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": { signature, url: `https://github.com/xreactivee/winpad/releases/download/v${version}/${installer}` },
  },
};
writeFileSync("release/latest.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(`release/latest.json for ${version}`);
