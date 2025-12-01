import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { globby } from "globby";
import sharp from "sharp";
import pLimit from "p-limit";
// Simple progress tracking without external dependencies

export type ImgxConfig = {
  width?: number;
  height?: number;
  sizes?: number[];
  withoutEnlargement?: boolean;
  formats?: Array<"webp" | "avif" | "jpeg">;
  suffix?: string;
  quality?: number;
  effort?: number;
  concurrency?: number;
  sharpCacheFiles?: number | false;
  pattern?: string[];
  stripMetadata?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  force?: boolean;
  dryRun?: boolean;
};

export type ImgxOptions = {
  input: string;
  output: string;
  width?: number; // default 1000
  height?: number; // optional; used with fit:"inside"
  sizes?: number[]; // multiple widths for responsive images
  withoutEnlargement?: boolean; // default true
  formats?: Array<"webp" | "avif" | "jpeg">; // default ["webp"]
  suffix?: string; // filename suffix pattern (e.g., "{w}w")
  quality?: number; // default 78 (for webp/avif/jpeg)
  effort?: number; // default 6  (for webp/avif)
  concurrency?: number; // default os.cpus().length
  sharpCacheFiles?: number | false; // default 100
  pattern?: string[]; // globs; default **/*.{jpg,jpeg,JPG,JPEG,png}
  stripMetadata?: boolean; // default true
  verbose?: boolean; // default false
  quiet?: boolean; // default false
  force?: boolean; // default false
  dryRun?: boolean; // default false
};

export type ImageManifestEntry = {
  src: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
  originalFile: string;
};

export type ImageManifest = {
  [originalFile: string]: ImageManifestEntry[];
};

export type CacheEntry = {
  inputPath: string;
  inputMtime: number;
  settingsHash: string;
  outputFiles: string[];
  timestamp: number;
};

export type ImgxCache = {
  [inputPath: string]: CacheEntry;
};

export type ImgxResult = {
  processed: number;
  files: Array<{ in: string; out: string[] }>;
  skipped: Array<{ file: string; reason: string }>;
  cached: Array<{ file: string; reason: string }>;
  totalFound: number;
  manifest?: ImageManifest;
};

// Types for file array processing
export type ImgxFileInput = string | Buffer;

export type ProcessedOutput = {
  path: string;
  buffer: Buffer;
  width: number;
  height: number;
  format: string;
  bytes: number;
};

export type ProcessedFile = {
  originalPath: string;
  originalIdentifier: string;
  outputs: ProcessedOutput[];
};

export type ImgxFilesResult = {
  processed: number;
  processedFiles: ProcessedFile[];
  skipped: Array<{ file: string; reason: string }>;
  totalFound: number;
  manifest?: ImageManifest;
};

// Helper functions for generating HTML
export function generateSrcset(
  entries: ImageManifestEntry[],
  format?: string
): string {
  const filtered = format
    ? entries.filter((e) => e.format === format)
    : entries;
  return filtered
    .sort((a, b) => a.width - b.width)
    .map((e) => `${e.src} ${e.width}w`)
    .join(", ");
}

export function generatePicture(
  entries: ImageManifestEntry[],
  alt: string = ""
): string {
  const formats = [...new Set(entries.map((e) => e.format))];
  const webpEntries = entries.filter((e) => e.format === "webp");
  const avifEntries = entries.filter((e) => e.format === "avif");
  const jpegEntries = entries.filter((e) => e.format === "jpeg");

  let picture = "<picture>\n";

  // AVIF source (best compression)
  if (avifEntries.length > 0) {
    picture += `  <source srcset="${generateSrcset(
      avifEntries
    )}" type="image/avif">\n`;
  }

  // WebP source (good compression)
  if (webpEntries.length > 0) {
    picture += `  <source srcset="${generateSrcset(
      webpEntries
    )}" type="image/webp">\n`;
  }

  // JPEG fallback
  if (jpegEntries.length > 0) {
    const largestJpeg = jpegEntries.reduce((prev, current) =>
      prev.width > current.width ? prev : current
    );
    picture += `  <img src="${largestJpeg.src}" srcset="${generateSrcset(
      jpegEntries
    )}" alt="${alt}">\n`;
  } else if (entries.length > 0) {
    // Fallback to any format if no JPEG
    const largest = entries.reduce((prev, current) =>
      prev.width > current.width ? prev : current
    );
    picture += `  <img src="${largest.src}" srcset="${generateSrcset(
      entries
    )}" alt="${alt}">\n`;
  }

  picture += "</picture>";
  return picture;
}

// Cache management functions
function generateSettingsHash(opts: ImgxOptions): string {
  const settings = {
    width: opts.width,
    height: opts.height,
    sizes: opts.sizes,
    formats: opts.formats,
    suffix: opts.suffix,
    quality: opts.quality,
    effort: opts.effort,
    stripMetadata: opts.stripMetadata,
    withoutEnlargement: opts.withoutEnlargement,
  };
  return crypto
    .createHash("sha1")
    .update(JSON.stringify(settings))
    .digest("hex");
}

async function loadCache(cachePath: string): Promise<ImgxCache> {
  try {
    const data = await fs.readFile(cachePath, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function saveCache(cachePath: string, cache: ImgxCache): Promise<void> {
  await fs.writeFile(cachePath, JSON.stringify(cache, null, 2));
}

// Config file loading functions
async function loadConfigFile(configPath: string): Promise<ImgxConfig | null> {
  try {
    const ext = path.extname(configPath).toLowerCase();

    if (ext === ".json") {
      const content = await fs.readFile(configPath, "utf-8");
      return JSON.parse(content) as ImgxConfig;
    } else if (ext === ".mjs") {
      // For .mjs files, we need to dynamically import them
      const module = await import(path.resolve(configPath));
      return module.default || module;
    }

    return null;
  } catch (error) {
    // Config file not found or invalid - this is not an error
    return null;
  }
}

export async function findConfigFile(
  workingDir: string,
  customPath?: string
): Promise<string | null> {
  if (customPath) {
    const resolvedPath = path.resolve(customPath);
    try {
      await fs.access(resolvedPath);
      return resolvedPath;
    } catch {
      return null;
    }
  }

  // Look for config files in working directory
  const configNames = ["imgx.config.json", "imgx.config.mjs"];

  for (const configName of configNames) {
    const configPath = path.join(workingDir, configName);
    try {
      await fs.access(configPath);
      return configPath;
    } catch {
      // Continue to next config file
    }
  }

  return null;
}

export async function loadConfig(
  workingDir: string,
  customPath?: string
): Promise<ImgxConfig> {
  const configPath = await findConfigFile(workingDir, customPath);

  if (!configPath) {
    return {};
  }

  const config = await loadConfigFile(configPath);
  return config || {};
}

async function shouldSkipFile(
  inputPath: string,
  outputFiles: string[],
  settingsHash: string,
  force: boolean,
  cache: ImgxCache
): Promise<{ skip: boolean; reason?: string }> {
  if (force) {
    return { skip: false };
  }

  try {
    const inputStats = await fs.stat(inputPath);
    const inputMtime = inputStats.mtime.getTime();

    // Check if all output files exist and are newer than input
    let allOutputsExist = true;
    let newestOutputMtime = 0;

    for (const outputFile of outputFiles) {
      try {
        const outputStats = await fs.stat(outputFile);
        newestOutputMtime = Math.max(
          newestOutputMtime,
          outputStats.mtime.getTime()
        );
      } catch {
        allOutputsExist = false;
        break;
      }
    }

    if (allOutputsExist && newestOutputMtime > inputMtime) {
      // Check cache for settings hash
      const cacheKey = path.relative(process.cwd(), inputPath);
      const cacheEntry = cache[cacheKey];

      if (cacheEntry && cacheEntry.settingsHash === settingsHash) {
        return { skip: true, reason: "cached (up to date)" };
      } else {
        return { skip: true, reason: "output newer than input" };
      }
    }

    return { skip: false };
  } catch {
    return { skip: false };
  }
}

export async function imgx(opts: ImgxOptions): Promise<ImgxResult> {
  const {
    input,
    output,
    width = 1000,
    height,
    sizes,
    withoutEnlargement = true,
    formats = ["webp"],
    suffix = "{w}w",
    quality = 78,
    effort = 6,
    concurrency = os.cpus().length,
    sharpCacheFiles = 100,
    pattern = ["**/*.{jpg,jpeg,JPG,JPEG,png}"],
    stripMetadata = true,
    verbose = false,
    quiet = false,
    force = false,
    dryRun = false,
  } = opts;

  // Configure Sharp cache and concurrency
  if (sharpCacheFiles === false) {
    sharp.cache(false);
  } else {
    sharp.cache({ files: sharpCacheFiles });
  }
  sharp.concurrency(concurrency);

  const files = await globby(pattern, { cwd: input, absolute: true });
  if (files.length === 0)
    return { processed: 0, files: [], skipped: [], cached: [], totalFound: 0 };

  const limit = pLimit(concurrency);
  const results: Array<{ in: string; out: string[] }> = [];
  const skippedFiles: Array<{ file: string; reason: string }> = [];
  const cachedFiles: Array<{ file: string; reason: string }> = [];
  const manifest: ImageManifest = {};

  // Determine sizes to process
  const sizesToProcess = sizes || [width];

  // Load cache and generate settings hash
  const cachePath = path.join(output, ".imgx-cache.json");
  const cache = await loadCache(cachePath);
  const settingsHash = generateSettingsHash(opts);

  // Progress tracking setup
  let processedCount = 0;
  const startTime = Date.now();
  let lastProgressTime = startTime;

  if (!quiet && !verbose) {
    console.log(`Processing ${files.length} files...`);
  }

  await Promise.all(
    files.map((abs) =>
      limit(async () => {
        const rel = path.relative(input, abs);

        try {
          const baseName = rel.replace(/\.[^.]+$/, "");
          const outBase = path.join(output, baseName);
          const manifestEntries: ImageManifestEntry[] = [];
          const allOutputs: string[] = [];

          // Generate all expected output paths
          for (const size of sizesToProcess) {
            const sizeSuffix = suffix.replace("{w}", size.toString());
            for (const fmt of formats) {
              const outPath = `${outBase}-${sizeSuffix}.${fmt}`;
              allOutputs.push(outPath);
            }
          }

          // Check if we should skip this file
          const skipCheck = await shouldSkipFile(
            abs,
            allOutputs,
            settingsHash,
            force,
            cache
          );
          if (skipCheck.skip) {
            cachedFiles.push({
              file: rel,
              reason: skipCheck.reason || "cached",
            });

            // Load existing manifest entries from cache if available
            const cacheKey = path.relative(process.cwd(), abs);
            const cacheEntry = cache[cacheKey];
            if (cacheEntry && cacheEntry.outputFiles) {
              // Reconstruct manifest entries from cached data
              for (const outputFile of cacheEntry.outputFiles) {
                try {
                  const stats = await fs.stat(outputFile);
                  const metadata = await sharp(outputFile).metadata();
                  const format = path.extname(outputFile).slice(1);
                  const sizeMatch = outputFile.match(/-(\d+)w\./);
                  const width = sizeMatch
                    ? parseInt(sizeMatch[1])
                    : metadata.width || 0;

                  manifestEntries.push({
                    src: path.relative(output, outputFile).replace(/\\/g, "/"),
                    width,
                    height: metadata.height || 0,
                    format,
                    bytes: stats.size,
                    originalFile: rel,
                  });
                } catch {
                  // If we can't read the cached file, we'll need to reprocess
                  break;
                }
              }
            }

            results.push({ in: rel, out: allOutputs });
            manifest[rel] = manifestEntries;
            processedCount++;

            if (verbose) {
              // eslint-disable-next-line no-console
              console.log(`⚡ ${rel} - ${skipCheck.reason || "cached"}`);
            }
            return;
          }

          // Process each size
          for (const size of sizesToProcess) {
            const sizeSuffix = suffix.replace("{w}", size.toString());

            for (const fmt of formats) {
              const outPath = `${outBase}-${sizeSuffix}.${fmt}`;
              const outDir = path.dirname(outPath);
              await fs.mkdir(outDir, { recursive: true });

              if (dryRun) {
                continue;
              }

              let instance = sharp(abs, { failOn: "none" }).rotate();

              if (stripMetadata) {
                instance = instance.withMetadata({
                  exif: undefined,
                  icc: undefined,
                });
              }

              instance = instance.resize({
                width: size,
                height,
                fit: "inside",
                withoutEnlargement,
              });

              if (fmt === "webp") {
                instance = instance.webp({
                  quality,
                  effort,
                  smartSubsample: true,
                });
              } else if (fmt === "avif") {
                instance = instance.avif({
                  quality: Math.min(quality, 60),
                  effort: Math.min(effort, 6),
                });
              } else if (fmt === "jpeg") {
                instance = instance.jpeg({ quality, mozjpeg: true });
              }

              const buffer = await instance.toBuffer();
              await fs.writeFile(outPath, buffer);

              // Get image metadata
              const metadata = await sharp(buffer).metadata();

              // Add to manifest
              manifestEntries.push({
                src: path.relative(output, outPath).replace(/\\/g, "/"),
                width: metadata.width || size,
                height: metadata.height || 0,
                format: fmt,
                bytes: buffer.length,
                originalFile: rel,
              });
            }
          }

          results.push({ in: rel, out: allOutputs });
          manifest[rel] = manifestEntries;
          processedCount++;

          // Update cache
          if (!dryRun) {
            const cacheKey = path.relative(process.cwd(), abs);
            const inputStats = await fs.stat(abs);
            cache[cacheKey] = {
              inputPath: abs,
              inputMtime: inputStats.mtime.getTime(),
              settingsHash,
              outputFiles: allOutputs,
              timestamp: Date.now(),
            };
          }

          // Update progress
          if (!quiet && !verbose) {
            const now = Date.now();
            const elapsed = Math.round((now - startTime) / 1000);
            const rate = processedCount / ((now - startTime) / 1000);
            const eta = Math.round((files.length - processedCount) / rate);

            // Update progress every 500ms or on completion
            if (
              now - lastProgressTime > 500 ||
              processedCount === files.length
            ) {
              console.log(
                `Progress: ${processedCount}/${
                  files.length
                } files (${Math.round(
                  (processedCount / files.length) * 100
                )}%) | Elapsed: ${elapsed}s | ETA: ${eta}s | Current: ${rel}`
              );
              lastProgressTime = now;
            }
          } else if (verbose) {
            // eslint-disable-next-line no-console
            console.log(
              `✔ ${rel} → ${allOutputs
                .map((o) => path.relative(output, o))
                .join(", ")}`
            );
          }
        } catch (error: any) {
          // Track skipped files with error details
          const reason = error.message || "Unknown error";
          skippedFiles.push({ file: rel, reason });

          if (verbose) {
            // eslint-disable-next-line no-console
            console.log(`✗ ${rel} - Skipped: ${reason}`);
          }
        }
      })
    )
  );

  // Save cache file
  if (!dryRun) {
    await saveCache(cachePath, cache);
  }

  // Write manifest file if we have entries
  if (Object.keys(manifest).length > 0 && !dryRun) {
    const manifestPath = path.join(output, "imgx-manifest.json");
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    if (!quiet) {
      console.log(
        `\nManifest written to: ${path.relative(process.cwd(), manifestPath)}`
      );
    }
  }

  // Final progress update
  if (!quiet && !verbose) {
    const totalTime = Math.round((Date.now() - startTime) / 1000);
    console.log(
      `Completed: ${processedCount}/${files.length} files in ${totalTime}s`
    );
  }

  return {
    processed: results.length,
    files: results,
    skipped: skippedFiles,
    cached: cachedFiles,
    totalFound: files.length,
    manifest: Object.keys(manifest).length > 0 ? manifest : undefined,
  };
}

export type ImgxFilesOptions = {
  files: ImgxFileInput[];
  output?: string; // optional if only returning buffers
  width?: number; // default 1000
  height?: number; // optional; used with fit:"inside"
  sizes?: number[]; // multiple widths for responsive images
  withoutEnlargement?: boolean; // default true
  formats?: Array<"webp" | "avif" | "jpeg">; // default ["webp"]
  suffix?: string; // filename suffix pattern (e.g., "{w}w")
  quality?: number; // default 78 (for webp/avif/jpeg)
  effort?: number; // default 6  (for webp/avif)
  concurrency?: number; // default os.cpus().length
  sharpCacheFiles?: number | false; // default 100
  stripMetadata?: boolean; // default true
  verbose?: boolean; // default false
  quiet?: boolean; // default false
  returnBuffers?: boolean; // default true
  writeToDisk?: boolean; // default true (requires output)
};

export async function imgxFromFiles(
  opts: ImgxFilesOptions
): Promise<ImgxFilesResult> {
  const {
    files,
    output,
    width = 1000,
    height,
    sizes,
    withoutEnlargement = true,
    formats = ["webp"],
    suffix = "{w}w",
    quality = 78,
    effort = 6,
    concurrency = os.cpus().length,
    sharpCacheFiles = 100,
    stripMetadata = true,
    verbose = false,
    quiet = false,
    returnBuffers = true,
    writeToDisk = true,
  } = opts;

  // Validate options
  if (writeToDisk && !output) {
    throw new Error("output directory is required when writeToDisk is true");
  }

  // Configure Sharp cache and concurrency
  if (sharpCacheFiles === false) {
    sharp.cache(false);
  } else {
    sharp.cache({ files: sharpCacheFiles });
  }
  sharp.concurrency(concurrency);

  if (files.length === 0) {
    return {
      processed: 0,
      processedFiles: [],
      skipped: [],
      totalFound: 0,
    };
  }

  const limit = pLimit(concurrency);
  const processedFiles: ProcessedFile[] = [];
  const skippedFiles: Array<{ file: string; reason: string }> = [];
  const manifest: ImageManifest = {};

  // Determine sizes to process
  const sizesToProcess = sizes || [width];

  // Generate settings hash for cache (if output is provided)
  let cache: ImgxCache = {};
  let cachePath: string | null = null;
  let settingsHash: string | null = null;

  if (output && writeToDisk) {
    cachePath = path.join(output, ".imgx-cache.json");
    cache = await loadCache(cachePath);
    // Create a temporary ImgxOptions-like object for hash generation
    const tempOpts: ImgxOptions = {
      input: "",
      output: output || "",
      width,
      height,
      sizes,
      formats,
      suffix,
      quality,
      effort,
      stripMetadata,
      withoutEnlargement,
    };
    settingsHash = generateSettingsHash(tempOpts);
  }

  if (!quiet && !verbose) {
    console.log(`Processing ${files.length} files...`);
  }

  await Promise.all(
    files.map((fileInput, index) =>
      limit(async () => {
        let inputBuffer: Buffer;
        let originalPath: string;
        let originalIdentifier: string;

        try {
          // Handle string (file path) or Buffer input
          if (typeof fileInput === "string") {
            originalPath = fileInput;
            originalIdentifier = path.basename(fileInput);
            inputBuffer = await fs.readFile(fileInput);
          } else {
            // Buffer input - generate identifier
            originalPath = `buffer-${index}`;
            originalIdentifier = `buffer-${index}`;
            inputBuffer = fileInput;
          }

          // Generate base name for outputs
          const baseName = originalIdentifier.replace(/\.[^.]+$/, "");
          const outBase = output
            ? path.join(output, baseName)
            : path.join(os.tmpdir(), `imgx-${Date.now()}-${baseName}`);

          const processedOutputs: ProcessedOutput[] = [];
          const allOutputs: string[] = [];

          // Generate all expected output paths
          for (const size of sizesToProcess) {
            const sizeSuffix = suffix.replace("{w}", size.toString());
            for (const fmt of formats) {
              const outPath = `${outBase}-${sizeSuffix}.${fmt}`;
              allOutputs.push(outPath);
            }
          }

          // Check cache if output directory is provided
          if (output && writeToDisk && settingsHash) {
            const skipCheck = await shouldSkipFile(
              originalPath,
              allOutputs,
              settingsHash,
              false,
              cache
            );
            if (skipCheck.skip) {
              skippedFiles.push({
                file: originalIdentifier,
                reason: skipCheck.reason || "cached",
              });

              // Load existing files from cache
              if (returnBuffers) {
                for (const outputFile of allOutputs) {
                  try {
                    const buffer = await fs.readFile(outputFile);
                    const metadata = await sharp(buffer).metadata();
                    const format = path.extname(outputFile).slice(1);
                    const sizeMatch = outputFile.match(/-(\d+)w\./);
                    const width = sizeMatch
                      ? parseInt(sizeMatch[1])
                      : metadata.width || 0;

                    processedOutputs.push({
                      path: outputFile,
                      buffer,
                      width,
                      height: metadata.height || 0,
                      format,
                      bytes: buffer.length,
                    });
                  } catch {
                    // If we can't read, skip this output
                  }
                }
              }

              if (processedOutputs.length > 0) {
                processedFiles.push({
                  originalPath,
                  originalIdentifier,
                  outputs: processedOutputs,
                });
              }

              if (verbose) {
                console.log(
                  `⚡ ${originalIdentifier} - ${skipCheck.reason || "cached"}`
                );
              }
              return;
            }
          }

          // Process each size
          for (const size of sizesToProcess) {
            const sizeSuffix = suffix.replace("{w}", size.toString());

            for (const fmt of formats) {
              const outPath = `${outBase}-${sizeSuffix}.${fmt}`;
              const outDir = path.dirname(outPath);

              if (writeToDisk) {
                await fs.mkdir(outDir, { recursive: true });
              }

              // Process image with Sharp
              let instance = sharp(inputBuffer, { failOn: "none" }).rotate();

              if (stripMetadata) {
                instance = instance.withMetadata({
                  exif: undefined,
                  icc: undefined,
                });
              }

              instance = instance.resize({
                width: size,
                height,
                fit: "inside",
                withoutEnlargement,
              });

              if (fmt === "webp") {
                instance = instance.webp({
                  quality,
                  effort,
                  smartSubsample: true,
                });
              } else if (fmt === "avif") {
                instance = instance.avif({
                  quality: Math.min(quality, 60),
                  effort: Math.min(effort, 6),
                });
              } else if (fmt === "jpeg") {
                instance = instance.jpeg({ quality, mozjpeg: true });
              }

              const buffer = await instance.toBuffer();

              // Write to disk if requested
              if (writeToDisk) {
                await fs.writeFile(outPath, buffer);
              }

              // Get image metadata
              const metadata = await sharp(buffer).metadata();

              // Add to processed outputs
              processedOutputs.push({
                path: writeToDisk ? outPath : "",
                buffer: returnBuffers ? buffer : Buffer.alloc(0),
                width: metadata.width || size,
                height: metadata.height || 0,
                format: fmt,
                bytes: buffer.length,
              });
            }
          }

          processedFiles.push({
            originalPath,
            originalIdentifier,
            outputs: processedOutputs,
          });

          // Update cache if output directory is provided
          if (output && writeToDisk && settingsHash && typeof fileInput === "string") {
            const cacheKey = path.relative(process.cwd(), originalPath);
            try {
              const inputStats = await fs.stat(originalPath);
              cache[cacheKey] = {
                inputPath: originalPath,
                inputMtime: inputStats.mtime.getTime(),
                settingsHash,
                outputFiles: allOutputs,
                timestamp: Date.now(),
              };
            } catch {
              // If we can't stat the file, skip cache update
            }
          }

          // Add to manifest
          const manifestEntries: ImageManifestEntry[] = processedOutputs.map(
            (out) => ({
              src: writeToDisk && output
                ? path.relative(output, out.path).replace(/\\/g, "/")
                : out.path,
              width: out.width,
              height: out.height,
              format: out.format,
              bytes: out.bytes,
              originalFile: originalIdentifier,
            })
          );
          manifest[originalIdentifier] = manifestEntries;

          if (verbose) {
            console.log(
              `✔ ${originalIdentifier} → ${processedOutputs.length} variants`
            );
          }
        } catch (error: any) {
          const reason = error.message || "Unknown error";
          const identifier =
            typeof fileInput === "string"
              ? path.basename(fileInput)
              : `buffer-${index}`;
          skippedFiles.push({ file: identifier, reason });

          if (verbose) {
            console.log(`✗ ${identifier} - Skipped: ${reason}`);
          }
        }
      })
    )
  );

  // Save cache file if output directory is provided
  if (output && writeToDisk && cachePath) {
    await saveCache(cachePath, cache);
  }

  // Write manifest file if output directory is provided and we have entries
  if (output && writeToDisk && Object.keys(manifest).length > 0) {
    const manifestPath = path.join(output, "imgx-manifest.json");
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    if (!quiet) {
      console.log(
        `\nManifest written to: ${path.relative(process.cwd(), manifestPath)}`
      );
    }
  }

  // Final progress update
  if (!quiet && !verbose) {
    console.log(
      `Completed: ${processedFiles.length}/${files.length} files processed`
    );
  }

  return {
    processed: processedFiles.length,
    processedFiles,
    skipped: skippedFiles,
    totalFound: files.length,
    manifest: Object.keys(manifest).length > 0 ? manifest : undefined,
  };
}
