import type {
  LatLng,
  MapEventMap,
  MapHandle,
  MapMarker,
  MapMountOptions,
  MapProvider,
  MapView,
} from "./types";

/**
 * fancy-map Leaflet provider — OpenStreetMap by default, or any XYZ raster tile
 * source (Stadia, CARTO, Mapbox raster, your own tile server).
 *
 * `leaflet` is an OPTIONAL peer dependency: install it in apps that use this
 * provider, and import its stylesheet once (`import "leaflet/dist/leaflet.css"`).
 * Leaflet is loaded dynamically inside `mount` (which runs client-side), so this
 * module is safe to import in an SSR bundle.
 */

export type LeafletProviderOptions = {
  /** XYZ tile URL template. Defaults to OpenStreetMap. */
  tileUrl?: string;
  /** Attribution HTML for the tile source. */
  attribution?: string;
  /** Extra options forwarded to `L.tileLayer` (maxZoom, subdomains, …). */
  tileLayerOptions?: Record<string, unknown>;
  /** Extra options forwarded to `L.map` (zoomControl, scrollWheelZoom, …). */
  mapOptions?: Record<string, unknown>;
};

const OSM_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const PIN_STYLE_ID = "fancy-map-leaflet-pin-style";
const PIN_CSS = `
.fancy-map-pin{display:flex;align-items:center;justify-content:center;width:26px;height:26px;
  border-radius:50% 50% 50% 0;background:var(--fancy-map-pin,#2563eb);transform:rotate(-45deg);
  box-shadow:0 1px 4px rgba(0,0,0,.4);border:2px solid #fff;cursor:pointer;transition:transform .12s}
.fancy-map-pin>span{transform:rotate(45deg);font-size:12px;line-height:1;color:#fff;font-weight:700}
.fancy-map-pin.is-selected{outline:3px solid rgba(37,99,235,.5);outline-offset:1px}
.fancy-map-pin:hover{transform:rotate(-45deg) scale(1.08)}`;

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function ensurePinStyle(): void {
  if (typeof document === "undefined" || document.getElementById(PIN_STYLE_ID)) {
    return;
  }
  const el = document.createElement("style");
  el.id = PIN_STYLE_ID;
  el.textContent = PIN_CSS;
  document.head.appendChild(el);
}

export function leafletProvider(options: LeafletProviderOptions = {}): MapProvider {
  return {
    name: "leaflet",
    async mount(host: HTMLElement, mount: MapMountOptions): Promise<MapHandle> {
      const mod = await import("leaflet");
      const L = ((mod as unknown as { default?: typeof import("leaflet") }).default ??
        mod) as typeof import("leaflet");
      ensurePinStyle();

      const map = L.map(host, { zoomControl: true, ...(options.mapOptions ?? {}) }).setView(
        [mount.view.center.lat, mount.view.center.lng],
        mount.view.zoom,
      );

      L.tileLayer(options.tileUrl ?? OSM_URL, {
        attribution: options.attribution ?? OSM_ATTRIBUTION,
        maxZoom: 19,
        ...(options.tileLayerOptions ?? {}),
      }).addTo(map);

      // Leaflet measures the container at init; when the host is sized by
      // flexbox/grid (or hydrates after SSR) that first measurement can be
      // stale, laying tiles out at the wrong size. Recompute once the layout
      // settles (double rAF). Ongoing window resizes are handled by Leaflet's
      // own `trackResize` — no ResizeObserver (calling invalidateSize from one
      // feeds back into a growth loop).
      let raf1: number | undefined;
      let raf2: number | undefined;
      if (typeof requestAnimationFrame === "function") {
        raf1 = requestAnimationFrame(() => {
          raf2 = requestAnimationFrame(() => map.invalidateSize());
        });
      }

      const listeners = new Map<keyof MapEventMap, Set<(p: never) => void>>();
      const emit = <K extends keyof MapEventMap>(event: K, payload: MapEventMap[K]) => {
        listeners.get(event)?.forEach((cb) => (cb as (p: MapEventMap[K]) => void)(payload));
      };

      const markerLayers = new Map<string, import("leaflet").Marker>();
      const markerData = new Map<string, MapMarker>();
      let selected: string | null = mount.selectedId ?? null;

      const iconFor = (m: MapMarker) =>
        L.divIcon({
          className: "",
          html: `<div class="fancy-map-pin${m.id === selected ? " is-selected" : ""}" data-map-marker-id="${esc(m.id)}" style="--fancy-map-pin:${esc(m.color ?? "#2563eb")}"><span>${esc(m.icon ?? "")}</span></div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 26],
        });

      const addMarker = (m: MapMarker) => {
        const marker = L.marker([m.position.lat, m.position.lng], {
          icon: iconFor(m),
          draggable: !!m.draggable,
          title: m.label,
        }).addTo(map);
        marker.on("click", () => emit("markerclick", { id: m.id, marker: markerData.get(m.id) ?? m }));
        marker.on("dragend", () => {
          const ll = marker.getLatLng();
          emit("markerdragend", { id: m.id, position: { lat: ll.lat, lng: ll.lng } });
        });
        if (m.label) {
          marker.bindTooltip(esc(m.label));
        }
        markerLayers.set(m.id, marker);
        markerData.set(m.id, m);
      };

      for (const m of mount.markers) {
        addMarker(m);
      }

      const currentView = (): MapView => {
        const c = map.getCenter();
        return { center: { lat: c.lat, lng: c.lng }, zoom: map.getZoom() };
      };

      map.on("moveend zoomend", () => emit("viewchange", currentView()));
      map.on("click", (e: import("leaflet").LeafletMouseEvent) =>
        emit("click", { position: { lat: e.latlng.lat, lng: e.latlng.lng } }),
      );

      return {
        setView(view, animate = true) {
          const c = view.center ?? currentView().center;
          const z = view.zoom ?? map.getZoom();
          map.setView([c.lat, c.lng], z, { animate });
        },
        getView: currentView,
        setMarkers(next: MapMarker[]) {
          const seen = new Set<string>();
          for (const m of next) {
            seen.add(m.id);
            const existing = markerLayers.get(m.id);
            if (existing) {
              const prev = markerData.get(m.id);
              existing.setLatLng([m.position.lat, m.position.lng]);
              markerData.set(m.id, m);
              // Re-render the icon only when its visual inputs changed.
              if (
                !prev ||
                prev.color !== m.color ||
                prev.icon !== m.icon ||
                prev.label !== m.label
              ) {
                existing.setIcon(iconFor(m));
              }
              if (!!m.draggable !== !!prev?.draggable) {
                if (m.draggable) {
                  existing.dragging?.enable();
                } else {
                  existing.dragging?.disable();
                }
              }
            } else {
              addMarker(m);
            }
          }
          for (const [id, marker] of markerLayers) {
            if (!seen.has(id)) {
              marker.remove();
              markerLayers.delete(id);
              markerData.delete(id);
            }
          }
        },
        setSelected(id) {
          selected = id;
          for (const [mid, marker] of markerLayers) {
            const el = marker.getElement()?.querySelector<HTMLElement>(".fancy-map-pin");
            if (el) {
              el.classList.toggle("is-selected", mid === id);
            }
          }
        },
        fitBounds(points: LatLng[], padding = 40) {
          if (!points.length) {
            return;
          }
          const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
          map.fitBounds(bounds, { padding: [padding, padding] });
        },
        on(event, cb) {
          let set = listeners.get(event);
          if (!set) {
            set = new Set();
            listeners.set(event, set);
          }
          set.add(cb as (p: never) => void);
          return () => {
            set.delete(cb as (p: never) => void);
          };
        },
        destroy() {
          if (typeof cancelAnimationFrame === "function") {
            if (raf1 !== undefined) {
              cancelAnimationFrame(raf1);
            }
            if (raf2 !== undefined) {
              cancelAnimationFrame(raf2);
            }
          }
          map.remove();
          markerLayers.clear();
          markerData.clear();
        },
      };
    },
  };
}
