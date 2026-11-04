// 外部素材查找：构建时扫描 assets/，生成可用文件清单。
// 有图用图，没图时调用方退回代码生成的占位美术。
// @ts-ignore 由构建脚本注入
import manifest from "virtual:assets";

const files = manifest as string[];
const index = new Map<string, string>();
for (const f of files) {
  const [kind, ...rest] = f.split("/");
  const base = rest.join("/").replace(/\.(png|jpe?g|webp|mp3|m4a|ogg)$/i, "");
  index.set(`${kind}/${base}`, encodeURI(`assets/${f}`));
}

/** 精确匹配 kind/key；找不到时按前缀匹配（例如只画了一个表情时，其他表情也先用它）。 */
export function findAsset(kind: string, key: string, floor = key): string | null {
  const exact = index.get(`${kind}/${key}`);
  if (exact) return exact;
  // 去掉最后一段再找，例如 温小满_8岁_哭 → 温小满_8岁_*；不会退到比 floor 更短（避免 8 岁用上 28 岁的图）
  const parts = key.split("_");
  while (parts.length >= 1) {
    const prefix = parts.join("_");
    if (prefix.length < floor.length) break;
    for (const [k, v] of index) if (k === `${kind}/${prefix}` || k.startsWith(`${kind}/${prefix}_`)) return v;
    parts.pop();
  }
  return null;
}

export function assetCount() {
  return files.length;
}

/** 按前缀找第一个素材（例如「槐荫村口_」找到「槐荫村口_秋黄昏」） */
export function findAssetPrefix(kind: string, prefix: string): string | null {
  for (const [k, v] of index) if (k.startsWith(`${kind}/${prefix}`)) return v;
  return null;
}
