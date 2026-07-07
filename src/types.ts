/**
 * fancy-map core types — provider-agnostic. Leaflet, Google Maps, and any
 * future engine (MapLibre, Mapbox GL) speak this same vocabulary, so swapping
 * the `provider` prop is the only change needed to move between map engines.
 *
 * Coordinates are `{ lat, lng }` objects (not `[lng, lat]` tuples): it matches
 * both Leaflet (`L.latLng`) and Google (`{ lat, lng }`) native conventions and
 * reads unambiguously in agent-emitted JSON.
 */

/** A geographic point. */
export type LatLng = { lat: number; lng: number };

/** The camera. `bearing`/`pitch` are honored only by providers that support them. */
export type MapView = {
  center: LatLng;
  zoom: number;
  bearing?: number;
  pitch?: number;
};

/**
 * A map marker. JSON-friendly so an agent can emit an array of these directly.
 * `id` is the stable handle — it appears as `data-map-marker-id` on the rendered
 * element and is how selection, updates, and the bridge address a marker.
 */
export type MapMarker = {
  id: string;
  position: LatLng;
  /** Tooltip / popup label. */
  label?: string;
  /** CSS color for the default pin (e.g. "#2563eb"). */
  color?: string;
  /** Emoji or 1–2 chars rendered inside the pin (e.g. "🚚", "A"). */
  icon?: string;
  /** Whether the human can drag this marker (fires onMarkerDragEnd). */
  draggable?: boolean;
  /** Arbitrary JSON payload carried with the marker (agent/host use). */
  data?: Record<string, unknown>;
};

/** Payloads for the events a {@link MapHandle} emits. */
export type MapEventMap = {
  /** Camera moved (user pan/zoom or a provider animation settling). */
  viewchange: MapView;
  /** A marker was clicked. */
  markerclick: { id: string; marker: MapMarker };
  /** A draggable marker was released. */
  markerdragend: { id: string; position: LatLng };
  /** The map background (not a marker) was clicked. */
  click: { position: LatLng };
};

/** Options a provider receives when the component mounts it. */
export type MapMountOptions = {
  view: MapView;
  markers: MapMarker[];
  selectedId?: string | null;
  /** True when the component is server/hydration constrained; providers ignore. */
  interactive?: boolean;
};

/**
 * The imperative handle a provider returns from {@link MapProvider.mount}. The
 * `<Map>` component drives it from props, and the Human+ bridge drives it from
 * an agent — both through this one surface.
 */
export type MapHandle = {
  /** Move the camera. Partial: pass only what changes. */
  setView(view: Partial<MapView>, animate?: boolean): void;
  /** Read the current camera. */
  getView(): MapView;
  /** Reconcile the rendered markers to exactly this set (providers diff). */
  setMarkers(markers: MapMarker[]): void;
  /** Highlight one marker (or clear with null). */
  setSelected(id: string | null): void;
  /** Fit the camera to enclose all points (with optional px padding). */
  fitBounds(points: LatLng[], padding?: number): void;
  /** Subscribe to an event; returns an unsubscribe fn. */
  on<K extends keyof MapEventMap>(event: K, cb: (payload: MapEventMap[K]) => void): () => void;
  /** Tear down the engine and release the host element. */
  destroy(): void;
};

/**
 * A map engine, ready to mount. Created by `leafletProvider()` /
 * `googleProvider({ apiKey })`. `mount` may be async (Google loads its SDK over
 * the network) — the component awaits it.
 */
export type MapProvider = {
  name: string;
  mount(host: HTMLElement, options: MapMountOptions): MapHandle | Promise<MapHandle>;
};
