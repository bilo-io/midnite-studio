# Gemini Image Generation Guide & Capabilities

This document outlines the image generation capabilities, parameters, constraints, and usage examples available in this environment.

---

## 1. Tool Specification: `generate_image`

The native image generation engine creates visual assets and UI designs directly into the session artifact storage, which can then be moved or referenced in the workspace.

### Parameters

| Parameter | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :--- | :--- | :--- |
| `Prompt` | String | **Yes** | Clear, detailed natural language description | The visual prompt or image-to-image edit instructions. |
| `ImageName` | String | **Yes** | Lowercase snake_case, max 3 words (e.g. `app_icon`) | Base filename identifier for the saved asset. |
| `AspectRatio` | String | No | `'1:1'`, `'16:9'`, `'9:16'`, `'4:3'`, `'3:4'`, `'3:2'`, `'2:3'` | Aspect ratio of output image. Defaults to `'1:1'`. |
| `ImagePaths` | Array | No | Up to 3 absolute file paths | Reference or base images for editing, variation, or composition. |

---

## 2. Supported Generation Categories

1. **UI/UX Mockups & Components**
   - Clean, borderless application interfaces (web dashboards, mobile views, modals, code viewers).
   - Generated as pure interface elements without artificial device bezels unless requested.

2. **Application Assets & Branding**
   - App icons, favicons, logos, empty-state illustrations, banner graphics, and feature badges.

3. **Game & 3D Environment Assets**
   - Isometric tiles, 2D sprites, textures, character concept art, and photorealistic 3D engine renders (Unreal Engine 5 / Octane / Blender).

4. **Cinematic & Photorealistic Imagery**
   - Hyperrealistic landscapes, architectural photography, editorial scenes, dramatic natural phenomena, and cinematic keyframes.

5. **Image-to-Image (Img2Img) Transformations**
   - Style transfers, daytime-to-night conversions, theme variants, color grading, and object additions/modifications using up to 3 local reference images via `ImagePaths`.

---

## 3. Capabilities & Limitations

### Capabilities
- **High Stylistic Range:** Supports diverse aesthetic styles (photorealism, Unreal Engine 5 cinematic, flat vector, pixel art, anime, cyberpunk, watercolor, minimal slate UI).
- **Multi-Image Referencing:** Combines or conditions generations on up to 3 existing images.
- **Workflow Integration:** Outputs high-resolution images that seamlessly integrate into the project filesystem or documentation artifacts.

### Limitations
- **Aspect Ratios:** Constrained to the standard predefined list (`1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3`). Arbitrary pixel dimensions cannot be supplied directly.
- **Static Assets Only:** Produces 2D raster images (JPEG/PNG). Does not generate video clips, animations (GIF), or 3D geometry meshes (`.obj`, `.gltf`).
- **Typography & Fine Text:** Small text strings, exact code snippets, or dense typography inside generated images may render with visual artifacts or spelling inconsistencies.
- **Reference Ceiling:** A maximum of 3 input images may be supplied in `ImagePaths`.
- **Content Safety:** Subject to safety and ethics filters regarding sensitive, harmful, or copyrighted materials.

---

## 4. Usage Examples (Commands & Arguments)

### Example 1: Dark Mode Dashboard UI
```json
{
  "ImageName": "dashboard_analytics_ui",
  "AspectRatio": "16:9",
  "Prompt": "Modern dark mode developer dashboard UI for Midnite Studio, displaying git branch graph, commit activity charts, terminal panel, sleek slate-gray accents, minimal border glow, crisp vector typography."
}
```

### Example 2: Vector App Icon
```json
{
  "ImageName": "studio_app_icon",
  "AspectRatio": "1:1",
  "Prompt": "Minimalist modern app icon for a developer git workstation called Midnite Studio. A stylized glowing geometric moon merging with git commit nodes, deep obsidian background, subtle neon purple and cyan gradient, rounded square icon format."
}
```

### Example 3: Isometric Game Environment
```json
{
  "ImageName": "cyberpunk_server_room",
  "AspectRatio": "4:3",
  "Prompt": "Isometric 3D diorama of an underground cyberpunk data center, neon glowing server racks, holographic terminals, ambient smoke, highly detailed Octane render."
}
```

### Example 4: Image-to-Image Variation (Night Mode Transformation)
```json
{
  "ImageName": "mountain_night_mode",
  "AspectRatio": "16:9",
  "ImagePaths": [
    "/Users/bilolwabona/Dev/midnite-studio/docs/examples/phoenix_table_mountain.jpg"
  ],
  "Prompt": "Transform the scene into deep midnight with a starry sky, bioluminescent aurora borealis above Table Mountain, and the phoenix glowing with cold blue electric fire."
}
```

---

## 5. Showcase: Phoenix Over Table Mountain

- **Output File:** [`phoenix_table_mountain.jpg`](./phoenix_table_mountain.jpg)
- **Aspect Ratio:** `16:9`
- **Prompt:**
  > *"A majestic fiery phoenix flying soaring over Table Mountain in Cape Town, South Africa. Hyperrealistic video game graphics, Unreal Engine 5 cinematic render, highly detailed glowing embers and fiery plumage, dramatic golden hour sunset, atmospheric volumetric fog over the city and Atlantic ocean."*
