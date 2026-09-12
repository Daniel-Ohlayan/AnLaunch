import { useEffect, useRef, useState } from "react";
import { loadImage, normalizeSkinDataUrl } from "../lib/skinPreview";

type UV = { r: number[]; f: number[]; l: number[]; b: number[]; t: number[]; d: number[] };

function drawFace(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p3: { x: number; y: number }
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
  ctx.restore();
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
  scale: number
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
  const faces: { idx: number[]; uv: number[]; z: number }[] = [
    { idx: [4, 5, 6, 7], uv: uv.f, z: oz + hz },
    { idx: [1, 0, 3, 2], uv: uv.b, z: oz - hz },
    { idx: [5, 1, 2, 6], uv: uv.r, z: ox + hx },
    { idx: [0, 4, 7, 3], uv: uv.l, z: ox - hx },
    { idx: [0, 1, 5, 4], uv: uv.t, z: oy - hy },
    { idx: [7, 6, 2, 3], uv: uv.d, z: oy + hy },
  ];
  return { img, ox, oy, oz, corners, faces, scale };
}

function renderSkin(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  yawDeg: number,
  pitchDeg: number,
  slim: boolean,
  layers: boolean
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const px = 7.2;
  const cx = w / 2;
  const cy = h * 0.42;
  const armW = slim ? 3 : 4;
  const armX = 4 + armW / 2;

  const parts = [
    cuboid(img, 0, -10, 0, 8, 8, 8, { r: [0, 8, 8, 8], f: [8, 8, 8, 8], l: [16, 8, 8, 8], b: [24, 8, 8, 8], t: [8, 0, 8, 8], d: [16, 0, 8, 8] }, 1),
    cuboid(img, 0, 0, 0, 8, 12, 4, { r: [16, 20, 4, 12], f: [20, 20, 8, 12], l: [28, 20, 4, 12], b: [32, 20, 8, 12], t: [20, 16, 8, 4], d: [28, 16, 8, 4] }, 1),
    cuboid(
      img,
      armX,
      0,
      0,
      armW,
      12,
      4,
      slim
        ? { r: [40, 20, 4, 12], f: [44, 20, 3, 12], l: [47, 20, 4, 12], b: [51, 20, 3, 12], t: [44, 16, 3, 4], d: [47, 16, 3, 4] }
        : { r: [40, 20, 4, 12], f: [44, 20, 4, 12], l: [48, 20, 4, 12], b: [52, 20, 4, 12], t: [44, 16, 4, 4], d: [48, 16, 4, 4] },
      1
    ),
    cuboid(
      img,
      -armX,
      0,
      0,
      armW,
      12,
      4,
      slim
        ? { r: [32, 52, 4, 12], f: [36, 52, 3, 12], l: [39, 52, 4, 12], b: [43, 52, 3, 12], t: [36, 48, 3, 4], d: [39, 48, 3, 4] }
        : { r: [32, 52, 4, 12], f: [36, 52, 4, 12], l: [40, 52, 4, 12], b: [44, 52, 4, 12], t: [36, 48, 4, 4], d: [40, 48, 4, 4] },
      1
    ),
    cuboid(img, 2, 12, 0, 4, 12, 4, { r: [0, 20, 4, 12], f: [4, 20, 4, 12], l: [8, 20, 4, 12], b: [12, 20, 4, 12], t: [4, 16, 4, 4], d: [8, 16, 4, 4] }, 1),
    cuboid(img, -2, 12, 0, 4, 12, 4, { r: [16, 52, 4, 12], f: [20, 52, 4, 12], l: [24, 52, 4, 12], b: [28, 52, 4, 12], t: [20, 48, 4, 4], d: [24, 48, 4, 4] }, 1),
  ];
  if (layers) {
    parts.push(
      cuboid(img, 0, -10, 0, 9, 9, 9, { r: [32, 8, 8, 8], f: [40, 8, 8, 8], l: [48, 8, 8, 8], b: [56, 8, 8, 8], t: [40, 0, 8, 8], d: [48, 0, 8, 8] }, 1),
      cuboid(img, 0, 0, 0, 8.5, 12.5, 4.5, { r: [16, 36, 4, 12], f: [20, 36, 8, 12], l: [28, 36, 4, 12], b: [32, 36, 8, 12], t: [20, 32, 8, 4], d: [28, 32, 8, 4] }, 1),
      cuboid(
        img,
        armX,
        0,
        0,
        armW + 0.5,
        12.5,
        4.5,
        slim
          ? { r: [40, 36, 4, 12], f: [44, 36, 3, 12], l: [47, 36, 4, 12], b: [51, 36, 3, 12], t: [44, 32, 3, 4], d: [47, 32, 3, 4] }
          : { r: [40, 36, 4, 12], f: [44, 36, 4, 12], l: [48, 36, 4, 12], b: [52, 36, 4, 12], t: [44, 32, 4, 4], d: [48, 32, 4, 4] },
        1
      ),
      cuboid(
        img,
        -armX,
        0,
        0,
        armW + 0.5,
        12.5,
        4.5,
        slim
          ? { r: [48, 52, 4, 12], f: [52, 52, 3, 12], l: [55, 52, 4, 12], b: [59, 52, 3, 12], t: [52, 48, 3, 4], d: [55, 48, 3, 4] }
          : { r: [48, 52, 4, 12], f: [52, 52, 4, 12], l: [56, 52, 4, 12], b: [60, 52, 4, 12], t: [52, 48, 4, 4], d: [56, 48, 4, 4] },
        1
      ),
      cuboid(img, 2, 12, 0, 4.5, 12.5, 4.5, { r: [0, 36, 4, 12], f: [4, 36, 4, 12], l: [8, 36, 4, 12], b: [12, 36, 4, 12], t: [4, 32, 4, 4], d: [8, 32, 4, 4] }, 1),
      cuboid(img, -2, 12, 0, 4.5, 12.5, 4.5, { r: [0, 52, 4, 12], f: [4, 52, 4, 12], l: [8, 52, 4, 12], b: [12, 52, 4, 12], t: [4, 48, 4, 4], d: [8, 48, 4, 4] }, 1)
    );
  }

  const drawn: { z: number; draw: () => void }[] = [];
  for (const box of parts) {
    const pts = box.corners.map(([x, y, z]) => rotate(x + box.ox, y + box.oy, z + box.oz, yaw, pitch));
    const proj = pts.map((p) => ({ x: cx + p.x * px, y: cy + p.y * px, z: p.z }));
    for (const face of box.faces) {
      const a = proj[face.idx[0]];
      const b = proj[face.idx[1]];
      const d = proj[face.idx[3]];
      const z = (a.z + b.z + proj[face.idx[2]].z + d.z) / 4;
      const u = face.uv;
      drawn.push({
        z,
        draw: () => drawFace(ctx, img, u[0], u[1], u[2], u[3], a, b, d),
      });
    }
  }
  drawn.sort((a, b) => a.z - b.z);
  for (const f of drawn) f.draw();
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
  const [norm, setNorm] = useState<string | undefined>(undefined);
  const yawRef = useRef(28);
  const pitchRef = useRef(-12);
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
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
    if (!tex) return;
    let cancelled = false;
    loadImage(tex)
      .then((img) => {
        if (!cancelled) imgRef.current = img;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tex]);

  useEffect(() => {
    if (mode !== "3d") return;
    let id = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = t - last;
      last = t;
      if (!drag.current) yawRef.current += dt * 0.018;
      const canvas = canvasRef.current;
      const img = imgRef.current;
      if (canvas && img) renderSkin(canvas, img, yawRef.current, pitchRef.current, slimRef.current, layersRef.current);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [mode, tex]);

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
        <span className="ml-auto text-[10px] text-white/35">{slim ? "Alex" : "Steve"}</span>
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
          className="relative cursor-grab rounded-lg bg-[radial-gradient(circle_at_50%_30%,#1a1d27,transparent_70%)] active:cursor-grabbing"
          onPointerDown={(e) => {
            (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, yaw, pitch };
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            setYaw(drag.current.yaw + (e.clientX - drag.current.x) * 0.5);
            setPitch(Math.max(-35, Math.min(20, drag.current.pitch + (e.clientY - drag.current.y) * 0.3)));
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
        >
          <canvas ref={canvasRef} width={280} height={340} className="mx-auto block h-[260px] w-auto" />
          {cape ? <span className="sr-only">Плащ</span> : null}
        </div>
      )}
    </div>
  );
}
