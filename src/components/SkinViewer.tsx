import { useEffect, useRef, useState } from "react";
import { detectSlim, loadImage, normalizeSkinDataUrl, skinUnit } from "../lib/skinPreview";

type UV = { r: number[]; f: number[]; l: number[]; b: number[]; t: number[]; d: number[] };
type FaceId = "f" | "b" | "r" | "l" | "t" | "d";

const SHADE: Record<FaceId, number> = { f: 1, r: 0.78, l: 0.62, b: 0.48, t: 0.92, d: 0.38 };

function drawSolidFace(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p3: { x: number; y: number },
  shade: number
) {
  if (sw <= 0 || sh <= 0) return;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const ex = p3.x - p0.x;
  const ey = p3.y - p0.y;
  if (dx * ey - dy * ex <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.lineTo(p1.x + ex, p1.y + ey);
  ctx.lineTo(p3.x, p3.y);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(dx / sw, dy / sw, ex / sh, ey / sh, p0.x, p0.y);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  if (shade < 0.99) {
    ctx.fillStyle = `rgba(0,0,0,${(1 - shade) * 0.45})`;
    ctx.fillRect(0, 0, sw, sh);
  }
  ctx.restore();
}

function texelAlpha(pixels: Uint8ClampedArray | null, tw: number, x: number, y: number, unit: number): number {
  if (!pixels) return 255;
  let a = 0;
  const x1 = Math.min(tw, x + unit);
  const h = pixels.length / 4 / tw;
  const y1 = Math.min(h, y + unit);
  for (let py = y; py < y1; py++) {
    for (let px = x; px < x1; px++) {
      a = Math.max(a, pixels[(py * tw + px) * 4 + 3] || 0);
    }
  }
  return a;
}

function drawOverlayFace(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  pixels: Uint8ClampedArray | null,
  unit: number,
  u: number[],
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p3: { x: number; y: number },
  shade: number
) {
  const fw = u[2];
  const fh = u[3];
  if (fw <= 0 || fh <= 0) return;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const ex = p3.x - p0.x;
  const ey = p3.y - p0.y;
  if (dx * ey - dy * ex <= 0) return;

  for (let v = 0; v < fh; v++) {
    for (let s = 0; s < fw; s++) {
      const sx = Math.floor((u[0] + s) * unit);
      const sy = Math.floor((u[1] + v) * unit);
      if (texelAlpha(pixels, img.width, sx, sy, unit) < 16) continue;
      const s0 = s / fw;
      const s1 = (s + 1) / fw;
      const t0 = v / fh;
      const t1 = (v + 1) / fh;
      const q0 = { x: p0.x + dx * s0 + ex * t0, y: p0.y + dy * s0 + ey * t0 };
      const q1 = { x: p0.x + dx * s1 + ex * t0, y: p0.y + dy * s1 + ey * t0 };
      const q3 = { x: p0.x + dx * s0 + ex * t1, y: p0.y + dy * s0 + ey * t1 };
      drawSolidFace(ctx, img, sx, sy, unit, unit, q0, q1, q3, shade);
    }
  }
}

function rotate(x: number, y: number, z: number, yaw: number, pitch: number) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const x1 = x * cy - z * sy;
  const z1 = x * sy + z * cy;
  const y1 = y * cp - z1 * sp;
  const z2 = y * sp + z1 * cp;
  return { x: x1, y: y1, z: z2 };
}

function cuboid(
  img: HTMLImageElement,
  ox: number,
  oy: number,
  oz: number,
  sx: number,
  sy: number,
  sz: number,
  uv: UV,
  overlay: boolean
) {
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const corners = [
    [-hx, -hy, -hz],
    [hx, -hy, -hz],
    [hx, hy, -hz],
    [-hx, hy, -hz],
    [-hx, -hy, hz],
    [hx, -hy, hz],
    [hx, hy, hz],
    [-hx, hy, hz],
  ] as const;
  const faces: { idx: number[]; uv: number[]; id: FaceId }[] = [
    { idx: [4, 5, 6, 7], uv: uv.f, id: "f" },
    { idx: [1, 0, 3, 2], uv: uv.b, id: "b" },
    { idx: [5, 1, 2, 6], uv: uv.r, id: "r" },
    { idx: [0, 4, 7, 3], uv: uv.l, id: "l" },
    { idx: [0, 1, 5, 4], uv: uv.t, id: "t" },
    { idx: [7, 6, 2, 3], uv: uv.d, id: "d" },
  ];
  return { img, ox, oy, oz, corners, faces, overlay };
}

function uvHead(): UV {
  return { r: [0, 8, 8, 8], f: [8, 8, 8, 8], l: [16, 8, 8, 8], b: [24, 8, 8, 8], t: [8, 0, 8, 8], d: [16, 0, 8, 8] };
}
function uvHat(): UV {
  return { r: [32, 8, 8, 8], f: [40, 8, 8, 8], l: [48, 8, 8, 8], b: [56, 8, 8, 8], t: [40, 0, 8, 8], d: [48, 0, 8, 8] };
}
function uvBody(): UV {
  return { r: [16, 20, 4, 12], f: [20, 20, 8, 12], l: [28, 20, 4, 12], b: [32, 20, 8, 12], t: [20, 16, 8, 4], d: [28, 16, 8, 4] };
}
function uvJacket(): UV {
  return { r: [16, 36, 4, 12], f: [20, 36, 8, 12], l: [28, 36, 4, 12], b: [32, 36, 8, 12], t: [20, 32, 8, 4], d: [28, 32, 8, 4] };
}
function uvArm(slim: boolean, left: boolean, overlay: boolean): UV {
  if (slim) {
    if (overlay) {
      return left
        ? { r: [48, 52, 4, 12], f: [52, 52, 3, 12], l: [55, 52, 4, 12], b: [59, 52, 3, 12], t: [52, 48, 3, 4], d: [55, 48, 3, 4] }
        : { r: [40, 36, 4, 12], f: [44, 36, 3, 12], l: [47, 36, 4, 12], b: [51, 36, 3, 12], t: [44, 32, 3, 4], d: [47, 32, 3, 4] };
    }
    return left
      ? { r: [32, 52, 4, 12], f: [36, 52, 3, 12], l: [39, 52, 4, 12], b: [43, 52, 3, 12], t: [36, 48, 3, 4], d: [39, 48, 3, 4] }
      : { r: [40, 20, 4, 12], f: [44, 20, 3, 12], l: [47, 20, 4, 12], b: [51, 20, 3, 12], t: [44, 16, 3, 4], d: [47, 16, 3, 4] };
  }
  if (overlay) {
    return left
      ? { r: [48, 52, 4, 12], f: [52, 52, 4, 12], l: [56, 52, 4, 12], b: [60, 52, 4, 12], t: [52, 48, 4, 4], d: [56, 48, 4, 4] }
      : { r: [40, 36, 4, 12], f: [44, 36, 4, 12], l: [48, 36, 4, 12], b: [52, 36, 4, 12], t: [44, 32, 4, 4], d: [48, 32, 4, 4] };
  }
  return left
    ? { r: [32, 52, 4, 12], f: [36, 52, 4, 12], l: [40, 52, 4, 12], b: [44, 52, 4, 12], t: [36, 48, 4, 4], d: [40, 48, 4, 4] }
    : { r: [40, 20, 4, 12], f: [44, 20, 4, 12], l: [48, 20, 4, 12], b: [52, 20, 4, 12], t: [44, 16, 4, 4], d: [48, 16, 4, 4] };
}
function uvLeg(left: boolean, overlay: boolean): UV {
  if (overlay) {
    return left
      ? { r: [0, 52, 4, 12], f: [4, 52, 4, 12], l: [8, 52, 4, 12], b: [12, 52, 4, 12], t: [4, 48, 4, 4], d: [8, 48, 4, 4] }
      : { r: [0, 36, 4, 12], f: [4, 36, 4, 12], l: [8, 36, 4, 12], b: [12, 36, 4, 12], t: [4, 32, 4, 4], d: [8, 32, 4, 4] };
  }
  return left
    ? { r: [16, 52, 4, 12], f: [20, 52, 4, 12], l: [24, 52, 4, 12], b: [28, 52, 4, 12], t: [20, 48, 4, 4], d: [24, 48, 4, 4] }
    : { r: [0, 20, 4, 12], f: [4, 20, 4, 12], l: [8, 20, 4, 12], b: [12, 20, 4, 12], t: [4, 16, 4, 4], d: [8, 16, 4, 4] };
}

function renderSkin(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  pixels: Uint8ClampedArray | null,
  yawDeg: number,
  pitchDeg: number,
  slim: boolean,
  layers: boolean,
  cape?: HTMLImageElement | null
) {
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const px = Math.min(w, h) / 46;
  const cx = w / 2;
  const cy = h * 0.4;
  const armW = slim ? 3 : 4;
  const armX = 4 + armW / 2;
  const unit = skinUnit(img);

  const inner = [
    cuboid(img, 0, -10, 0, 8, 8, 8, uvHead(), false),
    cuboid(img, 0, 0, 0, 8, 12, 4, uvBody(), false),
    cuboid(img, armX, 0, 0, armW, 12, 4, uvArm(slim, false, false), false),
    cuboid(img, -armX, 0, 0, armW, 12, 4, uvArm(slim, true, false), false),
    cuboid(img, 2, 12, 0, 4, 12, 4, uvLeg(false, false), false),
    cuboid(img, -2, 12, 0, 4, 12, 4, uvLeg(true, false), false),
  ];
  const outer = layers
    ? [
        cuboid(img, 0, -10, 0, 9, 9, 9, uvHat(), true),
        cuboid(img, 0, 0, 0, 8.5, 12.5, 4.5, uvJacket(), true),
        cuboid(img, armX, 0, 0, armW + 1, 13, 5, uvArm(slim, false, true), true),
        cuboid(img, -armX, 0, 0, armW + 1, 13, 5, uvArm(slim, true, true), true),
        cuboid(img, 2, 12, 0, 4.5, 12.5, 4.5, uvLeg(false, true), true),
        cuboid(img, -2, 12, 0, 4.5, 12.5, 4.5, uvLeg(true, true), true),
      ]
    : [];
  if (cape) {
    inner.push(
      cuboid(
        cape,
        0,
        1.2,
        -3.15,
        10,
        16,
        0.5,
        { r: [0, 1, 1, 16], f: [12, 1, 10, 16], l: [11, 1, 1, 16], b: [1, 1, 10, 16], t: [1, 0, 10, 1], d: [11, 0, 10, 1] },
        false
      )
    );
  }

  const drawBox = (box: ReturnType<typeof cuboid>, overlay: boolean) => {
    const pts = box.corners.map(([x, y, z]) => rotate(x + box.ox, y + box.oy, z + box.oz, yaw, pitch));
    const proj = pts.map((p) => ({ x: cx + p.x * px, y: cy + p.y * px, z: p.z }));
    const faceUnit = box.img === img ? unit : Math.max(1, Math.round(box.img.width / 64));
    const faces = box.faces
      .map((face) => {
        const a = proj[face.idx[0]];
        const b = proj[face.idx[1]];
        const d = proj[face.idx[3]];
        const z = (a.z + b.z + proj[face.idx[2]].z + d.z) / 4;
        return { face, a, b, d, z };
      })
      .sort((p, q) => p.z - q.z);
    for (const { face, a, b, d } of faces) {
      const u = face.uv;
      if (overlay) {
        drawOverlayFace(ctx, box.img, box.img === img ? pixels : null, faceUnit, u, a, b, d, SHADE[face.id]);
      } else {
        drawSolidFace(
          ctx,
          box.img,
          u[0] * faceUnit,
          u[1] * faceUnit,
          u[2] * faceUnit,
          u[3] * faceUnit,
          a,
          b,
          d,
          SHADE[face.id]
        );
      }
    }
  };

  const order = (boxes: ReturnType<typeof cuboid>[]) =>
    boxes
      .map((box) => {
        const c = rotate(box.ox, box.oy, box.oz, yaw, pitch);
        return { box, z: c.z };
      })
      .sort((a, b) => a.z - b.z);

  for (const { box } of order(inner)) drawBox(box, false);
  for (const { box } of order(outer)) drawBox(box, true);
}

function UnwrapCanvas({ src }: { src: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !src) return;
    const img = new Image();
    img.onload = () => {
      const w = 320;
      const h = Math.round((w * img.height) / img.width);
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#0c0d12";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
    };
    img.src = src;
  }, [src]);
  return <canvas ref={ref} className="max-h-[280px] w-full rounded-lg border border-white/10 bg-black/40" />;
}

function readPixels(img: HTMLImageElement): Uint8ClampedArray | null {
  try {
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d", { willReadFrequently: true, alpha: true });
    if (!ctx) return null;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, img.width, img.height).data;
  } catch {
    return null;
  }
}

export default function SkinViewer({
  skin,
  cape,
  slim,
}: {
  skin?: string;
  cape?: string;
  slim?: boolean;
}) {
  const [mode, setMode] = useState<"3d" | "unwrap">("3d");
  const [layers, setLayers] = useState(true);
  const [spin, setSpin] = useState(false);
  const [norm, setNorm] = useState<string | undefined>(undefined);
  const yawRef = useRef(28);
  const pitchRef = useRef(-8);
  const autoSpin = useRef(false);
  autoSpin.current = spin;
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const pixelsRef = useRef<Uint8ClampedArray | null>(null);
  const capeRef = useRef<HTMLImageElement | null>(null);
  const layersRef = useRef(layers);
  const slimRef = useRef(!!slim);
  layersRef.current = layers;
  slimRef.current = !!slim;

  useEffect(() => {
    if (!skin) {
      setNorm(undefined);
      return;
    }
    let cancelled = false;
    normalizeSkinDataUrl(skin)
      .then((url) => {
        if (!cancelled) setNorm(url);
      })
      .catch(() => {
        if (!cancelled) setNorm(skin);
      });
    return () => {
      cancelled = true;
    };
  }, [skin]);

  const tex = norm || skin;

  useEffect(() => {
    imgRef.current = null;
    pixelsRef.current = null;
    if (!tex) return;
    let cancelled = false;
    loadImage(tex)
      .then((img) => {
        if (cancelled) return;
        imgRef.current = img;
        pixelsRef.current = readPixels(img);
        if (slim === undefined) slimRef.current = detectSlim(img);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tex, slim]);

  useEffect(() => {
    capeRef.current = null;
    if (!cape) return;
    let cancelled = false;
    loadImage(cape)
      .then((img) => {
        if (!cancelled) capeRef.current = img;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [cape]);

  useEffect(() => {
    if (mode !== "3d") return;
    const canvas = canvasRef.current;
    if (canvas) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(280 * dpr);
      canvas.height = Math.round(340 * dpr);
    }
    let id = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = t - last;
      last = t;
      if (!drag.current && autoSpin.current) yawRef.current += dt * 0.018;
      const cnv = canvasRef.current;
      const img = imgRef.current;
      if (cnv && img) {
        renderSkin(
          cnv,
          img,
          pixelsRef.current,
          yawRef.current,
          pitchRef.current,
          slimRef.current,
          layersRef.current,
          capeRef.current
        );
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [mode, tex, cape]);

  return (
    <div className="rounded-xl border border-white/[0.08] bg-black/30 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => setMode("3d")}
          className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${
            mode === "3d" ? "bg-emerald-400 text-[#06070a]" : "bg-white/[0.06] text-white/60"
          }`}
        >
          3D
        </button>
        <button
          type="button"
          onClick={() => setMode("unwrap")}
          className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${
            mode === "unwrap" ? "bg-emerald-400 text-[#06070a]" : "bg-white/[0.06] text-white/60"
          }`}
        >
          Развёртка
        </button>
        <button
          type="button"
          onClick={() => setLayers((v) => !v)}
          className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${
            layers ? "bg-emerald-500/20 text-emerald-200" : "bg-white/[0.06] text-white/50"
          }`}
        >
          Слои
        </button>
        <button
          type="button"
          onClick={() => setSpin((v) => !v)}
          className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${
            spin ? "bg-emerald-500/20 text-emerald-200" : "bg-white/[0.06] text-white/50"
          }`}
        >
          Авто
        </button>
        <span className="ml-auto text-[10px] text-white/35">{slimRef.current || slim ? "Alex" : "Steve"}</span>
      </div>

      {!tex ? (
        <div className="flex h-[220px] items-center justify-center text-center text-xs text-white/35">
          Загрузите PNG или скин по нику —
          <br />
          здесь появится 3D-модель
        </div>
      ) : mode === "unwrap" ? (
        <UnwrapCanvas src={tex} />
      ) : (
        <div
          className="relative cursor-grab touch-none select-none rounded-lg bg-[radial-gradient(circle_at_50%_28%,#222636,transparent_68%)] active:cursor-grabbing"
          onPointerDown={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
            if (spin) setSpin(false);
            drag.current = { x: e.clientX, y: e.clientY, yaw: yawRef.current, pitch: pitchRef.current };
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            yawRef.current = drag.current.yaw + (e.clientX - drag.current.x) * 0.55;
            pitchRef.current = Math.max(-40, Math.min(28, drag.current.pitch + (e.clientY - drag.current.y) * 0.35));
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          <canvas ref={canvasRef} className="mx-auto block h-[260px] w-auto" />
          <div className="pointer-events-none absolute bottom-2 left-0 right-0 text-center text-[10px] text-white/35">
            Перетащите, чтобы повернуть
          </div>
        </div>
      )}
    </div>
  );
}
