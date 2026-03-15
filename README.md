# Shot Planner

A browser-based 3D previsualization tool for blocking out film and animation scenes. Built with vanilla JavaScript and Three.js.

Designed to mirror real production workflows used at studios like DreamWorks, Pixar, and ILM — where layout artists use tools like Maya and Blender to block shots before animation begins.

## Features

### Scene editing
- **Top-down 2D editor** with grid, snap-to-grid, and pan support
- **Live 3D camera preview** — synchronized in real time with the top-down view
- Place **actors**, **props**, **cameras**, **lights**, **walls**, and **movement paths**
- Drag to move, scroll to rotate cameras, Shift+scroll to rotate actor facing direction

### Cameras
- **8 shot type presets** — Extreme Wide, Wide, Medium, Close-Up, Extreme CU, Low Angle, High Angle, Bird's Eye
- **6 lens presets** — 14mm through 135mm with accurate FOV values
- Adjustable **camera height** (0.1m–8m) and **tilt** (−85° to +85°)
- **Multiple cameras** with a shot bar for switching between them
- **Camera frustum** visualized in the top-down view

### Cinematography tools
- **Rule of thirds** overlay
- **Action safe / title safe** zone guides
- **Aspect ratio presets** — 2.39:1 Scope, 16:9, 1.85:1 Flat, 4:3, 1:1
- **Export camera preview as PNG**

### Lighting
- **Time of day slider** — 8 stops from Night through Dawn, Sunrise, Morning, Afternoon, Golden Hour, Sunset, Dusk
- Sky color, sun angle, and ambient light all update in real time
- Place **key, fill, rim, and point lights** with color, intensity, and height controls

### Characters & props
- **Character height presets** — Toddler (0.8m) through Giant (2.4m)
- **Prop size presets** — Small through Building (10m)
- **Facing direction** — rotate actors to show who they're looking at
- **Custom colors** for actors and props, reflected in 3D

### Walls & paths
- Draw **walls** with configurable thickness, height, and color
- Draw **movement paths** with directional arrows showing blocking

### Workflow
- **Undo / redo** — full history up to 80 steps
- **Duplicate** any object or multi-selection
- **Multi-select** with Shift+click
- **Snap to grid** toggle
- **Export / import scene as JSON** — full round-trip
- **Scene notes** per object

## Keyboard shortcuts

| Action | Shortcut |
|--------|----------|
| Undo / Redo | `⌘Z` / `⌘⇧Z` |
| Duplicate | `⌘D` |
| Delete | `Del` |
| Multi-select | `Shift+click` |
| Place actor | `A` |
| Place camera | `C` |
| Place light | `L` |
| Select mode | `S` / `Esc` |
| Snap to grid | `G` |
| Rule of thirds | `T` |
| Safe zones | `Z` |
| Rotate camera | `Scroll` |
| Rotate actor facing | `Shift+Scroll` |
| Export PNG | `⌘P` |
| Finish path / wall | `Dbl-click` / `Esc` |
| Shortcuts panel | `?` |

## Running locally

No build step needed — it's plain HTML, CSS, and JavaScript.

```bash
git clone https://github.com/richards020/Shot-Planner.git
cd shot-planner

# Open directly in browser (macOS)
open index.html

# Or use a local server to avoid CORS issues
npx serve .
# then open http://localhost:3000
```

## Tech stack

- **Three.js r128** — 3D scene rendering, lighting, shadows
- **Canvas 2D API** — top-down editor and overlay system
- **Vanilla JS / HTML / CSS** — no framework or build tools
- **Google Fonts** — DM Sans + DM Mono

## Project background

Built as a portfolio project to demonstrate understanding of 3D graphics concepts, camera systems, and production tool design — concepts used daily in production software roles at animation studios.

The tool mirrors concepts from real previsualization workflows: scene hierarchy, camera frustums, lens FOV, the 180° rule, eyeline matching, time-of-day lighting, and aspect ratio cropping.

## License

© 2026 Richard Leonardo Saucedo. All rights reserved.

This project and its source code are the exclusive intellectual property of Richard Leonardo Saucedo. No part of this project may be copied, modified, distributed, reproduced, or used for personal, professional, commercial, or business purposes without the written permission of the author.

Viewing this repository for reference or inspiration is permitted, but direct use, redistribution, or derivative works are strictly prohibited without prior written consent.

For licensing inquiries contact: richardsaucedo2007@gmail.com
