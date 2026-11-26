import { resolve } from "node:path";

export function resolveRepositoryDirectory(options: { cwd?: string }): string {
  return resolve(options.cwd ?? process.cwd());
}
