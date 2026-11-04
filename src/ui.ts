// 界面层：实现 Presenter，负责把剧情显示到屏幕上并等待玩家操作。
import { figureHtml, hasPortrait, isMood, MOODS, sceneHtml } from "./art";
import { findAsset } from "./assets";
import { ambienceFor, playMusic, setAmbience, sfx, unlockAudio } from "./audio";
import { runBattle } from "./battle";
import { runDraw } from "./draw";
import { setWeather, weatherFor } from "./fx";
import { animatePortrait } from "./live";
import type { GameState, MenuItem, Presenter } from "./engine";
import type { Value } from "./parser";
import { getSettings } from "./save";
import { battleMods, give, ITEMS } from "./game/model";
import { quickOrFight } from "./game/map";

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
      unlockAudio();
      if (this.typing) {
        this.typing.finish();
        this.skipped++;
        return;
      }
      if (this.advance) {
        const a = this.advance;
        this.advance = null;
        sfx("tap");
        a();
      }
    };
    $("#stage").addEventListener("click", tap);
    this.panel.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      tap();
    });
  }

  scene(name: string, sub?: string, mood?: string, variant?: string, image?: string) {
    const m = isMood(mood) ? mood : "day";
    const key = `${name}|${m}|${variant ?? ""}|${image ?? ""}`;
    if (key === this.sceneKey) return;
    const samePlace = this.sceneKey.startsWith(name + "|");
    this.sceneKey = key;

    const layer = el("div", { class: "layer" });
    layer.innerHTML = sceneHtml(name, m, variant ?? "", image);
    this.art.append(layer);
    requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add("in")));
    setWeather($("#stage"), weatherFor(name, m, image));
    setAmbience(ambienceFor(name, m, image));
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

  private showFigure(portrait: string) {
    if (portrait === this.figureName) return;
    this.figureName = portrait;
    const old = [...this.figure.children];
    old.forEach((o) => o.classList.remove("in"));
    setTimeout(() => old.forEach((o) => o.remove()), 450);
    if (!portrait || !hasPortrait(portrait)) return;
    const f = el("div", { class: "fig" });
    f.innerHTML = figureHtml(portrait);
    this.figure.append(f);
    const img = f.querySelector("img.portrait") as HTMLImageElement | null;
    // 孩子和老人摆动小一些，年轻人衣袂飘得多一些
    const key = portrait.split("#")[0];
    const sway = /8岁|阿婆/.test(key) ? 0.6 : /青棠|温晚/.test(key) ? 1.3 : 1;
    this.live = img ? animatePortrait(img, { sway, breath: /阿婆|病中/.test(portrait) ? 0.7 : 1 }) : null;
    requestAnimationFrame(() => requestAnimationFrame(() => f.classList.add("in")));
  }

  private live: { pulse(): void; stop(): void } | null = null;
  /** 由入口注入：弹出面板 */
  sheetFn: ((title: string, body: HTMLElement, actions?: [string, () => void][], onDismiss?: () => void) => () => void) | null = null;

  /** 切换存档或跳转时，取消正在进行的打字和等待 */
  reset() {
    if (this.typing) clearInterval(this.typing.timer);
    this.typing = null;
    this.advance = null;
    this.choices.replaceChildren();
    this.sceneKey = "";
    this.showFigure("");
  }

  line(kind: "narration" | "dialogue" | "system", text: string, speaker?: string, portrait?: string): Promise<void> {
    if (this.typing) clearInterval(this.typing.timer);
    this.typing = null;
    this.advance = null;
    this.choices.replaceChildren();
    this.panel.dataset.kind = kind;
    this.speaker.textContent = speaker ?? "";
    this.speaker.hidden = !speaker;
    const hasFig = !!portrait && hasPortrait(portrait);
    if (hasFig) {
      const same = portrait === this.figureName;
      this.showFigure(portrait!);
      if (same) this.live?.pulse();
    }
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
      }, getSettings().textSpeed);
      this.typing = { finish: done, timer };
    });
  }

  private buttons(items: { label: string; cls?: string; locked?: string }[]): Promise<number> {
    this.panel.classList.remove("ready");
    this.advance = null;
    return new Promise((resolve) => {
      this.choices.replaceChildren(
        ...items.map((it, i) => {
          const b = el("button", { class: `choice ${it.cls ?? ""} ${it.locked ? "locked" : ""}` }, el("span", {}, it.label),
            ...(it.locked ? [el("small", {}, it.locked)] : []));
          b.style.animationDelay = `${i * 35}ms`;
          b.addEventListener("click", (e) => {
            e.stopPropagation();
            if (it.locked) { sfx("miss"); b.classList.remove("shake"); void b.offsetWidth; b.classList.add("shake"); return; }
            if (this.choices.dataset.busy) return;
            sfx("page");
            // 选中的选项亮一下飞出，其余淡出，再进入下一句
            this.choices.dataset.busy = "1";
            [...this.choices.children].forEach((o) => (o as HTMLElement).style.opacity = o === b ? "" : "0.25");
            b.classList.add("picked-out");
            setTimeout(() => { delete this.choices.dataset.busy; this.choices.replaceChildren(); resolve(i); }, 170);
            return;
            this.choices.replaceChildren();
            resolve(i);
          });
          return b;
        }),
      );
    });
  }

  menu(options: MenuItem[]) {
    this.figure.classList.add("idle");
    return this.buttons(options.map((o) => ({ label: o.text, locked: o.locked })));
  }

  async cmd(name: string, arg: string, state: GameState): Promise<Record<string, Value> | void> {
    switch (name) {
      case "music":
        playMusic(arg);
        return;
      case "sfx":
        sfx(arg);
        return;
      case "pause":
        await new Promise((r) => setTimeout(r, Number(arg) || 800));
        return;
      case "card":
        return this.card(arg);
      case "cg":
        return this.cg(arg);
      case "draw":
        this.reset();
        return runDraw(arg);
      case "fight": {
        // 剧情里的遭遇战：@fight 山狼
        this.reset();
        const prev = state.music;
        if (!state.p || !this.sheetFn) return;
        const win = await quickOrFight(state, arg, { sheet: this.sheetFn }, { forced: true, grant: state.spells.length ? undefined : ["驱邪符", "护身符"] });
        if (prev) playMusic(prev);
        return { [`fight.${arg}`]: win };
      }
      case "battle": {
        this.reset();
        const prev = state.music;
        playMusic("挑战");
        const p = state.p;
        const r = await runBattle(arg, state.spells, p ? { mods: battleMods(p), items: { ...p.bag }, itemDefs: ITEMS as any, onUseItem: (k) => give(p, k, -1) } : {});
        if (prev) playMusic(prev);
        return { [`${arg}.win`]: r.win, [`${arg}.objectHp`]: r.objectHp, [`${arg}.allyHurt`]: r.allyHurt, [`${arg}.turns`]: r.turns, [`${arg}.retries`]: r.retries, [`${arg}.broke`]: r.broke };
      }
    }
  }

  /** 时间跳转等全屏字卡 */
  private card(text: string) {
    return new Promise<void>((resolve) => {
      const c = el("div", { class: "time-card" }, el("div", { class: "tc-text" }, text), el("div", { class: "tc-hint" }, "轻触继续"));
      document.body.append(c);
      sfx("bell");
      const t0 = Date.now();
      c.addEventListener("click", () => { if (Date.now() - t0 < 250) return; c.classList.add("out"); setTimeout(() => c.remove(), 500); resolve(); });
    });
  }

  /** 插画：有图显示图，没有就显示一张水墨标题卡 */
  private cg(arg: string) {
    const [key, caption] = arg.split("|").map((s) => s.trim());
    return new Promise<void>((resolve) => {
      const img = findAsset("cg", key);
      const c = el("div", { class: "cg" });
      if (img) c.append(el("img", { src: img, alt: "" }));
      else c.append(el("div", { class: "cg-ph" }, el("span", { class: "cg-ph-title" }, key), el("span", { class: "seal" }, "插画")));
      if (caption) c.append(el("div", { class: "cg-cap" }, caption));
      document.body.append(c);
      sfx("page");
      const t0 = Date.now();
      c.addEventListener("click", () => { if (Date.now() - t0 < 250) return; c.classList.add("out"); setTimeout(() => c.remove(), 450); resolve(); });
    });
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
    const kinds: [RegExp, string][] = [[/^习得/, "法"], [/^获得/, "物"], [/^新地点/, "地"], [/^修为/, "修"]];
    const seal = kinds.find(([r]) => r.test(text))?.[1] ?? "记";
    const t = el("div", { class: "toast" },
      el("span", { class: "seal" }, seal),
      el("span", { class: "toast-text" }, text.replace(/^(记入旧事录|习得术法)：/, seal === "法" ? "习得 · " : "")),
    );
    if (seal === "物" || seal === "法") sfx("get");
    this.toasts.append(t);
    setTimeout(() => t.classList.add("out"), 2600);
    setTimeout(() => t.remove(), 3200);
  }

}
