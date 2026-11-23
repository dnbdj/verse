import { useEffect, useState } from "react";
import { api, type ReleaseInfo } from "../lib/api";
import { openExternal } from "../lib/services";
import { CheckIcon, DownloadIcon, ExternalIcon } from "./icons";

/** Release bodies are Markdown; strip the syntax the changelog cannot render. */
const plain = (notes: string) =>
  notes
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .trim();

const sizeLabel = (bytes: number) => {
  if (bytes <= 0) return "";
  if (bytes >= 1_048_576) return ` · ${(bytes / 1_048_576).toFixed(1)} MB`;
  return ` · ${Math.max(1, Math.round(bytes / 1024))} KB`;
};

const when = (iso: string) => {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

/**
 * The Versions module: the build you are running, then every published release
 * newest first with its notes and the attached exe.
 */
export function VersionHistory({ current }: { current: string }) {
  const [releases, setReleases] = useState<ReleaseInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setReleases(null);
    setError(null);
    void api
      .listReleases()
      .then((list) => {
        if (!cancelled) setReleases(list);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const latest = releases?.[0]?.version;

  return (
    <>
      <section className="settings-group">
        <div className="settings-rows">
          <div className="settings-row">
            <div className="settings-label">
              <div className="setting-title">This build</div>
              <div className="setting-sub">
                Verse {current} — portable Windows build. Updates are checked against GitHub
                Releases each time Verse opens.
              </div>
            </div>
            <span className="version-badge">v{current}</span>
          </div>
        </div>
      </section>

      <section className="settings-group">
        <div className="settings-head">
          <div className="settings-head-title">Changelog</div>
          <div className="settings-head-sub">
            Every published release, newest first, with the notes that shipped alongside it. Old
            builds stay downloadable, so you can always go back.
          </div>
        </div>

        <div className="version-list">
          {!releases && !error && <div className="share-empty">Loading releases…</div>}

          {error && (
            <div className="version-error">
              <span>Could not read GitHub Releases: {error}</span>
              <button className="btn btn-quiet" onClick={() => setAttempt((count) => count + 1)}>
                Try again
              </button>
            </div>
          )}

          {releases?.length === 0 && (
            <div className="share-empty">No releases have been published yet.</div>
          )}

          {releases?.map((release) => (
            <article className="version-row" key={release.version || release.url}>
              <div className="version-head">
                <span className="version-tag">v{release.version}</span>
                {release.version === current && (
                  <span className="version-current">
                    <CheckIcon size={11} />
                    Running
                  </span>
                )}
                {release.version === latest && release.version !== current && (
                  <span className="version-latest">Latest</span>
                )}
                <span className="version-date">{when(release.publishedAt)}</span>
              </div>

              {release.notes && <pre className="version-notes">{plain(release.notes)}</pre>}

              <div className="version-actions">
                {release.downloadUrl && (
                  <button
                    className="btn btn-quiet"
                    onClick={() => void openExternal(release.downloadUrl as string)}
                  >
                    <DownloadIcon size={13} />
                    Download exe{sizeLabel(release.downloadSize)}
                  </button>
                )}
                <button className="btn btn-quiet" onClick={() => void openExternal(release.url)}>
                  <ExternalIcon size={13} />
                  Release page
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
