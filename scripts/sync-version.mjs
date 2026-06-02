import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJsonPath = resolve(rootDir, "package.json");
const packageLockPath = resolve(rootDir, "package-lock.json");
const tauriConfigPath = resolve(rootDir, "src-tauri", "tauri.conf.json");
const cargoTomlPath = resolve(rootDir, "src-tauri", "Cargo.toml");
const cargoLockPath = resolve(rootDir, "src-tauri", "Cargo.lock");

const packageJson = readJson(packageJsonPath);
const version = packageJson.version;

if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`package.json version must be a semver string, got "${version}"`);
}

syncJsonVersion(packageLockPath, (json) => {
  json.version = version;
  if (json.packages?.[""]) {
    json.packages[""].version = version;
  }
});

syncJsonVersion(tauriConfigPath, (json) => {
  json.version = version;
});

syncCargoToml(cargoTomlPath);
syncCargoLock(cargoLockPath);

console.log(`Synced Codex Switch version to ${version}`);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function syncJsonVersion(path, update) {
  const json = readJson(path);
  update(json);
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
}

function syncCargoToml(path) {
  const content = readFileSync(path, "utf8");
  const packageVersionPattern = /^(\[package\][\s\S]*?^version\s*=\s*)"[^"]+"/m;
  if (!packageVersionPattern.test(content)) {
    throw new Error(`Could not find package version in ${path}`);
  }

  const next = content.replace(
    packageVersionPattern,
    `$1"${version}"`,
  );

  writeFileSync(path, next);
}

function syncCargoLock(path) {
  const content = readFileSync(path, "utf8");
  const packageVersionPattern = /(\[\[package\]\]\r?\nname = "codex-switch"\r?\nversion = )"[^"]+"/;
  if (!packageVersionPattern.test(content)) {
    throw new Error(`Could not find codex-switch version in ${path}`);
  }

  const next = content.replace(
    packageVersionPattern,
    `$1"${version}"`,
  );

  writeFileSync(path, next);
}
