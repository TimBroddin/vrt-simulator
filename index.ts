// Dev server: serves the HTML app and a separately bundled generation worker.
import index from "./src/index.html";

async function buildWorker() {
  const r = await Bun.build({ entrypoints: ["./src/worker.ts"], target: "browser", format: "esm", minify: true });
  if (!r.success) {
    console.error(r.logs);
    throw new Error("worker build failed");
  }
  return await r.outputs[0]!.text();
}

const workerJs = await buildWorker();

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  routes: {
    "/": index,
    "/worker.js": () => new Response(workerJs, { headers: { "content-type": "text/javascript" } }),
  },
  development: { hmr: false, console: true },
});

console.log(`VRT Simulator → ${server.url}`);
