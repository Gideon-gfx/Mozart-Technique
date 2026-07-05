How to add local course images

Place images used by courses into this folder and reference them from the `courseData` objects in `courses.html`.

Naming convention
- Use filenames that are descriptive and lowercase, e.g. `piano-beginner.jpg`, `vocals-intermediate.webp`.

Example
- Add `assets/images/piano-beginner.jpg`
- In `courses.html`, set the `image` field for the course to `"assets/images/piano-beginner.jpg"`.

Optional: provide `srcset` for responsive images
- For example: `srcset: "assets/images/piano-beginner-400.jpg 400w, assets/images/piano-beginner-800.jpg 800w"`
- Then the page will include that `srcset` so the browser can pick the best image.

Best practices
- Use modern formats (`webp`) when possible for better compression.
- Keep images under ~200 KB for faster page loads; use compression tooling.
- Prefer `400-1200px` widths depending on device; provide multiple sizes via `srcset` if you need responsive density control.

If you'd like, I can:
- scan `courseData` and auto-copy remote placeholder images into `assets/images/` and update the data to point at local files, or
- add a small Node script to batch-download and resize images for you.
