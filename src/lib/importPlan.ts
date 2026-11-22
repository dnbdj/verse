import {
  mergeLooks,
  mergePins,
  parseBundle,
  planPlaylists,
  resolveTrackIds,
  type ImportMode,
  type PlaylistPlan,
  type VerseBundle,
} from "./bundle";
import { themeMeta, type Appearance, type SavedLook } from "./theme";
import type { ServiceId } from "./services";
import type { Playlist, Track } from "./types";

/** The four independently-toggleable parts of a bundle. */
export type ImportSections = {
  playlists: boolean;
  looks: boolean;
  pins: boolean;
  appearance: boolean;
};

export const ALL_SECTIONS: ImportSections = {
  playlists: true,
  looks: true,
  pins: true,
  appearance: true,
};

export type PlaylistDiffStatus = "new" | "updated" | "kept" | "removed";

export type PlaylistDiff = {
  name: string;
  status: PlaylistDiffStatus;
  added: number;
  removed: number;
  kept: number;
};

export type TrackChange = {
  playlist: string;
  action: "added" | "removed";
  id: string;
  title: string;
  artist: string;
};

export type AppearanceChange = { label: string; from: string; to: string };

export type ImportPlan = {
  legacy: boolean;
  mode: ImportMode;
  playlists: PlaylistPlan;
  playlistDiffs: PlaylistDiff[];
  trackChanges: TrackChange[];
  trackChangesTruncated: boolean;
  skippedTracks: number;
  looks: { added: SavedLook[]; kept: number; removed: SavedLook[] };
  pins: { added: ServiceId[]; kept: ServiceId[]; removed: ServiceId[] };
  appearance: { replace: boolean; changes: AppearanceChange[] };
};

export type ImportState = {
  playlists: Playlist[];
  looks: SavedLook[];
  pinned: ServiceId[];
  prefs: Appearance;
};

const MAX_TRACK_CHANGES = 60;
const keyOf = (name: string) => name.trim().toLowerCase();

const appearanceFields: { label: string; read: (prefs: Appearance) => string }[] = [
  { label: "Theme", read: (prefs) => themeMeta(prefs.theme).name },
  { label: "Accent", read: (prefs) => prefs.accentHex ?? prefs.accent },
  {
    label: "Gradient",
    read: (prefs) =>
      prefs.gradient
        ? `${prefs.gradient.from} → ${prefs.gradient.via} → ${prefs.gradient.to}`
        : "Off",
  },
  { label: "Glass", read: (prefs) => prefs.glass },
  { label: "Backdrop blur", read: (prefs) => `${prefs.blur}px` },
  { label: "Colour bloom", read: (prefs) => `${prefs.glow}%` },
  { label: "Motion", read: (prefs) => (prefs.motion ? "On" : "Off") },
  { label: "Layout density", read: (prefs) => prefs.density },
  { label: "Tint from artwork", read: (prefs) => (prefs.artTint ? "On" : "Off") },
  { label: "Artwork glow", read: (prefs) => `${prefs.artGlow}%` },
  { label: "Sidebar", read: (prefs) => prefs.sidebar },
  { label: "Focus mode", read: (prefs) => (prefs.focus ? "On" : "Off") },
];

export function describeAppearanceChanges(
  current: Appearance,
  incoming: Appearance,
): AppearanceChange[] {
  const changes: AppearanceChange[] = [];
  for (const field of appearanceFields) {
    const from = field.read(current);
    const to = field.read(incoming);
    if (from !== to) changes.push({ label: field.label, from, to });
  }
  return changes;
}

/**
 * Works out everything an import would do without touching the live library. The
 * playlist plan carries resolved local ids, so apply does not need to resolve twice.
 */
export function planImport(
  bundle: VerseBundle,
  legacy: boolean,
  current: ImportState,
  tracks: Track[],
  mode: ImportMode,
): ImportPlan {
  const playlists: PlaylistPlan = legacy
    ? { deleteIds: [], create: [], append: [] }
    : planPlaylists(current.playlists, bundle.playlists, tracks, mode);

  const playlistDiffs: PlaylistDiff[] = [];
  const changes: TrackChange[] = [];
  let skipped = 0;

  const trackById = new Map(tracks.map((track) => [track.id, track]));
  const addChange = (playlist: string, action: "added" | "removed", id: string) => {
    const track = trackById.get(id);
    changes.push({
      playlist,
      action,
      id,
      title: track?.title ?? "Unknown track",
      artist: track?.artist ?? "",
    });
  };

  if (!legacy) {
    const currentByName = new Map(
      current.playlists.map((playlist) => [keyOf(playlist.name), playlist]),
    );
    const incomingNames = new Set(bundle.playlists.map((playlist) => keyOf(playlist.name)));

    for (const incoming of bundle.playlists) {
      const resolved = resolveTrackIds(incoming.tracks, tracks);
      skipped += Math.max(0, incoming.tracks.length - resolved.length);
      const existing = currentByName.get(keyOf(incoming.name));

      if (mode === "replace") {
        const oldIds = existing?.trackIds ?? [];
        const oldSet = new Set(oldIds);
        const newSet = new Set(resolved);
        const added = resolved.filter((id) => !oldSet.has(id));
        const removed = oldIds.filter((id) => !newSet.has(id));
        const kept = resolved.length - added.length;
        playlistDiffs.push({
          name: incoming.name,
          status: !existing ? "new" : added.length > 0 || removed.length > 0 ? "updated" : "kept",
          added: added.length,
          removed: removed.length,
          kept,
        });
        for (const id of added) addChange(incoming.name, "added", id);
        for (const id of removed) addChange(incoming.name, "removed", id);
        continue;
      }

      if (!existing) {
        playlistDiffs.push({
          name: incoming.name,
          status: "new",
          added: resolved.length,
          removed: 0,
          kept: 0,
        });
        for (const id of resolved) addChange(incoming.name, "added", id);
        continue;
      }

      const known = new Set(existing.trackIds);
      const missing = resolved.filter((id) => !known.has(id));
      playlistDiffs.push({
        name: incoming.name,
        status: missing.length > 0 ? "updated" : "kept",
        added: missing.length,
        removed: 0,
        kept: resolved.length - missing.length,
      });
      for (const id of missing) addChange(incoming.name, "added", id);
    }

    if (mode === "replace") {
      for (const old of current.playlists) {
        if (incomingNames.has(keyOf(old.name))) continue;
        playlistDiffs.push({
          name: old.name,
          status: "removed",
          added: 0,
          removed: old.trackIds.length,
          kept: 0,
        });
        for (const id of old.trackIds) addChange(old.name, "removed", id);
      }
    }
  }

  const currentLookIds = new Set(current.looks.map((look) => look.id));
  const incomingLookIds = new Set(bundle.looks.map((look) => look.id));
  const looks =
    mode === "replace"
      ? {
          added: bundle.looks.filter((look) => !currentLookIds.has(look.id)),
          kept: current.looks.filter((look) => incomingLookIds.has(look.id)).length,
          removed: current.looks.filter((look) => !incomingLookIds.has(look.id)),
        }
      : {
          added: bundle.looks.filter((look) => !currentLookIds.has(look.id)),
          kept: current.looks.length,
          removed: [],
        };

  const currentPins = new Set(current.pinned);
  const incomingPins = new Set(bundle.pinned);
  const pins =
    mode === "replace"
      ? {
          added: bundle.pinned.filter((id) => !currentPins.has(id)),
          kept: current.pinned.filter((id) => incomingPins.has(id)),
          removed: current.pinned.filter((id) => !incomingPins.has(id)),
        }
      : {
          added: bundle.pinned.filter((id) => !currentPins.has(id)),
          kept: [...current.pinned],
          removed: [],
        };

  return {
    legacy,
    mode,
    playlists,
    playlistDiffs,
    trackChanges: changes.slice(0, MAX_TRACK_CHANGES),
    trackChangesTruncated: changes.length > MAX_TRACK_CHANGES,
    skippedTracks: skipped,
    looks,
    pins,
    appearance: {
      replace: mode === "replace",
      changes: mode === "replace" ? describeAppearanceChanges(current.prefs, bundle.prefs) : [],
    },
  };
}

/** Resolves what the live state becomes, honouring the section toggles. */
export function applyImportSections(
  plan: ImportPlan,
  bundle: VerseBundle,
  current: ImportState,
  sections: ImportSections,
): { next: ImportState; applied: ImportSections } {
  const applied: ImportSections = {
    ...sections,
    // A legacy file has no playlist section, so that toggle can never do anything.
    playlists: sections.playlists && !plan.legacy,
  };

  const looks = applied.looks
    ? plan.mode === "replace"
      ? bundle.looks.map((look) => ({ ...look, appearance: { ...look.appearance } }))
      : mergeLooks(current.looks, bundle.looks)
    : current.looks;

  const pinned = applied.pins
    ? plan.mode === "replace"
      ? [...bundle.pinned]
      : mergePins(current.pinned, bundle.pinned)
    : current.pinned;

  const prefs =
    applied.appearance && plan.mode === "replace"
      ? {
          ...current.prefs,
          ...bundle.prefs,
          gradient: bundle.prefs.gradient ? { ...bundle.prefs.gradient } : null,
        }
      : current.prefs;

  return { next: { playlists: current.playlists, looks, pinned, prefs }, applied };
}

export type BundlePreview = {
  bundle: VerseBundle;
  legacy: boolean;
  plan: ImportPlan;
};

export type BundlePlanResult = { ok: true; preview: BundlePreview } | { ok: false; error: string };

/** Parses, verifies and plans in one step; every rejection happens before any change. */
export function planBundleText(
  text: string,
  current: ImportState,
  tracks: Track[],
  mode: ImportMode,
): BundlePlanResult {
  const parsed = parseBundle(text);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    preview: {
      bundle: parsed.bundle,
      legacy: parsed.legacy,
      plan: planImport(parsed.bundle, parsed.legacy, current, tracks, mode),
    },
  };
}

/** What the Settings view reports after an import attempt. */
export type BundleImportReport =
  | {
      ok: true;
      mode: ImportMode;
      legacy: boolean;
      sections: ImportSections;
      looks: number;
      pinned: number;
      playlists: number;
      removedPlaylists: number;
    }
  | { ok: false; error: string };
