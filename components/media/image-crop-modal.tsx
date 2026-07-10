"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export interface ImageCropModalProps {
  file: File;
  onCancel: () => void;
  onCropped: (cropped: File) => void;
  /** Mask + preview shape. The crop itself is always the square bounding box. */
  shape?: "circle" | "square";
  title?: string;
}

const OUT = 512;
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function minScaleOf(V: number, iw: number, ih: number): number {
  return V > 0 && iw > 0 && ih > 0 ? V / Math.min(iw, ih) : 0;
}

function clampOffsets(ox: number, oy: number, s: number, V: number, iw: number, ih: number) {
  return { ox: clamp(ox, V - iw * s, 0), oy: clamp(oy, V - ih * s, 0) };
}

interface CropState {
  zoom: number;
  ox: number;
  oy: number;
  V: number;
  iw: number;
  ih: number;
  initialized: boolean;
}

type CropAction =
  | { type: "geom"; V: number; iw: number; ih: number }
  | { type: "pan"; dx: number; dy: number }
  | { type: "zoomAnchor"; nextZoom: number; anchorX: number; anchorY: number };

function reducer(state: CropState, action: CropAction): CropState {
  switch (action.type) {
    case "geom": {
      const { V, iw, ih } = action;
      if (V <= 0 || iw <= 0 || ih <= 0) {
        return { ...state, V, iw, ih };
      }
      const ms = minScaleOf(V, iw, ih);
      if (!state.initialized) {
        const s = ms;
        return { zoom: 1, V, iw, ih, initialized: true, ox: (V - iw * s) / 2, oy: (V - ih * s) / 2 };
      }
      const sOld = minScaleOf(state.V, state.iw, state.ih) * state.zoom;
      const sNew = ms * state.zoom;
      if (sOld <= 0) {
        const s = ms * state.zoom;
        const c = clampOffsets((V - iw * s) / 2, (V - ih * s) / 2, s, V, iw, ih);
        return { ...state, V, iw, ih, ox: c.ox, oy: c.oy };
      }
      const imgX = (state.V / 2 - state.ox) / sOld;
      const imgY = (state.V / 2 - state.oy) / sOld;
      const c = clampOffsets(V / 2 - imgX * sNew, V / 2 - imgY * sNew, sNew, V, iw, ih);
      return { ...state, V, iw, ih, ox: c.ox, oy: c.oy };
    }
    case "pan": {
      const s = minScaleOf(state.V, state.iw, state.ih) * state.zoom;
      if (s <= 0) return state;
      const c = clampOffsets(state.ox + action.dx, state.oy + action.dy, s, state.V, state.iw, state.ih);
      return { ...state, ox: c.ox, oy: c.oy };
    }
    case "zoomAnchor": {
      const ms = minScaleOf(state.V, state.iw, state.ih);
      if (ms <= 0) return state;
      const z = clamp(action.nextZoom, MIN_ZOOM, MAX_ZOOM);
      const sOld = ms * state.zoom;
      const sNew = ms * z;
      const imgX = (action.anchorX - state.ox) / sOld;
      const imgY = (action.anchorY - state.oy) / sOld;
      const c = clampOffsets(
        action.anchorX - imgX * sNew,
        action.anchorY - imgY * sNew,
        sNew,
        state.V,
        state.iw,
        state.ih,
      );
      return { ...state, zoom: z, ox: c.ox, oy: c.oy };
    }
    default:
      return state;
  }
}

const INITIAL: CropState = { zoom: 1, ox: 0, oy: 0, V: 0, iw: 0, ih: 0, initialized: false };

export function ImageCropModal({
  file,
  onCancel,
  onCropped,
  shape = "circle",
  title = "Adjust your photo",
}: ImageCropModalProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const restoreFocusRef = useRef<Element | null>(null);
  const mountedRef = useRef(true);

  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ lastDist: number; lastMid: { x: number; y: number } } | null>(null);

  const [objUrl, setObjUrl] = useState<string | null>(null);
  const [nat, setNat] = useState<{ iw: number; ih: number } | null>(null);
  const [V, setV] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "saving">("loading");
  const [state, dispatch] = useReducer(reducer, INITIAL);

  const stateRef = useRef(state);
  stateRef.current = state;
  const statusRef = useRef(status);
  statusRef.current = status;

  const titleId = "image-crop-title";

  /** Decode via an object URL and revoke it on unmount / file change. */
  useEffect(() => {
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setObjUrl(url);
    setStatus("loading");
    setNat(null);
    return () => {
      URL.revokeObjectURL(url);
      objectUrlRef.current = null;
    };
  }, [file]);

  /** Feed measured viewport + natural size into the reducer for its clamp math. */
  useEffect(() => {
    dispatch({ type: "geom", V, iw: nat?.iw ?? 0, ih: nat?.ih ?? 0 });
  }, [V, nat]);

  /** Measure the square stage's rendered pixel width. */
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setV(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Native, non-passive wheel listener so preventDefault stops page scroll. */
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      if (statusRef.current !== "ready") return;
      const st = stateRef.current;
      if (st.V <= 0) return;
      const rect = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * 0.0015);
      dispatch({
        type: "zoomAnchor",
        nextZoom: st.zoom * factor,
        anchorX: e.clientX - rect.left,
        anchorY: e.clientY - rect.top,
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  /** Esc cancels. */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && statusRef.current !== "saving") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel]);

  /** Focus the panel on open; restore focus to the trigger on close. */
  useEffect(() => {
    restoreFocusRef.current = document.activeElement;
    panelRef.current?.focus();
    return () => {
      const prev = restoreFocusRef.current;
      if (prev instanceof HTMLElement) prev.focus();
    };
  }, []);

  /** Track mount so an in-flight save can't setState / upload after unmount. */
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (!img.naturalWidth) {
      setStatus("error");
      return;
    }
    imgRef.current = img;
    setNat({ iw: img.naturalWidth, ih: img.naturalHeight });
    setStatus("ready");
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (status !== "ready") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size >= 2) pinchRef.current = null;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (status !== "ready") return;
    const pointers = pointersRef.current;
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };

    if (pointers.size >= 2) {
      pointers.set(e.pointerId, cur);
      const pts = [...pointers.values()];
      const a = pts[0];
      const b = pts[1];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const rect = viewportRef.current?.getBoundingClientRect();
      if (pinchRef.current && rect && d > 0) {
        const { lastDist, lastMid } = pinchRef.current;
        dispatch({
          type: "zoomAnchor",
          nextZoom: stateRef.current.zoom * (d / lastDist),
          anchorX: mid.x - rect.left,
          anchorY: mid.y - rect.top,
        });
        dispatch({ type: "pan", dx: mid.x - lastMid.x, dy: mid.y - lastMid.y });
      }
      pinchRef.current = { lastDist: d, lastMid: mid };
      return;
    }

    dispatch({ type: "pan", dx: cur.x - prev.x, dy: cur.y - prev.y });
    pointers.set(e.pointerId, cur);
  };

  const endPointer = (e: React.PointerEvent) => {
    const pointers = pointersRef.current;
    if (pointers.has(e.pointerId)) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* capture may already be gone */
      }
      pointers.delete(e.pointerId);
    }
    if (pointers.size < 2) pinchRef.current = null;
  };

  const onSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (state.V <= 0) return;
    dispatch({ type: "zoomAnchor", nextZoom: Number(e.target.value), anchorX: state.V / 2, anchorY: state.V / 2 });
  };

  const nudgeZoom = (delta: number) => {
    if (state.V <= 0) return;
    dispatch({ type: "zoomAnchor", nextZoom: state.zoom + delta, anchorX: state.V / 2, anchorY: state.V / 2 });
  };

  /** Keep Tab focus inside the dialog (aria-modal has no native focus trap). */
  const onPanelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const nodes = panelRef.current?.querySelectorAll<HTMLElement>(
      'button, input, [href], [tabindex]:not([tabindex="-1"])',
    );
    if (!nodes) return;
    const focusable = Array.from(nodes).filter((node) => !node.hasAttribute("disabled"));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const handleSave = async () => {
    if (!nat || status !== "ready") return;
    setStatus("saving");
    const ms = minScaleOf(state.V, state.iw, state.ih);
    const s = ms * state.zoom;
    if (s <= 0 || !imgRef.current) {
      setStatus("error");
      return;
    }
    const sx = -state.ox / s;
    const sy = -state.oy / s;
    const sSize = state.V / s;
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setStatus("error");
      return;
    }
    ctx.drawImage(imgRef.current, sx, sy, sSize, sSize, 0, 0, OUT, OUT);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!mountedRef.current) return;
    if (!blob) {
      setStatus("error");
      return;
    }
    onCropped(new File([blob], "avatar.png", { type: "image/png" }));
  };

  const displayScale = minScaleOf(state.V, state.iw, state.ih) * state.zoom;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      onClick={() => {
        if (status !== "saving") onCancel();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-md rounded-lg border border-border bg-card shadow-lg p-6 outline-none"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onPanelKeyDown}
      >
        <h2 id={titleId} className="mb-4 text-lg font-bold">
          {title}
        </h2>

        {status === "error" ? (
          <p className="text-sm text-destructive">
            Couldn&rsquo;t read this image. Please try a different file.
          </p>
        ) : (
          <div className="mx-auto w-full max-w-[360px]">
            <div
              ref={viewportRef}
              role="group"
              aria-label="Crop area — drag to reposition, scroll or use the slider to zoom"
              className="relative aspect-square w-full touch-none select-none overflow-hidden rounded-md bg-black/60"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endPointer}
              onPointerCancel={endPointer}
            >
              {objUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={objUrl}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  onLoad={onImgLoad}
                  onError={() => setStatus("error")}
                  className="absolute left-0 top-0 max-w-none"
                  style={
                    nat
                      ? {
                          width: state.iw * displayScale,
                          height: state.ih * displayScale,
                          transform: `translate3d(${state.ox}px, ${state.oy}px, 0)`,
                        }
                      : { width: 0, height: 0 }
                  }
                />
              )}

              {shape === "circle" && status === "ready" && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-full border border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
                />
              )}

              {status !== "ready" && status !== "saving" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Spinner className="h-6 w-6 text-white" />
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                aria-label="Zoom out"
                onClick={() => nudgeZoom(-0.25)}
                disabled={status !== "ready"}
                className="text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.01}
                value={state.zoom}
                aria-label="Zoom"
                onChange={onSliderChange}
                disabled={status !== "ready"}
                className="h-1 flex-1 cursor-pointer accent-primary"
              />
              <button
                type="button"
                aria-label="Zoom in"
                onClick={() => nudgeZoom(0.25)}
                disabled={status !== "ready"}
                className="text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              Drag to reposition · scroll, pinch, or use the slider to zoom.
            </p>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={status === "saving"}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            loading={status === "saving"}
            loadingText="Saving…"
            disabled={status !== "ready"}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
