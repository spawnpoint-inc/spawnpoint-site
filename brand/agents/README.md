# Compatibility logo lockups

Local vector artwork retrieved 2026-10-25. These marks identify supported tools; ownership remains with their respective brands.

| File | Source |
| --- | --- |
| claude-lockup.svg | Complete inline `ClaudeWordmark` SVG (symbol and lettering) on https://claude.com/product/claude-code |
| cursor-lockup.svg | Official archive: https://ptht05hbb1ssoooe.public.blob.vercel-storage.com/assets/brand/cursor-brand-assets.zip , `General Logos/Lockup Horizontal/SVG/LOCKUP_HORIZONTAL_2D_DARK.svg` (https://cursor.com/brand) |
| copilot-lockup.svg | Official pack: https://brand.github.com/GitHub_Logos.zip , `GitHub Logos/SVG/GitHub_Copilot_Lockup_White.svg` (https://brand.github.com/foundations/logo) |
| codex-lockup.svg | Lobe Icons vector mark and vector wordmark: https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-svg/icons/codex.svg and https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-svg/icons/codex-text.svg |

Codex provenance: this is the Lobe Icons supplied combination, not a verified first-party OpenAI master download. It preserves the library's Codex Combine layout: icon 24 units, gap 4.8 units, text scale 0.8, vertically centered. References: https://github.com/lobehub/lobe-icons/blob/master/src/Codex/style.ts and https://github.com/lobehub/lobe-icons/blob/master/src/features/IconCombine/index.tsx . MIT notice is included. No website font substitutes or SVG text elements are used.

Claude's official lockup reads “Claude”; accessible text retains “Claude Code,” the supported product. GitHub Copilot uses the current official GitHub product lockup, not the deprecated mascot-only logo.

Path geometry and proportions are preserved. Claude and Codex currentColor fills resolve to #fafafa; Cursor and Copilot retain their supplied light fills. ViewBoxes fit the complete artwork bounds to normalize visible heights, and explicit source dimensions are removed for proportional CSS sizing. No external references, scripts, or runtime downloads.

Motion: 28 CSS px/second with artwork-width items and a consistent 80px gap (48px at <=680px), including the gap between repeating groups. Artwork is 36px high (32px mobile); edge masks are 48px (24px mobile); the viewport fills the existing section container. The group includes one trailing gap, and its measured width determines the loop duration. Decorative clones are hidden from assistive technology. No hover handlers. Offscreen/hidden pauses preserve time. Reduced motion and no JavaScript retain the static grid: two columns desktop, one column mobile.

Current balanced section layout: `--sp-section-padding-block` is 64px desktop / 48px at <=680px. `--sp-section-content-gap` is 40px / 32px. The heading and inline underlined “many more” link use regular 16px/24px body text. The former fixed-width logo slots are removed only from the moving layout; original vector proportions and normalized heights remain intact.

Shared color refinement: the landing page now uses the original SVGs as alpha masks, filled with `--sp-agent-logo-color: var(--foreground)` (white in the dark section). Original source fills remain intact in the files, but no longer determine the displayed carousel color. Transparent sizing images retain intrinsic proportions and accessible names.
