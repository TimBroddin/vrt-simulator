// Static build: dist/ can be hosted anywhere.
import { basename } from "node:path";

const app = await Bun.build({ entrypoints: ["./src/index.html"], outdir: "./dist", minify: true });
// the worker gets a content hash in its name, so a new deploy never runs with an old worker
const worker = await Bun.build({ entrypoints: ["./src/worker.ts"], outdir: "./dist", naming: "worker-[hash].js", target: "browser", format: "esm", minify: true });
if (!app.success || !worker.success) {
  console.error(app.logs, worker.logs);
  process.exit(1);
}
const name = basename(worker.outputs[0]!.path);
const html = Bun.file("./dist/index.html");
const text = await html.text();
if (!text.includes('content="./worker.js"')) throw new Error("worker meta tag not found in dist/index.html");
await Bun.write(html, text.replace('content="./worker.js"', `content="./${name}"`));
console.log(`built → dist/ (${name})`);
