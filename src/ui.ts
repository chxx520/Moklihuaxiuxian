// 界面层：实现 Presenter，负责把剧情显示到屏幕上并等待玩家操作。
import type { Presenter } from "./engine";

export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else e.setAttribute(k, v);
  }
  e.append(...children);
  return e;
}

const PALETTES = [
  ["#2b3a3a", "#516b63"], ["#3a2f2b", "#6d5848"], ["#2a3140", "#4d5d78"],
  ["#33302a", "#6b6450"], ["#2f2a36", "#5b4f6b"], ["#28352c", "#4f6a55"],
];

function hash(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export class DomPresenter implements Presenter {
  private art = $("#art");
  private sceneName = $("#scene-name");
  private sceneSub = $("#scene-sub");
  private chapterEl = $("#chapter");
  private panel = $("#panel");
  private speaker = $("#speaker");
  private text = $("#text");
  private choices = $("#choices");
  private toasts = $("#toasts");
  private advance: (() => void) | null = null;
  private typing: { finish: () => void; timer: number } | null = null;
  /** 统计跳过的对话，供试玩日志使用 */
  skipped = 0;

  constructor() {
    const tap = () => {
      if (this.typing) {
        this.typing.finish();
        this.skipped++;
        return;
      }
      if (this.advance) {
        const a = this.advance;
        this.advance = null;
        a();
      }
    };
    $("#stage").addEventListener("click", tap);
    this.panel.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      tap();
    });
  }

  scene(name: string, sub?: string) {
    const [a, b] = PALETTES[hash(name) % PALETTES.length];
    this.art.style.background = `radial-gradient(120% 90% at 50% 30%, ${b} 0%, ${a} 70%, #15191b 100%)`;
    this.sceneName.textContent = name;
    this.sceneSub.textContent = sub ?? "";
    this.art.classList.remove("fade");
    void this.art.offsetWidth;
    this.art.classList.add("fade");
  }

  chapter(text: string) {
    this.chapterEl.textContent = text;
  }

  /** 切换存档或跳转时，取消正在进行的打字和等待 */
  reset() {
    if (this.typing) clearInterval(this.typing.timer);
    this.typing = null;
    this.advance = null;
    this.choices.replaceChildren();
  }

  line(kind: "narration" | "dialogue" | "system", text: string, speaker?: string): Promise<void> {
    this.reset();
    this.panel.dataset.kind = kind;
    this.speaker.textContent = speaker ?? "";
    this.speaker.hidden = !speaker;
    return new Promise((resolve) => {
      let i = 0;
      const chars = [...text];
      this.text.textContent = "";
      this.panel.classList.remove("ready");
      const done = () => {
        clearInterval(timer);
        this.typing = null;
        this.text.textContent = text;
        this.panel.classList.add("ready");
        this.advance = resolve;
      };
      const timer = window.setInterval(() => {
        i += 1;
        this.text.textContent = chars.slice(0, i).join("");
        if (i >= chars.length) done();
      }, 28);
      this.typing = { finish: done, timer };
    });
  }

  private buttons(items: { label: string; cls?: string }[]): Promise<number> {
    this.panel.classList.remove("ready");
    this.advance = null;
    return new Promise((resolve) => {
      this.choices.replaceChildren(
        ...items.map((it, i) => {
          const b = el("button", { class: `choice ${it.cls ?? ""}` }, it.label);
          b.addEventListener("click", (e) => {
            e.stopPropagation();
            this.choices.replaceChildren();
            resolve(i);
          });
          return b;
        }),
      );
    });
  }

  menu(options: string[]) {
    return this.buttons(options.map((label) => ({ label })));
  }

  hub(spots: { text: string; seen: boolean; exit: boolean }[]) {
    this.panel.dataset.kind = "system";
    this.speaker.hidden = true;
    this.speaker.textContent = "";
    this.text.textContent = "要查看哪里？";
    return this.buttons(
      spots.map((s) => ({
        label: s.exit ? `${s.text} →` : `${s.seen ? "✓ " : "▸ "}${s.text}`,
        cls: s.exit ? "exit" : s.seen ? "seen" : "",
      })),
    );
  }

  end(text: string) {
    return new Promise<void>((resolve) => {
      const card = el("div", { class: "end-card" },
        el("div", { class: "end-text" }, text),
        el("button", { class: "choice" }, "回到标题"),
      );
      card.querySelector("button")!.addEventListener("click", () => {
        card.remove();
        resolve();
      });
      document.body.append(card);
    });
  }

  toast(text: string) {
    const t = el("div", { class: "toast" }, text);
    this.toasts.append(t);
    setTimeout(() => t.classList.add("out"), 2200);
    setTimeout(() => t.remove(), 2800);
  }
}
