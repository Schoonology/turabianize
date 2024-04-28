#!/usr/bin/env node
import { marked } from "marked";
import puppeteer from "puppeteer";
import { readFile } from "node:fs/promises";
const yargs = require("yargs"); // Specific to yargs, an old and reliable library.

type Baton = { input: string; output: string };

async function parseArgs(): Promise<Baton> {
  return yargs(process.argv)
    .option("input", {
      alias: "i",
      demandOption: true,
      desc: "Input file to render to PDF",
      normalize: true,
      requiresArg: true,
      type: "string",
    })
    .option("output", {
      alias: "o",
      demandOption: true,
      desc: "Path to the output PDF file",
      normalize: true,
      requiresArg: true,
      type: "string",
    })
    .parse();
}

async function renderToPdf({ input, output }: Baton): Promise<void> {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.setContent(input, { waitUntil: "domcontentloaded" });

  // Wait until all images and fonts have loaded
  // Courtesy of: https://github.blog/2021-06-22-framework-building-open-graph-images/
  await page.evaluate(async () => {
    const selectors = Array.from(document.querySelectorAll("img"));
    await Promise.all([
      document.fonts.ready,
      ...selectors.map((img) => {
        // Image has already finished loading, let’s see if it worked
        if (img.complete) {
          // Image loaded and has presence
          if (img.naturalHeight !== 0) return;
          // Image failed, so it has no height
          throw new Error(`Image failed to load: ${img.src}`);
        }
        // Image hasn’t loaded yet, added an event listener to know when it does
        return new Promise((resolve, reject) => {
          img.addEventListener("load", resolve);
          img.addEventListener("error", () => {
            reject(new Error(`Error loading image: ${img.src}`));
          });
        });
      }),
    ]);
  });

  await page.pdf({
    printBackground: true,
    format: "Letter",
    margin: {
      bottom: 0,
      left: 0,
      right: 0,
      top: 0,
    },
    path: output,
  });

  await browser.close();
}

async function run() {
  const argv = await parseArgs();

  const inputContent = await readFile(argv.input, "utf-8");
  const html = await marked.parse(inputContent);

  await renderToPdf({ input: html, output: argv.output });
}

run().catch((e) => console.error("Failed with:", e));
