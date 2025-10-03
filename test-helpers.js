import { generateSrcset, generatePicture } from "./dist/index.mjs";

// Test data from the manifest
const entries = [
  {
    src: "A Caruso Courage-640w.webp",
    width: 640,
    height: 480,
    format: "webp",
    bytes: 32426,
    originalFile: "A Caruso Courage.jpg",
  },
  {
    src: "A Caruso Courage-640w.avif",
    width: 640,
    height: 480,
    format: "avif",
    bytes: 31244,
    originalFile: "A Caruso Courage.jpg",
  },
  {
    src: "A Caruso Courage-1000w.webp",
    width: 1000,
    height: 750,
    format: "webp",
    bytes: 47682,
    originalFile: "A Caruso Courage.jpg",
  },
  {
    src: "A Caruso Courage-1000w.avif",
    width: 1000,
    height: 750,
    format: "avif",
    bytes: 44980,
    originalFile: "A Caruso Courage.jpg",
  },
  {
    src: "A Caruso Courage-1600w.webp",
    width: 1600,
    height: 1200,
    format: "webp",
    bytes: 98686,
    originalFile: "A Caruso Courage.jpg",
  },
  {
    src: "A Caruso Courage-1600w.avif",
    width: 1600,
    height: 1200,
    format: "avif",
    bytes: 92053,
    originalFile: "A Caruso Courage.jpg",
  },
];

console.log("=== Srcset Generation ===");
console.log("WebP srcset:");
console.log(generateSrcset(entries, "webp"));
console.log("\nAVIF srcset:");
console.log(generateSrcset(entries, "avif"));
console.log("\nAll formats srcset:");
console.log(generateSrcset(entries));

console.log("\n=== Picture Element Generation ===");
console.log(generatePicture(entries, "Beautiful landscape image"));
