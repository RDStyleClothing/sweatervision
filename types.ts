import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { HistoryItem, StyleBucket } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function nanoid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ---- Label & Filename ----

export function generateLabel(item: { label?: string; metadata?: Record<string, string>; version?: number }) {
  let label = item.label || '';
  if (item.metadata) {
    const parts: string[] = [];
    if (item.metadata.colorName) parts.push(item.metadata.colorName);
    if (item.metadata.colorCode) parts.push(item.metadata.colorCode);
    if (item.metadata.fit) parts.push(item.metadata.fit);
    if (item.metadata.wash) parts.push(item.metadata.wash);
    if (parts.length > 0) label = label ? `${label} (${parts.join(', ')})` : parts.join(', ');
  }
  if (item.version) label = label ? `V${item.version} | ${label}` : `V${item.version}`;
  return label;
}

// SOP fix: append mode suffix so render vs sketch never overwrite each other
export function generateFilename(item: { label?: string; metadata?: Record<string, string>; version?: number }, index: number): string {
  const style = item.label?.trim() || `style-${index}`;
  const colorName = item.metadata?.colorName?.trim() || '';
  const colorCode = item.metadata?.colorCode?.trim() || '';
  const mode = item.metadata?.renderMode || '';

  const modeSuffix: Record<string, string> = {
    '3D Render': 'RENDER',
    'Flat Sketch': 'SKETCH',
    'Life-like': 'EDIT',
    'Sales Sheet Render': 'SALESSHEET',
  };

  const parts = [style];
  if (colorName) parts.push(colorName);
  if (colorCode) parts.push(colorCode);
  if (modeSuffix[mode]) parts.push(modeSuffix[mode]);

  return `${parts.join(' - ')}.png`;
}

// ---- Image aspect ratio check ----
export function checkImageAspectRatio(base64: string): Promise<{ isPortrait: boolean; width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ isPortrait: img.height >= img.width, width: img.width, height: img.height });
    };
    img.onerror = () => resolve({ isPortrait: true, width: 0, height: 0 });
    img.src = base64;
  });
}

// ---- Downloads ----

export async function downloadImage(dataUrl: string, filename: string, options?: { label?: string; isRender?: boolean }) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = dataUrl; });

  canvas.width = 1200;
  canvas.height = 1600;
  const scale = Math.min(1200 / img.width, 1600 / img.height);
  const x = (1200 - img.width * scale) / 2;
  const y = (1600 - img.height * scale) / 2;
  ctx.clearRect(0, 0, 1200, 1600);
  ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

  if (options?.isRender) {
    const tempUrl = canvas.toDataURL('image/png');
    try {
      const transparentUrl = await makeImageTransparent(tempUrl);
      const pImg = new Image();
      await new Promise<void>((res, rej) => { pImg.onload = () => res(); pImg.onerror = rej; pImg.src = transparentUrl; });
      ctx.clearRect(0, 0, 1200, 1600);
      ctx.drawImage(pImg, 0, 0);
    } catch (e) { console.warn('Transparency pass failed:', e); }
  }

  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function downloadComparisonImage(originalUrl: string, modifiedUrl: string, filename: string, label?: string) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const loadImage = (url: string) => new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => res(img); img.onerror = rej; img.src = url;
  });
  try {
    const [img1, img2] = await Promise.all([loadImage(originalUrl), loadImage(modifiedUrl)]);
    const p = 40, lh = 60, fh = label ? 60 : 0;
    canvas.width = img1.width + img2.width + p * 3;
    canvas.height = Math.max(img1.height, img2.height) + p * 2 + lh + fh;
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#141414'; ctx.font = 'bold 24px monospace'; ctx.textAlign = 'center';
    ctx.fillText('ORIGINAL', p + img1.width / 2, p + lh / 2);
    ctx.fillText('MODIFIED', p * 2 + img1.width + img2.width / 2, p + lh / 2);
    ctx.drawImage(img1, p, p + lh);
    ctx.drawImage(img2, p * 2 + img1.width, p + lh);
    ctx.strokeStyle = '#141414'; ctx.lineWidth = 2;
    ctx.strokeRect(p, p + lh, img1.width, img1.height);
    ctx.strokeRect(p * 2 + img1.width, p + lh, img2.width, img2.height);
    if (label) { ctx.font = 'italic 20px monospace'; ctx.fillText(`REF: ${label.toUpperCase()}`, canvas.width / 2, canvas.height - p); }
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png'); link.download = filename;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  } catch (e) { console.error('Comparison download failed:', e); }
}

export async function downloadMultiComparisonImage(images: { image: string; label?: string }[], filename: string, originalImage?: string) {
  const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); if (!ctx) return;
  const loadImage = (url: string) => new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => res(img); img.onerror = rej; img.src = url;
  });
  try {
    const allImages = originalImage ? [{ image: originalImage, label: 'ORIGINAL' }, ...images] : images;
    const loaded = await Promise.all(allImages.map(i => loadImage(i.image)));
    const p = 40, lh = 60, cols = loaded.length <= 3 ? loaded.length : 2;
    const rows = Math.ceil(loaded.length / cols);
    const iw = loaded[0].width, ih = loaded[0].height;
    canvas.width = iw * cols + p * (cols + 1);
    canvas.height = ih * rows + p * (rows + 1) + lh * rows;
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    loaded.forEach((img, idx) => {
      const col = idx % cols, row = Math.floor(idx / cols);
      const x = p + col * (iw + p), y = p + row * (ih + p + lh);
      ctx.fillStyle = '#141414'; ctx.font = 'bold 20px monospace'; ctx.textAlign = 'center';
      ctx.fillText((allImages[idx].label || `V${idx}`).toUpperCase(), x + iw / 2, y + lh / 2);
      ctx.drawImage(img, x, y + lh);
      ctx.strokeStyle = '#141414'; ctx.lineWidth = 2;
      ctx.strokeRect(x, y + lh, iw, ih);
    });
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png'); link.download = filename;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  } catch (e) { console.error('Multi-comparison failed:', e); }
}

// Cross-style ZIP batch export
export async function downloadCollectionZip(buckets: StyleBucket[], collectionName: string) {
  try {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const colFolder = zip.folder(collectionName || 'collection') || zip;

    for (const bucket of buckets) {
      if (bucket.history.length === 0) continue;
      const styleFolder = colFolder.folder(bucket.label || bucket.key) || colFolder;
      for (let i = 0; i < bucket.history.length; i++) {
        const item = bucket.history[i];
        const fn = generateFilename({ label: bucket.label, metadata: item.metadata, version: item.version }, i);
        const base64 = item.image.split(',')[1];
        styleFolder.file(fn, base64, { base64: true });
      }
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${collectionName || 'collection'}-export.zip`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  } catch (e) {
    console.error('ZIP export failed:', e);
    alert('Export failed. Please try again.');
  }
}

// ---- Background removal ----
export async function makeImageTransparent(base64: string): Promise<string> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return base64;
  const img = new Image();
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = base64; });
  canvas.width = img.width; canvas.height = img.height;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const { width, height } = canvas;

  // Sample corners to determine background color
  const samplePixel = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
  };
  const corners = [
    samplePixel(0, 0), samplePixel(width - 1, 0),
    samplePixel(0, height - 1), samplePixel(width - 1, height - 1),
  ];
  const avgR = corners.reduce((s, c) => s + c[0], 0) / 4;
  const avgG = corners.reduce((s, c) => s + c[1], 0) / 4;
  const avgB = corners.reduce((s, c) => s + c[2], 0) / 4;
  const bgIsDark = (avgR + avgG + avgB) / 3 < 128;
  const bgThreshold = 55;

  const isBackgroundPixel = (r: number, g: number, b: number, a: number) => {
    if (a < 10) return true;
    if (bgIsDark) return Math.sqrt(r ** 2 + g ** 2 + b ** 2) < bgThreshold * 2;
    return Math.sqrt((255 - r) ** 2 + (255 - g) ** 2 + (255 - b) ** 2) < bgThreshold;
  };

  const visited = new Uint8Array(width * height);
  const queue: number[] = [];
  for (let x = 0; x < width; x++) {
    [0, height - 1].forEach(y => {
      const idx = y * width + x;
      const [r, g, b, a] = samplePixel(x, y);
      if (!visited[idx] && isBackgroundPixel(r, g, b, a)) { visited[idx] = 1; queue.push(idx); }
    });
  }
  for (let y = 0; y < height; y++) {
    [0, width - 1].forEach(x => {
      const idx = y * width + x;
      const [r, g, b, a] = samplePixel(x, y);
      if (!visited[idx] && isBackgroundPixel(r, g, b, a)) { visited[idx] = 1; queue.push(idx); }
    });
  }

  let head = 0;
  while (head < queue.length) {
    const curr = queue[head++];
    const cx = curr % width, cy = Math.floor(curr / width);
    const neighbors = [];
    if (cx > 0) neighbors.push(curr - 1);
    if (cx < width - 1) neighbors.push(curr + 1);
    if (cy > 0) neighbors.push(curr - width);
    if (cy < height - 1) neighbors.push(curr + width);
    for (const n of neighbors) {
      if (!visited[n]) {
        const nr = data[n * 4], ng = data[n * 4 + 1], nb = data[n * 4 + 2], na = data[n * 4 + 3];
        if (isBackgroundPixel(nr, ng, nb, na)) { visited[n] = 1; queue.push(n); }
      }
    }
  }

  const tempAlpha = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) tempAlpha[i] = data[i * 4 + 3];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (visited[idx]) {
        tempAlpha[idx] = 0;
      } else if (y > 0 && y < height - 1 && x > 0 && x < width - 1) {
        const hasTransNeighbor = visited[idx-1] || visited[idx+1] || visited[idx-width] || visited[idx+width] ||
          visited[idx-width-1] || visited[idx-width+1] || visited[idx+width-1] || visited[idx+width+1];
        if (hasTransNeighbor) {
          const r = data[idx*4], g = data[idx*4+1], b = data[idx*4+2];
          if (bgIsDark) {
            const d = Math.sqrt(r**2 + g**2 + b**2);
            if (d < 140) tempAlpha[idx] = Math.max(0, Math.min(255, Math.round(((d - 45) / 95) * 255)));
          } else {
            const d = Math.sqrt((255-r)**2 + (255-g)**2 + (255-b)**2);
            if (d < 140) tempAlpha[idx] = Math.max(0, Math.min(255, Math.round(((d - 40) / 100) * 255)));
          }
        }
      }
    }
  }

  // Clean up near-white or near-black interior islands
  for (let i = 0; i < width * height; i++) {
    if (tempAlpha[i] > 0) {
      const r = data[i*4], g = data[i*4+1], b = data[i*4+2];
      const d = bgIsDark ? Math.sqrt(r**2 + g**2 + b**2) : Math.sqrt((255-r)**2 + (255-g)**2 + (255-b)**2);
      if (d < 14) tempAlpha[i] = 0;
    }
  }

  for (let i = 0; i < width * height; i++) data[i * 4 + 3] = tempAlpha[i];
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

// ---- HEIC support ----
async function getHeic2any(): Promise<any> {
  if (typeof window !== 'undefined' && (window as any).heic2any) return (window as any).heic2any;
  try {
    const mod = await import('heic2any');
    const fn = mod.default || mod;
    if (typeof fn === 'function') return fn;
  } catch {}
  return new Promise((resolve, reject) => {
    const id = 'heic2any-cdn';
    if (document.getElementById(id)) {
      let tries = 0;
      const check = () => (window as any).heic2any ? resolve((window as any).heic2any) : tries++ < 50 ? setTimeout(check, 100) : reject(new Error('heic2any timeout'));
      check(); return;
    }
    const s = document.createElement('script');
    s.id = id; s.src = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
    s.onload = () => (window as any).heic2any ? resolve((window as any).heic2any) : reject(new Error('heic2any not on window'));
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export async function fileToBase64(file: File): Promise<string> {
  const isHeic = /\.(heic|heif)$/i.test(file.name) || file.type === 'image/heic' || file.type === 'image/heif';
  let blob: Blob = file;
  if (isHeic) {
    try {
      const fn = await getHeic2any();
      const converted = await fn({ blob: file, toType: 'image/jpeg', quality: 0.8 });
      blob = Array.isArray(converted) ? converted[0] : converted;
    } catch (e) { console.error('HEIC conversion failed:', e); }
  }
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result as string);
    reader.onerror = rej;
    reader.readAsDataURL(blob);
  });
}
