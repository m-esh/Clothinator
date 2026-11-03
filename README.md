# Clad

Open it in the morning, tap **Fancy**, **Casual** or **Comfy**, and get one
outfit that suits today's weather, isn't a repeat of last week, and doesn't
make any of the classic mistakes. Tap **Wear this** and you're done.

Built for one person and one iPhone. Free, no account, and nothing leaves the
phone. See [SPEC.md](SPEC.md) for the decisions behind it.

## Put it on your iPhone

1. On GitHub: **Settings → Pages → Build and deployment → Deploy from a
   branch**, then pick this branch and `/ (root)`. Save.
2. After a minute, open `https://m-esh.github.io/Clothinator/` in **Safari** (or `/Clad/` if the repo is renamed to Clad).
3. Share → **Add to Home Screen**. Open it from the home screen from now on.
4. Allow location when asked (used only for the weather).

## Adding clothes

Closet → **Add** → lay one piece flat on the floor and take a photo.

- The background is cut away **on the phone** (RMBG-1.4 model). Without the
  model, for example offline the first time, a simpler built-in cutter
  handles plain floors.
- The colours are read from the photo. An on-phone CLIP model guesses the
  type, pattern and fabric. You confirm or correct with a tap.
- The first photo downloads the two models (about 135 MB, once, use Wi-Fi).
  After that it all works offline. You can also download them up front in
  Settings.

Every number (dressiness, warmth, comfort, rain) starts from a built-in
garment knowledge base, and **Fine-tune** lets you override it per item.

## How it picks

1. **Hard rules** veto real mistakes: shorts with a sweater, shorts or
   sandals in the cold, a suit jacket over joggers, two busy prints, a puffer
   in summer, any pair you've marked "never together".
2. **Soft rules** score the rest:
   - colour harmony: neutrals plus at most one accent family, analogous and
     complementary pairs, no more than one loud piece
   - formality: the pieces should match each other and the mode
   - warmth against the 9–5 temperature range, with a jacket you can take off
     when mornings are cold and afternoons warm
   - rain and wind
   - comfort, in Comfy mode
3. **What shows**: under a closed sweater or hoodie, a collarless shirt is
   hidden, so its dressiness, colour and pattern don't count; a collar (or
   turtleneck) shows at the neck and does count; under an open cardigan or
   vest the whole shirt shows. Polos never go under sweaters, hoodies or
   cardigans. Undershirts are only suggested under a closed layer, and a
   sweater on its own comes with "wear a T-shirt or undershirt under it".
4. **Your taste**: a small model on the phone learns from every wear, skip,
   swap and save.
5. **Variety**: the same visible top + bottom is held back for about two
   weeks, and single pieces rest for most of a working week. Shoes and jackets are
   allowed to repeat.

Each suggestion lists its reasons, and warnings show in red. Tap any piece to
swap it.

## Laundry and wear counts

Wearing an outfit adds one to each piece's total wears and wears-since-wash.
Nothing is marked dirty automatically. In **Laundry** you send things to the
wash and press **Laundry done** to bring them all back. Pieces in the wash
are never suggested.

## Outfits, counts and the leaderboard

- **Outfits** sit in Fancy, Casual and Comfy tabs (one at a time, with
  counts): the mood you saved them under, or how dressy the pieces are.
  Newest first; no ranking, and no "too dressy / too casual" warnings there
  (the tab says it). The last tab you looked at is remembered.
- **Wear counts** can be corrected by hand: tap the stats on an item's page
  to set times worn, wears since washing and the last-worn date.
- **Laundry** actions (wash, clean, laundry done) all have Undo, which puts
  the since-wash count back too.
- **Leaders** (the last tab) is just for fun: most worn clothes and outfits,
  your mood split, streaks, fun facts and what's gathering dust.
- **Hair** (Settings, off by default): keep a list of hairstyles tagged with
  the moods they suit; Today suggests one with the outfit, prefers styles
  that hold up in wind and rain, avoids repeating yesterday's, and logs it.

## Your valet

Clad has someone behind it. Pick one in **Settings → Your valet** (or turn
it off): **Barnaby** the fox (default), **Humphrey** the bulldog,
**Reginald** the corgi or **Ashworth**, a gentleman's gentleman. Each has
its own voice and says a line or two on Today: a greeting with the weather,
then what kind of day it is, why it picked the outfit, or a sign-off once
you've worn it. They also appear in the launch intro, at the weekend and on
an empty closet. Portraits are in `src/mascot-art.js`, voices in
`src/ui/mascot.js`.

## Backups

Everything lives on the phone. Settings → **Save a backup** writes one file
(photos included) through the share sheet, so save it to iCloud Drive. Today
reminds you monthly. **Restore** checks the file before replacing anything.

## Development

No build step and no dependencies.

```bash
npm run serve   # http://localhost:8080
npm test        # engine, rules, rotation and image tests
```

```
src/core/      pure logic: catalog, colour, rules, generator, taste, weather, week
src/vision/    photo pipeline: pixels.js (pure), photo.js, ai.js (transformers.js)
src/data/      IndexedDB, in-memory store, backups, weather service
src/ui/        one module per screen
```

## Type and interface

The interface follows iOS conventions: Apple's system font (San Francisco),
large titles that collapse into a bar, grouped inset lists, switches, tinted
text buttons and a tab bar with icons. Unbounded (wide, round-ended, like the
C mark) is used only for the Clad wordmark; it ships in `assets/fonts` under
the SIL Open Font License.

## Icon and iOS 26

The mark is a bold C sitting on a hanger. The home-screen icon draws it as
polished metal on a black glass tile, with the glass edge and sheen built
into the image. A web app can only supply a flat icon (layered Liquid Glass
icons are a native-app feature), and iOS mostly just desaturates it in Tinted
mode, so the look has to be in the picture itself. Home-screen icons don't
update on their own: remove the app from the home screen and add it again to
get a new icon. Inside the app, Liquid
Glass is used only on the floating controls (tab bar, sheets, notices), and
turns solid when Reduce Transparency is on.

The app is dark only, in one of six colour schemes picked in Settings
(Graphite, Denim, Espresso, Forest, Plum, Oxblood). Each mode has its own colour that tints the screen once you pick it, including the
feels-like temperature chart for your hours. Items added without a photo are
drawn as a garment shape in their own colour and pattern.
