/**
 * @particle-academy/fancy-map — engine-agnostic Map component.
 *
 * Root barrel: the `<Map>` component, the live-tracking hook, and all types.
 * Map ENGINES are opt-in subpaths so you pay only for the one you use:
 *   import { leafletProvider } from "@particle-academy/fancy-map/leaflet";
 *   import { googleProvider }  from "@particle-academy/fancy-map/google";
 *
 * The Human+ bridge (agent-driven, cohabited maps) ships separately as
 * `registerMapBridge` from `@particle-academy/agent-integrations/bridges/map`.
 */
export { Map, type MapProps } from "./Map";
export { useGeolocationTrack, type GeolocationTrack, type GeolocationTrackOptions } from "./useGeolocationTrack";
export type {
  LatLng,
  MapView,
  MapMarker,
  MapEventMap,
  MapMountOptions,
  MapHandle,
  MapProvider,
} from "./types";
