# NexusAI interface redesign

## Audit

The application is Next.js 14 / React / TypeScript with Tailwind, Lucide icons, shared cards, buttons, badges, and modal components. Chat and Google connections use the live API. Tasks, memory, activity, approvals, insights, and settings currently use preview data.

The previous interface had competing colored panels, undersized metadata, dense technical copy, a permanently open chat context panel, a hardcoded operator identity, and a desktop sidebar compressed onto phones. The command palette lacked arrow-key selection and dialog focus handling.

## Design

- 60% charcoal canvas (#1f1f1f), 30% graphite surfaces (#171717, #262626, #303030), 10% blue emphasis (soft blue primary controls and #8ab6ff icon accents). This is a hierarchy guideline rather than an exact per-screen pixel quota.
- Neutral surfaces with restrained blue emphasis. Status is communicated with labels and icon shapes.
- Cards have subtle blue-tinted radial and graphite linear gradients. Hover-capable devices get a 2px lift and a gentle border highlight over 180ms; reduced motion disables the movement.
- Four-pixel spacing scale; 248px desktop navigation, compact tablet rail, separate phone bottom navigation and menu sheet.
- SF Pro via the native Apple system font stack. Apple’s fonts are not bundled. Windows uses Segoe UI.
- Content width: 760px for conversation reading, 1160px for workspace pages.
- Motion for page entrance, logo entrance, and menu movement. Short CSS transitions for controls. LottieFiles runtime for an original connection confirmation.
- Reduced-motion preference disables decorative movement and replaces the Lottie with a static check icon.
- Locally hosted logo, animation composition, and Lottie WASM runtime; no external animation requests required.

## Brand asset

Generated with the built-in image generation tool, transparent background enabled.

Final prompt: Create a premium app logo mark for NexusAI, an intelligent personal workspace. A single original geometric N formed from two smoothly interconnected folded ribbons, balanced symmetrical compact silhouette, elegant rounded ends, minimal Apple-like industrial precision. Strict grayscale: pearl white and soft silver with a restrained graphite inner edge. Flat front-facing logo with only subtle dimensional shading, no text, no letters beside the mark, no background tile, no shadows outside the shape, no glow, no colors, no mockup. Large centered mark filling 80 percent of square canvas, legible at 24 pixels. Genuine transparent alpha background. Brand identity logo asset.

Asset: apps/web/public/brand/nexus-mark.png. Next Image serves appropriate small sizes.

## References

- [Apple fonts](https://developer.apple.com/fonts/)
- [Apple guidance on system fonts](https://developer.apple.com/documentation/technologyoverviews/fonts)
- [Motion React](https://motion.dev/docs/react)
- [LottieFiles React runtime](https://docs.lottiefiles.com/en/runtimes/distributions/react/v0.x)
- [21st.dev](https://21st.dev/) and [Agent Elements tool-card patterns](https://21st.dev/@21st/components/search-tool/alt-source-set), consulted for component patterns; implementation is custom to this application.

The request named 24.dev; searches found no matching UI registry. 21st.dev was the relevant resource.

## Verification

- Production Next.js build passed, including TypeScript validation; final web container rebuilt and running at localhost:3000.
- Inspected workspace, connections, tasks, memory, activity, approvals, insights, and settings in the browser.
- Checked workspace widths 360, 390, 480, 768, 1024, 1280, and 1440px. Page width matched viewport and the composer stayed within bounds.
- Inspected narrow-phone task and permissions dialogs; verified focus wrapping and Escape restoration.
- Verified command search with keyboard navigation and Enter.
- Verified generated logo loading and Lottie confirmation rendering after bundling public assets.
- Sent a harmless welcome prompt through the live Gemini streaming endpoint; response completed successfully.
- Final browser pass reported no new console errors or warnings.
- Desktop and mobile previews: docs/screenshots/workspace-desktop.jpg and docs/screenshots/workspace-mobile.jpg.

Limits: preview features still use sample data, and reduced-motion handling was verified in the implementation rather than by changing the operating-system preference.
