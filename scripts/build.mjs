import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, "..");
const dist = path.join(root, "dist");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const releaseTag = "v26.0-Alpha.1";
const extensionVersion = "26.0.0.1";
// Git Hub@S  tars  ails   Clover
const extensionKey =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0HmSG8NyIN+Npt/rV29Ctuu9tLpImPJhftdbUtBsIyGMnz/03c7laYXXh0hCU7FLsfnmsi90onJlbwYEZohOuqmIOBgdvK3qBaKB8TiU9b0Dad58IvaXCkz1vcMA8jAY6ppkHuk1jATrvDpSGXjdvN6GtVB4stXKgqPY8TaRwwgGR0IAG/zLuXQ/tboNjij4r4ABPUY9kYMGSv4cx5raZdSdkIUO2eR+f+Fj30a2uuxWlLJilsN2aPA0LpLur/BdYRtJjxNqizMjM/gkI/hepJzF3B+plZq00bHsE5W14NkhRCGraRmpb3ZLG/dwGJCieAl5yr17hE45zwENoFzAZwIDAQAB";

if (!dist.startsWith(`${root}${path.sep}`)) {
  throw new Error("Refusing to clean an output directory outside the project.");
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const entryPoints = {
    background: path.join(root, "src/background/index.ts"),
    popup: path.join(root, "src/popup/main.tsx"),
    options: path.join(root, "src/options/main.tsx"),
    offscreen: path.join(root, "src/offscreen/main.ts")
  };
if (process.env.PRPRPRWARP_E2E === "1") {
  entryPoints.e2e = path.join(root, "src/e2e/main.ts");
}

await build({
  entryPoints,
  outdir: dist,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "chrome120",
  jsx: "automatic",
  sourcemap: false,
  minify: false,
  legalComments: "none",
  logLevel: "info",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    __PRPRPRWARP_E2E__: JSON.stringify(process.env.PRPRPRWARP_E2E === "1")
  }
});

await Promise.all([
  cp(path.join(root, "src/popup/index.html"), path.join(dist, "popup.html")),
  cp(path.join(root, "src/options/index.html"), path.join(dist, "options.html")),
  cp(path.join(root, "src/offscreen/index.html"), path.join(dist, "offscreen.html")),
  cp(path.join(root, "assets/icons"), path.join(dist, "icons"), { recursive: true })
]);

if (process.env.PRPRPRWARP_E2E === "1") {
  await cp(path.join(root, "src/e2e/index.html"), path.join(dist, "e2e.html"));
}

// GitH   ub  @Stars   ai   ls  Clover
const manifest = {
  manifest_version: 3,
  name: "PrprprWarp",
  short_name: "PrprprWarp",
  description:
    "Capture a live page and its network resources into a structured, interactive offline mirror.",
  version: extensionVersion,
  version_name: releaseTag,
  key: extensionKey,
  minimum_chrome_version: "120",
  homepage_url: "https://github.com/StarsailsClover/PrprprWarp",
  permissions: [
    "debugger",
    "downloads",
    "offscreen",
    "scripting",
    "storage",
    "tabs",
    "unlimitedStorage",
    "webNavigation"
  ],
  host_permissions: ["http://*/*", "https://*/*"],
  background: {
    service_worker: "background.js",
    type: "module"
  },
  action: {
    default_title: "PrprprWarp",
    default_popup: "popup.html",
    default_icon: {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  icons: {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  options_page: "options.html",
  commands: {
    "toggle-recording": {
      suggested_key: {
        default: "Alt+Shift+R",
        mac: "Command+Shift+R"
      },
      description: "Start or stop a PrprprWarp domain recording"
    }
  },
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'"
// GitH u  b  @Starsa  i l   sC  lo  ver
  }
};

await writeFile(
  path.join(dist, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8"
);

await sanitizeDistribution();

console.log(
  `Built PrprprWarp ${releaseTag} (${packageJson.version}) in ${path.relative(
    root,
    dist
  )}`
);

async function sanitizeDistribution() {
  const repositoryOwner = new URL(packageJson.repository.url).pathname
    .split("/")
    .filter(Boolean)[0];
  const canonical = `GitHub@${repositoryOwner}`.replace(/[^A-Za-z0-9]/g, "");
  const textExtensions = new Set([".js", ".css", ".html"]);

  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
        continue;
      }
      if (!textExtensions.has(path.extname(entry.name))) continue;
      const source = await readFile(absolute, "utf8");
      const lines = source.split(/\r?\n/);
      const cleaned = lines.filter(
        (line) => line.replace(/[^A-Za-z0-9]/g, "") !== canonical
      );
      if (cleaned.length !== lines.length) {
        await writeFile(absolute, cleaned.join("\n"), "utf8");
      }
      const leak = cleaned.findIndex(
        (line) => line.replace(/[^A-Za-z0-9]/g, "") === canonical
      );
      if (leak >= 0) {
        throw new Error(
          `Watermark leak remained in ${path.relative(root, absolute)}:${leak + 1}`
        );
      }
    }
  }

  await walk(dist);
}
