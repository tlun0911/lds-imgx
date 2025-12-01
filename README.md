# lds-imgx

A fast, Sharp-powered CLI tool for resizing and converting images with support
for modern formats (WebP, AVIF, JPEG) and responsive image generation.

## Features

- 🚀 **Fast processing** with Sharp (libvips) backend
- 📱 **Responsive images** with multiple sizes
- 🎨 **Modern formats** - WebP, AVIF, JPEG support
- ⚡ **Smart caching** - skip unchanged files
- 🔧 **Configurable** - JSON/MJS config files
- 🖥️ **Auto-concurrency** - respects CPU cores
- 📊 **Progress tracking** with detailed output
- 🎯 **Flexible patterns** - custom glob patterns
- 📋 **Manifest generation** - JSON manifest for web integration
- 📦 **File array processing** - process arrays of files/buffers programmatically

## Installation

```bash
npm install -g lds-imgx
```

## Quick Start

```bash
# Basic usage - convert images to WebP
imgx input/ output/

# With config file - just run and it uses imgx.config.json
imgx input/ output/

# Multiple sizes and formats
imgx input/ output/ --sizes 640,1000,1600,2000 --formats webp,avif
```

## Usage

```bash
imgx [options] <input> <output>
```

### Arguments

- `<input>` - Input directory containing images
- `<output>` - Output directory for processed images

### Options

| Option                         | Description                                         | Default                        |
| ------------------------------ | --------------------------------------------------- | ------------------------------ |
| `-w, --width <number>`         | Max width in pixels                                 | `1000`                         |
| `--height <number>`            | Max height in pixels                                | -                              |
| `--sizes <sizes>`              | Comma-separated widths (e.g., `640,1000,1600,2000`) | -                              |
| `-f, --formats <items>`        | Comma-separated formats: `webp`, `avif`, `jpeg`     | `webp`                         |
| `--suffix <pattern>`           | Filename suffix pattern (e.g., `{w}w`)              | `{w}w`                         |
| `--quality <number>`           | Quality (0-100)                                     | `78`                           |
| `-e, --effort <number>`        | Encoder effort (0-6)                                | `6`                            |
| `-c, --concurrency <number>`   | Parallel workers (default: CPU cores)               | Auto                           |
| `--sharp-cache-files <number>` | Sharp cache files limit (use `false` to disable)    | `100`                          |
| `-p, --pattern <glob...>`      | Glob patterns for input files                       | `**/*.{jpg,jpeg,JPG,JPEG,png}` |
| `--no-strip-metadata`          | Keep metadata instead of stripping                  | Strip                          |
| `--no-enlarge`                 | Allow upscaling (default prevents it)               | Prevent                        |
| `-v, --verbose`                | Show detailed progress for each file                | `false`                        |
| `-q, --quiet`                  | Suppress all output except errors                   | `false`                        |
| `--force`                      | Rebuild all images regardless of cache              | `false`                        |
| `--dry-run`                    | Do not write files                                  | `false`                        |
| `--config <path>`              | Path to config file                                 | Auto-detect                    |

## Configuration Files

Create `imgx.config.json` or `imgx.config.mjs` in your project root:

### JSON Config (`imgx.config.json`)

```json
{
  "sizes": [640, 1000, 1600, 2000],
  "formats": ["webp", "avif"],
  "quality": 78,
  "effort": 6,
  "pattern": ["**/*.{jpg,jpeg,png}"],
  "stripMetadata": true,
  "concurrency": 4,
  "sharpCacheFiles": 200
}
```

### ES Module Config (`imgx.config.mjs`)

```javascript
export default {
  sizes: [640, 1000, 1600, 2000],
  formats: ["webp", "avif"],
  quality: 78,
  effort: 6,
  pattern: ["**/*.{jpg,jpeg,png}"],
  stripMetadata: true,
  concurrency: 4,
  sharpCacheFiles: 200,
};
```

### Config Options

All CLI options are supported in config files except `input` and `output` (which
are required as arguments).

## Examples

### Basic Image Conversion

```bash
# Convert all images to WebP
imgx photos/ webp-output/

# Convert to multiple formats
imgx photos/ output/ --formats webp,avif,jpeg
```

### Responsive Images

```bash
# Generate multiple sizes
imgx photos/ responsive/ --sizes 640,1000,1600,2000

# With custom suffix
imgx photos/ responsive/ --sizes 640,1000,1600,2000 --suffix "{w}px"
```

### Quality and Performance Tuning

```bash
# High quality WebP
imgx photos/ output/ --quality 90 --effort 6

# Fast processing with lower quality
imgx photos/ output/ --quality 60 --effort 2

# Custom concurrency
imgx photos/ output/ --concurrency 8

# Disable Sharp cache
imgx photos/ output/ --sharp-cache-files false
```

### File Patterns

```bash
# Only process specific files
imgx photos/ output/ --pattern "**/*.jpg" "**/*.png"

# Exclude certain files
imgx photos/ output/ --pattern "**/*.{jpg,jpeg}" --pattern "!**/thumbnails/**"
```

### Verbose Output

```bash
# See detailed processing info
imgx photos/ output/ --verbose

# Quiet mode (errors only)
imgx photos/ output/ --quiet
```

### Cache Management

```bash
# Force rebuild all images
imgx photos/ output/ --force

# Dry run to see what would be processed
imgx photos/ output/ --dry-run
```

## Output Structure

### File Naming

Images are named with the pattern: `{basename}-{suffix}.{format}`

Example: `photo-1000w.webp`, `photo-640w.avif`

### Manifest File

A `imgx-manifest.json` file is generated in the output directory:

```json
{
  "photo.jpg": [
    {
      "src": "photo-640w.webp",
      "width": 640,
      "height": 480,
      "format": "webp",
      "bytes": 45678,
      "originalFile": "photo.jpg"
    },
    {
      "src": "photo-1000w.webp",
      "width": 1000,
      "height": 750,
      "format": "webp",
      "bytes": 78901,
      "originalFile": "photo.jpg"
    }
  ]
}
```

### Cache File

A `.imgx-cache.json` file tracks processed images to avoid reprocessing
unchanged files.

## Performance Features

### Automatic Concurrency

- Uses `os.cpus().length` by default
- Respects machine capabilities
- Override with `--concurrency`

### Sharp Optimization

- Configurable file cache (`--sharp-cache-files`)
- Disable cache with `--sharp-cache-files false`
- Automatic concurrency tuning

### Smart Caching

- Skips unchanged files
- Tracks settings changes
- Force rebuild with `--force`

## Web Integration

### HTML Picture Element

Use the manifest to generate responsive `<picture>` elements:

```javascript
import { generatePicture } from "lds-imgx";

const manifest = JSON.parse(fs.readFileSync("imgx-manifest.json"));
const picture = generatePicture(manifest["photo.jpg"], "Alt text");
```

### Srcset Generation

```javascript
import { generateSrcset } from "lds-imgx";

const srcset = generateSrcset(manifest["photo.jpg"], "webp");
// "photo-640w.webp 640w, photo-1000w.webp 1000w"
```

## API Usage

### Directory-based Processing

```javascript
import { imgx } from "lds-imgx";

const result = await imgx({
  input: "./photos",
  output: "./processed",
  sizes: [640, 1000, 1600],
  formats: ["webp", "avif"],
  quality: 80,
  effort: 6,
});

console.log(`Processed ${result.processed} files`);
console.log(`Skipped ${result.cached.length} cached files`);
```

### File Array Processing

Process an array of files (paths or buffers) and get back transformed images with buffers and paths:

```javascript
import { imgxFromFiles } from "lds-imgx";
import fs from "node:fs/promises";

// Process file paths
const result = await imgxFromFiles({
  files: [
    "/path/to/image1.jpg",
    "/path/to/image2.png",
  ],
  output: "./processed",
  sizes: [640, 1000, 1600],
  formats: ["webp", "avif"],
  quality: 80,
  returnBuffers: true,
  writeToDisk: true,
});

// Access processed files
result.processedFiles.forEach((file) => {
  console.log(`Original: ${file.originalIdentifier}`);
  file.outputs.forEach((output) => {
    console.log(`  ${output.format} ${output.width}x${output.height} - ${output.bytes} bytes`);
    // Use output.buffer for in-memory operations
    // Use output.path for file path
  });
});

// Process from buffers (e.g., from file uploads)
const imageBuffer = await fs.readFile("/path/to/image.jpg");
const result2 = await imgxFromFiles({
  files: [imageBuffer],
  output: "./processed",
  sizes: [640, 1000],
  formats: ["webp"],
  returnBuffers: true,
  writeToDisk: true,
});

// Use buffers directly (e.g., upload to S3)
result2.processedFiles[0].outputs.forEach((output) => {
  // output.buffer contains the processed image
  // output.path contains the file path if writeToDisk is true
});
```

## Requirements

- Node.js 18.0.0 or higher
- Supported formats: JPEG, PNG, WebP, AVIF, TIFF, GIF

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Changelog

### 0.1.0

- Initial release
- WebP, AVIF, JPEG support
- Responsive image generation
- Config file support
- Smart caching
- Progress tracking
- Manifest generation
