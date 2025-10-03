import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
  },
  format: ["esm", "cjs"],
  dts: true, // generate .d.ts for library API
  sourcemap: true,
  clean: true,
  target: "node18",
  banner: {
    // add shebang for CJS CLI output
    js: "#!/usr/bin/env node",
  },
  // Make sure we keep a CJS copy of the CLI for the "bin" field
  outExtension({ format }) {
    return { js: format === "esm" ? ".mjs" : ".cjs" };
  },
  // Fix CommonJS interop issues
  cjsInterop: true,
  splitting: false,
});
