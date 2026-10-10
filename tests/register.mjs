import { registerHooks } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, extname } from "node:path";
import ts from "typescript";
const root = resolve(import.meta.dirname, "..");
// Native packages that cannot load in Node. Tests get small stand-ins so
// repository and store code runs for real against node:sqlite.
const stubs = {
  "expo-background-task": "tests/stubs/expo-background-task.ts",
  "expo-battery": "tests/stubs/expo-battery.ts",
  "expo-sqlite": "tests/stubs/expo-sqlite.ts",
  "react-native": "tests/stubs/react-native.ts",
  expo: "tests/stubs/expo.ts",
  "expo-linking": "tests/stubs/expo-linking.ts",
  "expo-location": "tests/stubs/expo-location.ts",
  "expo-network": "tests/stubs/expo-network.ts",
  "expo-sensors": "tests/stubs/expo-sensors.ts",
  "expo-task-manager": "tests/stubs/expo-task-manager.ts",
  "@react-native-async-storage/async-storage": "tests/stubs/async-storage.ts",
};
registerHooks({
  resolve(specifier, context, next) {
    if (stubs[specifier])
      return {
        url: pathToFileURL(resolve(root, stubs[specifier])).href,
        shortCircuit: true,
      };
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
