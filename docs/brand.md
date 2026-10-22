# Market Tracker brand assets (public/brand)

The Future Gadget Labs "FG Slab" mark with Market Tracker's band colour, indigo
`#4F46E5` (`#928CEF` on dark backgrounds: the kit's band mixed 38% toward white).
Per the brand kit, only the band colour changes between sites.

| File | Use |
|---|---|
| `fgmt-mark-dark.svg` / `-light.svg` | The mark, 48 px and up (dark = white slab, for dark backgrounds) |
| `fgmt-mark-32-dark.svg` / `-light.svg` | Under 48 px (the 32-grid version) |
| `public/favicon.svg` | Browser tab: dark mark, light mark on light browser chrome |
| `public/favicon-32.png` | PNG favicon fallback |
| `public/apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `fgmt-icon-navy-512.svg` | App icons (navy square) |
| `og-banner.png` / `.svg` | Link preview, 1200 × 630 |

In the app, use `src/brand/Mark.tsx` (it switches to the 32-grid version under 48 px).
The PNGs were rendered from the SVGs with resvg (DejaVu Sans for the banner text).
