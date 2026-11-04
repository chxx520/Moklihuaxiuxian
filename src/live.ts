// 动态立绘：把一张透明立绘贴到网格上，用顶点着色器做呼吸、随风摆动、衣摆飘动。
// 原理接近简化版 Live2D，不需要分层素材。WebGL 不可用时退回静态图片。

const VS = `
attribute vec2 aPos;
uniform float uTime;
uniform float uSway;
uniform float uBreath;
uniform float uLean;
varying vec2 vUv;
void main() {
  vec2 uv = aPos;
  vUv = uv;
  float v = uv.y;            // 0 = 头顶，1 = 脚底
  float u = uv.x - 0.5;
  float top = pow(1.0 - v, 1.6);
  vec2 p = uv;
  // 整体随风轻摆：越往上摆得越多，脚底不动
  p.x += sin(uTime * 0.8 + v * 1.7) * 0.010 * uSway * top;
  // 呼吸：胸口附近上下起伏，并轻微横向撑开
  float chest = exp(-pow((v - 0.33) / 0.12, 2.0));
  p.y -= sin(uTime * 1.5) * 0.0045 * uBreath * (1.0 - v);
  p.x += u * sin(uTime * 1.5) * 0.006 * uBreath * chest;
  // 衣摆与发梢：画面两侧、下半身边缘的飘动
  float edge = smoothstep(0.18, 0.5, abs(u));
  float hem = smoothstep(0.55, 1.0, v) * (1.0 - smoothstep(0.96, 1.0, v));
  p.x += sin(uTime * 2.1 + v * 9.0 + u * 4.0) * 0.010 * uSway * edge * (0.4 + hem);
  // 说话时向前微倾
  p.y += uLean * 0.012 * top;
  p.x += uLean * 0.004 * top;
  gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
}`;

const FS = `
precision mediump float;
uniform sampler2D uTex;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uTex, vUv);
  gl_FragColor = c * uAlpha;
}`;

type Live = {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  prog: WebGLProgram;
  count: number;
  seed: number;
  lean: number;
  leanTarget: number;
  uni: Record<string, WebGLUniformLocation | null>;
  alive: boolean;
};

const lives = new Set<Live>();
let raf = 0;

/** 释放 WebGL 环境（浏览器同时能保留的数量有限，不释放会导致立绘空白甚至页面崩溃） */
function release(l: Live) {
  lives.delete(l);
  l.alive = false;
  try { l.gl.getExtension("WEBGL_lose_context")?.loseContext(); } catch { /* 忽略 */ }
  l.canvas.width = 1;
  l.canvas.height = 1;
}

function loop(t: number) {
  raf = 0;
  for (const l of lives) {
    if (!l.alive || !l.canvas.isConnected) { release(l); continue; }
    draw(l, t / 1000);
  }
  if (lives.size && !document.hidden) raf = requestAnimationFrame(loop);
}

function kick() {
  if (!raf && lives.size) raf = requestAnimationFrame(loop);
}
document.addEventListener("visibilitychange", kick);
setInterval(() => { for (const l of lives) if (!l.canvas.isConnected) release(l); }, 2000);

function draw(l: Live, time: number) {
  const { gl } = l;
  l.lean += (l.leanTarget - l.lean) * 0.12;
  if (Math.abs(l.leanTarget - l.lean) < 0.01) l.leanTarget *= 0.92;
  gl.viewport(0, 0, l.canvas.width, l.canvas.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.uniform1f(l.uni.uTime, time + l.seed);
  gl.uniform1f(l.uni.uLean, l.lean);
  gl.drawElements(gl.TRIANGLES, l.count, gl.UNSIGNED_SHORT, 0);
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
  return s;
}

/** 把容器里的 <img class="portrait"> 换成动态立绘。返回控制器（用于说话时前倾）。 */
export function animatePortrait(img: HTMLImageElement, opts: { sway?: number; breath?: number } = {}) {
  const canvas = document.createElement("canvas");
  canvas.className = "portrait live";
  canvas.style.cssText = img.style.cssText;
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) return null;

  const start = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const h = img.getBoundingClientRect().height || img.naturalHeight;
    const w = h * (img.naturalWidth / img.naturalHeight);
    canvas.width = Math.max(2, Math.round(w * dpr));
    canvas.height = Math.max(2, Math.round(h * dpr));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    // 24 × 40 的网格
    const NX = 24, NY = 40;
    const verts: number[] = [];
    for (let y = 0; y <= NY; y++) for (let x = 0; x <= NX; x++) verts.push(x / NX, y / NY);
    const idx: number[] = [];
    for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
      const a = y * (NX + 1) + x, b = a + 1, c = a + NX + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const uni: Live["uni"] = {};
    for (const n of ["uTime", "uSway", "uBreath", "uLean", "uTex", "uAlpha"]) uni[n] = gl.getUniformLocation(prog, n);
    gl.uniform1f(uni.uSway, opts.sway ?? 1);
    gl.uniform1f(uni.uBreath, opts.breath ?? 1);
    gl.uniform1f(uni.uAlpha, 1);
    gl.uniform1i(uni.uTex, 0);

    live.prog = prog;
    live.count = idx.length;
    live.uni = uni;
    img.replaceWith(canvas);
    lives.add(live);
    kick();
  };

  const live: Live = { canvas, gl, prog: null as any, count: 0, seed: Math.random() * 100, lean: 0, leanTarget: 0, uni: {}, alive: true };
  const ready = () => { try { start(); } catch (e) { console.warn("动态立绘不可用", e); } };
  if (img.complete && img.naturalWidth) requestAnimationFrame(ready);
  else img.addEventListener("load", () => requestAnimationFrame(ready), { once: true });

  return {
    /** 说话时前倾一下 */
    pulse() { live.leanTarget = 1; kick(); },
    stop() { release(live); },
  };
}
