# Multi-Sprite Plan

**Status: NOT IMPLEMENTED** — The current codebase uses a single sprite (`spriteRef: RefObject<SpriteState>`). This doc outlines a future multi-sprite refactor.

## Phase 1 — Core Multi-Sprite

### Sprite State
- Each sprite has: `{ name, x, y, direction, size, visible, blocksXml }`
- One sprite is always "active" — the workspace shows its blocks
- Green flag runs all sprites' blocks concurrently

### UI Changes
- **Sprite list** — row of colored thumbnails below the stage (click to activate)
- **Active sprite** — highlighted border, name shown in toolbar
- **Canvas** — all sprites rendered, active sprite drawn on top
- **Workspace** — loads/saves the active sprite's blocks as XML

### Execution
- When green flag clicked, iterate all sprites
- For each sprite, inject its blocks into a **headless/off-screen workspace**, generate code, execute via `AsyncFunction`
- All sprites run concurrently (their async functions run in parallel)
- The `spriteRef` becomes `Map<string, SpriteState>` — all window functions (`__scratchMove`, etc.) operate on the **currently executing sprite's state**
- Canvas render loop draws all sprites from the map

### Heads-up workspace
- Create a second `Blockly.Workspace` in code (no DOM) — `new Blockly.Workspace()`
- On green flag: for each sprite, load its blocks from XML into a temporary workspace, generate JS, collect the code strings
- Execute all generated code strings concurrently

---

## Phase 2 — Interaction Blocks

### New blocks
- `touching [sprite name]?` — dropdown lists all sprite names
- `broadcast [message]` — fires a custom event
- `when I receive [message]` — hat block, triggers on broadcast

### Execution
- `broadcast` resolves after all `when I receive` handlers finish
- Shared event bus using a simple pub/sub pattern

---

## Phase 3 — Polish

- Delete / duplicate / rename sprites
- Add sprite from emoji picker
- Draggable sprites on stage (click + drag on canvas)
- Custom costume colors
