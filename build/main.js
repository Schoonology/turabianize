#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = require("node:fs/promises");
const gray_matter_1 = __importDefault(require("gray-matter"));
const marked_1 = require("marked");
const node_path_1 = require("node:path");
const puppeteer_1 = __importDefault(require("puppeteer"));
const handlebars_1 = __importDefault(require("handlebars"));
const yargs = require("yargs"); // Specific to yargs, an old and reliable library.
const scriptPath = (0, node_path_1.resolve)((0, node_path_1.dirname)(__dirname), "node_modules", "pagedjs", "dist", "paged.polyfill.js");
function ellipses(input) {
    return input.replace(/\.\.\./g, "…");
}
function footnotes(input) {
    const REGEX_LATEX = /\\footnote\{[^\}]+\}/g;
    const REGEX_MARKDOWNISH = /\^\{[^\}]+\}/g;
    for (const [match, ..._] of input.matchAll(REGEX_LATEX)) {
        input = input.replace(match, `<span class="footnote">${match.slice(10, -1)}</span>`);
    }
    for (const [match, ..._] of input.matchAll(REGEX_MARKDOWNISH)) {
        input = input.replace(match, `<span class="footnote">${match.slice(2, -1)}</span>`);
    }
    return input;
}
async function parseArgs() {
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
async function renderToHtml(input, template) {
    const { content, data } = (0, gray_matter_1.default)(input);
    const render = handlebars_1.default.compile(template);
    if (Array.isArray(data.bibliography)) {
        data.bibliography = data.bibliography.map((line) => marked_1.marked.parseInline(line, {}));
    }
    const html = await marked_1.marked.parse(footnotes(ellipses(content.replaceAll(/\(\(/g, "(").replaceAll(/\)\)/g, ")"))));
    return render({
        html,
        data,
    });
}
async function renderToPdf({ input, output }) {
    const browser = await puppeteer_1.default.launch();
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
function countWords(markdown) {
    // Trim off front matter first.
    const { content, data } = (0, gray_matter_1.default)(markdown);
    const actualCount = content
        .split(/[\s-–—…\.\^]+/)
        .filter((protoWord) => protoWord.length)
        .filter((protoWord) => protoWord.match(/[a-zA-Z]+/)).length;
    const targetCount = data.word_count;
    if (targetCount) {
        const difference = Math.abs(targetCount - actualCount);
        const epsilon = targetCount * 0.1;
        return `${actualCount} / ${targetCount} ${difference <= epsilon
            ? "✅"
            : `❌ (${targetCount > actualCount ? "+" : "-"}${difference - epsilon})`}`;
    }
    else {
        return String(actualCount);
    }
}
function printReport({ content, startTime, }) {
    console.log(`Time elapsed: ${((performance.now() - startTime) / 1000).toPrecision(2)}s`);
    console.log(`Word count: ${countWords(content)}`);
}
async function run() {
    const startTime = performance.now();
    const argv = await parseArgs();
    const inputContent = await (0, promises_1.readFile)(argv.input, "utf-8");
    const templateContent = await (0, promises_1.readFile)(__dirname + "/template.html", "utf-8");
    const html = await renderToHtml(inputContent, templateContent);
    await renderToPdf({ input: html, output: argv.output });
    printReport({ content: inputContent, startTime });
}
run().catch((e) => console.error("Failed with:", e));
