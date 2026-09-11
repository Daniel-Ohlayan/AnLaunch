export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Не удалось прочитать PNG скина"));
    img.src = src;
  });
}

export async function normalizeSkinDataUrl(src: string): Promise<string> {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return src;
  ctx.imageSmoothingEnabled = false;
  if (img.width === 64 && img.height === 32) {
    ctx.drawImage(img, 0, 0);
    ctx.drawImage(canvas, 0, 16, 16, 16, 16, 48, 16, 16);
    ctx.drawImage(canvas, 40, 16, 16, 16, 32, 48, 16, 16);
  } else {
    ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, 64, 64);
  }
  return canvas.toDataURL("image/png");
}

export async function headIconDataUrl(src: string): Promise<string> {
  const img = await loadImage(src);
  const unit = Math.max(img.width / 64, 0.001);
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 8, 8);
  ctx.drawImage(img, 8 * unit, 8 * unit, 8 * unit, 8 * unit, 0, 0, 8, 8);
  return canvas.toDataURL("image/png");
}
