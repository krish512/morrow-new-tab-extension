# Morrow interface

## Direction
A quiet browser workspace for someone moving between tasks at their desk. Use the full window with measured margins, compact favourites, and a readable search field. Notes and chat stay in small on-demand panels. Visual character comes from the supplied curved card silhouette and careful type spacing.

## Palette and theme
Use the OKLCH variables in styles.css as the source of truth. Light mode uses near-white blue-grey neutrals with restrained indigo controls. Dusk uses a blue-grey background at OKLCH lightness 0.305, with lifted surfaces and pale text. Never substitute pure black. System follows the operating system preference.

## Layout
The shell spans the browser width with 24–88px side gutters. Greeting and local time occupy opposite sides. Search is limited to 780px for comfortable scanning. Favourites use compact tiles. The Notes and chat launchers sit at opposite ends of the footer and open shared, non-modal `morrow-panel` web components. Only one panel is visible at a time.

## Cards
The two objectBoundingBox paths from card.svg are embedded unchanged in newtab.html. Apply advaya-card-vector to favourite backgrounds and advaya-card-large-vector to the Notes panel. Keep favourite links and controls outside the clipped layer so focus outlines stay visible. Retain card.svg as the source asset.

## Type and interaction
Use the native system sans family. Quiet supporting labels, medium-size section titles, a 56px greeting on desktop, and a lightweight clock provide hierarchy. Controls have visible focus, conventional labels, native dialog behaviour, and restrained hover movement. Respect prefers-reduced-motion. Theme changes update colour immediately to avoid low-contrast transitional states.

## Local chat
The chat launcher appears only after an Ollama endpoint has been saved in Customize. Test probes model discovery and chat-route origin access. Available models populate a native select. Render model replies as plain text. Support streaming, Stop, new chat, connection failures, and focus return on Escape. Conversation history is held only in the current tab.
