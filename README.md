# RandomPic Generator

A powerful static random image API generator built with Bun.

## Features

- **Static Generation**: Converts images to efficient WebP format.
- **Client-Side API**: specialized `random.js` for easy integration.
- **Gallery**: Automatically generates a beautiful masonry layout gallery.
- **Demo Page**: Includes a ready-to-test `index.html`.
- **Shuffle**: Randomizes image order during build for true randomness on static hosts.
- **0-Based Indexing**: Files are named `0.webp`, `1.webp`, etc.

## Usage

1. **Install Dependencies**:
   ```bash
   bun install
   ```

2. **Prepare Images**:
   - Place horizontal images in `pics/h`
   - Place vertical images in `pics/v`

3. **Build**:
   ```bash
   bun run build
   ```
   *Optional: Set a domain prefix for CDNs*
   ```bash
   DOMAIN="https://my-cdn.com" bun run build
   ```

## Output (`dest/`)

The build command generates a complete static site in `dest/`:

- `h/`, `v/`: Processed WebP images.
- `random.js`: The client-side logic library.
- `manifest.json`: JSON data with image counts.
- `gallery.html`: A visual gallery of all images.
- `index.html`: A demo page showing usage.

## Integration Guide

### 1. Simple Drop-in (`random.js`)

Include the generated script on any page (must be hosted relative to the API or configured with DOMAIN):

```html
<script src="https://your-api.com/random.js"></script>
```

This script automatically:
- Sets a random source for images with `alt="random:h"` or `alt="random:v"`.
- Sets a random background for `#bg-box` or elements with `data-random-bg="h/v"`.
- Exposes `window.getRandomPicH()` and `window.getRandomPicV()`.

### 2. Manual API Usage

Fetch `manifest.json` to get the counts, then generate URLs randomly (0 to count-1).

```javascript
const manifest = await fetch('manifest.json').then(r => r.json());
const count = manifest.h;
const randomId = Math.floor(Math.random() * count);
const imageUrl = `h/${randomId}.webp`;
```
