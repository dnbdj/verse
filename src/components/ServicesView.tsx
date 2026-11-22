import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { SpotifyState } from "../hooks/useSpotify";
import { formatTime } from "../lib/format";
import { moveItem } from "../lib/order";
import { remoteFromDeezer, remoteFromLink } from "../lib/remoteTracks";
import type { Playlist, RemoteTrack } from "../lib/types";
import {
  SERVICES,
  deezerResolve,
  deezerSearch,
  openExternal,
  parseMusicLink,
  serviceById,
  type DeezerTrack,
  type LinkTarget,
  type MusicService,
  type ServiceId,
} from "../lib/services";
import {
  CloseIcon,
  CopyIcon,
  DiceIcon,
  ExternalIcon,
  NextIcon,
  PauseIcon,
  PinIcon,
  PlayIcon,
  PrevIcon,
  SearchIcon,
  VolumeIcon,
} from "./icons";
import { PlaylistPicker } from "./PlaylistPicker";
import { ServiceLogo } from "./ServiceLogo";
import { SpotifyView } from "./SpotifyView";

type Props = {
  /** The directory lists every service; a page is one service's dashboard. */
  mode: "directory" | "page";
  spotify: SpotifyState;
  /** Verse playlists, shared by every service page. */
  playlists: Playlist[];
  onAddRemote: (playlistId: string, track: RemoteTrack) => Promise<void>;
  onCreatePlaylist: (name: string, track: RemoteTrack) => Promise<void>;
  serviceId: ServiceId;
  onSelectService: (id: ServiceId) => void;
  pinned: ServiceId[];
  onTogglePin: (id: ServiceId) => void;
  /** Reorders the pinned shelf; the order is also the Alt+1…9 quick-launch order. */
  onReorderPins: (next: ServiceId[]) => void;
  recent: ServiceId[];
  onTouchService: (id: ServiceId) => void;
  onClearRecent: () => void;
  /** Bumped by the palette to focus this view's search field. */
  searchRequest: number;
  /** Reports the artwork behind the current preview, for the window tint. */
  onArtwork?: (url: string | null) => void;
  /** Opens a service's full page from a card or a recent chip. */
  onOpenService?: (id: ServiceId) => void;
  onBack?: () => void;
};

const describe = (target: LinkTarget): string => {
  const name = serviceById(target.service).name;
  switch (target.service) {
    case "ytmusic":
      return target.embedUrl
        ? "Playing in Verse through YouTube's official embed."
        : `Opens ${name}.`;
    case "soundcloud":
      return "SoundCloud's widget is loaded below — its own pause and seek work inside Verse.";
    case "deezer":
      return "Deezer previews stream below. Full tracks stay in Deezer.";
    case "spotify":
      return "Sends playback to whichever Spotify device is active.";
    default:
      return `Opens in ${name}.`;
  }
};

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the selection-based copy below.
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  } catch {
    return false;
  }
}

export function ServicesView({
  mode,
  spotify,
  playlists,
  onAddRemote,
  onCreatePlaylist,
  serviceId,
  onSelectService,
  pinned,
  onTogglePin,
  onReorderPins,
  recent,
  onTouchService,
  onClearRecent,
  searchRequest,
  onArtwork,
  onOpenService,
  onBack,
}: Props) {
  const [query, setQuery] = useState("");
  const [link, setLink] = useState("");
  const [target, setTarget] = useState<LinkTarget | null>(null);
  const [tracks, setTracks] = useState<DeezerTrack[]>([]);
  const [listLabel, setListLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [playingPreview, setPlayingPreview] = useState<string | null>(null);
  const [previewVolume, setPreviewVolume] = useState(0.9);
  const [progress, setProgress] = useState(0);
  const [queueIndex, setQueueIndex] = useState<number | null>(null);
  const [previewTime, setPreviewTime] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const searchInput = useRef<HTMLInputElement | null>(null);
  const noticeTimer = useRef(0);

  const service = serviceById(serviceId);
  const pinnedServices = pinned.map(serviceById);
  const otherServices = SERVICES.filter((entry) => !pinned.includes(entry.id));
  const recentServices = recent
    .filter((id) => id !== serviceId)
    .map(serviceById)
    .slice(0, 4);

  useEffect(() => {
    if (audio.current) audio.current.volume = previewVolume;
  }, [previewVolume]);

  useEffect(() => {
    if (searchRequest > 0) searchInput.current?.focus();
  }, [searchRequest]);

  useEffect(() => {
    if (!playingPreview) {
      onArtwork?.(null);
      return;
    }
    const entry = tracks.find((track) => track.preview === playingPreview);
    onArtwork?.(entry?.cover ?? null);
  }, [playingPreview, tracks, onArtwork]);

  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  const flash = (message: string) => {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2400);
  };

  const stopPreview = () => {
    audio.current?.pause();
    setPlayingPreview(null);
    setQueueIndex(null);
    setProgress(0);
    setPreviewTime(0);
    setPreviewDuration(0);
  };

  // Switching services through the palette or sidebar must not leave the previous
  // service's results under the new dashboard. A parsed link is kept when it is
  // the link that caused the switch (its target already names the new service).
  const previousService = useRef(serviceId);
  useEffect(() => {
    if (previousService.current === serviceId) return;
    previousService.current = serviceId;
    setError(null);
    stopPreview();
    if (target?.service !== serviceId) {
      setTarget(null);
      setTracks([]);
      setQuery("");
      setLink("");
    }
  }, [serviceId]);

  const choose = (id: ServiceId) => {
    onSelectService(id);
    onTouchService(id);
    setError(null);
    setTarget(null);
    setTracks([]);
    stopPreview();
    onOpenService?.(id);
  };

  const runSearch = async () => {
    const needle = query.trim();
    if (!needle) return;
    setError(null);

    if (service.playback !== "preview") {
      onTouchService(service.id);
      await openExternal(service.search(needle));
      return;
    }

    setBusy(true);
    try {
      const found = await deezerSearch(needle);
      setTracks(found);
      setListLabel(`Deezer results for “${needle}”`);
      setTarget(null);
      setHistory((prev) => [needle, ...prev.filter((entry) => entry !== needle)].slice(0, 6));
      if (found.length === 0) setError("Deezer returned nothing for that search.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const openLink = async (raw = link) => {
    setError(null);
    const parsed = parseMusicLink(raw);
    if (!parsed) {
      setTarget(null);
      setError("That doesn't look like a link Verse can read.");
      return;
    }

    setTarget(parsed);
    setTracks([]);
    setLink(raw);
    onSelectService(parsed.service);
    onTouchService(parsed.service);
    stopPreview();

    if (parsed.service === "deezer" && parsed.id && parsed.resource !== "artist") {
      setBusy(true);
      try {
        const found = await deezerResolve(parsed.resource, parsed.id);
        setTracks(found);
        setListLabel(`Deezer ${parsed.resource}`);
        if (found.length === 0) setError("Deezer has no playable previews for that link.");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setBusy(false);
      }
    }
  };

  const pasteLink = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setLink(text.trim());
        await openLink(text.trim());
      } else {
        flash("The clipboard is empty");
      }
    } catch {
      flash("Clipboard read is blocked — paste with Ctrl+V");
    }
  };

  const playAt = (index: number) => {
    const track = tracks[index];
    const element = audio.current;
    if (!element || !track) return;
    if (!track.preview) {
      setError("Deezer has no preview for that track.");
      return;
    }
    element.src = track.preview;
    element.currentTime = 0;
    element.volume = previewVolume;
    setQueueIndex(index);
    setPlayingPreview(track.preview);
    setPreviewTime(0);
    setPreviewDuration(0);
    setProgress(0);
    void element.play().catch((cause: unknown) => {
      setPlayingPreview(null);
      setError(String(cause));
    });
  };

  /** Walks the result list, skipping rows Deezer has no preview for. */
  const stepPreview = (delta: number) => {
    if (queueIndex === null) return;
    let next = queueIndex + delta;
    while (next >= 0 && next < tracks.length && !tracks[next].preview) next += delta;
    if (next < 0 || next >= tracks.length) {
      stopPreview();
      return;
    }
    playAt(next);
  };

  const togglePreview = (track: DeezerTrack) => {
    const element = audio.current;
    if (!element) return;
    if (playingPreview === track.preview) {
      element.pause();
      setPlayingPreview(null);
      return;
    }
    const index = tracks.findIndex((entry) => entry.id === track.id);
    playAt(index >= 0 ? index : 0);
  };

  const copyLink = async () => {
    const url = target?.webUrl ?? link.trim();
    if (!url) return;
    const copied = await copyText(url);
    flash(copied ? "Link copied" : "Copy is blocked in this window");
  };

  const copyDetails = async () => {
    if (!target) return;
    const name = serviceById(target.service).name;
    const details = [
      `${name}${target.resource !== "unknown" ? ` · ${target.resource}` : ""}`,
      target.id ? `id: ${target.id}` : "",
      target.webUrl,
    ]
      .filter(Boolean)
      .join("\n");
    const copied = await copyText(details);
    flash(copied ? "Track details copied" : "Copy is blocked in this window");
  };

  const renderCard = (entry: MusicService, isPinned: boolean, pinIndex = -1) => {
    const active = entry.id === serviceId;
    return (
      <div key={entry.id} className="service-card" data-active={active} data-pinned={isPinned}>
        <button
          className="service-card-main"
          aria-pressed={active}
          onClick={() => choose(entry.id)}
        >
          <span className="service-head">
            <span
              className="service-mark"
              style={{ background: entry.color, "--mark-cut": entry.color } as CSSProperties}
            >
              <ServiceLogo id={entry.id} size={15} />
            </span>
            <span className="service-name">{entry.name}</span>
          </span>
          <span className="service-cap">{entry.capability}</span>
        </button>
        {isPinned && pinIndex >= 0 && (
          <span className="service-moves" role="group" aria-label={`${entry.name} pin order`}>
            <button
              className="service-move"
              disabled={pinIndex === 0}
              aria-label={`Move ${entry.name} up in pinned services`}
              title="Move up"
              onClick={() => onReorderPins(moveItem(pinned, pinIndex, pinIndex - 1))}
            >
              ↑
            </button>
            <button
              className="service-move"
              disabled={pinIndex === pinned.length - 1}
              aria-label={`Move ${entry.name} down in pinned services`}
              title="Move down"
              onClick={() => onReorderPins(moveItem(pinned, pinIndex, pinIndex + 1))}
            >
              ↓
            </button>
          </span>
        )}
        <button
          className="service-pin"
          data-on={isPinned}
          aria-pressed={isPinned}
          aria-label={`${isPinned ? "Unpin" : "Pin"} ${entry.name}`}
          title={isPinned ? `Unpin ${entry.name}` : `Pin ${entry.name} to the top`}
          onClick={() => {
            onTogglePin(entry.id);
            flash(isPinned ? `${entry.name} unpinned` : `${entry.name} pinned`);
          }}
        >
          <PinIcon size={13} filled={isPinned} />
        </button>
      </div>
    );
  };

  const previewTotal = tracks.reduce((sum, track) => sum + track.durationMs, 0);

  return (
    <div className="services">
      {mode === "directory" && (
        <>
      {pinnedServices.length > 0 && (
        <div className="service-group">
          <div className="service-group-label">
            <PinIcon size={12} filled />
            Pinned
            <span className="service-group-count">{pinnedServices.length}</span>
            <span className="service-group-hint">Alt+1–9 launches a pinned service</span>
          </div>
          <div className="service-grid">
            {pinnedServices.map((entry, index) => renderCard(entry, true, index))}
          </div>
        </div>
      )}

      <div className="service-group">
        <div className="service-group-label">
          {pinnedServices.length > 0 ? "All services" : "Services"}
          <span className="service-group-count">{SERVICES.length}</span>
          <span className="service-group-hint">Pin a service to keep it on top and in the sidebar</span>
        </div>
        <div className="service-grid">
          {otherServices.map((entry) => renderCard(entry, false))}
        </div>
      </div>

      {recentServices.length > 0 && (
        <div className="service-recents">
          <span className="service-recents-label">Recently used</span>
          {recentServices.map((entry) => (
            <button key={entry.id} className="recent-chip" onClick={() => choose(entry.id)}>
              <span
                className="recent-mark"
                style={{ background: entry.color, "--mark-cut": entry.color } as CSSProperties}
              >
                <ServiceLogo id={entry.id} size={10} />
              </span>
              {entry.name}
            </button>
          ))}
          <button
            className="service-recents-clear"
            onClick={onClearRecent}
            title="Clear recently used services"
          >
            Clear
          </button>
        </div>
      )}

        </>
      )}

      {mode === "page" && (
        <>
      <div className="service-page-bar">
        <button className="btn btn-quiet service-back" onClick={onBack}>
          ← All services
        </button>
        <span className="service-page-path">Services / {service.name}</span>
      </div>

      <section
        className="panel service-page-hero"
        style={{ "--service-color": service.color } as CSSProperties}
      >
        <div className="service-page-identity">
          <span
            className="service-mark service-mark-page"
            style={{ background: service.color, "--mark-cut": service.color } as CSSProperties}
          >
            <ServiceLogo id={service.id} size={22} />
          </span>
          <div>
            <h2 className="service-page-name">{service.name}</h2>
            <div className="service-page-cap">{service.capability}</div>
            <p className="service-page-note">{service.note}</p>
          </div>
        </div>
        <div className="service-page-actions">
          <button
            className="btn"
            aria-pressed={pinned.includes(service.id)}
            onClick={() => {
              onTogglePin(service.id);
              flash(
                pinned.includes(service.id)
                  ? `${service.name} unpinned`
                  : `${service.name} pinned`,
              );
            }}
          >
            <PinIcon size={14} filled={pinned.includes(service.id)} />
            {pinned.includes(service.id) ? "Unpin" : "Pin to sidebar"}
          </button>
          <button className="btn btn-primary" onClick={() => void openExternal(service.home)}>
            <ExternalIcon size={14} />
            Open {service.name}
          </button>
        </div>
      </section>

      <div className="service-page-stats">
        <div className="service-stat">
          <span>Playback</span>
          <strong>
            {service.playback === "remote"
              ? "Remote control"
              : service.playback === "preview"
                ? "In-app previews"
                : service.playback === "embed"
                  ? "Embedded player"
                  : "Hands off to app"}
          </strong>
        </div>
        <div className="service-stat">
          <span>Account</span>
          <strong>
            {service.id === "spotify"
              ? spotify.status?.connected
                ? spotify.status.name ?? "Connected"
                : "Not connected"
              : "Service's own app"}
          </strong>
        </div>
        <div className="service-stat">
          <span>{service.id === "spotify" ? "Liked songs" : "Verse playlists"}</span>
          <strong>
            {service.id === "spotify"
              ? `${spotify.library.liked.length} loaded`
              : `${playlists.length} available`}
          </strong>
        </div>
        <div className="service-stat">
          <span>{service.id === "spotify" ? "Verse playlists" : "Saving songs"}</span>
          <strong>
            {service.id === "spotify"
              ? `${playlists.length} available`
              : "Any service · any playlist"}
          </strong>
        </div>
      </div>

      {service.id === "spotify" && (
        <SpotifyView
          spotify={spotify}
          playlists={playlists}
          onAddRemote={onAddRemote}
          onCreatePlaylist={onCreatePlaylist}
        />
      )}

      <div className="panel service-block">
        <div className="service-block-head">
          <div className="service-block-title">
            <span
              className="service-mark service-mark-lg"
              style={{ background: service.color, "--mark-cut": service.color } as CSSProperties}
            >
              <ServiceLogo id={service.id} size={18} />
            </span>
            <div>
              <div className="service-label">Search {service.name}</div>
              <div className="service-sub">{service.note}</div>
            </div>
          </div>
          <div className="service-head-actions">
            <button className="btn" onClick={() => void openExternal(service.home)}>
              <ExternalIcon size={14} />
              Open {service.name}
            </button>
          </div>
        </div>
        <div className="service-input-row">
          <div className="field" style={{ flex: 1 }}>
            <SearchIcon />
            <input
              ref={searchInput}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void runSearch();
              }}
              placeholder={`Search ${service.name}…`}
              spellCheck={false}
            />
            {query && (
              <button className="field-clear" title="Clear" onClick={() => setQuery("")}>
                <CloseIcon size={13} />
              </button>
            )}
          </div>
          <button
            className="btn btn-primary"
            disabled={busy || query.trim().length === 0}
            onClick={() => void runSearch()}
          >
            {busy ? "Searching…" : service.playback === "preview" ? "Search previews" : "Search"}
          </button>
        </div>
        {history.length > 0 && service.playback === "preview" && (
          <div className="service-history">
            {history.map((entry) => (
              <button
                key={entry}
                className="chip"
                onClick={() => {
                  setQuery(entry);
                  void (async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      const found = await deezerSearch(entry);
                      setTracks(found);
                      setListLabel(`Deezer results for “${entry}”`);
                    } catch (cause) {
                      setError(cause instanceof Error ? cause.message : String(cause));
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              >
                {entry}
              </button>
            ))}
          </div>
        )}
      </div>

      {busy && service.playback === "preview" && tracks.length === 0 && (
        <div className="panel service-block service-loading" role="status" aria-live="polite">
          <div className="service-loading-head">
            <span className="service-spinner" aria-hidden />
            Searching {service.name}…
          </div>
          <div className="service-skeleton-list" aria-hidden>
            {[0, 1, 2, 3].map((index) => (
              <div className="service-skeleton-row" key={index}>
                <span className="service-skeleton-cover" />
                <span className="service-skeleton-lines">
                  <span />
                  <span />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel service-block">
        <div className="service-block-head">
          <div>
            <div className="service-label">Open a link</div>
            <div className="service-sub">
              Paste a track, album, playlist or set link from any of these services. YouTube and
              SoundCloud play inside Verse, Deezer streams previews, the rest hand the track to
              their own app.
            </div>
          </div>
        </div>
        <div className="service-input-row">
          <div className="field" style={{ flex: 1 }}>
            <ExternalIcon size={14} />
            <input
              value={link}
              onChange={(event) => setLink(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void openLink();
                if (event.key === "Escape") setTarget(null);
              }}
              placeholder="https://music.youtube.com/watch?v=…"
              spellCheck={false}
            />
            {link && (
              <button
                className="field-clear"
                title="Clear"
                onClick={() => {
                  setLink("");
                  setTarget(null);
                  setTracks([]);
                }}
              >
                <CloseIcon size={13} />
              </button>
            )}
          </div>
          <button className="btn" onClick={() => void pasteLink()} title="Paste from clipboard">
            Paste
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || link.trim().length === 0}
            onClick={() => void openLink()}
          >
            Open
          </button>
        </div>

        {target && (
          <div className="service-target">
            <div className="service-block-head" style={{ marginBottom: 10 }}>
              <div className="service-block-title">
                <span
                  className="service-mark"
                  style={
                    {
                      background: serviceById(target.service).color,
                      "--mark-cut": serviceById(target.service).color,
                    } as CSSProperties
                  }
                >
                  <ServiceLogo id={target.service} size={14} />
                </span>
                <div>
                  <div className="service-label">
                    {serviceById(target.service).name}
                    {target.resource !== "unknown" ? ` · ${target.resource}` : ""}
                  </div>
                  <div className="service-sub">{describe(target)}</div>
                </div>
              </div>
              <div className="service-actions">
                <PlaylistPicker
                  playlists={playlists}
                  label={`Save this ${serviceById(target.service).name} link to a playlist`}
                  onPick={(playlistId) => onAddRemote(playlistId, remoteFromLink(target))}
                  onCreate={(name) => onCreatePlaylist(name, remoteFromLink(target))}
                />
                {target.uri && (
                  <button
                    className="btn btn-primary"
                    disabled={!spotify.status?.connected}
                    onClick={() => target.uri && void spotify.playUri(target.uri)}
                  >
                    <PlayIcon size={14} />
                    Play on Spotify
                  </button>
                )}
                <button className="btn" onClick={() => void copyLink()} title="Copy link">
                  <CopyIcon size={14} />
                  Copy link
                </button>
                <button className="btn" onClick={() => void copyDetails()} title="Copy details">
                  <CopyIcon size={14} />
                  Details
                </button>
                <button className="btn" onClick={() => void openExternal(target.webUrl)}>
                  <ExternalIcon size={14} />
                  Open original
                </button>
              </div>
            </div>

            {target.embedUrl && (
              <iframe
                className="service-embed"
                data-kind={target.embedKind ?? "video"}
                src={target.embedUrl}
                title={`${serviceById(target.service).name} player`}
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                allowFullScreen
              />
            )}

            {target.uri && !spotify.status?.connected && (
              <div className="service-note">
                Connect Spotify in the Spotify tab first — the link then plays on your active
                device.
              </div>
            )}
          </div>
        )}
      </div>

      {tracks.length > 0 && (
        <div className="panel">
          <div className="service-block-head" style={{ padding: "15px 18px 6px", marginBottom: 0 }}>
            <div>
              <div className="service-label">{listLabel}</div>
              <div className="service-sub">
                {tracks.length} tracks · {formatTime(previewTotal)} · thirty-second previews stream
                from Deezer while you listen.
              </div>
            </div>
            <div className="preview-tools">
              <VolumeIcon size={14} />
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={previewVolume}
                style={{ "--p": `${previewVolume * 100}%` } as CSSProperties}
                onChange={(event) => setPreviewVolume(Number(event.target.value))}
                aria-label="Preview volume"
              />
            </div>
          </div>
          {queueIndex !== null && tracks[queueIndex] && (
            <div className="preview-bar">
              <div className="preview-now">
                {tracks[queueIndex].cover ? (
                  <img className="cover" src={tracks[queueIndex].cover} alt="" />
                ) : (
                  <div className="cover" />
                )}
                <div className="preview-now-text">
                  <div className="preview-now-title">{tracks[queueIndex].title}</div>
                  <div className="track-artist">{tracks[queueIndex].artist}</div>
                </div>
              </div>

              <div className="preview-transport">
                <button
                  className="btn-icon"
                  title="Previous preview"
                  onClick={() => stepPreview(-1)}
                >
                  <PrevIcon size={14} />
                </button>
                <button
                  className="btn-icon"
                  title={playingPreview ? "Pause preview" : "Play preview"}
                  onClick={() => {
                    const element = audio.current;
                    if (!element) return;
                    if (playingPreview) {
                      element.pause();
                      setPlayingPreview(null);
                    } else {
                      void element
                        .play()
                        .then(() => setPlayingPreview(tracks[queueIndex].preview))
                        .catch((cause: unknown) => setError(String(cause)));
                    }
                  }}
                >
                  {playingPreview ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
                </button>
                <button className="btn-icon" title="Next preview" onClick={() => stepPreview(1)}>
                  <NextIcon size={14} />
                </button>
              </div>

              <span className="preview-time">{formatTime(previewTime * 1000)}</span>
              <input
                className="preview-scrub"
                type="range"
                min={0}
                max={Math.max(1, previewDuration)}
                step={0.1}
                value={Math.min(previewTime, previewDuration || 0)}
                style={
                  {
                    "--p": `${previewDuration ? (previewTime / previewDuration) * 100 : 0}%`,
                  } as CSSProperties
                }
                onChange={(event) => {
                  const next = Number(event.target.value);
                  const element = audio.current;
                  if (element) element.currentTime = next;
                  setPreviewTime(next);
                }}
                aria-label="Scrub preview"
              />
              <span className="preview-time">{formatTime(previewDuration * 1000)}</span>
              <button className="btn-icon" title="Stop preview" onClick={stopPreview}>
                <CloseIcon size={13} />
              </button>
            </div>
          )}

          {playingPreview && (
            <div className="preview-progress" aria-hidden>
              <span style={{ width: `${progress}%` }} />
            </div>
          )}
          <div className="service-list">
            {tracks.map((track) => {
              const active = playingPreview !== null && playingPreview === track.preview;
              return (
                <div
                  key={track.id || track.title}
                  className="track-row service-track-row"
                  data-active={active}
                >
                  <button
                    className="btn-icon"
                    style={{ padding: 4 }}
                    title={active ? "Pause preview" : "Play preview"}
                    onClick={() => togglePreview(track)}
                  >
                    {active ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
                  </button>
                  <div className="service-track-main">
                    {track.cover ? (
                      <img
                        className="cover"
                        src={track.cover}
                        alt=""
                        style={{ width: 34, height: 34 }}
                      />
                    ) : (
                      <div className="cover" style={{ width: 34, height: 34 }} />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div
                        className="track-title"
                        style={{ color: active ? "var(--accent)" : undefined }}
                      >
                        {track.title}
                      </div>
                      <div className="track-artist">
                        {[track.artist, track.album].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  </div>
                  <div className="track-dur">{formatTime(track.durationMs)}</div>
                  <span className="service-note" aria-hidden>
                    {track.preview ? "" : "—"}
                  </span>
                  <button
                    className="btn-icon"
                    style={{ padding: 4 }}
                    title="Open in Deezer"
                    onClick={() => void openExternal(track.url || "https://www.deezer.com")}
                  >
                    <ExternalIcon size={13} />
                  </button>
                  <PlaylistPicker
                    playlists={playlists}
                    label={`Add ${track.title} to a playlist`}
                    onPick={(playlistId) => onAddRemote(playlistId, remoteFromDeezer(track))}
                    onCreate={(name) => onCreatePlaylist(name, remoteFromDeezer(track))}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tracks.length === 0 && target?.service === "deezer" && !busy && (
        <div className="panel service-block">
          <div className="service-note">
            Nothing playable came back from that Deezer link.{" "}
            <button
              className="service-inline-link"
              onClick={() => void openExternal(target.webUrl)}
            >
              Open it in Deezer
            </button>
            .
          </div>
        </div>
      )}

      {error && (
        <div className="panel service-block service-error">
          <span>{error}</span>
          <button className="btn-icon" title="Dismiss" onClick={() => setError(null)}>
            <CloseIcon size={13} />
          </button>
        </div>
      )}

        </>
      )}

      {mode === "directory" && (
        <>
      <div className="service-meta">
        <span className="service-meta-text">
          {SERVICES.length} services · {pinned.length} pinned · logos and links are local, nothing
          is uploaded.
        </span>
        <button
          className="chip"
          onClick={() => {
            setLink("https://music.youtube.com/watch?v=dQw4w9WgXcQ");
            void openLink("https://music.youtube.com/watch?v=dQw4w9WgXcQ");
          }}
        >
          <DiceIcon size={12} />
          Try a demo link
        </button>
      </div>

        </>
      )}

      {notice && <div className="service-flash">{notice}</div>}

      <audio
        ref={audio}
        onLoadedMetadata={(event) => {
          setPreviewDuration(event.currentTarget.duration || 0);
          event.currentTarget.volume = previewVolume;
        }}
        onTimeUpdate={(event) => {
          const element = event.currentTarget;
          setPreviewTime(element.currentTime);
          setPreviewDuration(element.duration || 0);
          setProgress(element.duration ? (element.currentTime / element.duration) * 100 : 0);
        }}
        onEnded={() => {
          setPlayingPreview(null);
          setProgress(0);
          if (queueIndex !== null) stepPreview(1);
        }}
      />
    </div>
  );
}
