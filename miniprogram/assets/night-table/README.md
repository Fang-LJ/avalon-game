# Formal game scenery

`castle.jpg` is a local 810 × 1440 JPEG (quality 78), edited with the built-in imagegen tool from the previous version of this asset. No server upload is required. The scene intentionally contains no compass or UI.

Final image-edit prompt:

> Edit this existing portrait game background, preserving the exact overall composition, aspect ratio, dark ink-green and gold palette and upper third golden moon, gothic castle, night sky, mountains and subdued clouds. Simplify the middle and lower two thirds for legible game UI overlays: remove all large bridges, lower buildings, busy villages and bright reflections. Replace these with quiet dark forest silhouettes and a little soft mist, low detail and low contrast, only a few very dim warm distant lights. Around center make dark open mist without dense sharp trees. Bottom should be a calm dark forest backdrop, not black empty space. Upper castle and moon should remain recognizable and nearly unchanged. No compass, no gold decoration, no text, no avatars, no UI. High quality atmospheric painting; refine this image, do not redesign.

`compass.svg` is an independent vector layer. Its center remains (320, 320), outer ring radius 300, viewBox 640 × 640. The existing room WXML scales it by `2 * circularLayout.radius * 640 / 600` and positions it at `circularLayout.centerTop`. Do not change these constants to adjust brightness. Ring opacity and stroke width can be tuned independently from the low-opacity center rose, keeping text legible without moving seats.
