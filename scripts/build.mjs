// 构建：把 src/ 打包成 dist/www/game.js，复制 web/ 静态文件，并检查剧本。
// 用法：node scripts/build.mjs [--check]
import * as esbuild from "esbuild";
import { readFileSync, readdirSync, mkdirSync, copyFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import subsetFont from "subset-font";
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
copyDir(join(root, "web"), out);
await buildFonts();
writeFileSync(join(out, "build.txt"), `${stamp} ${rev}\n`);
console.log("已输出到 dist/www");

function copyDir(from, to) {
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(from)) {
    const src = join(from, f);
    if (statSync(src).isDirectory()) copyDir(src, join(to, f));
    else copyFileSync(src, join(to, f));
  }
}

// 3. 字体：霞鹜文楷（OFL），只保留游戏里用到的字
async function buildFonts() {
  const FONT_VER = "v1.520";
  const dir = join(root, "fonts");
  mkdirSync(dir, { recursive: true });
  const chars = new Set();
  const add = (t) => { for (const ch of t) chars.add(ch); };
  const scan = (d, ext) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) scan(p, ext);
      else if (ext.some((e) => f.endsWith(e))) add(readFileSync(p, "utf8"));
    }
  };
  scan(join(root, "content"), [".story"]);
  scan(join(root, "src"), [".ts"]);
  add(readFileSync(join(root, "web/index.html"), "utf8"));
  // 常用标点、数字、字母，以及起名时可能用到的常用字
  add("，。、；：？！…—·「」『』（）《》〔〕【】“”‘’ 0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ");
  add("一乙二十丁厂七卜人入八九几儿了力乃刀又三于干亏士工土才寸下大丈与万上小口巾山千乞川亿个勺久凡及夕丸么广亡门义之尸弓己已子卫也女飞刃习叉马乡丰王井开夫天无元专云扎艺木五支厅不太犬区历尤友匹车巨牙屯比互切瓦止少日中冈贝内水见午牛手毛气升长仁什片仆化仇币仍仅斤爪反介父从今凶分乏公仓月氏勿欠风丹匀乌凤勾文六方火为斗忆订计户认心尺引丑巴孔队办以允予劝双书幻玉刊示末未击打巧正扑扒功扔去甘世古节本术可丙左厉右石布龙平灭轧东卡北占业旧帅归且旦目叶甲申叮电号田由史只央兄叼叫另叨叹四生失禾丘付仗代仙们仪白仔他斥瓜乎丛令用甩印乐句匆册犯外处冬鸟务包饥主市立闪兰半汁汇头汉宁穴它讨写让礼训必议讯记永司尼民出辽奶奴加召皮边发孕圣对台矛纠母幼丝式刑动扛寺吉扣考托老执巩圾扩扫地扬场耳共芒亚芝朽朴机权过臣再协西压厌在有百存而页匠夸夺灰达列死成夹轨邪划迈毕至此贞师尘尖劣光当早吐吓虫曲团同吊吃因吸吗屿帆岁回岂刚则肉网年朱先丢舌竹迁乔伟传乒乓休伍伏优伐延件任伤价份华仰仿伙伪自血向似后行舟全会杀合兆企众爷伞创肌朵杂危旬旨负各名多争色壮冲冰庄庆亦刘齐交次衣产决充妄闭问闯羊并关米灯州汗污江池汤忙兴宇守宅字安讲军许论农讽设访寻那迅尽导异孙阵阳收阶阴防奸如妇好她妈戏羽观欢买红纤级约纪驰巡寿弄麦形进戒吞远违运扶抚坛技坏扰拒找批扯址走抄坝贡攻赤折抓扮抢孝均抛投坟抗坑坊抖护壳志扭块声把报却劫芽花芹芬苍芳严芦劳克苏杆杠杜材村杏极李杨求更束豆两丽医辰励否还歼来连步坚旱盯呈时吴助县里呆园旷围呀吨足邮男困吵串员听吩吹呜吧吼别岗帐财针钉告我乱利秃秀私每兵估体何但伸作伯伶佣低你住位伴身皂佛近彻役返余希坐谷妥含邻岔肝肚肠龟免狂犹角删条卵岛迎饭饮系言冻状亩况床库疗应冷这序辛弃冶忘闲间闷判灶灿弟汪沙汽沃泛沟没沈沉怀忧快完宋宏牢究穷灾良证启评补初社识诉诊词译君灵即层尿尾迟局改张忌际陆阿陈阻附妙妖妨努忍劲鸡驱纯纱纳纲驳纵纷纸纹纺驴纽");
  const text = [...chars].join("");
  for (const [w, out_] of [["Regular", "wenkai-regular"], ["Medium", "wenkai-medium"]]) {
    const src = join(dir, `LXGWWenKai-${w}.ttf`);
    if (!existsSync(src)) {
      const url = `https://github.com/lxgw/LxgwWenKai/releases/download/${FONT_VER}/LXGWWenKai-${w}.ttf`;
      console.log("下载字体 " + url);
      const res = await fetch(url);
      if (!res.ok) throw new Error("字体下载失败：" + res.status);
      writeFileSync(src, Buffer.from(await res.arrayBuffer()));
    }
    const buf = await subsetFont(readFileSync(src), text, { targetFormat: "woff2" });
    mkdirSync(join(out, "fonts"), { recursive: true });
    writeFileSync(join(out, "fonts", `${out_}.woff2`), buf);
  }
  console.log(`字体子集：${chars.size} 个字符`);
}
