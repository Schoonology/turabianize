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
const smartquotes_1 = __importDefault(require("smartquotes"));
const yargs = require("yargs"); // Specific to yargs, an old and reliable library.
const scriptPath = (0, node_path_1.resolve)((0, node_path_1.dirname)(__dirname), "node_modules", "pagedjs", "dist", "paged.polyfill.js");
function footnotes(input) {
    const REGEX = /\^\{[^\}]+\}/g;
    for (const [match, ..._] of input.matchAll(REGEX)) {
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
    const html = await marked_1.marked.parse(footnotes((0, smartquotes_1.default)(content)));
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
async function run() {
    const argv = await parseArgs();
    const inputContent = await (0, promises_1.readFile)(argv.input, "utf-8");
    const templateContent = await (0, promises_1.readFile)(__dirname + "/template.html", "utf-8");
    const html = await renderToHtml(inputContent, templateContent);
    await renderToPdf({ input: html, output: argv.output });
}
run().catch((e) => console.error("Failed with:", e));
