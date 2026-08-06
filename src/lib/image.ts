// Resizes and compresses an image file client-side before it's stored as a
// base64 data URL, since there's no server-side file upload/storage yet.
export function fileToCompressedDataUrl(file: File, maxDim = 400, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => {
      img.onerror = () => reject(new Error("Failed to load image"));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// Reads any file (PDF, image, etc.) as a base64 data URL, unresized — used for document/contract
// uploads where the file must stay byte-for-byte the same (fileToCompressedDataUrl above re-encodes
// as JPEG, which only makes sense for a decorative profile photo).
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

// Receipt logo upload: produces both a preview data URL AND a pre-rasterized ESC/POS bitmap,
// computed ONCE here (client-side, via Canvas) rather than at every print — so neither the
// local print-agent (C#) nor QZ Tray path (browser JS) needs an image-decoding library, they
// just splice these bytes verbatim into the byte stream they already build. Logos are small
// and typically high-contrast, so a flat luminance threshold (no dithering) is enough.
export function fileToLogoAssets(file: File, maxWidthPx = 384, maxHeightPx = 300, threshold = 200): Promise<{ dataUrl: string; escPosBase64: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => {
      img.onerror = () => reject(new Error("Failed to load image"));
      img.onload = () => {
        const scale = Math.min(1, maxWidthPx / img.width, maxHeightPx / img.height);
        const drawW = Math.max(1, Math.round(img.width * scale));
        const drawH = Math.max(1, Math.round(img.height * scale));
        // ESC/POS raster width must be a whole number of bytes (8px each) — pad up so no column
        // of the logo is silently dropped.
        const widthBytes = Math.ceil(drawW / 8);
        const rasterW = widthBytes * 8;

        const canvas = document.createElement("canvas");
        canvas.width = rasterW;
        canvas.height = drawH;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported"));
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, rasterW, drawH);
        ctx.drawImage(img, 0, 0, drawW, drawH);

        const { data } = ctx.getImageData(0, 0, rasterW, drawH);
        const bitmap = new Uint8Array(widthBytes * drawH);
        for (let y = 0; y < drawH; y++) {
          for (let x = 0; x < rasterW; x++) {
            const i = (y * rasterW + x) * 4;
            const alpha = data[i + 3];
            // Transparent pixels print as white (unset bit) — treat them as background, not black.
            const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            const isBlack = alpha > 32 && luminance < threshold;
            if (isBlack) {
              const byteIndex = y * widthBytes + (x >> 3);
              bitmap[byteIndex] |= 0x80 >> (x % 8);
            }
          }
        }

        // GS v 0 m xL xH yL yH d1...dk — ESC/POS "print raster bit image", m=0 (normal).
        const header = [0x1d, 0x76, 0x30, 0x00, widthBytes & 0xff, (widthBytes >> 8) & 0xff, drawH & 0xff, (drawH >> 8) & 0xff];
        const bytes = new Uint8Array(header.length + bitmap.length);
        bytes.set(header, 0);
        bytes.set(bitmap, header.length);

        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const escPosBase64 = btoa(binary);

        resolve({ dataUrl: canvas.toDataURL("image/png"), escPosBase64 });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
