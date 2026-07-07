import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { LatLng, MapHandle, MapMarker, MapProvider, MapView } from "./types";

export type MapProps = {
  /** The map engine to render with — `leafletProvider()` / `googleProvider({ apiKey })`. */
  provider: MapProvider;
  /** Controlled camera. */
  view: MapView;
  /** Fires when the user pans/zooms (or a provider animation settles). */
  onViewChange?: (view: MapView) => void;
  /** Controlled markers (JSON-friendly; an agent can emit these directly). */
  markers?: MapMarker[];
  /** Controlled selection. */
  selectedId?: string | null;
  onSelect?: (id: string | null, marker?: MapMarker) => void;
  /** Fires when a draggable marker is released. */
  onMarkerDragEnd?: (id: string, position: LatLng) => void;
  /** Fires when the map background (not a marker) is clicked. */
  onMapClick?: (position: LatLng) => void;
  /**
   * Live follow — keep this marker centered as its position updates. Set it to a
   * moving marker's id (a vehicle, a delivery, the agent) for live tracking.
   */
  follow?: string | null;
  /** One-shot: fit the camera to enclose these points (re-runs on array identity change). */
  fitTo?: LatLng[];
  /** Grab the imperative handle once the engine is live (e.g. for a bridge's fitBounds). */
  onReady?: (handle: MapHandle) => void;
  /** Called if the provider fails to mount (e.g. Google SDK load error). */
  onError?: (error: unknown) => void;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
};

const EMPTY_MARKERS: MapMarker[] = [];

/** Whether two cameras are close enough to treat as "the same" (echo guard). */
function viewsClose(a: MapView, b: MapView): boolean {
  return (
    Math.abs(a.center.lat - b.center.lat) < 1e-7 &&
    Math.abs(a.center.lng - b.center.lng) < 1e-7 &&
    Math.abs(a.zoom - b.zoom) < 1e-3
  );
}

/**
 * The engine-agnostic map surface. Fully controlled (view + markers + selection),
 * SSR-safe (renders a sized placeholder on the server; the provider mounts inside
 * an effect, so there's no `window`/engine access during render and no hydration
 * mismatch), and driveable by both a human and — via the Human+ map bridge in
 * `@particle-academy/agent-integrations` — an agent, over the same controlled state.
 */
export function Map({
  provider,
  view,
  onViewChange,
  markers = EMPTY_MARKERS,
  selectedId = null,
  onSelect,
  onMarkerDragEnd,
  onMapClick,
  follow = null,
  fitTo,
  onReady,
  onError,
  className,
  style,
  "aria-label": ariaLabel = "Map",
}: MapProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<MapHandle | null>(null);
  // A bump counter that flips once the (async) provider handle is live, so the
  // prop-sync effects below re-run and apply current props to the fresh engine.
  const [ready, setReady] = useState(0);

  // Latest callbacks + the initial mount snapshot, kept in refs so the mount
  // effect stays mount-once (it only re-runs when the provider identity changes).
  const cbRef = useRef({ onViewChange, onSelect, onMarkerDragEnd, onMapClick, onReady, onError });
  cbRef.current = { onViewChange, onSelect, onMarkerDragEnd, onMapClick, onReady, onError };
  const initialRef = useRef({ view, markers, selectedId });
  // The last camera the map itself emitted — lets the view-sync effect ignore
  // the echo of a user pan (which would otherwise fight the animation).
  const lastEmitted = useRef<MapView | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    let disposed = false;
    let handle: MapHandle | null = null;
    const offs: Array<() => void> = [];

    Promise.resolve(
      provider.mount(host, {
        view: initialRef.current.view,
        markers: initialRef.current.markers,
        selectedId: initialRef.current.selectedId,
        interactive: true,
      }),
    )
      .then((h) => {
        if (disposed) {
          h.destroy();
          return;
        }
        handle = h;
        handleRef.current = h;
        offs.push(
          h.on("viewchange", (v) => {
            lastEmitted.current = v;
            cbRef.current.onViewChange?.(v);
          }),
          h.on("markerclick", ({ id, marker }) => cbRef.current.onSelect?.(id, marker)),
          h.on("markerdragend", ({ id, position }) => cbRef.current.onMarkerDragEnd?.(id, position)),
          h.on("click", ({ position }) => cbRef.current.onMapClick?.(position)),
        );
        cbRef.current.onReady?.(h);
        setReady((n) => n + 1);
      })
      .catch((err) => {
        if (!disposed) {
          cbRef.current.onError?.(err);
        }
      });

    return () => {
      disposed = true;
      for (const off of offs) {
        off();
      }
      handle?.destroy();
      if (handleRef.current === handle) {
        handleRef.current = null;
      }
    };
  }, [provider]);

  // Sync camera — skip the echo of the map's own emitted view.
  useEffect(() => {
    const h = handleRef.current;
    if (!h) {
      return;
    }
    if (lastEmitted.current && viewsClose(lastEmitted.current, view)) {
      return;
    }
    h.setView(view, true);
  }, [view, ready]);

  // Sync markers (provider diffs internally — cheap on live-tracking updates).
  useEffect(() => {
    handleRef.current?.setMarkers(markers);
  }, [markers, ready]);

  // Sync selection.
  useEffect(() => {
    handleRef.current?.setSelected(selectedId);
  }, [selectedId, ready]);

  // Live follow — recenter on the followed marker whenever it moves.
  useEffect(() => {
    if (!follow) {
      return;
    }
    const h = handleRef.current;
    if (!h) {
      return;
    }
    const m = markers.find((x) => x.id === follow);
    if (m) {
      h.setView({ center: m.position }, true);
    }
  }, [follow, markers, ready]);

  // One-shot fit.
  useEffect(() => {
    if (fitTo && fitTo.length) {
      handleRef.current?.fitBounds(fitTo);
    }
  }, [fitTo, ready]);

  return (
    <div
      ref={hostRef}
      className={className}
      role="region"
      aria-label={ariaLabel}
      data-fancy-map={provider.name}
      style={{ position: "relative", width: "100%", height: "100%", minHeight: 240, ...style }}
    />
  );
}
