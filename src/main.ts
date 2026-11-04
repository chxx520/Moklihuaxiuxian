// 入口：标题画面、新游戏、继续、旧事录、调试面板。
import { Engine, GameState, newState } from "./engine";
import { lintStory, parseStory, parseValue } from "./parser";
import { clearAuto, loadSaves } from "./save";
import { $, DomPresenter, el } from "./ui";
// @ts-ignore 由构建脚本注入：{ 文件名: 剧本文本 }
import storyFiles from "virtual:story";

declare const __BUILD__: string;

const START = "prologue";
const story = parseStory(storyFiles as Record<string, string>);
const problems = lintStory(story);
if (problems.length) console.warn("剧本问题：\n" + problems.join("\n"));

let presenter: DomPresenter;
let engine: Engine | null = null;

function sheet(title: string, body: HTMLElement, actions: [string, () => void][] = []) {
  const close = () => wrap.remove();
  const wrap = el("div", { class: "sheet-wrap" },
    el("div", { class: "sheet" },
      el("div", { class: "sheet-head" }, el("h2", {}, title), el("button", { class: "icon" }, "✕")),
      body,
      el("div", { class: "sheet-actions" }, ...actions.map(([label, fn]) => {
        const b = el("button", { class: "choice" }, label);
        b.addEventListener("click", () => { close(); fn(); });
        return b;
      })),
    ),
  );
  wrap.querySelector(".icon")!.addEventListener("click", close);
  wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
  document.body.append(wrap);
  return close;
}

function showJournal() {
  const s = engine?.state;
  if (!s) return;
  const body = el("div", { class: "journal" },
    el("h3", {}, "当前目标"),
    el("p", {}, s.goal ?? "（暂无）"),
    el("h3", {}, "旧事与线索"),
    s.clues.length ? el("ul", {}, ...s.clues.map((c) => el("li", {}, c.text))) : el("p", { class: "dim" }, "还没有记下什么。"),
    el("h3", {}, "已习得术法"),
    s.spells.length ? el("p", {}, s.spells.join("、")) : el("p", { class: "dim" }, "无"),
  );
  sheet("旧事录", body);
}

function showMenu() {
  sheet("菜单", el("p", { class: "dim" }, `进度已自动保存。\n版本 ${__BUILD__}`), [
    ["回到标题", () => toTitle()],
    ["调试面板", () => showDebug()],
  ]);
}

function showDebug() {
  const s = engine?.state;
  const facts = el("textarea", { class: "facts", spellcheck: "false" });
  facts.value = s ? JSON.stringify(s.facts, null, 1) : "{}";
  const list = el("div", { class: "node-list" }, ...story.order.map((id) => {
    const b = el("button", { class: "node" }, id);
    b.addEventListener("click", () => {
      close();
      const base = engine?.state ?? newState("沈砚", START);
      try { base.facts = JSON.parse(facts.value); } catch { /* 保留原值 */ }
      startFrom({ ...base, node: id, hub: undefined });
    });
    return b;
  }));
  const body = el("div", { class: "debug" },
    problems.length ? el("pre", { class: "warn" }, problems.join("\n")) : el("p", { class: "dim" }, `剧本检查通过，共 ${story.order.length} 个节点。`),
    el("h3", {}, "跳到节点（保留下方事实）"), list,
    el("h3", {}, "事实（可编辑，跳转时生效）"), facts,
    el("p", { class: "dim" }, "快捷写法：在下面输入 key=value 后点「设置」"),
  );
  const quick = el("input", { class: "quick", placeholder: "例如 solution=repair" });
  body.append(quick);
  const close = sheet("调试面板", body, [
    ["设置", () => {
      const m = quick.value.match(/^\s*([\w.]+)\s*=\s*(.+)$/);
      if (m && engine) engine.state.facts[m[1]] = parseValue(m[2]);
      showDebug();
    }],
  ]);
}

function startFrom(state: GameState) {
  engine?.stop();
  presenter.reset();
  $("#title").hidden = true;
  $("#game").hidden = false;
  engine = new Engine(story, state, presenter);
  const mine = engine;
  mine.run().then(() => {
    if (engine === mine && !$("#game").hidden) toTitle(true);
  }).catch((err) => {
    console.error(err);
    presenter.toast(`出错了：${err.message}`);
  });
}

function askName(): Promise<string> {
  return new Promise((resolve) => {
    const input = el("input", { class: "name-input", value: "沈砚", maxlength: "6" });
    const body = el("div", {}, el("p", {}, "你的名字（可以修改，最多六个字）："), input);
    sheet("入山", body, [["就叫这个", () => resolve(input.value.trim() || "沈砚")]]);
    setTimeout(() => input.focus(), 50);
  });
}

function toTitle(finished = false) {
  engine?.stop();
  engine = null;
  if (finished) clearAuto();
  $("#game").hidden = true;
  $("#title").hidden = false;
  const saves = loadSaves();
  const cont = $<HTMLButtonElement>("#btn-continue");
  cont.hidden = !saves.auto;
  if (saves.auto) cont.textContent = `继续 · ${saves.auto.chapter ?? ""}`;
}

function boot() {
  presenter = new DomPresenter();
  $("#version").textContent = `原型 ${__BUILD__}`;
  $("#btn-new").addEventListener("click", async () => {
    const name = await askName();
    startFrom(newState(name, START));
  });
  $("#btn-continue").addEventListener("click", () => {
    const s = loadSaves().auto;
    if (s) startFrom(structuredClone(s));
  });
  $("#btn-debug").addEventListener("click", showDebug);
  $("#btn-journal").addEventListener("click", (e) => { e.stopPropagation(); showJournal(); });
  $("#btn-menu").addEventListener("click", (e) => { e.stopPropagation(); showMenu(); });
  toTitle();
}

boot();
