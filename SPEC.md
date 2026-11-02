# Clad — spec

A personal outfit picker for one person, one iPhone. Open it in the morning,
pick how you feel, get one outfit that suits the weather and looks right.

## Decisions

| Topic | Decision |
| --- | --- |
| Platform | Installable web app (PWA) for iPhone. One device. Works offline once loaded. |
| Cost | Zero. No accounts, no API keys, no paid services. |
| Data | Stays on the phone (IndexedDB). Backup file to iCloud Drive, monthly reminder. |
| Wardrobe size | ~30 items, built to be comfortable up to a few hundred. |
| Item categories | Tops, bottoms, one-pieces, outer layers, shoes, accessories. |
| Adding items | Photo of one item on the floor → on-device background removal → on-device AI suggests type, colours, pattern, fabric → short confirm form. |
| Outfits | Generated from items, plus outfits you save yourself. |
| "Looks good" | Rule layer built from styling basics (colour harmony, formality, weather, pattern, known mistakes) plus a small on-device model that learns your taste. |
| Modes | Fancy, Casual, Comfy — chosen each morning. |
| Fancy balance | Aim for 2–3 fancy weekdays. The app nudges, never forces. |
| Weather | Exact location, 9:00–17:00 window, temperature range, rain, wind. Open-Meteo (free, no key). |
| Variety | Avoid repeating the same top + bottom for about two weeks; vary without a fixed schedule. |
| Wear tracking | Per item: total wears, wears since last wash, last worn. Numbers only. |
| Laundry | Never automatic. You put things in the laundry and take them out. Laundry items are never suggested. |
| Your own outfits | Allowed even if they break a rule — the app warns, then trusts you. |
| Morning edits | Swap any single piece, add or remove layers and accessories. |
| Weekends | Quiet. A "Plan today" button if you want one. |
| Look | Minimal, paper-and-ink, not "AI app". |

## How an outfit is scored

1. **Hard rules (vetoes)** — things that are simply wrong: shorts with a
   sweater, shorts or sandals in the cold, two loud prints, a suit jacket over
   joggers, suede in the rain.
2. **Soft rules** — colour harmony (neutrals + at most one accent family,
   analogous/complementary pairs, no more than one loud colour), formality
   spread across pieces, closeness to the mode's target, warmth against the
   9–5 range (with a removable outer layer for cold mornings / warm
   afternoons), rain and wind protection, comfort for Comfy mode.
3. **Taste** — logistic regression trained on your choices: wearing an
   outfit, skipping it, swapping a piece, saving one.
4. **Variety** — penalty for a top + bottom combo worn in the last 14 days and
   for pieces worn in the last two days; the final pick is drawn from the best
   few, so mornings don't feel scripted.

Every suggestion shows short reasons ("navy + grey, easy neutrals", "jacket
off by the afternoon").

## Version 1 scope

- Closet: add / edit / delete items, photo pipeline, stats.
- Today: mode, weather, one outfit, wear / skip / swap / save, fancy nudge,
  weekend mode.
- Outfits: saved outfits, build your own with live warnings.
- Laundry: list, put in / take out, "laundry done".
- Settings: units, location, hours, never-pair rules, models, backup/restore.
