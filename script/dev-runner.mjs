import path from "node:path";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();
const loaderPath = path.join(projectRoot, "script", "ts-loader.mjs");
const loaderURL = pathToFileURL(loaderPath).href;
const rootURL = pathToFileURL(path.join(projectRoot, path.sep)).href;
const entry = process.argv[2] ?? "server/index.ts";
const entryURL = pathToFileURL(path.resolve(projectRoot, entry)).href;

register(loaderURL, rootURL);
await import(entryURL);
