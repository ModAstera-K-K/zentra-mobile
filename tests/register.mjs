import { registerHooks } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, extname } from "node:path";
import ts from "typescript";
const root = resolve(import.meta.dirname, "..");
registerHooks({
  resolve(specifier, context, next) {
    if (
      specifier.startsWith("@/") ||
      (specifier.startsWith(".") && context.parentURL?.endsWith(".ts"))
    ) {
      const path = specifier.startsWith("@/")
        ? resolve(root, specifier.slice(2))
        : fileURLToPath(new URL(specifier, context.parentURL));
      const candidate = [path, `${path}.ts`, `${path}/index.ts`].find(
        (p) => existsSync(p) && extname(p),
      );
      if (candidate)
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith(".ts"))
      return {
        format: "module",
        source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
          compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
          },
        }).outputText,
        shortCircuit: true,
      };
    return next(url, context);
  },
});
