// Static build: dist/ can be hosted anywhere.
const app = await Bun.build({ entrypoints: ["./src/index.html"], outdir: "./dist", minify: true });
const worker = await Bun.build({ entrypoints: ["./src/worker.ts"], outdir: "./dist", naming: "worker.js", target: "browser", format: "esm", minify: true });
if (!app.success || !worker.success) {
  console.error(app.logs, worker.logs);
  process.exit(1);
}
console.log("built → dist/");
