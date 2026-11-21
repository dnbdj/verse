const FALLBACK = "#2a2118";

/** Average the artwork down to one usable backdrop colour. */
export function tintFromImage(url: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        resolve(extractTint(img));
      } catch {
        resolve(FALLBACK);
      }
    };
    img.onerror = () => resolve(FALLBACK);
    img.src = url;
  });
}

function extractTint(img: HTMLImageElement): string {
  const size = 24;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return FALLBACK;
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 16) continue;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    count += 1;
  }
  if (count === 0) return FALLBACK;

  r /= count;
  g /= count;
  b /= count;

  const peak = Math.max(r, g, b, 1);
  const lift = Math.min(2.2, 150 / peak);
  const clamp = (v: number) => Math.min(255, Math.round(v * lift));
  return `rgb(${clamp(r)}, ${clamp(g)}, ${clamp(b)})`;
}
