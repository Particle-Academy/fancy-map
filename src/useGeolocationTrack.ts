import { useEffect, useState } from "react";
import type { LatLng } from "./types";

export type GeolocationTrackOptions = {
  /** Start watching immediately (default true). */
  enabled?: boolean;
  enableHighAccuracy?: boolean;
  maximumAge?: number;
  timeout?: number;
};

export type GeolocationTrack = {
  /** Latest fix, or null before the first one. */
  position: LatLng | null;
  /** Latest fix accuracy in meters, if reported. */
  accuracy: number | null;
  /** Human-readable error, or null. */
  error: string | null;
};

/**
 * Watch the browser's geolocation and return the live position. Feed
 * `position` into a marker to put a moving "you are here" dot on a `<Map>`, and
 * pass that marker's id as the map's `follow` prop to keep it centered.
 *
 * SSR-safe: the watch is started inside an effect, so `navigator` is never
 * touched during render. The watch is cleared on unmount / when disabled.
 */
export function useGeolocationTrack(options: GeolocationTrackOptions = {}): GeolocationTrack {
  const { enabled = true, enableHighAccuracy = true, maximumAge, timeout } = options;
  const [position, setPosition] = useState<LatLng | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Geolocation is not available in this environment.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setAccuracy(typeof pos.coords.accuracy === "number" ? pos.coords.accuracy : null);
        setError(null);
      },
      (err) => setError(err.message),
      { enableHighAccuracy, maximumAge, timeout },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled, enableHighAccuracy, maximumAge, timeout]);

  return { position, accuracy, error };
}
