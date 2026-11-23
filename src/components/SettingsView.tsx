import pkg from "../../package.json";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { api } from "../lib/api";
import { bundleFileName, type ImportMode } from "../lib/bundle";
import {
  ALL_SECTIONS,
  type BundleImportReport,
  type BundlePreview,
  type ImportSections,
} from "../lib/importPlan";
import { deepLinkFor } from "../lib/deepLink";
import { insideTauri } from "../lib/platform";
import { SERVICES, type ServiceId } from "../lib/services";
import { STARTER_LOOKS, decodeLook, encodeLook, lookLink } from "../lib/share";
import {
  ACCENTS,
  ART_GLOW_RANGE,
  BLUR_RANGE,
  GLASS_LEVELS,
  GLOW_RANGE,
  GRADIENT_PRESETS,
  THEMES,
  gradientCss,
  randomGradient,
  sameGradient,
  type Appearance,
  type Gradient,
  type SavedLook,
} from "../lib/theme";
import {
  CheckIcon,
  ChevronIcon,
  CloseIcon,
  CopyIcon,
  DiceIcon,
  DownloadIcon,
  FolderIcon,
  LockIcon,
  MusicIcon,
  PaletteIcon,
  PinIcon,
  TrashIcon,
  VolumeIcon,
} from "./icons";
import { LookQr } from "./LookQr";
import { VersionHistory } from "./VersionHistory";

type Props = {
  appearance: Appearance;
  /** Leaves Settings; the appearance panel is the theme picker, so it needs a close path. */
  onDone: () => void;
  /** Emits only the changed keys, so two clicks in one tick cannot overwrite each other. */
  onChange: (patch: Partial<Appearance>) => void;
  onReset: () => void;
  onSaveLook: (name: string) => void;
  onDeleteLook: (id: string) => void;
  onApplyLook: (look: Appearance) => void;
  tracks: number;
  albums: number;
  artists: number;
  folders: number;
  pinned: ServiceId[];
  /** Pins or unpins a streaming service for the sidebar and Alt+1…9. */
  onTogglePin: (id: ServiceId) => void;
  savedLooks: SavedLook[];
  /** Builds the JSON bundle text; the file write stays here so App keeps no IO. */
  onExportBundle: () => string;
  /** Parses and plans a bundle without touching state; rejects before anything changes. */
  onPlanBundle: (text: string, mode: ImportMode) =>
    | { ok: true; preview: BundlePreview }
    | { ok: false; error: string };
  /** Applies the reviewed plan, restricted to the checked sections. */
  onApplyBundle: (preview: BundlePreview, sections: ImportSections) => Promise<BundleImportReport>;
};

const SECTION_LABELS: { key: keyof ImportSections; label: string }[] = [
  { key: "playlists", label: "playlists" },
  { key: "looks", label: "saved looks" },
  { key: "pins", label: "pinned services" },
  { key: "appearance", label: "appearance" },
];

/** Settings opens on a tile board and each tile is one of these pages. */
type ModuleId = "personalisation" | "services" | "versions" | "backup" | "library";

const MODULES: { id: ModuleId; label: string; note: string }[] = [
  {
    id: "personalisation",
    label: "Personalisation",
    note: "Themes, wallpaper gradient, accent colour, motion and saved looks",
  },
  {
    id: "services",
    label: "Streaming services",
    note: "Pin services for the sidebar and the Alt+1…9 shortcuts",
  },
  {
    id: "versions",
    label: "Versions",
    note: "Changelog, previous releases and the build you are running",
  },
  {
    id: "backup",
    label: "Backup & transfer",
    note: "Move playlists, looks, pins and appearance between devices",
  },
  {
    id: "library",
    label: "Library",
    note: "Songs, albums, artists and the folders Verse watches",
  },
];

/** Tiles that are visible on the board but have nothing behind them yet. */
const SOON: { id: string; label: string; note: string }[] = [
  { id: "playback", label: "Playback", note: "Equaliser, crossfade and gapless playback" },
  { id: "storage", label: "Storage", note: "Cache limits, offline copies and cleanup" },
  { id: "privacy", label: "Privacy", note: "What leaves this device, and when" },
];

function ModuleIcon({ id }: { id: ModuleId }) {
  switch (id) {
    case "personalisation":
      return <PaletteIcon size={17} />;
    case "services":
      return <MusicIcon size={17} />;
    case "versions":
      return <DownloadIcon size={17} />;
    case "backup":
      return <CopyIcon size={17} />;
    case "library":
      return <FolderIcon size={17} />;
  }
}

function SoonIcon({ id }: { id: string }) {
  if (id === "playback") return <VolumeIcon size={17} />;
  if (id === "storage") return <FolderIcon size={17} />;
  return <LockIcon size={17} />;
}

const pct = (value: number, min: number, max: number) =>
  `${((value - min) / (max - min)) * 100}%`;

const accentColour = (appearance: Appearance): string =>
  appearance.accentHex ??
  ACCENTS.find((accent) => accent.id === appearance.accent)?.color ??
  "#0a84ff";

function HexField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    const match = draft.trim().match(/^#?([0-9a-f]{6})$/i);
    if (!match) {
      setDraft(value);
      return;
    }
    const next = `#${match[1].toLowerCase()}`;
    setDraft(next);
    if (next !== value) onCommit(next);
  };

  return (
    <input
      className="color-hex"
      value={draft}
      maxLength={7}
      spellCheck={false}
      aria-label={`${label} hex colour`}
      title={`${label} colour, for example ${value}`}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function ImportSection({
  label,
  summary,
  on,
  disabled,
  note,
  onToggle,
}: {
  label: string;
  summary: string;
  on: boolean;
  disabled?: boolean;
  note?: string;
  onToggle: () => void;
}) {
  return (
    <div className="import-section" data-off={!on}>
      <button
        className="toggle"
        role="switch"
        aria-checked={on}
        aria-label={`Import ${label}`}
        data-on={on}
        disabled={disabled}
        onClick={onToggle}
      >
        <span className="toggle-thumb" />
      </button>
      <div className="import-section-text">
        <span className="setting-title">{label}</span>
        <span className="import-count">{summary}</span>
      </div>
      {disabled && <span className="import-note">{note}</span>}
    </div>
  );
}

export function SettingsView({
  appearance,
  onDone,
  onChange,
  onReset,
  onSaveLook,
  onDeleteLook,
  onApplyLook,
  tracks,
  albums,
  artists,
  folders,
  pinned,
  onTogglePin,
  savedLooks,
  onExportBundle,
  onPlanBundle,
  onApplyBundle,
}: Props) {
  const [module, setModule] = useState<ModuleId | null>(null);
  const [lookName, setLookName] = useState("");
  const [importCode, setImportCode] = useState("");
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [sharedId, setSharedId] = useState<string | null>(null);
  const [bundleNote, setBundleNote] = useState<string | null>(null);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("replace");
  const [preview, setPreview] = useState<BundlePreview | null>(null);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [sections, setSections] = useState<ImportSections>(ALL_SECTIONS);
  const bundleInput = useRef<HTMLInputElement | null>(null);

  const set = (patch: Partial<Appearance>) => onChange(patch);
  const gradient = appearance.gradient;

  const patchGradient = (next: Partial<Gradient>) => {
    if (!gradient) return;
    set({ gradient: { ...gradient, ...next } });
  };

  const copyLook = () => {
    const code = encodeLook(appearance);
    setImportCode(code);
    setShareError(null);
    setShareNote("Look code ready — it is selected below, copy with Ctrl/Cmd+C.");
    void navigator.clipboard?.writeText(code).catch(() => undefined);
  };

  const applyCode = () => {
    const parsed = decodeLook(importCode);
    if (!parsed.ok) {
      setShareError(parsed.error);
      setShareNote(null);
      return;
    }
    set(parsed.look);
    setShareError(null);
    setShareNote("Look applied and saved.");
  };

  const sharedLook = savedLooks.find((entry) => entry.id === sharedId) ?? null;
  const shareOrigin =
    typeof window === "undefined" ? "" : window.location.origin + window.location.pathname;
  const sharedLink = sharedLook
    ? lookLink(encodeLook(sharedLook.appearance), shareOrigin)
    : "";

  const copyLookLink = (look: SavedLook) => {
    const link = lookLink(encodeLook(look.appearance), shareOrigin);
    void navigator.clipboard?.writeText(link).catch(() => undefined);
    setShareError(null);
    setShareNote("Link copied — opening it applies this look.");
  };

  const planText = (text: string, mode: ImportMode) => {
    const result = onPlanBundle(text, mode);
    if (!result.ok) {
      setBundleError(result.error);
      setBundleNote(null);
      setPreview(null);
      setPendingText(null);
      return;
    }
    setBundleError(null);
    setBundleNote(null);
    setPendingText(text);
    setPreview(result.preview);
    setSections({ ...ALL_SECTIONS, playlists: !result.preview.legacy });
  };

  const receiveBundle = (text: string) => planText(text, importMode);

  const changeMode = (mode: ImportMode) => {
    setImportMode(mode);
    if (pendingText) planText(pendingText, mode);
  };

  const cancelPreview = () => {
    setPreview(null);
    setPendingText(null);
    setBundleError(null);
    setBundleNote(null);
  };

  const applyPreview = async () => {
    if (!preview) return;
    const result = await onApplyBundle(preview, sections);
    if (!result.ok) {
      setBundleError(result.error);
      return;
    }
    setBundleError(null);
    const applied = SECTION_LABELS.filter((entry) => result.sections[entry.key])
      .map((entry) => entry.label)
      .join(", ");
    setBundleNote(
      result.legacy
        ? `Imported legacy v1 file: ${result.looks} saved look${
            result.looks === 1 ? "" : "s"
          } and ${result.pinned} pin${result.pinned === 1 ? "" : "s"}. Playlists were left unchanged.`
        : `${result.mode === "replace" ? "Replaced" : "Merged"} ${applied || "nothing"}: ${
            result.looks
          } saved look${result.looks === 1 ? "" : "s"}, ${result.pinned} pin${
            result.pinned === 1 ? "" : "s"
          }, ${result.playlists} playlist change${result.playlists === 1 ? "" : "s"}${
            result.removedPlaylists > 0
              ? `, ${result.removedPlaylists} playlist${result.removedPlaylists === 1 ? "" : "s"} removed`
              : ""
          }.`,
    );
    setPreview(null);
    setPendingText(null);
  };

  const exportBundle = async () => {
    const text = onExportBundle();
    const name = bundleFileName();

    if (insideTauri()) {
      try {
        const saved = await api.saveBundle(text, name);
        if (!saved) return;
        setBundleError(null);
        setBundleNote(`Saved to ${saved}`);
      } catch (error) {
        setBundleError(`Could not save the bundle: ${String(error)}`);
      }
      return;
    }

    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    setBundleError(null);
    setBundleNote(`Downloaded ${name}`);
  };

  const importBundle = async () => {
    if (!insideTauri()) {
      bundleInput.current?.click();
      return;
    }
    try {
      const text = await api.openBundle();
      if (text !== null) await receiveBundle(text);
    } catch (error) {
      setBundleError(`Could not read that file: ${String(error)}`);
    }
  };

  const saveCurrent = () => {
    const name = lookName.trim();
    onSaveLook(name || "My look");
    setLookName("");
    setShareNote(`Saved “${name || "My look"}” to your presets.`);
    setShareError(null);
  };

  const anySection = Object.values(sections).some(Boolean);
  const planAdded = preview
    ? preview.plan.playlistDiffs.reduce((sum, diff) => sum + diff.added, 0)
    : 0;
  const planRemoved = preview
    ? preview.plan.playlistDiffs.reduce((sum, diff) => sum + diff.removed, 0)
    : 0;

  return (
    <div className="settings">
      <div className="settings-top">
        <div className="settings-top-left">
          {module !== null && (
            <button className="settings-back" onClick={() => setModule(null)}>
              <ChevronIcon dir="left" size={14} />
              Settings
            </button>
          )}
          <span className="settings-top-note">
            {module ? MODULES.find((entry) => entry.id === module)?.label : "Changes save as you go"}
          </span>
        </div>
        <button className="btn btn-quiet" onClick={onDone}>
          Done
        </button>
      </div>

      {module === null && (
        <div className="settings-home">
          <div className="settings-home-head">
            <h2 className="settings-home-title">Modules</h2>
            <p className="settings-home-sub">
              Everything is grouped into a module. Open one to change it — more are on the way.
            </p>
          </div>
          <div className="settings-grid">
            {MODULES.map((entry) => (
              <button
                key={entry.id}
                className="settings-tile"
                onClick={() => setModule(entry.id)}
              >
                <span className="settings-tile-icon">
                  <ModuleIcon id={entry.id} />
                </span>
                <span className="settings-tile-text">
                  <span className="settings-tile-title">{entry.label}</span>
                  <span className="settings-tile-note">{entry.note}</span>
                </span>
                <ChevronIcon dir="right" size={15} />
              </button>
            ))}
            {SOON.map((entry) => (
              <div className="settings-tile" data-soon="true" key={entry.id}>
                <span className="settings-tile-icon">
                  <SoonIcon id={entry.id} />
                </span>
                <span className="settings-tile-text">
                  <span className="settings-tile-title">{entry.label}</span>
                  <span className="settings-tile-note">{entry.note}</span>
                </span>
                <span className="settings-soon">Coming soon</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {module === "personalisation" && (
        <>
      <section className="settings-group">
        <div className="settings-head">
          <div className="settings-head-title">Appearance</div>
          <div className="settings-head-sub">
            Soft, layered glass with rounded corners — the whole window is tinted from a single
            palette, so panels, sliders and lyrics move together.
          </div>
        </div>
        <div className="settings-block">
          <div className="theme-grid">
            {THEMES.map((theme) => {
              const active = appearance.theme === theme.id;
              return (
                <button
                  key={theme.id}
                  className="theme-card"
                  data-active={active}
                  aria-pressed={active}
                  onClick={() => set({ theme: theme.id })}
                >
                  <span
                    className="theme-swatch"
                    data-scheme={theme.scheme}
                    style={{ backgroundImage: theme.preview }}
                  >
                    <span className="theme-swatch-pane" />
                    <span className="theme-swatch-pill" />
                  </span>
                  <span className="theme-card-text">
                    <span className="theme-card-name">
                      {theme.name}
                      {active && <CheckIcon size={13} />}
                    </span>
                    <span className="theme-card-note">{theme.note}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="settings-group">
        <div className="settings-head">
          <div className="settings-head-title">Wallpaper gradient</div>
          <div className="settings-head-sub">
            A wash of colour behind the glass. Presets set a matching accent; the sliders let you
            build your own and the window repaints as you drag.
          </div>
        </div>
        <div className="settings-block">
          <div className="gradient-studio">
            <div
              className="grad-preview"
              data-on={Boolean(gradient)}
              style={gradient ? { backgroundImage: gradientCss(gradient) } : undefined}
            >
              <span className="grad-preview-pane" />
              <span className="grad-preview-pill" />
              {!gradient && <span className="grad-preview-empty">Blobs only</span>}
            </div>

            <div className="grad-controls">
              <div className="preset-row" role="group" aria-label="Gradient presets">
                {GRADIENT_PRESETS.map((preset) => {
                  const active = Boolean(gradient && sameGradient(gradient, preset.gradient));
                  return (
                    <button
                      key={preset.id}
                      className="preset-chip"
                      title={`${preset.name} · ${preset.gradient.angle}°`}
                      aria-label={preset.name}
                      aria-pressed={active}
                      data-active={active}
                      onClick={() =>
                        set({
                          gradient: { ...preset.gradient },
                          accent: preset.accent,
                          accentHex: null,
                        })
                      }
                    >
                      <span
                        className="preset-chip-swatch"
                        style={{ backgroundImage: gradientCss(preset.gradient) }}
                      />
                      <span className="preset-chip-name">{preset.name}</span>
                    </button>
                  );
                })}
                {savedLooks.map((look) => (
                  <button
                    key={`preset-${look.id}`}
                    className="preset-chip preset-chip-saved"
                    title={`${look.name} · saved`}
                    aria-label={`Saved look ${look.name}`}
                    onClick={() => onApplyLook(look.appearance)}
                  >
                    <span
                      className="preset-chip-swatch"
                      style={{
                        backgroundImage: look.appearance.gradient
                          ? gradientCss(look.appearance.gradient)
                          : `linear-gradient(135deg, ${accentColour(look.appearance)}, #1b1b1f)`,
                      }}
                    />
                    <span className="preset-chip-name">{look.name}</span>
                  </button>
                ))}
                {gradient &&
                  !GRADIENT_PRESETS.some((preset) => sameGradient(gradient, preset.gradient)) && (
                    <span className="preset-current">Custom gradient</span>
                  )}
                <button
                  className="btn btn-quiet"
                  onClick={() =>
                    set({ gradient: randomGradient(), accent: "custom", accentHex: null })
                  }
                >
                  <DiceIcon size={13} />
                  Surprise me
                </button>
                <button
                  className="btn btn-quiet"
                  data-active={!gradient}
                  onClick={() => set({ gradient: null })}
                >
                  Off
                </button>
              </div>

              {gradient && (
                <>
                  <div className="grad-colors">
                    <label className="color-field">
                      <span>Start</span>
                      <input
                        type="color"
                        value={gradient.from}
                        onChange={(event) => patchGradient({ from: event.target.value })}
                      />
                      <HexField
                        label="Start"
                        value={gradient.from}
                        onCommit={(from) => patchGradient({ from })}
                      />
                    </label>
                    {gradient.via ? (
                      <label className="color-field">
                        <span>Mid</span>
                        <input
                          type="color"
                          value={gradient.via}
                          onChange={(event) => patchGradient({ via: event.target.value })}
                        />
                        <HexField
                          label="Mid"
                          value={gradient.via}
                          onCommit={(via) => patchGradient({ via })}
                        />
                        <button
                          className="color-field-x"
                          title="Remove the mid stop"
                          onClick={() => patchGradient({ via: null })}
                        >
                          <CloseIcon size={11} />
                        </button>
                      </label>
                    ) : (
                      <button
                        className="btn btn-quiet"
                        onClick={() => patchGradient({ via: gradient.to })}
                      >
                        + Mid stop
                      </button>
                    )}
                    <label className="color-field">
                      <span>End</span>
                      <input
                        type="color"
                        value={gradient.to}
                        onChange={(event) => patchGradient({ to: event.target.value })}
                      />
                      <HexField
                        label="End"
                        value={gradient.to}
                        onCommit={(to) => patchGradient({ to })}
                      />
                    </label>
                  </div>

                  <div className="range-field">
                    <span className="range-label">Angle</span>
                    <input
                      type="range"
                      min={0}
                      max={360}
                      step={5}
                      value={gradient.angle}
                      style={{ "--p": `${(gradient.angle / 360) * 100}%` } as CSSProperties}
                      onChange={(event) => patchGradient({ angle: Number(event.target.value) })}
                      aria-label="Gradient angle"
                    />
                    <span className="range-value">{gradient.angle}°</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="settings-group">
        <div className="settings-head">
          <div className="settings-head-title">Share &amp; saved looks</div>
          <div className="settings-head-sub">
            One code carries the theme, gradient, accent, blur, bloom, motion and density. Saved
            looks stay on this device and join the presets above.
          </div>
        </div>
        <div className="settings-block share-studio">
          <div className="share-row">
            <input
              className="share-input"
              value={importCode}
              onChange={(event) => {
                setImportCode(event.target.value);
                setShareError(null);
              }}
              placeholder="VRS1.… paste a look code"
              spellCheck={false}
              aria-label="Look code"
            />
            <button className="btn btn-quiet" onClick={copyLook} title="Copy this look as a code">
              <CopyIcon size={13} />
              Copy my look
            </button>
            <button className="btn btn-primary" disabled={!importCode.trim()} onClick={applyCode}>
              Apply code
            </button>
          </div>

          <div className="share-row">
            <input
              className="share-input"
              value={lookName}
              onChange={(event) => setLookName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") saveCurrent();
              }}
              placeholder="Name this look…"
              maxLength={40}
              aria-label="Look name"
            />
            <button className="btn btn-quiet" onClick={saveCurrent}>
              <CheckIcon size={13} />
              Save current look
            </button>
          </div>

          {(shareNote || shareError) && (
            <div className="share-note" data-error={Boolean(shareError)}>
              {shareError ?? shareNote}
            </div>
          )}

          {savedLooks.length > 0 ? (
            <div className="look-list">
              {savedLooks.map((look) => (
                <div className="look-chip" key={look.id}>
                  <span
                    className="look-dot"
                    style={{
                      backgroundImage: look.appearance.gradient
                        ? gradientCss(look.appearance.gradient)
                        : `linear-gradient(135deg, ${accentColour(look.appearance)}, #1b1b1f)`,
                    }}
                  />
                  <button
                    className="look-name"
                    title="Apply this look"
                    onClick={() => onApplyLook(look.appearance)}
                  >
                    {look.name}
                  </button>
                  <button
                    className="btn-icon"
                    title={`Share ${look.name}`}
                    aria-label={`Share ${look.name}`}
                    onClick={() => setSharedId(sharedId === look.id ? null : look.id)}
                  >
                    <CopyIcon size={12} />
                  </button>
                  <button
                    className="btn-icon"
                    title={`Delete ${look.name}`}
                    onClick={() => onDeleteLook(look.id)}
                  >
                    <TrashIcon size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="share-empty">No saved looks yet — build one above and save it.</div>
          )}

          {sharedLook && (
            <div className="share-link-panel">
              <div className="share-row">
                <input
                  className="share-input"
                  readOnly
                  value={sharedLink}
                  aria-label={`Link for ${sharedLook.name}`}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <button className="btn btn-quiet" onClick={() => copyLookLink(sharedLook)}>
                  <CopyIcon size={13} />
                  Copy link
                </button>
              </div>
              <LookQr link={sharedLink} label={`QR code that opens ${sharedLook.name}`} />
              <div className="share-row">
                <input
                  className="share-input"
                  readOnly
                  value={deepLinkFor(encodeLook(sharedLook.appearance))}
                  aria-label={`Desktop app link for ${sharedLook.name}`}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <button
                  className="btn btn-quiet"
                  onClick={() => {
                    void navigator.clipboard
                      ?.writeText(deepLinkFor(encodeLook(sharedLook.appearance)))
                      .catch(() => undefined);
                    setShareError(null);
                    setShareNote("Desktop link copied — it opens the installed app with this look.");
                  }}
                >
                  <CopyIcon size={13} />
                  Copy app link
                </button>
              </div>
              <div className="share-empty">
                Opening or scanning the link applies {sharedLook.name} to the window. The app link
                opens the installed desktop build; the web link needs a browser or a hosted
                redirect, since a plain https address cannot be registered to the app.
              </div>
            </div>
          )}
        </div>
      </section>
        </>
      )}

      {module === "backup" && (
      <section className="settings-group">
        <div className="settings-head">
          <div className="settings-head-title">Backup &amp; transfer</div>
          <div className="settings-head-sub">
            One checksummed JSON file carries your playlists with their track order, saved looks,
            pinned services in order, and appearance preferences. Choose Replace or Merge before
            importing. An import is all-or-nothing — a damaged or mismatched file is refused and
            nothing is overwritten.
          </div>
        </div>
        <div className="settings-block share-studio">
          <div className="bundle-row">
            <button className="btn btn-quiet" onClick={() => void exportBundle()}>
              Export bundle
            </button>
            <div className="segmented" role="group" aria-label="Import mode">
              <button
                className="segment"
                data-active={importMode === "replace"}
                onClick={() => changeMode("replace")}
              >
                Replace
              </button>
              <button
                className="segment"
                data-active={importMode === "merge"}
                onClick={() => changeMode("merge")}
              >
                Merge
              </button>
            </div>
            <button className="btn btn-quiet" onClick={() => void importBundle()}>
              Import bundle
            </button>
            <span className="share-empty">
              {savedLooks.length} look{savedLooks.length === 1 ? "" : "s"} · {pinned.length}{" "}
              pinned · checksummed v2
            </span>
          </div>
          <div className="share-empty">
            Replace makes the file authoritative for playlists, looks, pins and appearance.
            Merge keeps what you have: matching playlists get the file&apos;s missing tracks
            appended, new looks and pins are added, and your appearance and pin order stay put.
            Files without a valid checksum are refused before anything changes. A legacy v1 file
            imports looks, pins and appearance only and leaves playlists alone.
          </div>
          <input
            ref={bundleInput}
            type="file"
            accept="application/json,.json"
            hidden
            aria-label="Bundle file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void file
                .text()
                .then(receiveBundle)
                .catch((error: unknown) =>
                  setBundleError(`Could not read that file: ${String(error)}`),
                );
            }}
          />
          {(bundleNote || bundleError) && (
            <div className="share-note" data-error={Boolean(bundleError)}>
              {bundleError ?? bundleNote}
            </div>
          )}

          {preview && (
            <div className="import-preview" aria-label="Import preview">
              <div className="import-preview-head">
                <div>
                  <div className="import-title">Review this bundle</div>
                  <div className="share-empty">
                    {preview.bundle.exportedAt
                      ? `Exported ${new Date(preview.bundle.exportedAt).toLocaleString()}`
                      : "No export date"}{" "}
                    · {preview.legacy ? "legacy v1" : "v2 checksum verified"} ·{" "}
                    {importMode === "replace" ? "Replace" : "Merge"} · nothing applied yet
                  </div>
                </div>
                <button
                  className="btn-icon"
                  aria-label="Close import preview"
                  onClick={cancelPreview}
                >
                  <CloseIcon size={14} />
                </button>
              </div>

              <div className="import-sections">
                <ImportSection
                  label="Playlists"
                  on={sections.playlists}
                  disabled={preview.legacy}
                  note="v1 keeps your playlists"
                  onToggle={() =>
                    setSections((prev) => ({ ...prev, playlists: !prev.playlists }))
                  }
                  summary={
                    preview.legacy
                      ? "No playlist section in a v1 file"
                      : `${preview.plan.playlistDiffs.length} playlist${preview.plan.playlistDiffs.length === 1 ? "" : "s"} · +${planAdded} −${planRemoved} tracks`
                  }
                />
                <ImportSection
                  label="Saved looks"
                  on={sections.looks}
                  onToggle={() => setSections((prev) => ({ ...prev, looks: !prev.looks }))}
                  summary={`${preview.plan.looks.added.length} added · ${preview.plan.looks.kept} kept${
                    preview.plan.looks.removed.length > 0
                      ? ` · ${preview.plan.looks.removed.length} removed`
                      : ""
                  }`}
                />
                <ImportSection
                  label="Pinned services"
                  on={sections.pins}
                  onToggle={() => setSections((prev) => ({ ...prev, pins: !prev.pins }))}
                  summary={`${preview.plan.pins.added.length} added · ${
                    preview.plan.pins.kept.length
                  } kept${
                    preview.plan.pins.removed.length > 0
                      ? ` · ${preview.plan.pins.removed.length} removed`
                      : ""
                  }`}
                />
                <ImportSection
                  label="Appearance"
                  on={sections.appearance}
                  onToggle={() =>
                    setSections((prev) => ({ ...prev, appearance: !prev.appearance }))
                  }
                  summary={
                    preview.plan.appearance.replace
                      ? `${preview.plan.appearance.changes.length} field${
                          preview.plan.appearance.changes.length === 1 ? "" : "s"
                        } change`
                      : "Merge keeps your appearance"
                  }
                />
              </div>

              {sections.playlists && !preview.legacy && (
                <div className="import-diff">
                  <div className="import-diff-title">Playlist changes</div>
                  {preview.plan.playlistDiffs.map((diff) => (
                    <div className="import-diff-row" data-status={diff.status} key={diff.name}>
                      <span className="import-diff-name">{diff.name}</span>
                      <span className="import-diff-meta">
                        {diff.status === "new"
                          ? "new playlist"
                          : diff.status === "removed"
                            ? "removed"
                            : diff.status === "kept"
                              ? "unchanged"
                              : "updated"}{" "}
                        {diff.added > 0 && <b className="import-add">+{diff.added}</b>}
                        {diff.removed > 0 && <b className="import-sub">−{diff.removed}</b>}
                        {diff.kept > 0 && <span className="import-keep">{diff.kept} kept</span>}
                      </span>
                    </div>
                  ))}
                  {preview.plan.trackChanges.length > 0 ? (
                    <div className="import-track-list">
                      {preview.plan.trackChanges.slice(0, 12).map((change, index) => (
                        <div
                          className="import-track"
                          data-action={change.action}
                          key={`${change.playlist}:${change.id}:${change.action}:${index}`}
                        >
                          <span className="import-sign">
                            {change.action === "added" ? "+" : "−"}
                          </span>
                          <span className="import-track-title">{change.title}</span>
                          <span className="import-artist">{change.artist}</span>
                          <span className="import-which">{change.playlist}</span>
                        </div>
                      ))}
                      {(preview.plan.trackChanges.length > 12 ||
                        preview.plan.trackChangesTruncated) && (
                        <div className="share-empty">More track changes are not shown.</div>
                      )}
                    </div>
                  ) : (
                    <div className="share-empty">No track changes.</div>
                  )}
                  {preview.plan.skippedTracks > 0 && (
                    <div className="share-empty">
                      {preview.plan.skippedTracks} track reference
                      {preview.plan.skippedTracks === 1 ? "" : "s"} not in this library will be
                      skipped.
                    </div>
                  )}
                </div>
              )}

              {sections.looks && preview.plan.looks.added.length > 0 && (
                <div className="import-diff">
                  <div className="import-diff-title">Looks added</div>
                  <div className="import-tags">
                    {preview.plan.looks.added.map((look) => (
                      <span className="import-tag" key={look.id}>
                        {look.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {sections.appearance && preview.plan.appearance.changes.length > 0 && (
                <div className="import-diff">
                  <div className="import-diff-title">Appearance changes</div>
                  {preview.plan.appearance.changes.map((change) => (
                    <div className="import-diff-row" key={change.label}>
                      <span className="import-diff-name">{change.label}</span>
                      <span className="import-diff-meta">
                        {change.from} → {change.to}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="import-actions">
                <button
                  className="btn btn-primary"
                  disabled={!anySection}
                  onClick={() => void applyPreview()}
                >
                  Apply import
                </button>
                <button className="btn" onClick={cancelPreview}>
                  Cancel
                </button>
                <span className="share-empty">
                  {anySection ? "Only checked sections change." : "Choose at least one section."}
                </span>
              </div>
            </div>
          )}
        </div>
      </section>
      )}

      {module === "personalisation" && (
        <>
      <section className="settings-group">
        <div className="settings-head">
          <div className="settings-head-title">Starter pack</div>
          <div className="settings-head-sub">
            Four finished looks. One click applies the whole palette — save it afterwards if you
            want to keep it.
          </div>
        </div>
        <div className="settings-block">
          <div className="starter-grid">
            {STARTER_LOOKS.map((item) => {
              const look = { ...appearance, ...item.look };
              return (
                <button
                  key={item.id}
                  className="starter-card"
                  onClick={() => onApplyLook(look)}
                >
                  <span
                    className="starter-swatch"
                    style={{
                      backgroundImage: item.look.gradient
                        ? gradientCss(item.look.gradient)
                        : `linear-gradient(135deg, ${accentColour(look)}, #1b1b1f)`,
                    }}
                  />
                  <span className="starter-name">{item.name}</span>
                  <span className="starter-note">{item.note}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="settings-group">
        <div className="settings-row">
          <div className="settings-label">
            <div className="setting-title">Accent colour</div>
            <div className="setting-sub">
              Tints buttons, sliders, active rows and highlights. The last swatch is any colour you
              like.
            </div>
          </div>
          <div className="swatches">
            {ACCENTS.map((accent) => {
              const active = appearance.accent === accent.id;
              return (
                <button
                  key={accent.id}
                  className="swatch"
                  style={{ background: accent.color }}
                  data-active={active}
                  aria-pressed={active}
                  aria-label={accent.name}
                  title={accent.name}
                  onClick={() => set({ accent: accent.id, accentHex: null })}
                >
                  <span className="swatch-check">
                    <CheckIcon size={12} />
                  </span>
                </button>
              );
            })}
            <label
              className="swatch swatch-custom"
              data-active={appearance.accent === "custom"}
              title="Custom colour"
            >
              <span className="swatch-rainbow" />
              <input
                type="color"
                value={appearance.accentHex ?? "#0a84ff"}
                aria-label="Custom accent colour"
                onChange={(event) => set({ accent: "custom", accentHex: event.target.value })}
              />
              <span className="swatch-check">
                <CheckIcon size={12} />
              </span>
            </label>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-label">
            <div className="setting-title">Transparency</div>
            <div className="setting-sub">
              {GLASS_LEVELS.find((level) => level.id === appearance.glass)?.note}
            </div>
          </div>
          <div className="segmented" role="group" aria-label="Transparency">
            {GLASS_LEVELS.map((level) => (
              <button
                key={level.id}
                className="segment"
                data-active={appearance.glass === level.id}
                onClick={() => set({ glass: level.id })}
              >
                {level.name}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-label">
            <div className="setting-title">Backdrop blur</div>
            <div className="setting-sub">How strongly the glass smears what is behind it.</div>
          </div>
          <div className="range-field">
            <input
              type="range"
              min={BLUR_RANGE.min}
              max={BLUR_RANGE.max}
              step={1}
              value={appearance.blur}
              style={
                { "--p": pct(appearance.blur, BLUR_RANGE.min, BLUR_RANGE.max) } as CSSProperties
              }
              onChange={(event) => set({ blur: Number(event.target.value) })}
              aria-label="Backdrop blur"
            />
            <span className="range-value">{appearance.blur}px</span>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-label">
            <div className="setting-title">Colour bloom</div>
            <div className="setting-sub">
              How much of the drifting colour shows behind the panels.
            </div>
          </div>
          <div className="range-field">
            <input
              type="range"
              min={GLOW_RANGE.min}
              max={GLOW_RANGE.max}
              step={1}
              value={appearance.glow}
              style={{ "--p": pct(appearance.glow, GLOW_RANGE.min, GLOW_RANGE.max) } as CSSProperties}
              onChange={(event) => set({ glow: Number(event.target.value) })}
              aria-label="Colour bloom"
            />
            <span className="range-value">{appearance.glow}%</span>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-label">
            <div className="setting-title">Tint from cover art</div>
            <div className="setting-sub">
              Samples the playing artwork and blends its strongest colour into the glass. Neutral
              grey when a cover has no colour to give.
            </div>
          </div>
          <button
            className="toggle"
            role="switch"
            aria-checked={appearance.artTint}
            aria-label="Tint from cover art"
            data-on={appearance.artTint}
            onClick={() => set({ artTint: !appearance.artTint })}
          >
            <span className="toggle-thumb" />
          </button>
        </div>

                  <div className="settings-row">
            <div className="settings-label">
              <div className="setting-title">Artwork glow intensity</div>
              <div className="setting-sub">
                How strongly the playing cover lights the sidebar and player bar. The accent
                colour itself is contrast-guarded for the current theme.
              </div>
            </div>
            <div className="range-field">
              <input
                type="range"
                min={ART_GLOW_RANGE.min}
                max={ART_GLOW_RANGE.max}
                step={1}
                value={appearance.artGlow}
                disabled={!appearance.artTint}
                style={
                  {
                    "--p": pct(appearance.artGlow, ART_GLOW_RANGE.min, ART_GLOW_RANGE.max),
                  } as CSSProperties
                }
                onChange={(event) => set({ artGlow: Number(event.target.value) })}
                aria-label="Artwork glow intensity"
              />
              <span className="range-value">{appearance.artGlow}%</span>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label">
              <div className="setting-title">Motion</div>
            <div className="setting-sub">Drifting colour, hovers and panel transitions.</div>
          </div>
          <button
            className="toggle"
            role="switch"
            aria-checked={appearance.motion}
            aria-label="Motion"
            data-on={appearance.motion}
            onClick={() => set({ motion: !appearance.motion })}
          >
            <span className="toggle-thumb" />
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-label">
            <div className="setting-title">Layout density</div>
            <div className="setting-sub">Compact fits more rows on a laptop screen.</div>
          </div>
          <div className="segmented" role="group" aria-label="Layout density">
            <button
              className="segment"
              data-active={appearance.density === "cozy"}
              onClick={() => set({ density: "cozy" })}
            >
              Cozy
            </button>
            <button
              className="segment"
              data-active={appearance.density === "compact"}
              onClick={() => set({ density: "compact" })}
            >
              Compact
            </button>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-label">
            <div className="setting-title">Sidebar</div>
            <div className="setting-sub">
              Hide it for more room; the show-sidebar button stays available. Persisted.
            </div>
          </div>
          <div className="segmented" role="group" aria-label="Sidebar">
            <button
              className="segment"
              data-active={appearance.sidebar === "full"}
              onClick={() => set({ sidebar: "full" })}
            >
              Full
            </button>
            <button
              className="segment"
              data-active={appearance.sidebar === "hidden"}
              onClick={() => set({ sidebar: "hidden" })}
            >
              Hidden
            </button>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-label">
            <div className="setting-title">Focus mode</div>
            <div className="setting-sub">
              Hides the sidebar and page header, leaving the music and its controls.
            </div>
          </div>
          <button
            className="toggle"
            role="switch"
            aria-checked={appearance.focus}
            aria-label="Focus mode"
            data-on={appearance.focus}
            onClick={() => set({ focus: !appearance.focus })}
          >
            <span className="toggle-thumb" />
          </button>
        </div>

        <div className="settings-actions">
          <span className="settings-actions-note">
            Resets themes, gradient, accent and glass — your library, pins and saved looks stay.
          </span>
          <button className="btn btn-quiet" onClick={onReset}>
            Reset appearance
          </button>
        </div>
      </section>
        </>
      )}

      {module === "library" && (
      <section className="settings-group">
        <div className="settings-head">
          <div className="settings-head-title">Library</div>
        </div>
        <div className="settings-rows">
          <div className="settings-row">
            <div className="setting-title">Songs</div>
            <div className="setting-value">{tracks}</div>
          </div>
          <div className="settings-row">
            <div className="setting-title">Albums</div>
            <div className="setting-value">{albums}</div>
          </div>
          <div className="settings-row">
            <div className="setting-title">Artists</div>
            <div className="setting-value">{artists}</div>
          </div>
          <div className="settings-row">
            <div className="setting-title">Folders watched</div>
            <div className="setting-value">{folders}</div>
          </div>
          <div className="settings-row">
            <div className="setting-title">
              <span className="settings-inline-title">
                <PinIcon size={12} filled />
                Pinned services
              </span>
            </div>
            <div className="setting-value">{pinned.length > 0 ? pinned.join(", ") : "None"}</div>
          </div>
          <div className="settings-row">
            <div className="setting-title">Saved looks</div>
            <div className="setting-value">{savedLooks.length}</div>
          </div>
        </div>
      </section>
      )}

      {module === "services" && (
        <section className="settings-group">
          <div className="settings-head">
            <div className="settings-head-title">Streaming services</div>
            <div className="settings-head-sub">
              Pinned services sit at the top of Services and answer Alt+1…9 in pin order. Pinning
              only changes where a service shows; it never changes what it can play.
            </div>
          </div>
          <div className="settings-rows">
            {SERVICES.map((service) => {
              const isPinned = pinned.includes(service.id);
              return (
                <div className="settings-row settings-service-row" key={service.id}>
                  <span
                    className="settings-service-mark"
                    style={{ background: service.color }}
                    aria-hidden
                  >
                    {service.mark}
                  </span>
                  <div className="settings-label">
                    <div className="setting-title">{service.name}</div>
                    <div className="setting-sub">{service.capability}</div>
                  </div>
                  <button
                    className="btn btn-quiet"
                    data-active={isPinned}
                    aria-pressed={isPinned}
                    onClick={() => onTogglePin(service.id)}
                  >
                    <PinIcon size={12} filled={isPinned} />
                    {isPinned ? "Pinned" : "Pin"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {module === "versions" && <VersionHistory current={pkg.version} />}
    </div>
  );
}
