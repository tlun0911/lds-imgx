import { Command, Option } from "commander";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { imgx, loadConfig, type ImgxConfig } from "./index.js";

const program = new Command();

program
  .name("imgx")
  .description("Resize & convert images (Sharp-powered).")
  .version("0.1.0")
  .argument("<input>", "input directory")
  .argument("<output>", "output directory")
  .option("-w, --width <number>", "max width (px)", "1000")
  .option("--height <number>", "max height (px)")
  .option(
    "--sizes <sizes>",
    "comma-separated list of widths (e.g., 640,1000,1600,2000)"
  )
  .addOption(
    new Option("-f, --formats <items>", "comma list of formats")
      .default("webp")
      .choices([
        "webp",
        "avif",
        "jpeg",
        "webp,avif",
        "webp,jpeg",
        "avif,jpeg",
        "webp,avif,jpeg",
      ])
  )
  .option(
    "--suffix <pattern>",
    "filename suffix pattern (e.g., '{w}w')",
    "{w}w"
  )
  .option("--quality <number>", "quality (0–100)", "78")
  .option("-e, --effort <number>", "encoder effort (0–6)", "6")
  .option("-c, --concurrency <number>", "parallel workers (default: CPU cores)")
  .option(
    "--sharp-cache-files <number>",
    "Sharp cache files limit (default: 100, use 'false' to disable)",
    "100"
  )
  .option("-p, --pattern <glob...>", "glob(s) for inputs", [
    "**/*.{jpg,jpeg,JPG,JPEG,png}",
  ])
  .option("--no-strip-metadata", "keep metadata instead of stripping")
  .option("--no-enlarge", "allow upscaling (default prevents it)")
  .option("-v, --verbose", "show detailed progress for each file", false)
  .option("-q, --quiet", "suppress all output except errors", false)
  .option("--force", "rebuild all images regardless of cache", false)
  .option("--dry-run", "do not write files", false)
  .option(
    "--config <path>",
    "path to config file (imgx.config.json or imgx.config.mjs)"
  )
  .action(async (input, output, opts) => {
    // Load config file
    const workingDir = process.cwd();
    const fileConfig = await loadConfig(workingDir, opts.config);

    // Parse CLI options with config file defaults
    let sharpCacheFiles: number | false = fileConfig.sharpCacheFiles ?? 100;
    if (opts.sharpCacheFiles === "false") {
      sharpCacheFiles = false;
    } else if (opts.sharpCacheFiles !== "100") {
      sharpCacheFiles = Number(opts.sharpCacheFiles);
    }

    // Parse concurrency option (CLI overrides config, config overrides auto-detection)
    const concurrency = opts.concurrency
      ? Number(opts.concurrency)
      : fileConfig.concurrency;

    // Merge config file with CLI options (CLI takes precedence)
    const config = {
      input: path.resolve(input),
      output: path.resolve(output),
      width: opts.width ? Number(opts.width) : fileConfig.width ?? 1000,
      height: opts.height ? Number(opts.height) : fileConfig.height,
      sizes: opts.sizes ? opts.sizes.split(",").map(Number) : fileConfig.sizes,
      formats:
        opts.formats !== "webp"
          ? opts.formats.split(",")
          : fileConfig.formats ?? ["webp"],
      suffix:
        opts.suffix !== "{w}w" ? opts.suffix : fileConfig.suffix ?? "{w}w",
      quality:
        opts.quality !== "78" ? Number(opts.quality) : fileConfig.quality ?? 78,
      effort:
        opts.effort !== "6" ? Number(opts.effort) : fileConfig.effort ?? 6,
      concurrency,
      sharpCacheFiles,
      pattern:
        opts.pattern.length > 1 ||
        opts.pattern[0] !== "**/*.{jpg,jpeg,JPG,JPEG,png}"
          ? opts.pattern
          : fileConfig.pattern ?? ["**/*.{jpg,jpeg,JPG,JPEG,png}"],
      stripMetadata:
        opts.stripMetadata !== undefined
          ? opts.stripMetadata
          : fileConfig.stripMetadata ?? true,
      withoutEnlargement:
        opts.noEnlarge !== undefined
          ? !opts.noEnlarge
          : fileConfig.withoutEnlargement ?? true,
      verbose: !!opts.verbose || fileConfig.verbose || false,
      quiet: !!opts.quiet || fileConfig.quiet || false,
      force: !!opts.force || fileConfig.force || false,
      dryRun: !!opts.dryRun || fileConfig.dryRun || false,
    } as const;

    try {
      await fs.mkdir(config.output, { recursive: true });
      const res = await imgx(config);

      if (!config.quiet) {
        // Display summary
        console.log("\n" + "=".repeat(50));
        console.log("SUMMARY");
        console.log("=".repeat(50));
        console.log(`Total files found: ${res.totalFound}`);
        console.log(`Successfully processed: ${res.processed}`);
        console.log(`Cached (skipped): ${res.cached.length}`);
        console.log(`Skipped (errors): ${res.skipped.length}`);

        if (res.cached.length > 0) {
          console.log("\nCached files:");
          res.cached.forEach(({ file, reason }) => {
            console.log(`  ⚡ ${file} - ${reason}`);
          });
        }

        if (res.skipped.length > 0) {
          console.log("\nSkipped files:");
          res.skipped.forEach(({ file, reason }) => {
            console.log(`  ✗ ${file} - ${reason}`);
          });
        }

        if (res.processed > 0) {
          console.log(`\nProcessed ${res.processed} file(s) successfully.`);
        }
        console.log("=".repeat(50));
      }
    } catch (err: any) {
      console.error("Error:", err.message ?? err);
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv);
