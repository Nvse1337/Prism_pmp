"use strict";

const path = require("node:path");
const fs = require("node:fs");
const { packager } = require("@electron/packager");

const root = path.resolve(__dirname, "..");
const release = path.join(root, "release");
const pkg = require(path.join(root, "package.json"));

async function main() {
  fs.mkdirSync(release, { recursive: true });
  const paths = await packager({
    dir: root,
    name: "PRISM",
    platform: "win32",
    arch: "x64",
    out: release,
    overwrite: true,
    icon: path.join(root, "assets", "prism.ico"),
    asar: false,
    prune: true,
    appVersion: pkg.version,
    buildVersion: pkg.version,
    appCopyright: "Copyright © 2026 PRISM",
    ignore: [
      /^\/release($|\/)/,
      /^\/tools($|\/)/,
      /^\/docs($|\/)/,
      /^\/node_modules($|\/)/,
      /^\/scripts($|\/)/,
      /^\/\.git($|\/)/,
      /^\/\.electron-cache($|\/)/,
      /^\/\.tmp($|\/)/,
      /^\/electron-boot\.log$/,
      /^\/electron-test\..*$/,
      /^\/\.tmp-electron-test\.mjs$/,
      /^\/README\.md$/,
      /^\/LICENSE$/,
      /^\/启动 PRISM\.cmd$/,
      /^\/pnpm-lock\.yaml$/,
      /^\/pnpm-workspace\.yaml$/,
      /^\/package-lock\.json$/,
      /^\/assets\/prism-icon\.png$/,
    ],
    win32metadata: {
      CompanyName: "PRISM",
      FileDescription: "PRISM 粒子音乐播放器",
      ProductName: "PRISM",
      InternalName: "PRISM",
      OriginalFilename: "PRISM.exe",
      LegalCopyright: "Copyright © 2026 PRISM",
    },
  });

  if (!paths || !paths.length) throw new Error("Packager returned no output.");
  const built = paths[0];
  const finalDir = path.join(release, "PRISM");
  fs.rmSync(finalDir, { recursive: true, force: true });
  fs.renameSync(built, finalDir);
  console.log("Packed:", finalDir);
  console.log("Executable:", path.join(finalDir, "PRISM.exe"));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
