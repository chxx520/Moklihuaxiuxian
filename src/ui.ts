// 界面层：实现 Presenter，负责把剧情显示到屏幕上并等待玩家操作。
import { hasFigure, isMood, MOODS, renderFigure, renderScene } from "./art";
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

export class DomPresenter implements Presenter {
  private art = $("#art");
  private inscription = $("#inscription");
  private figure = $("#figure");
  private chapterEl = $("#chapter");
  private panel = $("#panel");
  private speaker = $("#speaker");
  private text = $("#text");
  private choices = $("#choices");
  private toasts = $("#toasts");
  private advance: (() => void) | null = null;
  private typing: { finish: () => void; timer: number } | null = null;
  private sceneKey = "";
  private figureName = "";
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

  scene(name: string, sub?: string, mood?: string, variant?: string) {
    const m = isMood(mood) ? mood : "day";
    const key = `${name}|${m}|${variant ?? ""}`;
    if (key === this.sceneKey) return;
    const samePlace = this.sceneKey.startsWith(name + "|");
    this.sceneKey = key;

    const layer = el("div", { class: "layer" });
    layer.innerHTML = renderScene(name, m, variant);
    this.art.append(layer);
    requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add("in")));
    const old = [...this.art.children].slice(0, -1);
    setTimeout(() => old.forEach((o) => o.remove()), 1300);

    $("#game").dataset.dark = String(MOODS[m].dark);
    if (!samePlace) {
      this.inscription.replaceChildren(
        el("span", { class: "ins-name" }, name),
        ...(sub ? [el("span", { class: "ins-sub" }, sub)] : []),
      );
      this.inscription.classList.remove("show");
      void this.inscription.offsetWidth;
      this.inscription.classList.add("show");
      this.showFigure("");
    }
  }

  chapter(text: string) {
    this.chapterEl.textContent = text;
  }

  private showFigure(name: string) {
    if (name === this.figureName) return;
    this.figureName = name;
    const old = [...this.figure.children];
    old.forEach((o) => o.classList.remove("in"));
    setTimeout(() => old.forEach((o) => o.remove()), 450);
    if (!name || !hasFigure(name)) return;
    const f = el("div", { class: "fig" });
    f.innerHTML = renderFigure(name);
    this.figure.append(f);
    requestAnimationFrame(() => requestAnimationFrame(() => f.classList.add("in")));
  }

  /** 切换存档或跳转时，取消正在进行的打字和等待 */
  reset() {
    if (this.typing) clearInterval(this.typing.timer);
    this.typing = null;
    this.advance = null;
    this.choices.replaceChildren();
    this.sceneKey = "";
    this.showFigure("");
  }

  line(kind: "narration" | "dialogue" | "system", text: string, speaker?: string): Promise<void> {
    if (this.typing) clearInterval(this.typing.timer);
    this.typing = null;
    this.advance = null;
    this.choices.replaceChildren();
    this.panel.dataset.kind = kind;
    this.speaker.textContent = speaker ?? "";
    this.speaker.hidden = !speaker;
    const hasFig = !!speaker && hasFigure(speaker);
    if (hasFig) this.showFigure(speaker!);
    this.figure.classList.toggle("idle", !hasFig);

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
      }, 30);
      this.typing = { finish: done, timer };
    });
  }

  private buttons(items: { label: string; cls?: string }[]): Promise<number> {
    this.panel.classList.remove("ready");
    this.advance = null;
    return new Promise((resolve) => {
      this.choices.replaceChildren(
        ...items.map((it, i) => {
          const b = el("button", { class: `choice ${it.cls ?? ""}` }, el("span", {}, it.label));
          b.style.animationDelay = `${i * 70}ms`;
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
    this.figure.classList.add("idle");
    return this.buttons(options.map((label) => ({ label })));
  }

  hub(spots: { text: string; seen: boolean; exit: boolean }[]) {
    this.panel.dataset.kind = "system";
    this.speaker.hidden = true;
    this.speaker.textContent = "";
    this.text.textContent = "要查看哪里？";
    this.showFigure("");
    return this.buttons(
      spots.map((s) => ({ label: s.text, cls: s.exit ? "exit" : s.seen ? "seen" : "spot" })),
    );
  }

  end(text: string) {
    return new Promise<void>((resolve) => {
      const card = el("div", { class: "end-card" },
        el("div", { class: "end-text" }, text),
        el("span", { class: "seal big" }, "归山"),
        el("button", { class: "choice" }, el("span", {}, "回到标题")),
      );
      card.querySelector("button")!.addEventListener("click", () => {
        card.remove();
        resolve();
      });
      document.body.append(card);
    });
  }

  toast(text: string) {
    const isSpell = text.startsWith("习得");
    const t = el("div", { class: "toast" },
      el("span", { class: "seal" }, isSpell ? "法" : "记"),
      el("span", { class: "toast-text" }, text.replace(/^(记入旧事录|习得术法)：/, isSpell ? "习得 · " : "")),
    );
    this.toasts.append(t);
    setTimeout(() => t.classList.add("out"), 2600);
    setTimeout(() => t.remove(), 3200);
  }
}
