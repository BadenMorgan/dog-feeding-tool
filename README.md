# Dog Feeding Tool

A simple feeding tool to determine how much food to give your dog.

Live site: https://badenmorgan.github.io/dog-feeding-tool/

## Structure

```
index.html                    page markup
assets/css/styles.css         theme tokens and layout
assets/js/main.js             theme toggle + calculator wiring
assets/logo.png               brand mark used in the header
assets/favicon-*.png          browser tab icons (48/192/512)
assets/apple-touch-icon.png   home screen icon for iOS/Android
.nojekyll                     serve files as-is, no Jekyll processing
.github/workflows/deploy.yml  publishes the repo root to Pages on push to main
```

No build step and no dependencies — plain HTML, CSS and JavaScript.

## Data

Both feeding tables are transcribed from Royal Canin Dachshund packaging and
live in `CHARTS` in `assets/js/main.js`. The two bags differ, so each stage
carries its own conversions:

| | Puppy | Adult |
|---|---|---|
| Chart axes | expected adult weight (3/6/10 kg) × age (2–10 months) | current weight (2/5/8/10 kg) × activity |
| Cup (240 ml) | 86 g | 77 g |
| Energy | 3887 kcal/kg | 3726 kcal/kg |
| Meals per day | 3 up to 5 months, then 2 | 2 |

Values between the printed columns are linearly interpolated; weights outside
the printed range are clamped and flagged in the UI. The adult chart also has a
reduced-kibble column for feeding alongside a wet pouch.

## Local preview

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deployment

Pages is configured with **Settings → Pages → Source: GitHub Actions**. Every
push to `main` uploads the repo root and deploys it.
