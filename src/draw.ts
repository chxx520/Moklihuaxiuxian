// 补符小游戏：沿着淡色笔迹描完缺失的笔画。
import { sfx } from "./audio";
import { el } from "./ui";

type Pt = [number, number];
type Preset = {
  title: string;
  hint: string;
  printed: Pt[][]; // 已有的笔画（坐标系 100×155）
  strokes: Pt[][]; // 需要玩家描的笔画
  errorAt?: number; // 这一笔会「画歪」（剧情安排）
  errorText?: string;
  doneText: string;
};

function quad(a: Pt, c: Pt, b: Pt, n = 24): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push([(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]]);
  }
  return out;
}
const line = (a: Pt, b: Pt) => quad(a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], b, 16);

// 镇字诀的简化笔画
const ZHEN_PRINTED: Pt[][] = [
  line([50, 12], [50, 30]),
  quad([28, 34], [50, 28], [72, 34]),
  quad([34, 44], [30, 70], [40, 92]),
  quad([66, 44], [72, 70], [60, 92]),
  line([38, 60], [62, 60]),
  quad([30, 100], [50, 94], [70, 100]),
];
const ZHEN_MISSING: Pt[][] = [
  line([50, 102], [50, 128]),
  quad([36, 112], [42, 124], [34, 138]),
  quad([64, 112], [62, 128], [74, 140]),
];

const PRESETS: Record<string, Preset> = {
  v1: {
    title: "补符",
    hint: "沿着淡色的笔迹，从红点开始，一笔描到底。",
    printed: ZHEN_PRINTED,
    strokes: ZHEN_MISSING,
    errorAt: 2,
    errorText: "最后一笔收得太急，手腕一抖——笔锋歪了出去。",
    doneText: "三笔补完了。只是最后那一笔，怎么看都不对劲。",
  },
  fix: {
    title: "补上那一笔",
    hint: "阿禾的最后一笔歪了。替她补正——从红点开始。",
    printed: [...ZHEN_PRINTED, ...ZHEN_MISSING.slice(0, 2)],
    strokes: [ZHEN_MISSING[2]],
    doneText: "笔锋收住了。阿禾凑过来看，眼睛亮亮的。",
  },
  seal: {
    title: "落镇符",
    hint: "这一次，从头到尾都由你来画。",
    printed: [],
    strokes: [...ZHEN_PRINTED, ...ZHEN_MISSING],
    doneText: "九笔落定，符纸微微发热。",
  },
};

export function runDraw(id: string): Promise<Record<string, boolean>> {
  const p = PRESETS[id] ?? PRESETS.v1;
  return new Promise((resolve) => {
    const canvas = el("canvas", { class: "draw-canvas" });
    const msg = el("div", { class: "draw-msg" }, p.hint);
    const done = el("button", { class: "choice", hidden: "" }, el("span", {}, "继续"));
    const root = el("div", { class: "draw" },
      el("div", { class: "draw-title" }, el("span", { class: "seal" }, p.title), el("span", { class: "dim" }, `共 ${p.strokes.length} 笔`)),
      canvas, msg, done,
    );
    document.getElementById("game")!.append(root);

    const dpr = window.devicePixelRatio || 1;
    const W = Math.min(280, window.innerWidth * 0.72);
    const H = W * 1.55;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const g = canvas.getContext("2d")!;
    g.scale(dpr, dpr);
    const sx = (x: number) => (x / 100) * W;
    const sy = (y: number) => (y / 155) * H;

    let cur = 0;
    let drawing: Pt[] | null = null;
    let reach = 0;
    const finished: Pt[][] = [];

    const brush = (pts: Pt[], color: string, width: number, alpha = 1) => {
      if (pts.length < 2) return;
      g.save();
      g.globalAlpha = alpha;
      g.strokeStyle = color;
      g.lineCap = "round";
      g.lineJoin = "round";
      for (let i = 1; i < pts.length; i++) {
        // 起笔重、收笔轻
        const t = i / pts.length;
        g.lineWidth = width * (0.65 + 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.2)));
        g.beginPath();
        g.moveTo(sx(pts[i - 1][0]), sy(pts[i - 1][1]));
        g.lineTo(sx(pts[i][0]), sy(pts[i][1]));
        g.stroke();
      }
      g.restore();
    };

    const paint = () => {
      g.clearRect(0, 0, W, H);
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, "#efdfae");
      grd.addColorStop(1, "#e3cd8e");
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
      g.strokeStyle = "rgba(168,56,44,0.5)";
      g.lineWidth = 1.5;
      g.strokeRect(6, 6, W - 12, H - 12);
      p.printed.forEach((s) => brush(s, "#a8382c", 5.5));
      finished.forEach((s) => brush(s, "#a8382c", 5.5));
      const guide = p.strokes[cur];
      if (guide) {
        g.save();
        g.setLineDash([4, 6]);
        brush(guide, "#6d4a2a", 3, 0.35);
        g.restore();
        g.fillStyle = "#a8382c";
        g.beginPath();
        g.arc(sx(guide[0][0]), sy(guide[0][1]), 7, 0, Math.PI * 2);
        g.fill();
        const end = guide[guide.length - 1];
        g.strokeStyle = "rgba(168,56,44,0.6)";
        g.beginPath();
        g.arc(sx(end[0]), sy(end[1]), 6, 0, Math.PI * 2);
        g.stroke();
      }
      if (drawing) brush(drawing, "#8f2b20", 6);
    };

    const toLocal = (e: PointerEvent): Pt => {
      const r = canvas.getBoundingClientRect();
      return [((e.clientX - r.left) / W) * 100, ((e.clientY - r.top) / H) * 155];
    };
    const near = (a: Pt, b: Pt, tol: number) => Math.hypot((a[0] - b[0]) * W / 100, (a[1] - b[1]) * H / 155) < tol;

    canvas.addEventListener("pointerdown", (e) => {
      const guide = p.strokes[cur];
      if (!guide) return;
      const pt = toLocal(e);
      if (!near(pt, guide[0], 30)) { msg.textContent = "从红点开始落笔。"; return; }
      canvas.setPointerCapture(e.pointerId);
      drawing = [pt];
      reach = 0;
      sfx("brush");
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!drawing) return;
      const pt = toLocal(e);
      drawing.push(pt);
      const guide = p.strokes[cur];
      // 沿着笔迹前进：只要手指靠近下一个采样点就算推进
      for (let i = reach; i < Math.min(guide.length, reach + 6); i++) if (near(pt, guide[i], 26)) reach = i;
      paint();
    });
    const up = () => {
      if (!drawing) return;
      const guide = p.strokes[cur];
      const ok = reach >= guide.length - 3;
      drawing = null;
      if (!ok) {
        msg.textContent = "笔断了。从红点重新描，一口气到底。";
        paint();
        return;
      }
      if (cur === p.errorAt) {
        // 剧情安排：这一笔画歪
        const bent = guide.map(([x, y], i) => [x + (i > guide.length * 0.55 ? (i - guide.length * 0.55) * 1.4 : 0), y + (i > guide.length * 0.55 ? (i - guide.length * 0.55) * 0.6 : 0)] as Pt);
        finished.push(bent);
        msg.textContent = p.errorText ?? "";
        sfx("miss");
      } else {
        finished.push(guide);
        sfx("seal");
        msg.textContent = cur + 1 < p.strokes.length ? `第 ${cur + 1} 笔。接着来。` : "";
      }
      cur++;
      paint();
      if (cur >= p.strokes.length) {
        setTimeout(() => {
          msg.textContent = (p.errorAt !== undefined ? (p.errorText ?? "") + "\n" : "") + p.doneText;
          done.hidden = false;
        }, 500);
      }
    };
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    done.addEventListener("click", () => {
      root.remove();
      resolve({ [`draw.${id}`]: true });
    });
    paint();
  });
}
