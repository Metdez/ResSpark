import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_LINES = 500;
const SKIP_DIRS = new Set(["node_modules", "dist", ".wrangler", ".git"]);
const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".cjs"];
// shortcut: src/components/ui/** is vendored shadcn (sidebar.tsx is 728 lines); split it the first time it is edited
const SKIP_PATHS = [/(^|\/)routeTree\.gen\.ts$/, /(^|\/)worker-configuration\.d\.ts$/, /(^|\/)src\/components\/ui\//];

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const rootFlag = process.argv.indexOf("--root");
if (rootFlag >= 0 && !process.argv[rootFlag + 1]) throw new Error("--root needs a directory.");
const root = resolve(rootFlag >= 0 ? process.argv[rootFlag + 1] : resolve(scriptDirectory, ".."));

const walk = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : walk(path);
    return entry.isFile() ? [path] : [];
  });

const countLines = (text) => {
  const breaks = text.split("\n").length - 1;
  return text.length > 0 && !text.endsWith("\n") ? breaks + 1 : breaks;
};

const offenders = walk(root)
  .map((path) => path.slice(root.length + 1).replaceAll("\\", "/"))
  .filter((path) => CODE_EXTENSIONS.some((ext) => path.endsWith(ext)))
  .filter((path) => !SKIP_PATHS.some((pattern) => pattern.test(path)))
  .map((path) => [path, countLines(readFileSync(join(root, path), "utf8"))])
  .filter(([, lines]) => lines > MAX_LINES)
  .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));

if (offenders.length > 0) {
  console.error(offenders.map(([path, lines]) => `${path}: ${lines} lines`).join("\n"));
  process.exit(1);
}
