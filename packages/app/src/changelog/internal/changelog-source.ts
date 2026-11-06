import { useCallback, useEffect, useMemo, useState } from "react";
import { i18n } from "@/i18n/i18next";
import { resolveBundledReleaseNotes } from "./bundled-release-notes";
import { parseChangelog, type ChangelogRelease } from "./parse-changelog";

const CHANGELOG_URL = "https://raw.githubusercontent.com/getpaseo/paseo/main/CHANGELOG.md";

export type ChangelogState =
  | { status: "loading" }
  | { status: "ready"; releases: ChangelogRelease[] }
  | { status: "error" };

// Survives close/reopen so the second look paints without a spinner. The raw
// text is kept alongside the releases so an unchanged revalidation can be
// dropped: handing back an equal-but-new array would re-render every release.
let cached: {
  language: string;
  markdown: string;
  releases: ChangelogRelease[];
} | null = null;

export interface Changelog {
  state: ChangelogState;
  reload: () => void;
}

/**
 * Reads the changelog from the repository the app was built from.
 *
 * The daemon is not involved: the changelog describes the app, a phone reaching
 * a relay already has internet, and going through a host would make the notes
 * depend on which host happens to be connected.
 *
 * Every open refetches, because the whole point of opening it is a release that
 * shipped after this app started. A previous result stays on screen while that
 * happens, and survives a failed revalidation.
 */
export function useChangelog(enabled: boolean): Changelog {
  const language = i18n.resolvedLanguage ?? i18n.language ?? "en";
  const bundledReleases = useMemo(
    () => parseChangelog(resolveBundledReleaseNotes(language)),
    [language],
  );
  const [state, setState] = useState<ChangelogState>(() => readCache(language, bundledReleases));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    setState(readCache(language, bundledReleases));

    void (async () => {
      try {
        const response = await fetch(CHANGELOG_URL, { signal: controller.signal });
        if (!response.ok) throw new Error(`Changelog request failed: ${response.status}`);
        const markdown = await response.text();
        if (cached?.language === language && cached.markdown === markdown) return;
        const releases = mergeChangelogReleases(bundledReleases, parseChangelog(markdown));
        if (releases.length === 0) throw new Error("Changelog has no releases");
        cached = { language, markdown, releases };
        setState({ status: "ready", releases });
      } catch {
        if (controller.signal.aborted) return;
        if (cached?.language === language) return;
        setState({ status: "ready", releases: bundledReleases });
      }
    })();

    return () => controller.abort();
  }, [bundledReleases, enabled, attempt, language]);

  const reload = useCallback(() => {
    cached = null;
    setAttempt((value) => value + 1);
  }, []);

  return { state, reload };
}

function readCache(language: string, bundledReleases: ChangelogRelease[]): ChangelogState {
  return cached?.language === language
    ? { status: "ready", releases: cached.releases }
    : { status: "ready", releases: bundledReleases };
}

export function mergeChangelogReleases(
  bundled: ChangelogRelease[],
  remote: ChangelogRelease[],
): ChangelogRelease[] {
  const bundledVersions = new Set(bundled.map((release) => release.version));
  return [...bundled, ...remote.filter((release) => !bundledVersions.has(release.version))];
}
