# fancy-map — full guide

`@particle-academy/fancy-map` is an engine-agnostic map surface: the `<Map>`
component owns state, and a **provider** renders it with a concrete engine. This
guide covers the model, both providers, live tracking, the Human+ bridge, and
SSR.

## The model

- **Coordinates** are `{ lat, lng }` objects everywhere (not `[lng, lat]`
  tuples) — matching both Leaflet and Google native conventions.
- **`view`** is the camera: `{ center: {lat,lng}, zoom, bearing?, pitch? }`.
  `bearing`/`pitch` are honored only by providers that support them.
- **`markers`** are a controlled JSON array. `id` is the stable identity — it
  appears as `data-map-marker-id` on the rendered pin and is how selection,
  live updates, and the bridge address a marker.
- **Providers** implement one contract, so the rest of your code never changes
  when you switch engines.

```ts
type LatLng = { lat: number; lng: number };
type MapView = { center: LatLng; zoom: number; bearing?: number; pitch?: number };
type MapMarker = {
  id: string; position: LatLng;
  label?: string; color?: string; icon?: string;   // icon = emoji or 1–2 chars
  draggable?: boolean; data?: Record<string, unknown>;
};
```

## Controlled state (and the one gotcha)

`<Map>` is fully controlled: it never holds view/markers/selection internally.
When the user pans, the map fires `onViewChange` with the new camera; you store
it and pass it back as `view`. The component guards against the feedback loop —
it ignores the echo of a view it just emitted, so the animation never fights the
user. You still own the state, so an agent (or a websocket, or a button) can set
`view` at any time and the map follows.

## Container sizing

Give the map a container with a real height — `height: 480`, `100%` of a sized
parent, or a flex child. This is not a fancy-map quirk; Leaflet and Google both
measure their container to lay out tiles. fancy-map defers an initial size
recompute (for flex/grid/SSR-hydration cases where the first measurement is
stale), but it can't invent a height for a zero-height container.

## Leaflet / OpenStreetMap provider

```tsx
import "leaflet/dist/leaflet.css"; // once, anywhere
import { leafletProvider } from "@particle-academy/fancy-map/leaflet";

const osm = leafletProvider(); // OpenStreetMap
const stadia = leafletProvider({
  tileUrl: "https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png",
  attribution: "© Stadia Maps",
});
```

Options: `tileUrl`, `attribution`, `tileLayerOptions` (forwarded to
`L.tileLayer` — `maxZoom`, `subdomains`, …), `mapOptions` (forwarded to `L.map`
— `zoomControl`, `scrollWheelZoom`, …). `leaflet` is an optional peer dependency;
its stylesheet must be imported by your app once.

Markers render as colored teardrop pins (a Leaflet `divIcon`, so there's no
bundler broken-image-path problem) carrying the `data-map-marker-id` handle.

## Google Maps provider

```tsx
import { googleProvider } from "@particle-academy/fancy-map/google";
const provider = googleProvider({ apiKey: "…", mapId: "…optional…" });
```

Options: `apiKey` (required), `version` ("weekly" default), `mapId` (cloud
styling), `mapOptions` (forwarded to `new google.maps.Map`). The SDK is loaded
via `@googlemaps/js-api-loader` (optional peer dep) at mount time.

## Live tracking

The map has no special "tracking mode" — it just re-renders from controlled
`markers`, and `follow` keeps the camera on one of them. Wire any position
source to a marker:

```tsx
// Browser geolocation
const { position, error } = useGeolocationTrack({ enableHighAccuracy: true });

// …or a websocket / Laravel Echo channel
useEffect(() => {
  const ch = echo.channel(`vehicle.${id}`).listen("Moved", (e) =>
    setMarkers((ms) => ms.map((m) => (m.id === id ? { ...m, position: e.position } : m))),
  );
  return () => ch.stopListening("Moved");
}, [id]);

<Map provider={provider} view={view} onViewChange={setView} markers={markers} follow={id} />;
```

`useGeolocationTrack(options?)` returns `{ position, accuracy, error }` and
watches `navigator.geolocation` inside an effect (SSR-safe). Options:
`enabled`, `enableHighAccuracy`, `maximumAge`, `timeout`.

## Human+ — the cohabited map

Two ways an agent shares the map, both over the same controlled state:

1. **It emits markers/view.** Because `markers` and `view` are JSON, an agent
   that produces app data can hand you a marker array and a camera — no map API
   needed.
2. **It drives the live map** via `registerMapBridge` from
   `@particle-academy/agent-integrations/bridges/map`. Wire the bridge adapter
   to the same setters you pass to `<Map>`:

```ts
import { registerMapBridge } from "@particle-academy/agent-integrations/bridges/map";

const bridge = registerMapBridge(server, {
  adapter: {
    getView: () => view, setView,
    getMarkers: () => markers, setMarkers,
    getSelected: () => selected, setSelected,
    fitBounds: (pts, pad) => handleRef.current?.fitBounds(pts, pad),
  },
  agent: { id: "assistant", name: "Assistant", color: "#7c3aed" },
});
// bridge.dispose() to remove its tools.
```

Tools: `map_get_state`, `map_set_view`, `map_pan`, `map_zoom`, `map_add_marker`,
`map_update_marker`, `map_remove_marker`, `map_select`, `map_fit_bounds`,
`map_start_track`, `map_stop_track`. Mutations broadcast `AgentActivity` and push
undo entries, so the human sees the agent act and can undo.

## SSR / Inertia

`<Map>` renders a sized placeholder `<div>` on the server; the engine mounts in
a `useEffect`, so there's no `window`/engine access during render and no
hydration mismatch. Import `leaflet/dist/leaflet.css` in your app's client
entry. Nothing engine-specific needs to run on the server.

## Writing a new provider

Implement `{ name, mount(host, opts) => MapHandle }` where `MapHandle` is
`setView / getView / setMarkers / setSelected / fitBounds / on / destroy`. Lazy-
load the heavy SDK inside `mount` (it runs client-side), create the native map
into `host`, and translate the engine's events into the four `on(...)` events.
`src/leaflet.ts` is the reference (~180 lines).
