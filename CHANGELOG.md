# Changelog

Notable changes to `@particle-academy/fancy-map`.

**BREAKING** marks anything that can stop working on upgrade. This package is
pre-1.0, so breaking changes land in MINOR releases — read those entries before
upgrading.

> Entries below **1.0** were reconstructed from git history when this file was
> introduced, so they summarise commit subjects rather than consumer impact.
> Everything from the next release onward is written by hand, in the same commit
> as the change.

---

## [Unreleased]

## 0.2.0 — 2026-08-07

### Changed

- **BREAKING — Node 22 is no longer supported.** `engines.node` moves from `>=22` to `>=22`.

  **What you must do:** on Node 22 or newer, nothing. Note npm only *warns* on an `engines` mismatch while **pnpm fails the install**, so this surfaces differently depending on your package manager. Node 18 is end-of-life and 20 is maintenance-only.

- **BREAKING — React 18 is no longer supported.** `peerDependencies.react` / `react-dom` are now `^19.0.0`.

  **What you must do:** on React 19, nothing. On React 18, stay on the previous release, or upgrade your app to 19 first.

  React 18 support was a claim nothing tested — every build and test in this package ran against 19, so the 18 half of the old range was never executed. An untested compatibility claim is worse than an absent one, because it reads as support.

### Why

These are the kit 0.5 platform floors, applied across every package at once so a consumer never has to resolve a mix. **No API changed, nothing was removed, nothing was renamed** — only what the package requires.


## 0.1.2 — 2026-07-07

- Maintenance only (2 internal commits).

## 0.1.1 — 2026-07-07

### Fixed

- **google:** target @googlemaps/js-api-loader v2 functional API (setOptions + importLibrary)

## 0.1.0 — 2026-07-07

### Added

- fancy-map 0.1.0 — engine-agnostic Map (OSM/Leaflet + Google), live tracking, Human+ ready
