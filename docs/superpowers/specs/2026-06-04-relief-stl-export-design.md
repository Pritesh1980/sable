# Relief STL Export Design

## Summary

Add a first 3D-printing feature to the AI Concepts workflow: generate a downloadable
relief-style STL from a saved concept/result image. The first version is browser-only,
deterministic, and local-first. It treats the selected image as a heightmap, converts
brightness into relief height, adds a printable base and side walls, then downloads an
STL file.

This is deliberately not a full 3D Lab yet. The goal is to prove that concept images can
be turned into useful printable relief objects without adding a backend, a model API, or
a new top-level app area.

## User Flow

1. User opens **AI**.
2. User creates or opens a saved concept.
3. User adds or views an AI result variant that has an image.
4. User clicks **Make STL** on that result image.
5. A focused drawer/modal opens with the selected image and print settings.
6. User adjusts dimensions and image treatment.
7. User clicks **Download STL**.
8. Browser generates and downloads an STL file.

## Placement

The feature belongs inside the existing AI Concepts result-variant workflow.

- Add a **Make STL** action to result variants that have an image.
- Open a focused drawer/modal rather than expanding inline controls.
- Do not add a separate route or top-level navigation item in v1.

This keeps the feature attached to the artwork it operates on while leaving room for a
future 3D Lab if relief, lithophane, and stencil workflows become substantial enough.

## V1 Scope

The first version supports:

- Relief STL generation from one image.
- Source images stored as data URLs or normal image URLs.
- Width in millimetres.
- Maximum relief height in millimetres.
- Base thickness in millimetres.
- Invert-height toggle.
- Detail preset controlling sampling density.
- Light smoothing preset.
- Downloading an STL file.

Default settings:

- Width: `80mm`
- Max relief height: `3mm`
- Base thickness: `1.2mm`
- Detail: `medium`
- Invert: off
- Smoothing: light

## Out Of Scope For V1

Do not build these in the first slice:

- Live 3D preview.
- AI monocular depth estimation.
- Lithophane mode.
- Stencil/logo extrusion mode.
- A separate 3D Lab page.
- Server-side generation.
- Slicer integration.
- Model repair beyond generating a watertight relief mesh.

## Architecture

### Pure Relief Logic

Create a pure module for image-to-mesh/STL logic. It should avoid React dependencies and
be testable with small synthetic pixel grids.

Responsibilities:

- Convert pixel brightness to height.
- Apply invert behavior.
- Apply detail/downsampling behavior.
- Build top surface triangles.
- Build bottom base triangles.
- Build side wall triangles.
- Serialize mesh data to STL.

The browser UI can handle real image loading/canvas extraction; the pure module should
accept normalized grayscale data so tests do not need real image fixtures.

### UI Drawer

Create a drawer/modal component launched from a result variant image.

Responsibilities:

- Show selected image thumbnail.
- Present print controls.
- Validate numeric input ranges.
- Call the pure relief exporter.
- Trigger the browser download.
- Show simple error text when image loading or export fails.

### Concepts Integration

Modify the result variant display so image-bearing variants expose **Make STL**. The
action passes the variant image URL/data URL and a concept-derived filename seed to the
drawer.

Legacy concepts without variants should not gain extra UI unless they have an image that
can be treated as a source. If supporting legacy top-level concept images is cheap and
clear, it may be included, but result variants are the primary target.

## Data Flow

1. Result variant provides `imageUrl`.
2. Drawer loads image into a canvas.
3. Canvas is resized/downsampled according to detail preset.
4. Canvas pixels are converted to grayscale height data.
5. Pure relief module creates mesh triangles.
6. STL serializer creates a downloadable Blob.
7. Browser downloads `tattoo-relief-<concept-or-result>.stl`.

Generated STL files are not stored in app state in v1. They are derived artifacts.

## Printability Rules

The generated mesh must be a solid relief object:

- Top surface follows image-derived heights.
- Bottom surface sits at `z = 0`.
- Base raises the minimum top surface above the bottom.
- Side walls close all four edges.
- Triangle winding should be consistent enough for slicers to interpret the mesh.
- Dimensions should be in millimetres by convention, while acknowledging STL itself has
  unitless coordinates.

The exporter should cap detail so the browser does not create excessive triangles from a
large image. Detail presets should target predictable mesh sizes rather than raw image
resolution.

## Error Handling

Handle these cases:

- Missing image: do not show **Make STL**.
- Image load failure: show an error in the drawer.
- Cross-origin image that cannot be read by canvas: show an error explaining that an
  uploaded image/data URL is needed.
- Invalid numeric settings: disable download and show concise field guidance.
- Excessive dimensions/detail: clamp to supported ranges rather than generating an
  impractical mesh.

## Testing

Use Vitest for pure logic first.

Test coverage should include:

- Bright pixels produce higher relief than dark pixels.
- Invert reverses the height mapping.
- Base thickness affects minimum printable thickness.
- Generated mesh includes top, bottom, and side-wall triangles.
- STL output includes expected solid name and facet records.
- Detail/downsampling changes mesh size predictably.
- Invalid settings are normalized or rejected consistently.

UI tests can cover:

- **Make STL** appears only for result variants with images.
- Drawer opens with default settings.
- Invalid fields disable download.

Browser verification after implementation:

- Start the app.
- Open AI Concepts.
- Add or use a concept result image.
- Open **Make STL**.
- Download an STL.
- Confirm a non-empty `.stl` file is produced.

## Documentation

Because this changes the Concepts UI, update:

- `docs/06-concepts.md`
- `src/pages/Help.jsx`

If screenshots are affected, refresh the relevant guide screenshot following
`docs/MAINTAINING.md`.

## Future Extensions

Once the relief exporter is working, the next likely additions are:

- Live Three.js preview.
- Lithophane mode.
- Stencil/logo extrusion from thresholded line art.
- AI depth-map bas-relief using a local or external depth model.
- Save generated STL metadata to the concept/result variant.
