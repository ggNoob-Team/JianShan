interface KaTeXInstance {
  renderToString(
    expression: string,
    options?: {
      displayMode?: boolean;
      throwOnError?: boolean;
      trust?: boolean;
      output?: "html" | "mathml" | "htmlAndMathml";
    },
  ): string;
}

let katexLoadPromise: Promise<KaTeXInstance | null> | null = null;

/** Loads KaTeX only when a rendered Markdown document contains math. */
export function loadKaTeX(): Promise<KaTeXInstance | null> {
  katexLoadPromise ??= import("katex")
    .then((module) => {
      const candidate = ((module as { default?: unknown }).default ??
        module) as Partial<KaTeXInstance> | null;
      return typeof candidate?.renderToString === "function" ? (candidate as KaTeXInstance) : null;
    })
    .catch(() => null);
  return katexLoadPromise;
}
