export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Не удалось прочитать PNG скина"));
    img.src = src;
  });
}

export function skinUnit(img: { width: number; height: number }): number {
  return Math.max(1, Math.round(img.width / 64));
}

export async function normalizeSkinDataUrl(src: string): Promise<string> {
  const img = await loadImage(src);
  const w = img.width;
  const h = img.height;
  if (w >= 64 && h === w) return src;
  if (w >= 64 && h === w * 2) return src;

  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return src;
  ctx.imageSmoothingEnabled = false;
  if (h * 2 === w || (w === 64 && h === 32)) {
    ctx.drawImage(img, 0, 0, w, h, 0, 0, 64, 32);
    ctx.drawImage(canvas, 0, 16, 16, 16, 16, 48, 16, 16);
    ctx.drawImage(canvas, 40, 16, 16, 16, 32, 48, 16, 16);
    return canvas.toDataURL("image/png");
  }
  ctx.drawImage(img, 0, 0, w, h, 0, 0, 64, 64);
  return canvas.toDataURL("image/png");
}

export function detectSlim(img: HTMLImageElement): boolean {
  const unit = skinUnit(img);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(img, 0, 0);
  const x = 54 * unit;
  const y = 20 * unit;
  const pix = ctx.getImageData(x, y, 1, 1).data;
  return pix[3] < 16;
}

export async function headIconDataUrl(src: string): Promise<string> {
  const img = await loadImage(src);
  const unit = skinUnit(img);
  const canvas = document.createElement("canvas");
  canvas.width = 8 * unit;
  canvas.height = 8 * unit;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 8 * unit, 8 * unit, 8 * unit, 8 * unit, 0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 40 * unit, 8 * unit, 8 * unit, 8 * unit, 0, 0, canvas.width, canvas.height);
  const out = document.createElement("canvas");
  out.width = 64;
  out.height = 64;
  const octx = out.getContext("2d");
  if (!octx) return canvas.toDataURL("image/png");
  octx.imageSmoothingEnabled = false;
  octx.drawImage(canvas, 0, 0, 64, 64);
  return out.toDataURL("image/png");
}
