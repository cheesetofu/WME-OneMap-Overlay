# WME OneMap Overlay

A userscript that shows Singapore's **OneMap** basemap (from the Singapore Land Authority) as a reference layer in the Waze Map Editor (WME). Use it to check road geometry, street names and building outlines against Singapore's official map while you edit.

It uses OneMap's **Default HD** style. The HD tiles are drawn at the normal on-screen size, so they look sharp on high-resolution screens without shrinking the labels.

This is not an official Waze or OneMap tool, and it comes as-is.

## Install

> **Install from Greasy Fork:** [https://greasyfork.org/en/scripts/579472-wme-nlsc-overlay](https://greasyfork.org/en/scripts/606443-wme-onemap-overlay)]
> 
You need a userscript manager first — Tampermonkey (Chrome / Edge / Firefox), Violentmonkey, or Greasemonkey (Firefox). Once installed, open the Greasy Fork link and click Install this script; updates are delivered automatically on your userscript manager's check schedule.

## Usage

1. Open [waze.com/editor](https://www.waze.com/editor) and go to Singapore.
2. Turn the layer on in either place (they stay in sync):
   - the **Layers** menu on the map: tick **OneMap (Default HD)**
   - the **Scripts** tab in the left sidebar: open **OneMap** and switch on **Show OneMap**
3. Zoom in to zoom 11 or closer. OneMap has no tiles further out.

## Features

- **One layer, no setup.** OneMap Default HD, ready to switch on.
- **Opacity slider.**
- **Sensible stacking.** The map sits above satellite imagery and below your roads and places. A switch moves it above them instead.
- **Lines-only colour.** OneMap tiles are solid maps, so a plain colour tint would turn the layer into one block of colour. Lines-only mode hides the map's background and recolours just the roads, outlines and labels, which works better for tracing over satellite.
- **Shows at every zoom.** Zoom 11 to 19 uses OneMap's own tiles. Past zoom 19 it stretches the zoom-19 tiles, so the layer doesn't vanish when you zoom right in.
- **No wasted requests.** It doesn't ask for tiles outside Singapore or below zoom 11.
- **Remembers your settings** (show/hide, opacity, colour, stacking) in your browser's `localStorage`.
- **Attribution shown on the map** whenever the layer is on, as the OneMap licence requires.

## What it connects to

Map tiles from `www.onemap.gov.sg` are the only thing the script loads.

- It only uses the browser's normal image loading to fetch tiles. There are no `fetch` or XHR calls, no analytics and no remote code.
- It runs with `@grant none`. It has no `@connect`, `@require` or update URL, so the userscript manager gives it no extra powers and never fetches code for it.
- It doesn't read your edits, account or cookies, and it never changes the map. The only thing it stores is its own settings.

As with any map tile service, OneMap sees your IP address and which tiles your browser loads.

## Data and licence

Map data © [OneMap](https://www.onemap.gov.sg/), Singapore Land Authority, made available under the [Singapore Open Data Licence](https://www.onemap.gov.sg/legal/opendatalicence.html).

Before using OneMap as a source for map edits, check what your local Waze community allows.

## Credits

This script is based on **[WME NLSC Overlay](https://github.com/lati0s/wme-nlsc-overlay)** by [lati0s](https://github.com/lati0s) and Waze Community Taiwan ([Greasy Fork](https://greasyfork.org/en/scripts/579472-wme-nlsc-overlay)). It does for Taiwan's NLSC maps what this one does for OneMap. The overall design follows theirs closely: the sidebar tab and controls, Layers menu sync, and how the overlay is placed between satellite imagery and the road layers. Several of those pieces were adapted from their code. Many thanks to them for working it out first and publishing it under MIT.

Portions adapted from WME NLSC Overlay, MIT License, Copyright (c) 2026 Waze Community Taiwan.

## License

[MIT](LICENSE)
