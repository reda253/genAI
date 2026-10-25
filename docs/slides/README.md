# Ledger Lens — visual slide deck

This folder is the visual version of [`docs/slides.md`](../slides.md). It is a
10-slide, 16:9 deck with speaker notes, source lines, and visible placeholders
for the P5, P2, P6, and P4 reviews.

## Files

| File | Purpose |
|---|---|
| `deck.html` | The deck source. Ten `<section class="slide">` blocks, one per slide. |
| `deck.css` | The “Ledger Lens Emerald” theme, layout, wireframes, and print rules. |
| `ledger-lens-deck.pdf` | Draft PDF exported from `deck.html` (10 pages, 1280×720 px / 960×540 pt). |
| `assets/` | Drop screenshots and logos here. The folder is empty until P2/P6 supply images. |
| `export.sh` | Re-export the PDF with headless Chrome. |

The Markdown outline remains the review document. This deck is the visual
skeleton; it is not the final export until the placeholders below are replaced.

## Preview

Open `deck.html` directly in Chrome:

```bash
xdg-open docs/slides/deck.html
```

Or serve it locally if the browser blocks local assets:

```bash
python3 -m http.server 8080 --directory docs/slides
# then open http://localhost:8080/deck.html
```

The screen view stacks all ten slides vertically. The print view is the real
16:9 deck. Use **Print → Save as PDF** with background graphics enabled, or run
the export script.

## Export the PDF

```bash
./docs/slides/export.sh
```

The script uses `google-chrome`, `chromium`, or `chromium-browser` (override
with `CHROME=/path/to/chrome`). It writes `docs/slides/ledger-lens-deck.pdf`.
The current draft has **10 pages** at **960×540 pt** (1280×720 px at 96 dpi).

Manual command:

```bash
google-chrome --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=1 --virtual-time-budget=15000 \
  --no-pdf-header-footer \
  --print-to-pdf=docs/slides/ledger-lens-deck.pdf \
  file://$PWD/docs/slides/deck.html
```

To render PNGs for review:

```bash
pdftoppm -png -r 144 docs/slides/ledger-lens-deck.pdf /tmp/ledger-lens-slide
```

## Speaker notes

Every slide has an `<aside class="notes">` block with the same notes as
`docs/slides.md`. The notes are hidden on screen and in the PDF. Read them in
the Markdown outline or in the HTML source. If a notes-only PDF is needed later,
add a print stylesheet that shows `.notes` and hides the slide body.

## Placeholders to replace before the final export

### Slide 4 — P5

Remove `[confirm P5]` from the critic-loop callout once P5 confirms the status.
If the critic loop is not live, change the callout to “planned” rather than
claiming it works.

### Slide 5 — P2

Replace the dashed box:

```html
<div class="screenshot-slot tall">
  [P2] Zetaris UI screenshot · four views · drop a 16:9 or wider image here
</div>
```

with:

```html
<img class="screenshot-image" src="assets/zetaris-views.png"
     alt="Zetaris UI showing the four Ledger Lens views" />
```

P2 should also confirm the source names (`ledger_lens_pg`, `fx_rest`), the
container (`ledger_lens`), the four view names, and the FX endpoint/licence
(CC0 1.0).

### Slide 6 — P4 / P5

Remove `[confirm P4]` from the World Model card once P4 confirms the entity
ingestion status. P5 should confirm the model lanes, Markovian, H-MEM, and the
critic-loop wording.

### Slide 7 — P6

Replace each `.wireframe` block with a screenshot. The slots are wide strips
(about 3.8:1), so either supply cropped 1920×500 images or keep
`object-position: top` to preserve the headline and first cards:

```html
<img class="screen-shot" src="assets/brief.png" alt="Brief screen" />
<img class="screen-shot" src="assets/leaks.png" alt="Leaks and evidence screen" />
<img class="screen-shot" src="assets/forecast.png" alt="Forecast screen" />
<img class="screen-shot" src="assets/why.png" alt="Why and timeline screen" />
```

Optional fifth image: the draft modal with “Never sent automatically”.

### Slide 8 — P1

Refresh the backend-test count at the freeze tag. The current number is
**128 passed** from `backend/npm test` (20 files). Update both the stat card and
the terminal block if the number changes.

### Slide 9 — P3 / P5

The claim “10 tests per engine” comes from the three engine smoke suites
(World Model, Markovian, H-MEM, 10 tests each). Remove or reword it if the
suites change.

### Slide 10 — P3

`data-v1 @ 93e3af3` is the frozen dataset tag. Update it only if the dataset is
retagged, which the current plan forbids.

## Design notes

- **Palette:** slate background, emerald primary, teal secondary, amber for
  risk, violet for memory/deep-lane accents.
- **Type:** Space Grotesk for headings, Inter for body, JetBrains Mono for
  numbers, paths, and labels. The CSS imports them from Google Fonts; offline
  previews fall back to Liberation Sans / DejaVu Sans Mono. The exported PDF
  embeds the fonts, so it does not need a network connection.
- **Numbers:** every amount and count on the slides is checked against
  `data/answer_key.json`, `data/out/summary.json`, or the commands shown on
  slide 8.
- **No live claims:** the deck uses placeholders for P5/P2/P6/P4-owned work and
  does not claim unmerged features are live.
