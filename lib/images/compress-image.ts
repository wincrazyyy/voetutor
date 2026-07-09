/**
 * Client-side image compression shared by every image uploader (educator profile images + gallery
 * photos, account avatars, forum/announcement embeds). Downscales to a max edge and re-encodes, then
 * steps quality — and, if still over budget, dimensions — DOWN until the result fits a byte target.
 * So an educator can drop in a large phone photo and it "just works" without hunting for a compressor.
 *
 * Prefers WEBP; falls back to JPEG on browsers whose canvas can't encode WEBP (Safari < 17), so a
 * large photo still compresses there instead of being rejected. A file that can't be decoded at all
 * is reported as an error rather than uploaded broken.
 *
 * Browser-only (canvas / createImageBitmap): every export touches those globals only inside a
 * function body, never at module load, so the module stays safe to import from a server component
 * that only needs a sibling pure helper (e.g. isRteImageUrl lives beside uploadRteImage).
 */

const DEFAULT_MAX_DIM = 1600;
const DEFAULT_TARGET_BYTES = 4 * 1024 * 1024;
const HARD_MAX_BYTES = 5 * 1024 * 1024;
const MAX_INPUT_BYTES = 40 * 1024 * 1024;
const QUALITY_STEPS = [0.85, 0.7, 0.55, 0.4];
const MIN_EDGE = 320;
const MAX_ATTEMPTS = 8;

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export interface PreparedImage {
  blob: Blob;
  ext: string;
  contentType: string;
}

export interface CompressImageOptions {
  maxDim?: number;
  targetBytes?: number;
}

type CompressResult =
  | { ok: true; blob: Blob; ext: string; contentType: string }
  | { ok: false; reason: "decode" | "encode" };

interface Drawable {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}

/**
 * Decode the file into something drawable. Prefers createImageBitmap (which can honour EXIF
 * orientation) and falls back to an <img> element for formats a given browser can't bitmap-decode.
 * Returns null when the image cannot be decoded at all.
 */
async function loadDrawable(file: File): Promise<Drawable | null> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close?.(),
    };
  } catch {
    /* fall through to the <img> decoder */
  }
  try {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const ok = await new Promise<boolean>((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
    if (!ok || !img.naturalWidth) {
      URL.revokeObjectURL(url);
      return null;
    }
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      cleanup: () => URL.revokeObjectURL(url),
    };
  } catch {
    return null;
  }
}

let webpEncodeSupport: Promise<boolean> | null = null;

/** Does this browser's canvas actually encode WEBP? (Safari < 17 silently emits PNG instead.) Cached. */
function supportsWebpEncode(): Promise<boolean> {
  if (!webpEncodeSupport) {
    webpEncodeSupport = (async () => {
      try {
        const probe = document.createElement("canvas");
        probe.width = 1;
        probe.height = 1;
        const blob = await new Promise<Blob | null>((resolve) =>
          probe.toBlob(resolve, "image/webp", 0.8),
        );
        return !!blob && blob.type === "image/webp";
      } catch {
        return false;
      }
    })();
  }
  return webpEncodeSupport;
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob && blob.type === type ? blob : null), type, quality);
  });
}

/**
 * Compress `file` under `targetBytes`, preferring WEBP and falling back to JPEG where WEBP encoding
 * is unavailable. Quality is stepped down first, then the canvas is shrunk, until the blob fits — the
 * smallest blob produced is returned even in the rare miss. Reports `reason: "decode"` when the image
 * can't be read and `reason: "encode"` when no encoder produced any output.
 */
export async function compressImage(
  file: File,
  options: CompressImageOptions = {},
): Promise<CompressResult> {
  const maxDim = options.maxDim ?? DEFAULT_MAX_DIM;
  const targetBytes = options.targetBytes ?? DEFAULT_TARGET_BYTES;

  const drawable = await loadDrawable(file);
  if (!drawable) return { ok: false, reason: "decode" };

  const format = (await supportsWebpEncode())
    ? { type: "image/webp", ext: "webp" }
    : { type: "image/jpeg", ext: "jpg" };

  try {
    let scale = Math.min(1, maxDim / Math.max(drawable.width, drawable.height));
    let smallest: Blob | null = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const w = Math.max(1, Math.round(drawable.width * scale));
      const h = Math.max(1, Math.round(drawable.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) break;
      /* JPEG has no alpha; paint white so transparent areas don't render as black. */
      if (format.type === "image/jpeg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(drawable.source, 0, 0, w, h);

      let encodeFailed = false;
      for (const quality of QUALITY_STEPS) {
        const blob = await encode(canvas, format.type, quality);
        if (!blob) {
          encodeFailed = true;
          break; /* try a smaller canvas (guards against a large-canvas OOM) */
        }
        if (!smallest || blob.size < smallest.size) smallest = blob;
        if (blob.size <= targetBytes) {
          return { ok: true, blob, ext: format.ext, contentType: format.type };
        }
      }

      if (!encodeFailed && w <= MIN_EDGE && h <= MIN_EDGE) break;
      scale *= 0.7;
    }

    if (smallest) return { ok: true, blob: smallest, ext: format.ext, contentType: format.type };
    return { ok: false, reason: "encode" };
  } finally {
    drawable.cleanup();
  }
}

/**
 * The single entry point every uploader uses: validate the type, guard against an absurdly large
 * input, compress, and fall back to the untouched original only when the browser can't ENCODE but the
 * original already fits the cap. A file that can't be DECODED is reported as an error rather than
 * uploaded broken. A normal large photo compresses far below the cap, so it uploads with no user
 * action.
 */
export async function prepareImageForUpload(
  file: File,
  options: CompressImageOptions = {},
): Promise<PreparedImage | { error: string }> {
  const baseExt = EXT[file.type];
  if (!baseExt) return { error: "Use a PNG, JPG, or WEBP image." };
  if (file.size > MAX_INPUT_BYTES) {
    return { error: "That image is too large to process. Please use one under 40 MB." };
  }

  const result = await compressImage(file, options);
  if (result.ok && result.blob.size <= HARD_MAX_BYTES) {
    return { blob: result.blob, ext: result.ext, contentType: result.contentType };
  }
  if (!result.ok && result.reason === "decode") {
    return { error: "Couldn't read this image. Please try a different file." };
  }
  /* Encoder unavailable (or the rare over-cap compression): the untouched original is fine if it fits. */
  if (file.size <= HARD_MAX_BYTES) {
    return { blob: file, ext: baseExt, contentType: file.type };
  }
  return { error: "Couldn't shrink this image below 5 MB. Please try a different photo." };
}
