import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

for (const file of readdirSync(new URL("../src/", import.meta.url)).filter((name) => name.endsWith(".js"))) {
  const result = spawnSync(process.execPath, ["--check", fileURLToPath(new URL(`../src/${file}`, import.meta.url))], {
    stdio: "inherit",
  });
  if (result.status) process.exit(result.status);
}

for (const file of readdirSync(new URL("../docs/", import.meta.url)).filter((name) => name.endsWith(".js"))) {
  const result = spawnSync(process.execPath, ["--check", fileURLToPath(new URL(`../docs/${file}`, import.meta.url))], {
    stdio: "inherit",
  });
  if (result.status) process.exit(result.status);
}
console.log("syntax-check: ok");
