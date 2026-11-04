// 入口：标题画面、新游戏、继续、存读档、章节回溯、旧事录、设置、试玩日志、调试面板。
import { titleHtml } from "./art";
import { setWeather } from "./fx";
import { inkWipe, installTheme } from "./theme";
import { assetCount } from "./assets";
import { applyVolume, playMusic, setAmbience, sfx, stopMusic, unlockAudio } from "./audio";
import { battleIds } from "./battle";
import { Engine, GameState, newState } from "./engine";
import { lintStory, parseStory, parseValue } from "./parser";
import { clearAuto, clearLog, flushSaves, getSettings, loadSaves, logEvent, saveSlot, setSettings } from "./save";
import { SPELLS, SPELL_ORDER } from "./spells";
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
  sfx("open");
  const close = () => { sfx("close"); wrap.remove(); };
  const wrap = el("div", { class: "sheet-wrap" },
    el("div", { class: "sheet" },
      el("div", { class: "sheet-head" }, el("h2", {}, title), el("button", { class: "icon" }, "✕")),
      body,
      el("div", { class: "sheet-actions" }, ...actions.map(([label, fn]) => {
        const b = el("button", { class: "choice" }, el("span", {}, label));
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

const fmtTime = (t: number) => {
  const d = new Date(t);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

function showJournal() {
  const s = engine?.state;
  if (!s) return;
  const spells = SPELL_ORDER.filter((n) => s.spells.includes(n)).map((n) => SPELLS[n]);
  const body = el("div", { class: "journal" },
    el("h3", {}, "当前目标"),
    el("p", {}, s.goal ?? "（暂无）"),
    el("h3", {}, "旧事与线索"),
    s.clues.length ? el("ul", {}, ...s.clues.map((c) => el("li", {}, c.text))) : el("p", { class: "dim" }, "还没有记下什么。"),
    el("h3", {}, "已习得术法"),
    spells.length
      ? el("ul", {}, ...spells.map((sp) => el("li", {}, el("b", {}, `${sp.name}`), `（${sp.kind}，灵力 ${sp.cost}${sp.paper ? `，符纸 ${sp.paper}` : ""}）${sp.desc}${sp.field ? `　探索：${sp.field}` : ""}`)))
      : el("p", { class: "dim" }, "无"),
  );
  sheet("旧事录", body);
}

function slotList(mode: "save" | "load") {
  const saves = loadSaves();
  const box = el("div", {});
  saves.slots.forEach((st, i) => {
    const info = el("div", { class: "info" }, st ? `${st.chapter ?? ""}\n${fmtTime(st.savedAt)}` : "（空）");
    info.style.whiteSpace = "pre-line";
    const btn = el("button", { class: "choice" }, el("span", {}, mode === "save" ? "存到这里" : "读取"));
    if (mode === "load" && !st) btn.setAttribute("disabled", "");
    btn.addEventListener("click", () => {
      document.querySelector(".sheet-wrap")?.remove();
      if (mode === "save" && engine) { saveSlot(i, engine.state); presenter.toast(`已存到第 ${i + 1} 格`); }
      if (mode === "load" && st) startFrom(structuredClone(st));
    });
    box.append(el("div", { class: "slot" }, el("span", {}, `第 ${i + 1} 格`), info, btn));
  });
  return box;
}

function showSlots(mode: "save" | "load") {
  sheet(mode === "save" ? "存档" : "读档", slotList(mode));
}

function showCheckpoints() {
  const cps = loadSaves().checkpoints ?? {};
  const keys = Object.keys(cps);
  const body = el("div", {},
    el("p", { class: "dim" }, "关键选择之前，游戏会自动留一份存档。可以从这里回去，试试另一条路。"),
    ...(keys.length ? keys.map((k) => {
      const b = el("button", { class: "choice" }, el("span", {}, `${k}　·　${fmtTime(cps[k].savedAt)}`));
      b.addEventListener("click", () => { document.querySelector(".sheet-wrap")?.remove(); startFrom(structuredClone(cps[k])); });
      return b;
    }) : [el("p", {}, "还没有经过关键选择。")]),
  );
  body.querySelectorAll(".choice").forEach((b) => ((b as HTMLElement).style.marginBottom = "8px"));
  sheet("章节回溯", body);
}

function showSettings() {
  const s = getSettings();
  const slider = (label: string, key: "music" | "sfx", ) => {
    const input = el("input", { type: "range", min: "0", max: "1", step: "0.05", value: String(s[key]) });
    input.addEventListener("input", () => { setSettings({ [key]: Number(input.value) }); applyVolume(); });
    return el("div", { class: "setting" }, el("label", {}, label), input);
  };
  const speed = el("input", { type: "range", min: "8", max: "60", step: "2", value: String(68 - s.textSpeed) });
  speed.addEventListener("input", () => setSettings({ textSpeed: 68 - Number(speed.value) }));
  sheet("设置", el("div", {}, slider("音乐", "music"), slider("音效", "sfx"), el("div", { class: "setting" }, el("label", {}, "文字速度"), speed)));
}

function showLog() {
  const log = loadSaves().log ?? [];
  const lines = log.map(([t, k, v], i) => {
    const prev = i ? log[i - 1][0] : t;
    return `${fmtTime(t)} +${Math.round((t - prev) / 1000)}s ${k} ${v}`;
  });
  const box = el("textarea", { class: "log-box", readonly: "" });
  box.value = `《归山》试玩日志 · ${__BUILD__} · 共 ${log.length} 条 · 跳过对话 ${presenter.skipped} 次\n` + lines.join("\n");
  sheet("试玩日志", el("div", {}, el("p", { class: "dim" }, "记录了停留时间、选择和挑战结果。点「复制」后发给开发者。"), box), [
    ["复制", () => {
      box.select();
      navigator.clipboard?.writeText(box.value).then(() => presenter.toast("已复制"), () => { document.execCommand("copy"); presenter.toast("已复制"); });
    }],
    ["清空日志", () => { clearLog(); presenter.toast("已清空"); }],
  ]);
}

function showCredits() {
  sheet("致谢", el("div", { class: "credits" },
    el("h3", {}, "字体"),
    el("p", {}, "霞鹜文楷 LXGW WenKai，SIL Open Font License 1.1。"),
    el("h3", {}, "音效"),
    el("p", {}, "\"Oculus Audio Pack 01\" by Oculus VR, LLC (https://developers.meta.com/vr/downloads/package/oculus-audio-pack-1/), licensed under CC BY 4.0. Files renamed to the UCS naming convention; OGG previews transcoded from the original WAVs. 本游戏使用时转为 AAC 格式并截选。"),
    el("h3", {}, "美术"),
    el("p", {}, "人物、场景与插画为本项目原创生成。"),
  ));
}

function showMenu() {
  sheet("菜单", el("p", { class: "dim" }, `进度会自动保存。\n版本 ${__BUILD__}`), [
    ["存档", () => showSlots("save")],
    ["读档", () => showSlots("load")],
    ["章节回溯", () => showCheckpoints()],
    ["设置", () => showSettings()],
    ["试玩日志", () => showLog()],
    ["致谢", () => showCredits()],
    ["回到标题", () => toTitle()],
    ["调试面板", () => showDebug()],
  ]);
}

function showDebug() {
  const s = engine?.state;
  const facts = el("textarea", { class: "facts", spellcheck: "false" });
  facts.value = s ? JSON.stringify(s.facts, null, 1) : "{}";
  const jump = (id: string) => {
    close();
    const base = engine?.state ?? newState("沈砚", START);
    try { base.facts = JSON.parse(facts.value); } catch { /* 保留原值 */ }
    for (const sp of ["驱邪符", "护身符", "明灯符", "定身符", "辨气术", "破煞符"]) if (!base.spells.includes(sp) && debugAllSpells.checked) base.spells.push(sp);
    startFrom({ ...base, node: id, hub: undefined });
  };
  const debugAllSpells = el("input", { type: "checkbox" }) as HTMLInputElement;
  const list = el("div", { class: "node-list" }, ...story.order.map((id) => {
    const b = el("button", { class: "node" }, id);
    b.addEventListener("click", () => jump(id));
    return b;
  }));
  const quick = el("input", { class: "quick", placeholder: "例如 solution=repair" });
  const body = el("div", { class: "debug" },
    problems.length ? el("pre", { class: "warn" }, problems.join("\n")) : el("p", { class: "dim" }, `剧本检查通过：${story.order.length} 个节点，${battleIds().length} 场挑战，${assetCount()} 个素材。`),
    el("label", { class: "dim" }, debugAllSpells, " 跳转时补齐全部术法"),
    el("h3", {}, "跳到节点（保留下方事实）"), list,
    el("h3", {}, "事实（可编辑，跳转时生效）"), facts,
    el("p", { class: "dim" }, "快捷写法：输入 key=value 后点「设置」"), quick,
  );
  const close = sheet("调试面板", body, [
    ["设置", () => {
      const m = quick.value.match(/^\s*([\w.]+)\s*=\s*(.+)$/);
      if (m && engine) engine.state.facts[m[1]] = parseValue(m[2]);
      showDebug();
    }],
  ]);
}

function startFrom(state: GameState) {
  if (!$("#title").hidden) { void inkWipe(() => startFromNow(state)); return; }
  startFromNow(state);
}

function startFromNow(state: GameState) {
  engine?.stop();
  presenter.reset();
  document.querySelectorAll(".battle, .draw, .cg, .time-card, .end-card").forEach((n) => n.remove());
  state.cast ??= {};
  $("#title").hidden = true;
  $("#game").hidden = false;
  logEvent("start", state.node);
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
  document.querySelectorAll(".battle, .draw").forEach((n) => n.remove());
  $("#game").hidden = true;
  $("#title").hidden = false;
  playMusic("主题");
  setAmbience("环境_风林");
  setWeather($("#title"), "petals");
  const saves = loadSaves();
  const cont = $<HTMLButtonElement>("#btn-continue");
  cont.hidden = !saves.auto;
  if (saves.auto) cont.querySelector("span")!.textContent = `继续 · ${saves.auto.chapter ?? ""}`;
  $("#btn-load").hidden = !saves.slots.some(Boolean) && !Object.keys(saves.checkpoints ?? {}).length;
}

function boot() {
  installTheme();
  presenter = new DomPresenter();
  $("#title-art").innerHTML = titleHtml();
  $("#version").textContent = `原型 ${__BUILD__}`;
  $("#btn-new").addEventListener("click", async () => {
    unlockAudio();
    const name = await askName();
    startFrom(newState(name, START));
  });
  $("#btn-continue").addEventListener("click", () => {
    unlockAudio();
    const s = loadSaves().auto;
    if (s) startFrom(structuredClone(s));
  });
  $("#btn-load").addEventListener("click", () => {
    unlockAudio();
    sheet("读档", el("div", {}, slotList("load")), [["章节回溯", () => showCheckpoints()]]);
  });
  $("#btn-settings").addEventListener("click", showSettings);
  $("#btn-debug").addEventListener("click", showDebug);
  $("#btn-journal").addEventListener("click", (e) => { e.stopPropagation(); showJournal(); });
  $("#btn-menu").addEventListener("click", (e) => { e.stopPropagation(); showMenu(); });
  // 标题页第一次触摸时开始播放音乐（iOS 要求）
  document.addEventListener("pointerdown", () => { unlockAudio(); if (!$("#title").hidden) playMusic("主题"); }, { once: true });
  document.addEventListener("visibilitychange", () => { if (document.hidden) flushSaves(); });
  window.addEventListener("pagehide", () => flushSaves());
  toTitle();
}

void stopMusic;
boot();
