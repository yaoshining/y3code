export const clamp = (value: number) => Math.max(0, Math.min(1, value));
const mix = (a: number, b: number, fraction: number) => a + (b - a) * fraction;
const sm = (a: number, b: number, v: number) => {
  const x = clamp((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};
const TAU = Math.PI * 2,
  fract = (v: number) => v - Math.floor(v),
  sin = Math.sin,
  cos = Math.cos;
function seed(n: number) {
  return () => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n / 4294967296;
  };
}
function makeGraph() {
  const random = seed(84621),
    nodes = [],
    edges = [];
  const cols = 14,
    rows = 3;
  for (let k = 0; k < cols * rows; k++) {
    const col = k % cols,
      row = Math.floor(k / cols),
      x = (col + 0.45 + (row % 2) * 0.33) / cols,
      step = 0.3;
    nodes.push({
      x: clamp(x + (random() - 0.5) * 0.043),
      y: clamp(0.15 + row * (step + 0.02) + (random() - 0.5) * 0.25),
      lx: x,
      ly: 0.19 + row * step,
      z: random(),
      phase: random() * TAU,
      g: random(),
      color: (k % 9 === 0 ? "pink" : k % 3 ? "cyan" : "violet") as CoolColor,
    });
  }
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!,
        b = nodes[j]!,
        d = Math.hypot((a.lx - b.lx) * 3.4, a.ly - b.ly);
      if (d < 0.395)
        edges.push({
          i,
          j,
          at: 0.16 + d * 0.31 + random() * 0.22,
          speed: 0.18 + random() * 0.25,
          phase: random(),
          color: a.color,
        });
    }
  return { nodes, edges };
}
function canvas() {
  return document.createElement("canvas");
}
type CoolColor = "cyan" | "violet" | "pink";
type GlowColor = CoolColor | "gold" | "hot";
export type NebulaPalette = Record<GlowColor | "deep" | "space", string>;

export const silkNebulaPalette: NebulaPalette = {
  deep: "#0b0819",
  space: "#100c21",
  cyan: "#5ee7ff",
  violet: "#9b6bff",
  pink: "#ff5fd2",
  gold: "#ffd27a",
  hot: "#fff4d6",
};

function sprite(color: string) {
  const result = canvas();
  result.width = result.height = 96;
  const ctx = result.getContext("2d")!;
  const gradient = ctx.createRadialGradient(48, 48, 0, 48, 48, 48);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.17, `color-mix(in srgb, ${color} 68%, transparent)`);
  gradient.addColorStop(0.48, `color-mix(in srgb, ${color} 21%, transparent)`);
  gradient.addColorStop(1, "transparent");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 96, 96);
  return result;
}

function makeOptics(p: NebulaPalette) {
  const sprites = {
    cyan: sprite(p.cyan),
    violet: sprite(p.violet),
    pink: sprite(p.pink),
    gold: sprite(p.gold),
    hot: sprite(p.hot),
  };
  const ramp = (key: CoolColor) =>
    Array.from({ length: 129 }, (_, i) =>
      i === 0
        ? p[key]
        : i === 128
          ? p.gold
          : `color-mix(in srgb, ${p.gold} ${(i / 128) * 100}%, ${p[key]})`,
    );
  const ramps = { cyan: ramp("cyan"), violet: ramp("violet"), pink: ramp("pink") };
  return { sprites, ramps };
}

function bloom(
  ctx: CanvasRenderingContext2D,
  sprites: Record<GlowColor, HTMLCanvasElement>,
  k: GlowColor,
  x: number,
  y: number,
  w: number,
  h = w,
) {
  ctx.drawImage(sprites[k], x - w * 0.5, y - h * 0.5, w, h);
}

function makeLayers(
  w: number,
  h: number,
  dpr: number,
  p: NebulaPalette,
  optics: ReturnType<typeof makeOptics>,
) {
  const sky = canvas(),
    gas = canvas();
  for (const c of [sky, gas]) {
    c.width = Math.ceil(w * dpr);
    c.height = Math.ceil(h * dpr);
  }
  const s = sky.getContext("2d")!,
    g = gas.getContext("2d")!,
    r = seed(2711);
  s.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (let i = 0; i < 102; i++) {
    const x = r() * w,
      y = r() * h,
      z = r();
    s.globalAlpha = 0.09 + r() * 0.38;
    s.fillStyle = i % 7 ? p.cyan : p.violet;
    s.fillRect(x, y, z * z * 1.3 + 0.25, z * z * 1.3 + 0.25);
  }
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 24; i++) {
    const x = r() * w,
      y = h * (0.52 + 0.18 * sin((x / w) * 9) + (r() - 0.5) * 0.52),
      a = r();
    g.globalAlpha = 0.018 + a * 0.072;
    bloom(
      g,
      optics.sprites,
      i % 6 === 0 ? "pink" : i % 3 === 0 ? "cyan" : "violet",
      x,
      y,
      w * (0.11 + a * 0.26),
      h * (0.2 + a * 0.65),
    );
  }
  return { sky, gas };
}

const graph = makeGraph();

export const isOverloadLevel = (id: string) =>
  id.toLowerCase() === "max" || id.toLowerCase() === "ultra";

const levelIntensity: Readonly<Record<string, number>> = {
  off: 0,
  none: 0,
  minimal: 0.08,
  low: 0.2,
  medium: 0.39,
  high: 0.58,
  xhigh: 0.74,
  max: 0.89,
  ultra: 1,
};

export function mapNebulaLevels(ids: readonly string[]) {
  const evenlySpaced = ids.map((_, i) => i / Math.max(1, ids.length - 1));
  const named = ids.map((id, index) => {
    const key = id.toLowerCase();
    return Object.hasOwn(levelIntensity, key) ? levelIntensity[key]! : evenlySpaced[index]!;
  });
  const values = named.every((value, index) => index === 0 || value > named[index - 1]!)
    ? named
    : evenlySpaced;
  const firstHot = ids.findIndex(isOverloadLevel);
  const overload =
    firstHot > 0
      ? {
          position: (firstHot - 0.5) / (ids.length - 1),
          t: (values[firstHot - 1]! + values[firstHot]!) / 2,
          peak: values[firstHot]!,
        }
      : null;
  return { values, overload };
}

export function interpolateNebulaLevel(position: number, values: readonly number[]) {
  const stop = clamp(position) * (values.length - 1);
  const index = Math.min(Math.floor(stop), values.length - 2);
  return mix(values[index]!, values[index + 1]!, stop - index);
}

export function createNebulaLayers(w: number, h: number, dpr: number, palette: NebulaPalette) {
  const optics = makeOptics(palette);
  return { ...optics, ...makeLayers(w, h, dpr, palette, optics) };
}

type SceneOptions = ReturnType<typeof createNebulaLayers> & {
  railStart: number;
  railLength: number;
  values: readonly number[];
  boundary: { x: number; t: number; peak: number } | null;
  reduced: boolean;
};

export function renderNeuralNebulaFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  timeSec: number,
  p: NebulaPalette,
  opts: SceneOptions,
) {
  const { nodes, edges } = graph;
  const { boundary, railStart, railLength, values } = opts;
  let stop = 0;
  while (stop < values.length - 2 && t > values[stop + 1]!) stop++;
  const progress = clamp((t - values[stop]!) / (values[stop + 1]! - values[stop]!));
  const center = railStart + (railLength * (stop + progress)) / (values.length - 1);
  const coords = new Float32Array(nodes.length * 2);
  const strengths = new Float32Array(nodes.length);
  const motion = opts.reduced ? 0 : 1,
    time = motion * timeSec;
  const warm = boundary ? sm(boundary.t, boundary.peak, t) : 0;
  const ultra = boundary ? (boundary.peak === 1 ? warm : sm(boundary.peak, 1, t)) : 0;
  const crystal = sm(0.48, 0.74, t),
    wake = sm(0.01, 0.24, t),
    cy = h * 0.5;
  const scale = 0.74;
  const { sprites, ramps } = opts,
    warmIndex = Math.round(warm * 128);
  const sx = sin(time * 53) * 0.85 * ultra * motion,
    sy = sin(time * 43 + 0.5) * 0.65 * ultra * motion;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = p.deep;
  // Cover the rounded-up backing store; fractional CSS edges otherwise retain history.
  ctx.save();
  ctx.resetTransform();
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
  if (boundary) {
    ctx.globalAlpha = 0.047;
    ctx.fillStyle = p.gold;
    ctx.fillRect(boundary.x, 0, w - boundary.x, h);
  }
  ctx.translate(sx * scale, sy * scale);
  ctx.globalAlpha = 0.13 + wake * 0.72;
  ctx.drawImage(opts.sky, 0, 0, w, h);
  ctx.globalAlpha = 0.09 + wake * 0.18;
  ctx.fillStyle = p.space;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = (0.055 + wake * 0.32 + crystal * 0.27) * (1 - warm * 0.53);
  ctx.drawImage(
    opts.gas,
    sin(time * 0.32) * w * 0.034 * crystal,
    -2 + h * 0.027 * cos(time * 0.26) * crystal,
    w,
    h,
  );
  ctx.globalAlpha = warm * 0.22;
  bloom(ctx, sprites, "gold", center, cy, w * 0.68, h * 1.6);
  const idle = 1 - sm(0.025, 0.2, t),
    emberX = w * 0.3;
  if (idle > 0) {
    ctx.globalAlpha = idle * 0.34;
    ctx.strokeStyle = p.violet;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(w * 0.06, cy);
    ctx.lineTo(w * 0.94, cy);
    ctx.stroke();
    ctx.globalAlpha = idle * 0.52;
    bloom(ctx, sprites, "violet", emberX, cy, 26);
    ctx.fillStyle = p.violet;
    ctx.fillRect(emberX, cy, 1.2, 1.2);
  }
  if (crystal > 0) {
    for (let k = 0; k < 4; k++) {
      const color = k % 3 === 0 ? "pink" : k % 3 === 1 ? "violet" : "cyan";
      ctx.globalAlpha = crystal * (0.14 - k * 0.012) * (1 - warm * 0.8);
      ctx.strokeStyle = p[color];
      ctx.lineWidth = (k === 0 ? 1.4 : 0.6) * scale;
      ctx.beginPath();
      for (let x = 0; x <= w + 10; x += 9) {
        const u = x / w,
          y =
            cy +
            h *
              (sin(u * 9 + k * 0.13 - time * 0.33) * (0.2 + k * 0.017) +
                cos(u * 15 + k * 0.7 + time * 0.18) * 0.047);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      if (k < 3) {
        ctx.globalAlpha = crystal * (0.18 - k * 0.033) * (1 - warm * 0.83);
        for (let u = 0.04; u < 1; u += 0.076) {
          const y =
            cy +
            h *
              (sin(u * 9 + k * 0.13 - time * 0.33) * (0.2 + k * 0.017) +
                cos(u * 15 + k * 0.7 + time * 0.18) * 0.047);
          bloom(ctx, sprites, color, u * w, y, w * 0.16, h * (0.18 + k * 0.08));
        }
      }
    }
  }
  // The original lattice stays in place while its bright layer collapses into the core.
  const residue = warm * (0.19 - 0.075 * ultra);
  if (residue > 0) {
    ctx.globalAlpha = residue;
    ctx.lineWidth = 0.7 * scale;
    ctx.strokeStyle = p.cyan;
    ctx.beginPath();
    for (const { i, j } of edges) {
      const a = nodes[i]!,
        b = nodes[j]!;
      ctx.moveTo(a.lx * w, a.ly * h);
      ctx.lineTo(b.lx * w, b.ly * h);
    }
    ctx.stroke();
    ctx.globalAlpha = residue * 1.9;
    ctx.fillStyle = p.violet;
    for (const n of nodes)
      ctx.fillRect(n.lx * w - 0.5, n.ly * h - 0.5, 1 + n.z * 0.4, 1 + n.z * 0.4);
  }
  const collapse = warm * (0.69 + 0.15 * ultra);
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!,
      strength = sm(0.045 + n.g * 0.44, 0.2 + n.g * 0.45, t);
    strengths[i] = strength;
    const drift = (2 + 5 * n.z) * strength * motion * scale;
    const x =
      w * mix(n.x, n.lx, crystal * 0.88) + sin(time * (0.31 + n.z * 0.36) + n.phase) * drift;
    const y = h * mix(n.y, n.ly, crystal * 0.87) + cos(time * 0.54 + n.phase) * drift * 0.68;
    const compression = collapse * (0.68 + n.z * 0.36);
    coords[2 * i] = mix(x, center, compression);
    coords[2 * i + 1] =
      mix(y, cy, collapse * (0.81 + n.z * 0.18)) +
      warm * (1 - ultra * 0.6) * sin(n.x * 8) * h * 0.036;
  }
  for (let k = 0; k < edges.length; k++) {
    const e = edges[k]!,
      f = sm(e.at, e.at + 0.22, t) * Math.min(strengths[e.i]!, strengths[e.j]!);
    if (f < 0.003) continue;
    const ax = coords[2 * e.i]!,
      ay = coords[2 * e.i + 1]!,
      bx = coords[2 * e.j]!,
      by = coords[2 * e.j + 1]!,
      reach = sm(0, 0.86, f),
      dx = bx - ax,
      dy = by - ay;
    const tint = ramps[e.color][warmIndex]!;
    ctx.globalAlpha = f * (0.43 + crystal * 0.025) * (1 - 0.59 * warm);
    ctx.strokeStyle = tint;
    ctx.lineWidth = (0.56 + crystal * 0.13) * scale;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + dx * reach, ay + dy * reach);
    ctx.stroke();
    if (k % 3 === 0) {
      const q = fract(e.phase + time * e.speed * (0.32 + t * t * 2.3));
      const x = ax + dx * reach * q,
        y = ay + dy * reach * q;
      ctx.globalAlpha = f * 0.83 * sin(q * Math.PI);
      ctx.fillStyle = tint;
      ctx.fillRect(x - 0.65 * scale, y - 0.65 * scale, 1.3 * scale, 1.3 * scale);
      if (k % 9 === 0) {
        ctx.globalAlpha *= 0.48 * (1 - warm);
        bloom(ctx, sprites, e.color, x, y, 12);
      }
    }
  }
  for (let i = 0; i < nodes.length; i++) {
    const strength = strengths[i]!;
    if (strength < 0.002) continue;
    const n = nodes[i]!,
      x = coords[2 * i]!,
      y = coords[2 * i + 1]!,
      pulse = 0.78 + 0.22 * sin(time * (0.76 + n.z) + n.phase),
      glow = (8 + n.z * 14 + crystal * 6) * scale,
      alpha = strength * pulse * (0.28 + 0.43 * n.z) * (1 - warm * 0.42);
    if (warm < 1) {
      ctx.globalAlpha = alpha * (1 - warm);
      bloom(ctx, sprites, n.color, x, y, glow);
    }
    if (warm > 0) {
      ctx.globalAlpha = alpha * warm;
      bloom(ctx, sprites, "gold", x, y, glow);
    }
    ctx.fillStyle = ramps[n.color][warmIndex]!;
    ctx.globalAlpha = strength * (0.3 + 0.59 * n.z) * pulse * (1 - 0.28 * warm);
    const size = (0.64 + n.z * 1.16) * scale;
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
  }
  if (warm > 0) {
    for (let j = 0; j < 6; j++) {
      const gain = j < 3 ? 1 : ultra,
        q = fract(0.14 + j * 0.157 + time * (0.43 + ultra * 0.13)),
        r = h * (0.06 + q * 1.1);
      ctx.globalAlpha = warm * gain * sin(q * Math.PI) * (1 - q) * (0.31 + 0.28 * ultra);
      ctx.strokeStyle = j % 3 ? p.gold : p.hot;
      ctx.lineWidth = (0.65 + ultra * 0.55) * scale;
      ctx.beginPath();
      ctx.ellipse(center, cy, r * 1.31, r * 0.74, -0.14, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = warm * (0.5 + 0.18 * ultra);
    bloom(ctx, sprites, "gold", center, cy, h * (0.99 + ultra * 0.45));
    ctx.globalAlpha = warm * 0.71;
    bloom(ctx, sprites, "gold", center, cy, w * (0.65 + 0.3 * ultra), h * 0.032);
    bloom(ctx, sprites, "gold", center, cy, h * 0.046, h * 0.89);
    ctx.globalAlpha = warm * 0.84;
    bloom(ctx, sprites, "hot", center, cy, h * 0.3);
    bloom(ctx, sprites, "hot", center, cy, w * 0.27, h * 0.018);
    ctx.globalAlpha = warm * 0.91;
    ctx.fillStyle = p.hot;
    ctx.beginPath();
    ctx.moveTo(center - h * 0.075, cy);
    ctx.quadraticCurveTo(center, cy - h * 0.013, center, cy - h * 0.09);
    ctx.quadraticCurveTo(center + h * 0.012, cy, center + h * 0.075, cy);
    ctx.quadraticCurveTo(center, cy + h * 0.012, center, cy + h * 0.09);
    ctx.quadraticCurveTo(center - h * 0.012, cy, center - h * 0.075, cy);
    ctx.fill();
  }
  ctx.restore();
}

export function renderNeuralNebulaLens(
  lctx: CanvasRenderingContext2D,
  scene: HTMLCanvasElement,
  w: number,
  h: number,
  l: number,
  x: number,
  t: number,
  seconds: number,
  reduced: boolean,
  palette: NebulaPalette,
  { sprites }: ReturnType<typeof createNebulaLayers>,
) {
  const r = l * 0.5,
    y = h * 0.5,
    rings = 6;
  lctx.save();
  lctx.resetTransform();
  lctx.fillStyle = palette.deep;
  lctx.fillRect(0, 0, lctx.canvas.width, lctx.canvas.height);
  lctx.restore();
  for (let i = 0; i < rings; i++) {
    const f = i / (rings - 1),
      m = 1.35 + 0.21 * sm(0, 1, f);
    lctx.save();
    lctx.beginPath();
    lctx.arc(r, r, r * (1 - f * 0.8), 0, TAU);
    lctx.clip();
    lctx.drawImage(scene, r - x * m, r - y * m, w * m, h * m);
    lctx.restore();
  }
  const halo = sm(0.52, 0.74, t) * (1 - sm(0.78, 0.92, t));
  const ember = sm(0.015, 0.085, t) * (1 - sm(0.22, 0.42, t));
  lctx.save();
  lctx.globalCompositeOperation = "screen";
  if (ember > 0) {
    const x = r * 0.96,
      y = r * 1.05;
    lctx.globalAlpha = ember * 0.52;
    bloom(lctx, sprites, "violet", x, y, l * 0.71, l * 0.54);
    lctx.globalAlpha = ember * 0.72;
    bloom(lctx, sprites, "gold", x, y, l * 0.235);
    lctx.fillStyle = palette.hot;
    lctx.beginPath();
    lctx.arc(x, y, Math.max(0.85, l * 0.013), 0, TAU);
    lctx.fill();
    for (let i = 0; i < 5; i++) {
      const angle = i * 2.4 + (reduced ? 0 : seconds * 0.25);
      const px = x + cos(angle) * r * (0.26 + i * 0.086),
        py = y + sin(angle) * r * (0.18 + i * 0.076);
      lctx.globalAlpha = ember * (0.36 - i * 0.035);
      bloom(lctx, sprites, i % 2 ? "cyan" : "pink", px, py, l * 0.115);
      lctx.fillStyle = palette[i % 2 ? "cyan" : "pink"];
      lctx.fillRect(px, py, 1, 1);
    }
  }
  lctx.globalAlpha = halo * 0.19;
  if (halo > 0) {
    bloom(lctx, sprites, "pink", r * 0.37, r * 1.27, l * 0.36, l * 0.52);
    bloom(lctx, sprites, "cyan", r * 1.6, r * 0.7, l * 0.38, l * 0.47);
  }
  lctx.restore();
}
