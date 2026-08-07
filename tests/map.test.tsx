// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Map } from "../src/Map";
import type { LatLng, MapHandle, MapMarker, MapProvider, MapView } from "../src/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

/**
 * `<Map>` mounts its provider through `Promise.resolve(...).then(...)` so a
 * provider whose SDK loads asynchronously (Google) works the same as one that
 * does not (Leaflet). Every assertion about the handle therefore has to wait a
 * microtask — a synchronous act() sees only the mount call itself.
 */
async function mount(el: ReactElement): Promise<HTMLElement> {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => {
        root.render(el);
    });
    return host;
}

async function rerender(root: Root, el: ReactElement): Promise<void> {
    await act(async () => {
        root.render(el);
    });
}

afterEach(() => {
    act(() => roots.splice(0).forEach((r) => r.unmount()));
    document.body.innerHTML = "";
});

/**
 * A provider that records what `<Map>` asks of it.
 *
 * The whole point of the engine-agnostic core is that Leaflet and Google are
 * interchangeable behind this contract — so the contract is exactly what is
 * worth testing, and it can be tested without booting a map engine at all.
 */
function fakeProvider() {
    const calls: string[] = [];
    let view: MapView = { center: { lat: 0, lng: 0 }, zoom: 1 };
    const listeners: Record<string, ((p: never) => void)[]> = {};
    let destroyed = 0;

    const handle: MapHandle = {
        setView: (next, animate) => {
            calls.push(`setView:${JSON.stringify(next)}:${animate ?? false}`);
            view = { ...view, ...next } as MapView;
        },
        getView: () => view,
        setMarkers: (markers) => calls.push(`setMarkers:${markers.map((m) => m.id).join(",")}`),
        setSelected: (id) => calls.push(`setSelected:${id}`),
        fitBounds: (points, padding) => calls.push(`fitBounds:${points.length}:${padding ?? "-"}`),
        on: (event, cb) => {
            (listeners[event] ??= []).push(cb as (p: never) => void);
            return () => {
                listeners[event] = (listeners[event] ?? []).filter((f) => f !== cb);
            };
        },
        destroy: () => {
            destroyed++;
            calls.push("destroy");
        },
    };

    const provider: MapProvider = {
        mount: vi.fn((_host: HTMLElement, opts) => {
            view = opts.view;
            calls.push("mount");
            return handle;
        }),
    } as unknown as MapProvider;

    return {
        provider,
        calls,
        get destroyed() {
            return destroyed;
        },
        emit: <K extends string>(event: K, payload: unknown) => {
            act(() => {
                for (const cb of listeners[event] ?? []) (cb as (p: unknown) => void)(payload);
            });
        },
    };
}

const marker = (id: string, over: Partial<MapMarker> = {}): MapMarker => ({
    id,
    position: { lat: 1, lng: 2 },
    ...over,
});

const VIEW: MapView = { center: { lat: 10, lng: 20 }, zoom: 8 };

describe("Map / provider contract", () => {
    it("mounts the provider into a real element with the initial view", async () => {
        const f = fakeProvider();
        await mount(<Map provider={f.provider} view={VIEW} markers={[]} />);

        expect(f.calls).toContain("mount");
        const [host, opts] = (f.provider.mount as ReturnType<typeof vi.fn>).mock.calls[0]!;
        expect(host).toBeInstanceOf(HTMLElement);
        expect(opts.view).toEqual(VIEW);
    });

    it("pushes marker changes down to the engine", async () => {
        const f = fakeProvider();
        const host = document.createElement("div");
        document.body.append(host);
        const root = createRoot(host);
        roots.push(root);

        await rerender(root, <Map provider={f.provider} view={VIEW} markers={[marker("a")]} />);
        await rerender(root, <Map provider={f.provider} view={VIEW} markers={[marker("a"), marker("b")]} />);

        expect(f.calls.filter((c) => c.startsWith("setMarkers")).at(-1)).toBe("setMarkers:a,b");
    });

    it("pushes selection down, including clearing it", async () => {
        const f = fakeProvider();
        const host = document.createElement("div");
        document.body.append(host);
        const root = createRoot(host);
        roots.push(root);

        await rerender(root, <Map provider={f.provider} view={VIEW} markers={[marker("a")]} selectedId="a" />);
        await rerender(root, <Map provider={f.provider} view={VIEW} markers={[marker("a")]} selectedId={null} />);

        expect(f.calls).toContain("setSelected:a");
        expect(f.calls).toContain("setSelected:null");
    });

    it("reports a marker click back to the caller", async () => {
        // The event path is what makes the surface inhabitable — an agent and a
        // human both learn about the same click through it.
        const onSelect = vi.fn();
        const f = fakeProvider();
        await mount(<Map provider={f.provider} view={VIEW} markers={[marker("a")]} onSelect={onSelect} />);

        f.emit("markerclick", { id: "a", marker: marker("a") });

        // Both the id AND the marker: a bridge needs the id to echo selection
        // back as state, and the payload to describe what was clicked without a
        // second lookup.
        expect(onSelect).toHaveBeenCalledWith("a", marker("a"));
    });

    it("reports camera movement", async () => {
        const onViewChange = vi.fn();
        const f = fakeProvider();
        await mount(<Map provider={f.provider} view={VIEW} markers={[]} onViewChange={onViewChange} />);

        const moved: MapView = { center: { lat: 1, lng: 1 }, zoom: 12 };
        f.emit("viewchange", moved);

        expect(onViewChange).toHaveBeenCalledWith(moved);
    });

    it("destroys the engine on unmount, so a remount does not leak one", async () => {
        // A map engine holds canvases, tile requests and DOM listeners. Skipping
        // destroy is invisible until a route that mounts a map is visited a few
        // times.
        const f = fakeProvider();
        const host = document.createElement("div");
        document.body.append(host);
        const root = createRoot(host);

        await rerender(root, <Map provider={f.provider} view={VIEW} markers={[]} />);
        act(() => root.unmount());

        expect(f.destroyed).toBe(1);
    });

    it("renders a sized placeholder so the first paint is deterministic", async () => {
        // SSR + hydration: the server cannot mount an engine, so the element it
        // renders must match what the client renders before mounting one.
        const f = fakeProvider();
        const host = await mount(<Map provider={f.provider} view={VIEW} markers={[]} style={{ height: 300 }} />);

        expect(host.firstElementChild).toBeInstanceOf(HTMLElement);
    });
});

describe("marker positions", () => {
    it("carries a JSON-friendly marker shape an agent can emit", async () => {
        // The Human+ contract: markers are plain data, so an agent can produce
        // them without React children or imperative calls.
        const m: MapMarker = { id: "m1", position: { lat: 1.5, lng: -2.5 }, label: "Depot" };
        const round: MapMarker = JSON.parse(JSON.stringify(m));

        expect(round).toEqual(m);
    });

    it("fits bounds over a list of points", async () => {
        const f = fakeProvider();
        const points: LatLng[] = [
            { lat: 0, lng: 0 },
            { lat: 1, lng: 1 },
        ];
        await mount(<Map provider={f.provider} view={VIEW} markers={[]} fitTo={points} />);

        expect(f.calls.some((c) => c.startsWith("fitBounds:2"))).toBe(true);
    });
});
