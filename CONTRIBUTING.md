# Contributing to @particle-academy/fancy-map

Notes for anyone, human or agent, working ON this package's code. How to USE the
package is in [AGENTS.md](./AGENTS.md); what it is, is in [README.md](./README.md).
`CLAUDE.md` is a symlink to this file, so Claude Code reads these notes when it
works in this repo.

## Build and test

```bash
npm run build       # tsup
npm run dev         # tsup --watch
npm run lint        # tsc --noEmit && eslint .
npm test            # vitest run
```

- Tests live in `tests/` (`map.test.tsx`, `stylesheet-check.test.ts`).
- Entries: `.` (the `<Map>` core), `./leaflet` and `./google` (the providers).
  The core has no map-engine dependency; `leaflet` and
  `@googlemaps/js-api-loader` are optional peers and must stay confined to their
  provider entry.
- `src/leaflet.ts` is the reference provider implementation
  (`{ name, mount(host, opts) => MapHandle }`).

## Changelog

Update `CHANGELOG.md` (`## [Unreleased]`) in the same commit as the change.
