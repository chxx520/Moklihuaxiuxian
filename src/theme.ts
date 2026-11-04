// 界面主题：描金边框、云纹角饰、牌匾等装饰纹样（矢量生成），全局点击涟漪，水墨转场。
// 以后有画好的界面素材（assets/ui/），可以直接替换这里的 CSS 变量。
import { findAsset } from "./assets";

const svg = (body: string, vb = "0 0 120 120") => {
  const [, , w, h] = vb.split(" ");
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='${vb}'>${body}</svg>`)}")`;
};

const GOLD = "#b88a3c", GOLD_HI = "#f0d58c", GOLD_LO = "#7a5520";

// 九宫格描金边框：双线 + 四角云纹
const corner = (tx: number, ty: number, rot: number) => `
  <g transform='translate(${tx} ${ty}) rotate(${rot})'>
    <path d='M2 34 L2 12 Q2 2 12 2 L34 2' fill='none' stroke='${GOLD}' stroke-width='3'/>
    <path d='M9 30 L9 15 Q9 9 15 9 L30 9' fill='none' stroke='${GOLD_HI}' stroke-width='1.2'/>
    <path d='M14 22 q0 -8 8 -8 q6 0 6 6 q0 4 -4 4 q-3 0 -3 -3' fill='none' stroke='${GOLD}' stroke-width='2' stroke-linecap='round'/>
    <circle cx='5' cy='5' r='2.6' fill='${GOLD_HI}' stroke='${GOLD_LO}' stroke-width='0.8'/>
  </g>`;
const FRAME = svg(`
  <rect x='2' y='2' width='116' height='116' rx='6' fill='none' stroke='${GOLD_LO}' stroke-width='1.2' opacity='0.6'/>
  <rect x='5' y='5' width='110' height='110' rx='4' fill='none' stroke='${GOLD}' stroke-width='1.6'/>
  <rect x='9' y='9' width='102' height='102' rx='2' fill='none' stroke='${GOLD_HI}' stroke-width='0.8' opacity='0.8'/>
  ${corner(0, 0, 0)}${corner(120, 0, 90)}${corner(120, 120, 180)}${corner(0, 120, 270)}`);

// 细描金边框（按钮、卡片）
const FRAME_THIN = svg(`
  <rect x='1.5' y='1.5' width='57' height='57' rx='5' fill='none' stroke='${GOLD}' stroke-width='1.6'/>
  <rect x='4.5' y='4.5' width='51' height='51' rx='3' fill='none' stroke='${GOLD_HI}' stroke-width='0.7' opacity='0.7'/>
  <path d='M1.5 12 L1.5 6 Q1.5 1.5 6 1.5 L12 1.5 M48 1.5 L54 1.5 Q58.5 1.5 58.5 6 L58.5 12 M58.5 48 L58.5 54 Q58.5 58.5 54 58.5 L48 58.5 M12 58.5 L6 58.5 Q1.5 58.5 1.5 54 L1.5 48' fill='none' stroke='${GOLD_HI}' stroke-width='2.4'/>`, "0 0 60 60");

// 牌匾（标题底板）
const PLAQUE = svg(`
  <defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#5b2a1c'/><stop offset='0.5' stop-color='#3c1a12'/><stop offset='1' stop-color='#2a110b'/></linearGradient></defs>
  <path d='M14 4 H186 Q196 4 196 14 V46 Q196 56 186 56 H14 Q4 56 4 46 V14 Q4 4 14 4 Z' fill='url(%23g)' stroke='${GOLD}' stroke-width='2.4'/>
  <path d='M16 9 H184 Q191 9 191 16 V44 Q191 51 184 51 H16 Q9 51 9 44 V16 Q9 9 16 9 Z' fill='none' stroke='${GOLD_HI}' stroke-width='0.9' opacity='0.8'/>
  <path d='M0 30 L6 24 L6 36 Z M200 30 L194 24 L194 36 Z' fill='${GOLD}'/>`.replace(/%23/g, "#"), "0 0 200 60");

// 云纹底纹（面板背景上的淡纹）
const CLOUDS = svg(`
  <g fill='none' stroke='#8a6a3a' stroke-width='1.2' opacity='0.16'>
    <path d='M10 60 q10 -14 24 -6 q4 -12 18 -10 q12 2 12 14 q10 0 10 10 q0 10 -12 10 H22 q-14 0 -12 -18 Z'/>
    <path d='M30 64 q4 -8 12 -4 M50 56 q6 -6 12 0'/>
    <path d='M120 140 q8 -10 18 -4 q4 -10 14 -8 q10 2 10 12 q8 0 8 8 q0 8 -10 8 H130 q-12 0 -10 -16 Z'/>
  </g>`, "0 0 200 200");

// 纸纹
const PAPER = svg(`<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' seed='4'/><feColorMatrix values='0 0 0 0 0.35 0 0 0 0 0.28 0 0 0 0 0.18 0 0 0 0.08 0'/></filter><rect width='200' height='200' filter='url(%23n)'/>`.replace(/%23/g, "#"), "0 0 200 200");

// 水墨笔触（转场遮罩）
const BRUSH = svg(`
  <filter id='r'><feTurbulence type='fractalNoise' baseFrequency='0.02' numOctaves='3' seed='7'/><feDisplacementMap in='SourceGraphic' scale='60'/></filter>
  <g filter='url(%23r)' fill='#15120f'>
    <ellipse cx='500' cy='500' rx='430' ry='420'/>
    <ellipse cx='260' cy='320' rx='200' ry='160'/><ellipse cx='760' cy='700' rx='220' ry='180'/>
  </g>`.replace(/%23/g, "#"), "0 0 1000 1000");

/** 界面皮肤：assets/ui/ 里有对应素材就用素材，没有就用代码画的版本 */
const SKIN: [string, string, string?][] = [
  // [CSS 变量, 素材文件名, 代码版回退]
  ["--frame", "面板边框", FRAME], ["--frame-thin", "细边框", FRAME_THIN], ["--plaque", "牌匾", PLAQUE],
  ["--ui-dialog", "对话框"], ["--ui-panel", "面板底"], ["--ui-topbar", "顶栏"], ["--ui-dock", "底栏"],
  ["--ui-btn-red", "按钮_朱漆"], ["--ui-btn-jade", "按钮_青玉"], ["--ui-btn-gold", "按钮_鎏金"], ["--ui-btn-round", "按钮_圆"],
  ["--ui-namebar", "名牌"], ["--ui-card", "卡牌"], ["--ui-choice", "选项"], ["--ui-bar-frame", "进度条框"],
  ["--ui-realm", "境界徽章"], ["--ui-map-frame", "舆图框"], ["--ui-title-logo", "标题字"], ["--ui-loading", "加载背景"], ["--ui-divider", "分隔线"],
];

export function installTheme() {
  const r = document.documentElement;
  for (const [v, file, fallback] of SKIN) {
    const f = findAsset("ui", file);
    if (f) { r.style.setProperty(v, `url("${f}")`); r.classList.add(`skin-${file}`); }
    else if (fallback) r.style.setProperty(v, fallback);
  }
  r.style.setProperty("--clouds", CLOUDS);
  r.style.setProperty("--paper-tex", PAPER);
  r.style.setProperty("--brush", BRUSH);
  installRipple();
}

// ———— 全局点击涟漪：每一次触摸都有墨晕和金屑 ————

function installRipple() {
  const layer = document.createElement("div");
  layer.className = "tap-layer";
  document.body.append(layer);
  document.addEventListener("pointerdown", (e) => {
    const target = e.target as HTMLElement;
    const onButton = !!target.closest("button, .card, .act, .choice, .foe.targetable, .guard.targetable, .nav-btn");
    const ring = document.createElement("i");
    ring.className = `tap-ring ${onButton ? "gold" : ""}`;
    ring.style.left = `${e.clientX}px`;
    ring.style.top = `${e.clientY}px`;
    layer.append(ring);
    setTimeout(() => ring.remove(), 650);
    if (onButton) {
      for (let i = 0; i < 5; i++) {
        const s = document.createElement("b");
        s.className = "tap-spark";
        s.style.left = `${e.clientX}px`;
        s.style.top = `${e.clientY}px`;
        const a = Math.random() * Math.PI * 2, d = 18 + Math.random() * 22;
        s.style.setProperty("--dx", `${Math.cos(a) * d}px`);
        s.style.setProperty("--dy", `${Math.sin(a) * d}px`);
        layer.append(s);
        setTimeout(() => s.remove(), 600);
      }
    }
  }, { passive: true });
}

// ———— 水墨转场：墨团晕开盖住画面，再退去 ————

export function inkWipe(midway?: () => void, duration = 900): Promise<void> {
  return new Promise((resolve) => {
    const d = document.createElement("div");
    d.className = "ink-wipe";
    document.body.append(d);
    const a = d.animate(
      [
        { transform: "translate(-50%,-50%) scale(0.05) rotate(0deg)", opacity: 0.0 },
        { transform: "translate(-50%,-50%) scale(1.6) rotate(25deg)", opacity: 1, offset: 0.45 },
        { transform: "translate(-50%,-50%) scale(1.6) rotate(25deg)", opacity: 1, offset: 0.55 },
        { transform: "translate(-50%,-50%) scale(2.6) rotate(40deg)", opacity: 0 },
      ],
      { duration, easing: "cubic-bezier(.6,0,.4,1)" },
    );
    setTimeout(() => midway?.(), duration * 0.48);
    a.finished.then(() => { d.remove(); resolve(); }, () => { d.remove(); resolve(); });
  });
}
