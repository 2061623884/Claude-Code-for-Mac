# Classic thinking Spark

Source supplied by the user:
https://github.com/user-attachments/assets/93e0bbd8-ed9e-4ccc-b0fb-e09a2c989511

Published in https://github.com/anthropics/claude-code/issues/99139 as a rendering
of the Claude Desktop `thinking` sprite. The artwork is associated with Anthropic;
this repository does not claim authorship or an official affiliation.

`reference.gif` is the unchanged downloaded reference. `frame-01.png` through
`frame-09.png` are its nine composited frames, extracted without resizing:

    ffmpeg -i reference.gif -vsync 0 frame-%02d.png

The reference is 120 × 120 pixels, 90 ms per frame, 810 ms per loop. The SVG
component uses these exact frames, not invented vector rays. Its alpha mask
removes the white background using the blue channel (solid source RGB is
217, 118, 86), then applies the application's flat accent color. GIF palette
quantization is retained; these are raster frames inside SVG, not original
vector paths. The expanded fifth frame is used when animation is disabled.
