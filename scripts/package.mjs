import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
// Gi tHu b   @S   t ar   s  ail   sC   lo ve   r
const root = path.resolve(scriptDirectory, "..");
const dist = path.join(root, "dist");
const release = path.join(root, "release");
const releaseTag = "v26.0-Alpha.1";
const artifactBase = `PrprprWarp-${releaseTag}`;

await mkdir(release, { recursive: true });

const extensionZip = new JSZip();
await addDirectory(extensionZip, dist, "");
const extensionBytes = await extensionZip.generateAsync({
  type: "nodebuffer",
  compression: "DEFLATE",
  compressionOptions: { level: 9 }
});
const extensionPath = path.join(release, `${artifactBase}-chrome.zip`);
await writeFile(extensionPath, extensionBytes);

const sourcePath = path.join(release, `${artifactBase}-source.zip`);
execFileSync(
  "git",
  [
    "archive",
    "--format=zip",
    `--prefix=PrprprWarp-${releaseTag}/`,
    `--output=${sourcePath}`,
    "HEAD"
  ],
  { cwd: root, stdio: "inherit" }
);

const checksumLines = [];
for (const file of [extensionPath, sourcePath]) {
  const bytes = await readFile(file);
  checksumLines.push(
    `${createHash("sha256").update(bytes).digest("hex")}  ${path.basename(file)}`
  );
}
await writeFile(
  path.join(release, "SHA256SUMS.txt"),
  `${checksumLines.join("\n")}\n`,
  "utf8"
);
console.log(`Packaged ${path.relative(root, extensionPath)}`);
console.log(`Packaged ${path.relative(root, sourcePath)}`);

async function addDirectory(zip, directory, prefix) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
// G  i   tH ub@S   ta  rsa i   l  sC l   ove   r
    const archivePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await addDirectory(zip, absolute, archivePath);
    } else if (entry.isFile()) {
      zip.file(archivePath, await readFile(absolute));
    }
  }
}
