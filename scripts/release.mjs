#!/usr/bin/env node
/**
 * Publishes a Verse build in one command: bump the version, build the portable
 * exe, commit and tag it, then upload it as a GitHub Release.
 *
 * Usage:
 *   npm run release -- 0.2.0
 *   npm run release -- --bump minor
 *   npm run release -- --bump patch --notes-file notes.md
 *
 * Commit the work you are releasing first; the script refuses a dirty tree and
 * commits only the version bump, so the release notes list your commits.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";
const exePath = join(root, "src-tauri", "target", "release", "verse.exe");
/** Files that carry the version; Cargo.lock is refreshed by the build. */
const VERSION_FILES = [
  "package.json",
  "src-tauri/Cargo.toml",
  "src-tauri/tauri.conf.json",
  "src-tauri/Cargo.lock",
];

const snapshots = [];
let bumped = false;

function log(message) {
  console.log(`\n\u2192 ${message}`);
}

function restore() {
  for (const [file, contents] of snapshots) {
    writeFileSync(join(root, file), contents);
  }
}

function fail(message) {
  if (bumped) restore();
  console.error(`\nrelease: ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    shell: options.shell ?? false,
  });
  if (result.error) {
    fail(`${command} could not start: ${result.error.message}`);
  }
  if (result.status !== 0 && !options.allowFailure) {
    const detail = options.capture ? (result.stderr || result.stdout || "").trim() : "";
    fail(`${command} ${args.join(" ")} failed${detail ? `:\n${detail}` : ""}`);
  }
  return result;
}

const git = (...args) => run("git", args, { capture: true }).stdout.trim();

const readJson = (relative) => JSON.parse(readFileSync(join(root, relative), "utf8"));
const writeJson = (relative, value) =>
  writeFileSync(join(root, relative), `${JSON.stringify(value, null, 2)}\n`);

function bumpVersion(current, kind) {
  const [major, minor, patch] = current.split(".").map(Number);
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function generatedNotes(version) {
  const previous = run("git", ["describe", "--tags", "--abbrev=0"], {
    capture: true,
    allowFailure: true,
  }).stdout?.trim();
  const range = previous ? `${previous}..HEAD` : "HEAD";
  const changes = git("log", "--pretty=format:%s", range)
    .split("\n")
    .filter((subject) => subject && !/^Release v/.test(subject));

  return [
    `## Verse ${version}`,
    "",
    "Portable Windows build (x64). Download the `.exe`, run it, and replace your old copy.",
    "No installer and no account needed.",
    "",
    "### Changes",
    "",
    changes.length ? changes.map((subject) => `- ${subject}`).join("\n") : "- Maintenance release.",
    "",
    "### Updating",
    "",
    "Verse asks GitHub Releases for the newest version each time it opens and announces",
    "a newer one in the Windows notification centre and an in-app Download banner.",
    "",
  ].join("\n");
}

function usage() {
  console.log(`Publish a Verse release.

  npm run release -- <version>        e.g. 0.2.0
  npm run release -- --bump <kind>    patch (default), minor or major
  npm run release -- --notes-file <path>   custom release notes`);
}

// ---- arguments -------------------------------------------------------------
const args = process.argv.slice(2);
const options = { version: null, bump: null, notesFile: null };

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--help" || arg === "-h") {
    usage();
    process.exit(0);
  } else if (arg === "--bump") {
    options.bump = args[index + 1] ?? "patch";
    index += 1;
  } else if (arg === "--notes-file") {
    options.notesFile = args[index + 1];
    index += 1;
  } else if (arg.startsWith("-")) {
    fail(`unknown option ${arg}`);
  } else if (options.version === null) {
    options.version = arg;
  } else {
    fail(`unexpected argument ${arg}`);
  }
}

if (options.bump && !["patch", "minor", "major"].includes(options.bump)) {
  fail(`--bump must be patch, minor or major (got "${options.bump}")`);
}
if (options.notesFile && !existsSync(resolve(root, options.notesFile))) {
  fail(`notes file not found: ${options.notesFile}`);
}

const packageJson = readJson("package.json");
const currentVersion = packageJson.version;
const version =
  options.version ?? bumpVersion(currentVersion, options.bump ?? "patch");
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  fail(`"${version}" is not a version like 0.2.0`);
}
if (version === currentVersion) {
  fail(`the project is already on ${version}`);
}

const tag = `v${version}`;
const branch = "main";

// ---- preflight -------------------------------------------------------------
log("Checking the repository");

const branchNow = git("rev-parse", "--abbrev-ref", "HEAD");
if (branchNow !== branch) {
  fail(`releases are published from ${branch}, but this checkout is on ${branchNow}`);
}

const dirty = git("status", "--porcelain")
  .split("\n")
  .filter((line) => line && !line.startsWith("??"));
if (dirty.length) {
  fail(`commit or stash these changes first:\n${dirty.join("\n")}`);
}

const auth = run("gh", ["auth", "status"], { capture: true, allowFailure: true });
if (auth.status !== 0) {
  fail("gh is not signed in: run gh auth login");
}

if (
  git("tag", "--list", tag) ||
  git("ls-remote", "--tags", "origin", `refs/tags/${tag}`)
) {
  fail(`${tag} already exists locally or on origin`);
}

// ---- version bump ----------------------------------------------------------
log(`Bumping ${currentVersion} to ${version}`);

for (const file of VERSION_FILES) {
  if (existsSync(join(root, file))) snapshots.push([file, readFileSync(join(root, file))]);
}
bumped = true;

packageJson.version = version;
writeJson("package.json", packageJson);

const tauriConf = readJson("src-tauri/tauri.conf.json");
tauriConf.version = version;
writeJson("src-tauri/tauri.conf.json", tauriConf);

const cargoPath = join(root, "src-tauri", "Cargo.toml");
const cargoToml = readFileSync(cargoPath, "utf8");
if (!/^version = "[^"]*"$/m.test(cargoToml)) {
  fail("src-tauri/Cargo.toml has no package version line");
}
writeFileSync(cargoPath, cargoToml.replace(/^version = "[^"]*"$/m, `version = "${version}"`));

// ---- notes -----------------------------------------------------------------
log("Preparing release notes");

const notes = options.notesFile
  ? readFileSync(resolve(root, options.notesFile), "utf8")
  : generatedNotes(version);
mkdirSync(join(root, "artifacts"), { recursive: true });
const notesPath = join(root, "artifacts", `release-notes-${tag}.md`);
writeFileSync(notesPath, notes.endsWith("\n") ? notes : `${notes}\n`);

// ---- build -----------------------------------------------------------------
log(`Building Verse ${version} (the frontend build runs first)`);
const buildStarted = Date.now();
run(isWindows ? "npx.cmd" : "npx", ["tauri", "build", "--no-bundle"], { shell: isWindows });

if (!existsSync(exePath)) {
  fail("the build produced no src-tauri/target/release/verse.exe");
}
if (Date.now() - buildStarted < 1000) {
  log("warning: the build finished suspiciously fast; the exe may be stale");
}

const assetName = `Verse-${version}-windows-x64.exe`;
const assetPath = join(root, "artifacts", assetName);
copyFileSync(exePath, assetPath);

// ---- commit, tag, publish --------------------------------------------------
log(`Committing the ${tag} version bump`);
run("git", ["add", ...VERSION_FILES.filter((file) => existsSync(join(root, file)))]);
run("git", ["commit", "-m", `Release ${tag}`]);
bumped = false;

run("git", ["tag", tag]);
run("git", ["push", "origin", branch]);
run("git", ["push", "origin", tag]);

log(`Publishing ${tag} to GitHub Releases`);
const release = run(
  "gh",
  [
    "release",
    "create",
    tag,
    assetPath,
    "--title",
    `Verse ${version}`,
    "--notes-file",
    notesPath,
    "--target",
    branch,
  ],
  { capture: true },
);

console.log(`\nDone. ${release.stdout.trim()}`);
console.log(`Asset: ${assetName}`);
console.log(
  "Any older Verse install will announce this release the next time it opens.",
);
