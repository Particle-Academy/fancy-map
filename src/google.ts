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
 * fancy-map Google Maps provider — the Google Maps JavaScript API behind the
 * same `<Map>` contract as the Leaflet provider.
 *
 * `@googlemaps/js-api-loader` is an OPTIONAL peer dependency; the Google SDK
 * itself is loaded over the network (script tag) at mount time, so nothing
 * Google-specific enters an SSR bundle. Requires a Google Maps JS API key.
 */

export type GoogleProviderOptions = {
  /** Google Maps JavaScript API key (required). */
  apiKey: string;
  /** SDK channel — "weekly" (default), "quarterly", or a pinned version. */
  version?: string;
  /** Optional Map ID (enables cloud-styled maps). */
  mapId?: string;
  /** Extra options forwarded to `new google.maps.Map` (styles, disableDefaultUI, …). */
  mapOptions?: Record<string, unknown>;
};

// A teardrop pin path, colored per-marker (parity with the Leaflet provider).
const PIN_PATH = "M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z";

export function googleProvider(options: GoogleProviderOptions): MapProvider {
  return {
    name: "google",
    async mount(host: HTMLElement, mount: MapMountOptions): Promise<MapHandle> {
      const { setOptions, importLibrary } = await import("@googlemaps/js-api-loader");
      // js-api-loader v2 functional API. Loading these libraries bootstraps the
      // global `google.maps` namespace the rest of this provider uses.
      setOptions({ key: options.apiKey, v: options.version ?? "weekly" });
      await importLibrary("maps");
      await importLibrary("marker");

      const map = new google.maps.Map(host, {
        center: { lat: mount.view.center.lat, lng: mount.view.center.lng },
        zoom: mount.view.zoom,
        mapId: options.mapId,
        ...(options.mapOptions ?? {}),
      });

      const listeners = new Map<keyof MapEventMap, Set<(p: never) => void>>();
      const emit = <K extends keyof MapEventMap>(event: K, payload: MapEventMap[K]) => {
        listeners.get(event)?.forEach((cb) => (cb as (p: MapEventMap[K]) => void)(payload));
      };

      const markers = new Map<string, google.maps.Marker>();
      const markerData = new Map<string, MapMarker>();
      let selected: string | null = mount.selectedId ?? null;

      const iconFor = (m: MapMarker, isSelected: boolean): google.maps.Symbol => ({
        path: PIN_PATH,
        fillColor: m.color ?? "#2563eb",
        fillOpacity: 1,
        strokeColor: isSelected ? "#1d4ed8" : "#ffffff",
        strokeWeight: isSelected ? 4 : 2,
        scale: isSelected ? 1.35 : 1.2,
        anchor: new google.maps.Point(12, 36),
        labelOrigin: new google.maps.Point(12, 12),
      });

      const labelFor = (m: MapMarker): google.maps.MarkerLabel | undefined =>
        m.icon ? { text: m.icon, color: "#ffffff", fontSize: "11px", fontWeight: "700" } : undefined;

      const addMarker = (m: MapMarker) => {
        const marker = new google.maps.Marker({
          position: { lat: m.position.lat, lng: m.position.lng },
          map,
          icon: iconFor(m, m.id === selected),
          label: labelFor(m),
          draggable: !!m.draggable,
          title: m.label,
          zIndex: m.id === selected ? 999 : undefined,
        });
        marker.addListener("click", () =>
          emit("markerclick", { id: m.id, marker: markerData.get(m.id) ?? m }),
        );
        marker.addListener("dragend", () => {
          const pos = marker.getPosition();
          if (pos) {
            emit("markerdragend", { id: m.id, position: { lat: pos.lat(), lng: pos.lng() } });
          }
        });
        markers.set(m.id, marker);
        markerData.set(m.id, m);
      };

      for (const m of mount.markers) {
        addMarker(m);
      }

      const currentView = (): MapView => {
        const c = map.getCenter();
        return {
          center: { lat: c ? c.lat() : mount.view.center.lat, lng: c ? c.lng() : mount.view.center.lng },
          zoom: map.getZoom() ?? mount.view.zoom,
        };
      };

      map.addListener("idle", () => emit("viewchange", currentView()));
      map.addListener("click", (e: google.maps.MapMouseEvent) => {
        if (e.latLng) {
          emit("click", { position: { lat: e.latLng.lat(), lng: e.latLng.lng() } });
        }
      });

      return {
        setView(view, animate = true) {
          if (view.center) {
            const to = { lat: view.center.lat, lng: view.center.lng };
            if (animate) {
              map.panTo(to);
            } else {
              map.setCenter(to);
            }
          }
          if (typeof view.zoom === "number") {
            map.setZoom(view.zoom);
          }
        },
        getView: currentView,
        setMarkers(next: MapMarker[]) {
          const seen = new Set<string>();
          for (const m of next) {
            seen.add(m.id);
            const existing = markers.get(m.id);
            if (existing) {
              const prev = markerData.get(m.id);
              existing.setPosition({ lat: m.position.lat, lng: m.position.lng });
              markerData.set(m.id, m);
              if (!prev || prev.color !== m.color || m.id === selected) {
                existing.setIcon(iconFor(m, m.id === selected));
              }
              if (!prev || prev.icon !== m.icon) {
                existing.setLabel(labelFor(m) ?? null);
              }
              if (!!m.draggable !== !!prev?.draggable) {
                existing.setDraggable(!!m.draggable);
              }
            } else {
              addMarker(m);
            }
          }
          for (const [id, marker] of markers) {
            if (!seen.has(id)) {
              marker.setMap(null);
              markers.delete(id);
              markerData.delete(id);
            }
          }
        },
        setSelected(id) {
          const prev = selected;
          selected = id;
          for (const targetId of [prev, id]) {
            if (!targetId) {
              continue;
            }
            const marker = markers.get(targetId);
            const data = markerData.get(targetId);
            if (marker && data) {
              marker.setIcon(iconFor(data, targetId === id));
              marker.setZIndex(targetId === id ? 999 : undefined);
            }
          }
        },
        fitBounds(points: LatLng[], padding = 40) {
          if (!points.length) {
            return;
          }
          const bounds = new google.maps.LatLngBounds();
          for (const p of points) {
            bounds.extend({ lat: p.lat, lng: p.lng });
          }
          map.fitBounds(bounds, padding);
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
          for (const marker of markers.values()) {
            marker.setMap(null);
          }
          markers.clear();
          markerData.clear();
          if (typeof google !== "undefined") {
            google.maps.event.clearInstanceListeners(map);
          }
        },
      };
    },
  };
}
