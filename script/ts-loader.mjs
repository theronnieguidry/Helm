import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const aliasRoots = {
  "@shared/": path.join(projectRoot, "shared"),
  "@/": path.join(projectRoot, "client", "src"),
};

function toPath(urlOrPath) {
  return urlOrPath.startsWith("file:") ? fileURLToPath(urlOrPath) : urlOrPath;
}

function firstExistingPath(basePath) {
  const hasExtension = Boolean(path.extname(basePath));
  const candidates = hasExtension
    ? [
        basePath,
        `${basePath}.ts`,
        `${basePath}.tsx`,
        `${basePath}.js`,
        `${basePath}.mjs`,
        `${basePath}.cjs`,
      ]
    : [
        `${basePath}.ts`,
        `${basePath}.tsx`,
        `${basePath}.js`,
        `${basePath}.mjs`,
        `${basePath}.cjs`,
        path.join(basePath, "index.ts"),
        path.join(basePath, "index.tsx"),
        path.join(basePath, "index.js"),
        path.join(basePath, "index.mjs"),
        path.join(basePath, "index.cjs"),
      ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function resolveAlias(specifier) {
  for (const [prefix, targetRoot] of Object.entries(aliasRoots)) {
    if (specifier.startsWith(prefix)) {
      const resolved = path.join(targetRoot, specifier.slice(prefix.length));
      return firstExistingPath(resolved) ?? resolved;
    }
  }
  return null;
}

function resolveRelative(specifier, parentURL) {
  if (specifier.startsWith("file:")) {
    return toPath(specifier);
  }
  const parentDir = parentURL ? path.dirname(toPath(parentURL)) : projectRoot;
  const absolute = path.resolve(parentDir, specifier);
  return firstExistingPath(absolute) ?? absolute;
}

export async function resolve(specifier, context, defaultResolve) {
  if (
    specifier.startsWith("node:") ||
    specifier.startsWith("data:") ||
    specifier.startsWith("http:")
  ) {
    return defaultResolve(specifier, context, defaultResolve);
  }

  const aliasPath = resolveAlias(specifier);
  if (aliasPath) {
    return {
      shortCircuit: true,
      url: pathToFileURL(aliasPath).href,
    };
  }

  if (
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier.startsWith("/") ||
    specifier.startsWith("file:")
  ) {
    const resolvedPath = resolveRelative(specifier, context.parentURL);
    return {
      shortCircuit: true,
      url: pathToFileURL(resolvedPath).href,
    };
  }

  return defaultResolve(specifier, context, defaultResolve);
}

export async function load(url, context, defaultLoad) {
  if (!url.endsWith(".ts") && !url.endsWith(".tsx")) {
    return defaultLoad(url, context, defaultLoad);
  }

  const filePath = fileURLToPath(url);
  const source = fs.readFileSync(filePath, "utf8");
  const result = ts.transpileModule(source, {
    fileName: filePath,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
      sourceMap: true,
      inlineSources: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      isolatedModules: true,
    },
  });

  return {
    format: "module",
    shortCircuit: true,
    source: result.outputText,
  };
}
