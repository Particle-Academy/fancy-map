// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { leafletStylesheetMissing } from "../src/leaflet";

/**
 * Leaflet ships its own stylesheet and the consumer has to import it. When they
 * do not, the map does NOT look like a missing-stylesheet error -- tiles are
 * fetched and painted, so something map-shaped appears. What is actually wrong
 * is that `.leaflet-tile { position: absolute }` never applied, so every tile
 * lays out in normal flow and stacks 256px down the page.
 *
 * That failure is silent, catastrophic and easy to misread as a geometry bug --
 * it cost exactly that misdiagnosis on the showcase, where the map was held back
 * for weeks as "Leaflet measuring stale container size". The size was fine. The
 * stylesheet was absent.
 */

const STYLE_ID = "leaflet-css-probe-fixture";

afterEach(() => {
    document.getElementById(STYLE_ID)?.remove();
    vi.restoreAllMocks();
});

function loadLeafletCss(): void {
    const el = document.createElement("style");
    el.id = STYLE_ID;
    // The single rule the check exists to notice.
    el.textContent = ".leaflet-pane { position: absolute; }";
    document.head.appendChild(el);
}

describe("leafletStylesheetMissing", () => {
    it("reports missing when the consumer never imported the stylesheet", () => {
        expect(leafletStylesheetMissing()).toBe(true);
    });

    it("reports present once the stylesheet is loaded", () => {
        loadLeafletCss();
        expect(leafletStylesheetMissing()).toBe(false);
    });

    it("leaves no probe element behind", () => {
        const before = document.body.childElementCount;
        leafletStylesheetMissing();
        expect(document.body.childElementCount).toBe(before);
    });

    it("is safe where there is no document at all", () => {
        const doc = globalThis.document;
        // @ts-expect-error -- deliberately simulating a server pass.
        delete globalThis.document;
        try {
            expect(leafletStylesheetMissing()).toBe(false);
        } finally {
            globalThis.document = doc;
        }
    });
});
