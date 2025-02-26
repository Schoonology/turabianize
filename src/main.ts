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

function ellipses(input: string): string {
  return input.replace(/\.\.\./g, "…");
}

function footnotes(input: string): string {
  const REGEX_LATEX = /\\footnote\{[^\}]+\}/g;
  const REGEX_MARKDOWNISH = /\^\{[^\}]+\}/g;

  for (const [match, ..._] of input.matchAll(REGEX_LATEX)) {
    input = input.replace(
      match,
      `<span class="footnote">${match.slice(10, -1)}</span>`
    );
  }

  for (const [match, ..._] of input.matchAll(REGEX_MARKDOWNISH)) {
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

  if (Array.isArray(data.bibliography)) {
    data.bibliography = data.bibliography.map((line) =>
      marked.parseInline(line, {})
    );
  }

  const html = await marked.parse(
    footnotes(
      ellipses(content.replaceAll(/\(\(/g, "(").replaceAll(/\)\)/g, ")"))
    )
  );

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

function countWords(markdown: string): string {
  // Trim off front matter first.
  const { content, data } = matter(markdown);

  const actualCount = content
    .split(/[\s-–—…\.\^]+/)
    .filter((protoWord) => protoWord.length)
    .filter((protoWord) => protoWord.match(/[a-zA-Z]+/)).length;
  const targetCount = data.word_count;

  if (targetCount) {
    const difference = Math.abs(targetCount - actualCount);
    const epsilon = targetCount * 0.1;

    return `${actualCount} / ${targetCount} ${
      difference <= epsilon
        ? "✅"
        : `❌ (${targetCount > actualCount ? "+" : "-"}${difference - epsilon})`
    }`;
  } else {
    return String(actualCount);
  }
}

function printReport({
  content,
  startTime,
}: {
  content: string;
  startTime: number;
}) {
  console.log(
    `Time elapsed: ${((performance.now() - startTime) / 1000).toPrecision(2)}s`
  );
  console.log(`Word count: ${countWords(content)}`);
}

async function run() {
  const startTime = performance.now();
  const argv = await parseArgs();

  const inputContent = await readFile(argv.input, "utf-8");
  const templateContent = await readFile(__dirname + "/template.html", "utf-8");

  const html = await renderToHtml(inputContent, templateContent);

  await renderToPdf({ input: html, output: argv.output });

  printReport({ content: inputContent, startTime });
}

run().catch((e) => console.error("Failed with:", e));
