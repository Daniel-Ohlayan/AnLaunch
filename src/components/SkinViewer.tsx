import { useEffect, useRef, useState } from "react";

function Face({
  src,
  x,
  y,
  w,
  h,
  tw = 64,
  th = 64,
  transform,
  overlay,
}: {
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tw?: number;
  th?: number;
  transform: string;
  overlay?: boolean;
}) {
  return (
    <div
      style={{
        position: "absolute",
        width: `${w}em`,
        height: `${h}em`,
        left: "50%",
        top: "50%",
        marginLeft: `${-w / 2}em`,
        marginTop: `${-h / 2}em`,
        backgroundImage: `url(${src})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${tw}em ${th}em`,
        backgroundPosition: `${-x}em ${-y}em`,
        imageRendering: "pixelated",
        transform,
        backfaceVisibility: "hidden",
        pointerEvents: "none",
        opacity: overlay ? 0.99 : 1,
      }}
    />
  );
}

function Cuboid({
  src,
  cx,
  cy,
  cz,
  sx,
  sy,
  sz,
  uv,
  overlay,
}: {
  src: string;
  cx: number;
  cy: number;
  cz: number;
  sx: number;
  sy: number;
  sz: number;
  uv: { r: number[]; f: number[]; l: number[]; b: number[]; t: number[]; d: number[] };
  overlay?: boolean;
}) {
  const zf = sz / 2;
  const xf = sx / 2;
  const yf = sy / 2;
  const scale = overlay ? 1.06 : 1;
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: 0,
        height: 0,
        transform: `translate3d(${cx}em, ${cy}em, ${cz}em) scale(${scale})`,
        transformStyle: "preserve-3d",
      }}
    >
      <Face src={src} x={uv.f[0]} y={uv.f[1]} w={uv.f[2]} h={uv.f[3]} transform={`translateZ(${zf}em)`} overlay={overlay} />
      <Face src={src} x={uv.b[0]} y={uv.b[1]} w={uv.b[2]} h={uv.b[3]} transform={`rotateY(180deg) translateZ(${zf}em)`} overlay={overlay} />
      <Face src={src} x={uv.r[0]} y={uv.r[1]} w={uv.r[2]} h={uv.r[3]} transform={`rotateY(90deg) translateZ(${xf}em)`} overlay={overlay} />
      <Face src={src} x={uv.l[0]} y={uv.l[1]} w={uv.l[2]} h={uv.l[3]} transform={`rotateY(-90deg) translateZ(${xf}em)`} overlay={overlay} />
      <Face src={src} x={uv.t[0]} y={uv.t[1]} w={uv.t[2]} h={uv.t[3]} transform={`rotateX(90deg) translateZ(${yf}em)`} overlay={overlay} />
      <Face src={src} x={uv.d[0]} y={uv.d[1]} w={uv.d[2]} h={uv.d[3]} transform={`rotateX(-90deg) translateZ(${yf}em)`} overlay={overlay} />
    </div>
  );
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
      const cell = w / 8;
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 8; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cell, 0);
        ctx.lineTo(i * cell, h);
        ctx.stroke();
      }
      for (let i = 0; i <= img.height / (img.width / 8); i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * cell);
        ctx.lineTo(w, i * cell);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(16,185,129,0.9)";
      ctx.font = "10px ui-sans-serif, system-ui";
      ctx.fillText("голова", cell + 4, cell - 4);
      ctx.fillText("тело", cell * 2.5, cell * 3 - 4);
      ctx.fillText("рука", cell * 5.2, cell * 3 - 4);
      ctx.fillText("нога", 6, cell * 3 - 4);
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
  const [yaw, setYaw] = useState(28);
  const [pitch, setPitch] = useState(-12);
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);

  useEffect(() => {
    if (mode !== "3d") return;
    let id = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = t - last;
      last = t;
      if (!drag.current) setYaw((y) => y + dt * 0.02);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [mode]);

  const armW = slim ? 3 : 4;
  const armX = 4 + armW / 2;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-black/30 p-3">
      <div className="mb-2 flex items-center gap-1">
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
        <span className="ml-auto text-[10px] text-white/35">{slim ? "Alex" : "Steve"} · крутите мышью</span>
      </div>

      {!skin ? (
        <div className="flex h-[220px] items-center justify-center text-center text-xs text-white/35">
          Загрузите PNG или скин по нику —
          <br />
          здесь появится 3D-модель
        </div>
      ) : mode === "unwrap" ? (
        <UnwrapCanvas src={skin} />
      ) : (
        <div
          className="relative h-[240px] cursor-grab overflow-hidden rounded-lg bg-[radial-gradient(circle_at_50%_30%,#1a1d27,transparent_70%)] active:cursor-grabbing"
          onPointerDown={(e) => {
            (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, yaw, pitch };
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            setYaw(drag.current.yaw + (e.clientX - drag.current.x) * 0.5);
            setPitch(Math.max(-40, Math.min(25, drag.current.pitch + (e.clientY - drag.current.y) * 0.3)));
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              perspective: "420px",
              perspectiveOrigin: "50% 40%",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "54%",
                width: 0,
                height: 0,
                fontSize: 5,
                transformStyle: "preserve-3d",
                transform: `rotateX(${pitch}deg) rotateY(${yaw}deg)`,
              }}
            >
              <Cuboid
                src={skin}
                cx={0}
                cy={-10}
                cz={0}
                sx={8}
                sy={8}
                sz={8}
                uv={{ r: [0, 8, 8, 8], f: [8, 8, 8, 8], l: [16, 8, 8, 8], b: [24, 8, 8, 8], t: [8, 0, 8, 8], d: [16, 0, 8, 8] }}
              />
              <Cuboid
                src={skin}
                cx={0}
                cy={-10}
                cz={0}
                sx={8}
                sy={8}
                sz={8}
                overlay
                uv={{ r: [32, 8, 8, 8], f: [40, 8, 8, 8], l: [48, 8, 8, 8], b: [56, 8, 8, 8], t: [40, 0, 8, 8], d: [48, 0, 8, 8] }}
              />
              <Cuboid
                src={skin}
                cx={0}
                cy={0}
                cz={0}
                sx={8}
                sy={12}
                sz={4}
                uv={{ r: [16, 20, 4, 12], f: [20, 20, 8, 12], l: [28, 20, 4, 12], b: [32, 20, 8, 12], t: [20, 16, 8, 4], d: [28, 16, 8, 4] }}
              />
              <Cuboid
                src={skin}
                cx={0}
                cy={0}
                cz={0}
                sx={8}
                sy={12}
                sz={4}
                overlay
                uv={{ r: [16, 36, 4, 12], f: [20, 36, 8, 12], l: [28, 36, 4, 12], b: [32, 36, 8, 12], t: [20, 32, 8, 4], d: [28, 32, 8, 4] }}
              />
              <Cuboid
                src={skin}
                cx={armX}
                cy={0}
                cz={0}
                sx={armW}
                sy={12}
                sz={4}
                uv={
                  slim
                    ? { r: [40, 20, 4, 12], f: [44, 20, 3, 12], l: [47, 20, 4, 12], b: [51, 20, 3, 12], t: [44, 16, 3, 4], d: [47, 16, 3, 4] }
                    : { r: [40, 20, 4, 12], f: [44, 20, 4, 12], l: [48, 20, 4, 12], b: [52, 20, 4, 12], t: [44, 16, 4, 4], d: [48, 16, 4, 4] }
                }
              />
              <Cuboid
                src={skin}
                cx={-armX}
                cy={0}
                cz={0}
                sx={armW}
                sy={12}
                sz={4}
                uv={
                  slim
                    ? { r: [32, 52, 4, 12], f: [36, 52, 3, 12], l: [39, 52, 4, 12], b: [43, 52, 3, 12], t: [36, 48, 3, 4], d: [39, 48, 3, 4] }
                    : { r: [32, 52, 4, 12], f: [36, 52, 4, 12], l: [40, 52, 4, 12], b: [44, 52, 4, 12], t: [36, 48, 4, 4], d: [40, 48, 4, 4] }
                }
              />
              <Cuboid
                src={skin}
                cx={2}
                cy={12}
                cz={0}
                sx={4}
                sy={12}
                sz={4}
                uv={{ r: [0, 20, 4, 12], f: [4, 20, 4, 12], l: [8, 20, 4, 12], b: [12, 20, 4, 12], t: [4, 16, 4, 4], d: [8, 16, 4, 4] }}
              />
              <Cuboid
                src={skin}
                cx={-2}
                cy={12}
                cz={0}
                sx={4}
                sy={12}
                sz={4}
                uv={{ r: [16, 52, 4, 12], f: [20, 52, 4, 12], l: [24, 52, 4, 12], b: [28, 52, 4, 12], t: [20, 48, 4, 4], d: [24, 48, 4, 4] }}
              />
              {cape && (
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    width: "10em",
                    height: "16em",
                    marginLeft: "-5em",
                    marginTop: "-6em",
                    backgroundImage: `url(${cape})`,
                    backgroundSize: "64em 32em",
                    backgroundPosition: "-1em -1em",
                    imageRendering: "pixelated",
                    transform: "translateZ(-2.6em) rotateX(8deg)",
                    transformOrigin: "top center",
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
