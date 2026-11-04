// 构建：把 src/ 打包成 dist/www/game.js，复制 web/ 静态文件，并检查剧本。
// 用法：node scripts/build.mjs [--check]
import * as esbuild from "esbuild";
import { readFileSync, readdirSync, mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const out = join(root, "dist/www");
const checkOnly = process.argv.includes("--check");

function storyFiles() {
  const dir = join(root, "content");
  const files = {};
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".story")).sort()) {
    files[f] = readFileSync(join(dir, f), "utf8");
  }
  return files;
}

const storyPlugin = {
  name: "story",
  setup(build) {
    build.onResolve({ filter: /^virtual:story$/ }, () => ({ path: "story", namespace: "story" }));
    build.onLoad({ filter: /.*/, namespace: "story" }, () => ({
      contents: `export default ${JSON.stringify(storyFiles())};`,
      loader: "js",
      watchDirs: [join(root, "content")],
    }));
  },
};

// 1. 剧本检查
mkdirSync(join(root, "dist"), { recursive: true });
await esbuild.build({
  stdin: {
    contents: `import { parseStory, lintStory } from "./src/parser.ts"; import files from "virtual:story";
      const story = parseStory(files); const p = lintStory(story);
      console.log("剧本：" + story.order.length + " 个节点，" + Object.values(files).join("").replace(/\\s/g, "").length + " 字");
      if (p.length) { console.error(p.join("\\n")); process.exit(1); }`,
    resolveDir: root,
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: join(root, "dist/check.mjs"),
  plugins: [storyPlugin],
  logLevel: "warning",
});
execSync(`node ${join(root, "dist/check.mjs")}`, { stdio: "inherit" });
if (checkOnly) process.exit(0);

// 2. 打包游戏
let rev = "dev";
try { rev = execSync("git rev-parse --short HEAD", { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch {}
const stamp = new Date().toISOString().slice(0, 10);
mkdirSync(out, { recursive: true });
await esbuild.build({
  entryPoints: [join(root, "src/main.ts")],
  bundle: true,
  format: "iife",
  target: ["safari15"],
  minify: true,
  sourcemap: false,
  outfile: join(out, "game.js"),
  define: { __BUILD__: JSON.stringify(`${stamp} · ${rev}`) },
  plugins: [storyPlugin],
  logLevel: "warning",
});
for (const f of readdirSync(join(root, "web"))) copyFileSync(join(root, "web", f), join(out, f));
writeFileSync(join(out, "build.txt"), `${stamp} ${rev}\n`);
console.log("已输出到 dist/www");
