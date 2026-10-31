import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// G   itH  ub@S   tars   ai  l s Clover
const directory = path.dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [path.join(directory, "app.tsx")],
  outfile: path.join(directory, "public/app.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome120",
  jsx: "automatic",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production")
  },
  sourcemap: false,
  minify: false
});

console.log("Built PrprprWarp browser fixture.");
