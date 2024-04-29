#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import matter from "gray-matter";
import { marked } from "marked";
import { dirname, resolve } from "node:path";
import puppeteer from "puppeteer";
import Handlebars from "handlebars";
import smartquotes from "smartquotes";
const yargs = require("yargs"); // Specific to yargs, an old and reliable library.

const scriptPath = resolve(
  dirname(__dirname),
  "node_modules",
  "pagedjs",
  "dist",
  "paged.polyfill.js"
);

function footnotes(input: string): string {
  const REGEX = /\^\{[^\}]+\}/g;

  for (const [match, ..._] of input.matchAll(REGEX)) {
    input = input.replace(
      match,
      `<span class="footnote">${match.slice(2, -1)}</span>`
    );
  }

  return input;
}

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

async function renderToHtml(input: string, template: string): Promise<string> {
  const { content, data } = matter(input);
  const render = Handlebars.compile(template);

  const html = await marked.parse(footnotes(smartquotes(content)));

  return render({
    html,
    data,
  });
}

async function renderToPdf({ input, output }: Baton): Promise<void> {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.setContent(input, { waitUntil: "domcontentloaded" });
  await page.addScriptTag({
    path: scriptPath,
  });
  await page.waitForNetworkIdle();
  await page.waitForSelector(".pagedjs_pages");

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
  const templateContent = await readFile(__dirname + "/template.html", "utf-8");

  const html = await renderToHtml(inputContent, templateContent);

  await renderToPdf({ input: html, output: argv.output });
}

run().catch((e) => console.error("Failed with:", e));
