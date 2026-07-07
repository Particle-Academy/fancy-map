import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/leaflet.ts", "src/google.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    "react",
    "react-dom",
    "leaflet",
    "@googlemaps/js-api-loader",
  ],
  treeshake: true,
});
