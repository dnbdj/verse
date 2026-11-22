import { decodeLook, readLookFromUrl, SHARE_PREFIX, type Arrival } from "./share";
import { parsePlayParams, playTarget, type PlayArrival } from "./playLink";

/** A `verse://` link is either a look or a request to play something local. */
export type DeepLinkArrival = Arrival | PlayArrival;

/**
 * Desktop deep links arrive as `verse://…`. Look links reuse the share parser, so the
 * same validation and error messages apply:
 *
 *   verse://look#look=VRS1.…
 *   verse://look?code=VRS1.…
 *   verse://look/VRS1.…
 *   verse://play?track=<id>
 *   verse://play?playlist=<id>
 *   verse://play?album=<artist|album>
 *
 * Anything unrecognised is `none`; a damaged payload is an error, never a partial apply.
 */
export function parseDeepLink(rawUrl: string): DeepLinkArrival {
  const trimmed = rawUrl.trim();
  if (!trimmed) return { kind: "none" };

  let url: URL | null = null;
  try {
    url = new URL(trimmed);
  } catch {
    url = null;
  }

  if (url && url.protocol === "verse:" && url.hostname.toLowerCase() === "play") {
    const fromQuery = parsePlayParams(url.searchParams);
    if (fromQuery.kind !== "none") return fromQuery;

    const fromPath = decodeURIComponent(url.pathname.replace(/^\/+/, "")).trim();
    if (!fromPath) {
      return {
        kind: "error",
        error: "That play link has nothing to play — copy a fresh link from the app.",
      };
    }
    return playTarget({ kind: "track", id: fromPath });
  }

  const fromFragment = readLookFromUrl(trimmed);
  if (fromFragment.kind !== "none") return fromFragment;

  if (!url || url.protocol !== "verse:") return { kind: "none" };

  if (url.hostname.toLowerCase() !== "look") return { kind: "none" };

  const queryCode = url.searchParams.get("code") ?? url.searchParams.get("look");
  const pathCode = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  const code = (queryCode ?? pathCode).trim();
  if (!code) {
    return {
      kind: "error",
      error: "That desktop link has no look code — copy a fresh link from Settings.",
    };
  }

  if (!code.startsWith(SHARE_PREFIX)) {
    return {
      kind: "error",
      error: "That desktop link contains something that is not a Verse look code.",
    };
  }

  const result = decodeLook(code);
  if (!result.ok) return { kind: "error", error: result.error };
  return { kind: "look", look: result.look, code };
}

/** The `verse://` form of a look code, ready to hand to the operating system. */
export function deepLinkFor(code: string): string {
  return `verse://look#look=${code}`;
}

/** The `verse://` form of a play request. */
export function playDeepLinkFor(trackId: string): string {
  return `verse://play?track=${encodeURIComponent(trackId)}`;
}

export function playlistDeepLinkFor(playlistId: string): string {
  return `verse://play?playlist=${encodeURIComponent(playlistId)}`;
}

export function albumDeepLinkFor(key: string): string {
  return `verse://play?album=${encodeURIComponent(key)}`;
}

export { invalidTrackIdError } from "./playLink";
