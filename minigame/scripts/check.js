const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
let count = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "qa-output", ".git"].includes(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (file.endsWith(".js")) {
      execFileSync(process.execPath, ["--check", file]);
      count++;
    }
  }
}
walk(root);
function imports(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "qa-output", "tests", "scripts"].includes(entry.name))
      continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) imports(file);
    else if (file.endsWith(".js")) {
      for (const match of fs
        .readFileSync(file, "utf8")
        .matchAll(/require\(['"](\.[^'"]+)['"]\)/g)) {
        const target = path.resolve(path.dirname(file), match[1]);
        if (!fs.existsSync(target + ".js") && !target.endsWith(".js"))
          throw Error(
            "WeChat requires explicit module file: " + file + " -> " + match[1],
          );
      }
    }
  }
}
imports(root);
const config = JSON.parse(
  fs.readFileSync(path.join(root, "project.config.json")),
);
if (config.compileType !== "game") throw Error("小游戏配置错误");
console.log("Syntax checked " + count + " JavaScript files; compileType=game");
