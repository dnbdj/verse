import { useState } from "react";
import type { CSSProperties } from "react";
import { formatTime } from "../lib/format";
import type { SpotifyState } from "../hooks/useSpotify";
import { NextIcon, PauseIcon, PlayIcon, PrevIcon } from "./icons";

export function SpotifyView({ spotify }: { spotify: SpotifyState }) {
  const [clientId, setClientId] = useState("");
  const { status, library, playback, busy, error } = spotify;

  if (!status) {
    return (
      <div className="panel">
        <div className="empty-state">Checking Spotify…</div>
      </div>
    );
  }

  if (!status.connected) {
    return (
      <div className="panel" style={{ padding: "26px 28px", maxWidth: 640 }}>
        <div style={{ fontSize: 17, fontWeight: 640 }}>Connect Spotify</div>
        <p style={{ color: "var(--text-dim)", fontSize: 13.5, lineHeight: 1.75, marginTop: 10 }}>
          Verse controls playback on whichever Spotify device is active — phone, desktop or web.
          Spotify&#39;s audio can&#39;t be embedded natively, so this is a remote, not a second player.
        </p>
        <ol
          style={{
            color: "var(--text-dim)",
            fontSize: 13,
            lineHeight: 1.9,
            margin: "12px 0 0",
            paddingLeft: 20,
          }}
        >
          <li>
            Create an app at <span style={{ color: "var(--text)" }}>developer.spotify.com/dashboard</span>.
          </li>
          <li>
            Add redirect URI{" "}
            <code style={{ color: "var(--text)" }}>http://127.0.0.1/callback</code> and tick the Web API.
          </li>
          <li>Paste the Client ID below — no secret is needed, and it stays on this machine.</li>
        </ol>

        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <div className="field" style={{ flex: 1 }}>
            <input
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              placeholder="Spotify Client ID"
              spellCheck={false}
            />
          </div>
          <button
            className="btn btn-primary"
            disabled={busy || clientId.trim().length < 10}
            onClick={() => void spotify.connect(clientId)}
          >
            {busy ? "Waiting for browser…" : "Connect"}
          </button>
        </div>

        {status.configured && (
          <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--text-faint)" }}>
            A Client ID is already saved — connecting again re-authorises.
          </div>
        )}
        {error && (
          <div style={{ marginTop: 12, fontSize: 12.5, color: "#e7998a", lineHeight: 1.6 }}>
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="panel" style={{ padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {playback?.art ? (
            <img className="cover" src={playback.art} alt="" style={{ width: 56, height: 56 }} />
          ) : (
            <div className="cover" style={{ width: 56, height: 56 }} />
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="nav-label" style={{ padding: 0, marginBottom: 4 }}>
              {playback ? `On ${playback.device ?? "Spotify"}` : "Nothing playing"}
            </div>
            <div className="track-title">{playback?.name ?? "Start something in Spotify"}</div>
            <div className="track-artist">{playback?.artists ?? status.name ?? ""}</div>
          </div>
          <div className="transport-row">
            <button className="btn-icon" onClick={() => void spotify.control("previous")} title="Previous">
              <PrevIcon size={18} />
            </button>
            <button
              className="play-button"
              onClick={() => void spotify.control(playback?.playing ? "pause" : "play")}
              title={playback?.playing ? "Pause" : "Play"}
            >
              {playback?.playing ? <PauseIcon size={17} /> : <PlayIcon size={17} />}
            </button>
            <button className="btn-icon" onClick={() => void spotify.control("next")} title="Next">
              <NextIcon size={18} />
            </button>
          </div>
          <div style={{ width: 120 }}>
            <input
              type="range"
              min={0}
              max={Math.max(playback?.durationMs ?? 1, 1)}
              value={Math.min(playback?.progressMs ?? 0, playback?.durationMs ?? 0)}
              readOnly
              style={
                {
                  "--p": `${
                    playback && playback.durationMs > 0
                      ? (playback.progressMs / playback.durationMs) * 100
                      : 0
                  }%`,
                } as CSSProperties
              }
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--text-faint)" }}>
              <span>{formatTime(playback?.progressMs ?? 0)}</span>
              <span>{formatTime(playback?.durationMs ?? 0)}</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
          <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
            Connected as {status.name ?? "Spotify user"} · Premium required for transport
          </span>
          <button className="chip" onClick={() => void spotify.disconnect()}>
            disconnect
          </button>
        </div>
        {error && (
          <div style={{ marginTop: 10, fontSize: 12.5, color: "#e7998a" }}>{error}</div>
        )}
      </div>

      <div>
        <div className="nav-label" style={{ padding: "0 4px 10px" }}>
          Your playlists
        </div>
        <div className="album-grid">
          {library.playlists.map((playlist) => (
            <button
              key={playlist.id}
              className="album-card"
              onClick={() => void spotify.playUri(playlist.uri)}
              title="Play on the active Spotify device"
            >
              {playlist.art ? (
                <img className="cover" src={playlist.art} alt="" />
              ) : (
                <div className="cover" />
              )}
              <div className="album-name">{playlist.name}</div>
              <div className="album-meta">{playlist.trackCount} tracks</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="nav-label" style={{ padding: "0 4px 10px" }}>
          Liked songs
        </div>
        <div className="panel">
          {library.liked.slice(0, 30).map((track) => (
            <div key={track.id} className="track-row" style={{ gridTemplateColumns: "1fr 60px 30px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                {track.art ? (
                  <img className="cover" src={track.art} alt="" style={{ width: 36, height: 36 }} />
                ) : (
                  <div className="cover" style={{ width: 36, height: 36 }} />
                )}
                <div style={{ minWidth: 0 }}>
                  <div className="track-title">{track.name}</div>
                  <div className="track-artist">{track.artists}</div>
                </div>
              </div>
              <div className="track-dur">{formatTime(track.durationMs)}</div>
              <button
                className="btn-icon"
                title="Play on Spotify"
                onClick={() => void spotify.playUri(track.uri)}
              >
                <PlayIcon size={15} />
              </button>
            </div>
          ))}
          {library.liked.length === 0 && (
            <div className="empty-state">No liked songs found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
