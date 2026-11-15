Map radars, PNG 1024x1024: <slug>.png (slugs are listed in src/shared/constants/MapCatalog.js).
Most CS2 map radars are already included.

TWO-FLOOR maps (Nuke, Vertigo and Baggage) use two files:
  nuke.png         (upper floor)      nuke-lower.png      (lower floor)
  vertigo.png      vertigo-lower.png
  baggage.png      baggage-lower.png

Without an image, the app shows a generic board with the map name (and "Upper/Lower floor").
The same radar serves the tactical board and the demo viewer (smoke and fire also use the radar drawing as a ground mask).
Currently without a radar: agency, basalt, alpine, stronghold, warden, sanctum, brewery, safehouse, pool-day, canals.
