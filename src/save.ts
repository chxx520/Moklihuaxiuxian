// 存档层：在 iOS App 里写入 App 的 Documents 目录（通过原生桥），
// 在浏览器里退回到 localStorage。
import type { GameState } from "./engine";

export type SaveFile = {
  version: 1;
  auto?: GameState;
  slots: (GameState | null)[];
  /** 关键选择前自动保留的存档，按标签 */
  checkpoints?: Record<string, GameState>;
  settings?: { music: number; sfx: number; textSpeed: number };
  /** 试玩日志：[时间戳, 类型, 内容] */
  log?: [number, string, string][];
};

declare global {
  interface Window {
    __NATIVE__?: boolean;
    __NATIVE_SAVE__?: SaveFile | null;
    webkit?: { messageHandlers?: { store?: { postMessage: (s: string) => void } } };
  }
}

const KEY = "guishan.saves.v1";
const empty = (): SaveFile => ({ version: 1, slots: [null, null, null] });

let cache: SaveFile | null = null;

export function loadSaves(): SaveFile {
  if (cache) return cache;
  let data: SaveFile | null = null;
  if (window.__NATIVE_SAVE__) data = window.__NATIVE_SAVE__;
  if (!data) {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) data = JSON.parse(raw);
    } catch {
      /* 存储不可用时从空存档开始 */
    }
  }
  cache = data && data.version === 1 ? { ...empty(), ...data } : empty();
  return cache;
}

export function writeSaves(file: SaveFile) {
  cache = file;
  const json = JSON.stringify(file);
  window.webkit?.messageHandlers?.store?.postMessage(json);
  try {
    localStorage.setItem(KEY, json);
  } catch {
    /* 忽略 */
  }
}

export function autosave(state: GameState) {
  const f = loadSaves();
  f.auto = structuredClone(state);
  writeSaves(f);
}

export function clearAuto() {
  const f = loadSaves();
  delete f.auto;
  writeSaves(f);
}

export function saveSlot(i: number, state: GameState | null) {
  const f = loadSaves();
  f.slots[i] = state ? structuredClone(state) : null;
  writeSaves(f);
}

export function saveCheckpoint(label: string, state: GameState) {
  const f = loadSaves();
  f.checkpoints = { ...f.checkpoints, [label]: structuredClone(state) };
  writeSaves(f);
}

export function getSettings() {
  return { music: 0.7, sfx: 0.8, textSpeed: 30, ...loadSaves().settings };
}

export function setSettings(s: Partial<ReturnType<typeof getSettings>>) {
  const f = loadSaves();
  f.settings = { ...getSettings(), ...s };
  writeSaves(f);
}

let logDirty = 0;
export function logEvent(type: string, text: string) {
  const f = loadSaves();
  const log = (f.log ??= []);
  log.push([Date.now(), type, text]);
  if (log.length > 3000) log.splice(0, log.length - 3000);
  // 日志随自动存档一起写；这里每 10 条额外落盘一次
  if (++logDirty % 10 === 0) writeSaves(f);
}

export function clearLog() {
  const f = loadSaves();
  f.log = [];
  writeSaves(f);
}
