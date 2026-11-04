// 存档层：在 iOS App 里写入 App 的 Documents 目录（通过原生桥），
// 在浏览器里退回到 localStorage。
import type { GameState } from "./engine";

export type SaveFile = {
  version: 1;
  auto?: GameState;
  slots: (GameState | null)[];
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
