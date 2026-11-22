import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, loadPrefs, saveLook, savePrefs, type PrefStore } from "./prefs";
import {
  SHARE_PREFIX,
  STARTER_LOOKS,
  decodeLook,
  encodeLook,
  lookLink,
  readLookFromUrl,
  type Look,
} from "./share";
import { appearanceOf } from "./theme";

const LOOK: Look = {
  theme: "velvet",
  accent: "custom",
  accentHex: "#ff5fa2",
  glass: "clear",
  gradient: { from: "#120a2e", via: "#bf5af2", to: "#ff2d78", angle: 210 },
  blur: 58,
  glow: 72,
  motion: false,
  density: "compact",
};

/** A tiny in-memory stand-in for localStorage, so persistence is testable in node. */
function memoryStore(): PrefStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

describe("look share codes", () => {
  it("round-trips every portable field", () => {
    const code = encodeLook(LOOK);
    expect(code.startsWith(SHARE_PREFIX)).toBe(true);
    expect(code).not.toContain(" ");

    const result = decodeLook(code);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.look).toEqual(LOOK);
  });

  it("round-trips a look with no gradient and a preset accent", () => {
    const plain: Look = {
      ...LOOK,
      accent: "green",
      accentHex: null,
      gradient: null,
      motion: true,
    };
    const result = decodeLook(encodeLook(plain));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.look.gradient).toBeNull();
    expect(result.look.accent).toBe("green");
    expect(result.look.motion).toBe(true);
  });

  it("tolerates surrounding whitespace and a lowercase hex", () => {
    const result = decodeLook(`  ${encodeLook({ ...LOOK, accentHex: "#FF5FA2" })}  `);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.look.accentHex).toBe("#ff5fa2");
  });

  it("rejects empty, foreign, damaged and incomplete codes with a reason", () => {
    expect(decodeLook("")).toMatchObject({ ok: false });
    const foreign = decodeLook("https://open.spotify.com/track/abc");
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.error).toContain("VRS1");

    const damaged = decodeLook(`${SHARE_PREFIX}!!!not-base64!!!`);
    expect(damaged.ok).toBe(false);

    const incomplete = decodeLook(`${SHARE_PREFIX}${btoa("velvet|blue")}`);
    expect(incomplete.ok).toBe(false);
    if (!incomplete.ok) expect(incomplete.error).toContain("incomplete");
  });

  it("rejects a code whose values are out of range", () => {
    const fields = (blur: string) => [
      "aurora",
      "blue",
      "",
      "frosted",
      "",
      "",
      "",
      "0",
      blur,
      "85",
      "1",
      "cozy",
    ];
    const encode = (blur: string) => SHARE_PREFIX + btoa(fields(blur).join("|")).replace(/=+$/, "");

    expect(decodeLook(encode("900")).ok).toBe(false);
    expect(decodeLook(encode("42")).ok).toBe(true);
  });
});

describe("arrival links", () => {
  it("builds a link that carries the same look", () => {
    const code = encodeLook(LOOK);
    const link = lookLink(code, "http://localhost:5183/");
    expect(link).toContain("#look=");

    const arrival = readLookFromUrl(link);
    expect(arrival.kind).toBe("look");
    if (arrival.kind !== "look") return;
    expect(arrival.look).toEqual(LOOK);
    expect(arrival.code).toBe(code);
  });

  it("ignores pages with no look payload", () => {
    expect(readLookFromUrl("http://localhost:5183/")).toEqual({ kind: "none" });
    expect(readLookFromUrl("http://localhost:5183/#settings")).toEqual({ kind: "none" });
    expect(readLookFromUrl("http://localhost:5183/#look=")).toEqual({ kind: "none" });
    expect(readLookFromUrl("not a url")).toEqual({ kind: "none" });
  });

  it("reports a bad payload as an error and yields no look", () => {
    const damaged = readLookFromUrl("http://localhost:5183/#look=VRS1.!!!");
    expect(damaged.kind).toBe("error");
    if (damaged.kind !== "error") return;
    expect(damaged.error).toContain("damaged");

    const wrongVersion = readLookFromUrl("http://localhost:5183/#look=VRS9.abc");
    expect(wrongVersion.kind).toBe("error");

    const outOfRange = readLookFromUrl(
      `http://localhost:5183/#look=${SHARE_PREFIX}${btoa("aurora|blue||frosted|||0|900|85|1|cozy")}`,
    );
    expect(outOfRange.kind).toBe("error");
  });

  it("accepts an encoded payload wrapped in a longer hash", () => {
    const link = `${lookLink(encodeLook(LOOK), "http://localhost:5183/")}&from=chat`;
    expect(readLookFromUrl(link).kind).toBe("look");
  });
});

describe("starter looks", () => {
  it("ships four uniquely named looks that survive a share round-trip", () => {
    expect(STARTER_LOOKS).toHaveLength(4);
    expect(new Set(STARTER_LOOKS.map((item) => item.name)).size).toBe(4);

    for (const item of STARTER_LOOKS) {
      const decoded = decodeLook(encodeLook(item.look));
      expect(decoded.ok).toBe(true);
      if (!decoded.ok) continue;
      expect(decoded.look).toEqual(item.look);
      expect(item.note.length).toBeGreaterThan(10);
    }
  });
});

describe("prefs persistence", () => {
  it("keeps pinned services and saved looks across a reload", () => {
    const store = memoryStore();
    const look = { name: "Late night", appearance: appearanceOf(DEFAULT_PREFS) };
    const saved = saveLook([], look);

    savePrefs(
      {
        pinned: ["deezer", "bandcamp"],
        savedLooks: saved,
        sidebar: "hidden",
        focus: true,
        artTint: false,
      },
      store,
    );

    const reloaded = loadPrefs(store);
    expect(reloaded.pinned).toEqual(["deezer", "bandcamp"]);
    expect(reloaded.savedLooks).toHaveLength(1);
    expect(reloaded.savedLooks[0].name).toBe("Late night");
    expect(reloaded.savedLooks[0].appearance.theme).toBe(DEFAULT_PREFS.theme);
    expect(reloaded.sidebar).toBe("hidden");
    expect(reloaded.focus).toBe(true);
    expect(reloaded.artTint).toBe(false);
  });

  it("merges patches instead of erasing other slices", () => {
    const store = memoryStore();
    savePrefs({ pinned: ["amazon"] }, store);
    savePrefs({ blur: 60 }, store);
    const reloaded = loadPrefs(store);
    expect(reloaded.pinned).toEqual(["amazon"]);
    expect(reloaded.blur).toBe(60);
  });

  it("drops malformed saved looks and junk values", () => {
    const store = memoryStore();
    store.setItem(
      "verse.prefs",
      JSON.stringify({
        pinned: ["not-a-service", "tidal"],
        blur: 900,
        sidebar: "sideways",
        savedLooks: [
          { id: "a", name: "", appearance: {} },
          { id: "b", name: "Okay", appearance: { theme: "aurora", accent: "custom", accentHex: null } },
          { id: "c", name: "Valid", appearance: { theme: "mist", accent: "pink" } },
        ],
      }),
    );

    const reloaded = loadPrefs(store);
    expect(reloaded.pinned).toEqual(["tidal"]);
    expect(reloaded.blur).toBeLessThanOrEqual(72);
    expect(reloaded.sidebar).toBe("full");
    expect(reloaded.savedLooks.map((entry) => entry.name)).toEqual(["Valid"]);
  });

  it("keeps the pinned service order across a reload", () => {
    const store = memoryStore();
    savePrefs({ pinned: ["bandcamp", "spotify", "deezer"] }, store);
    expect(loadPrefs(store).pinned).toEqual(["bandcamp", "spotify", "deezer"]);

    savePrefs({ pinned: ["deezer", "bandcamp", "spotify"] }, store);
    expect(loadPrefs(store).pinned).toEqual(["deezer", "bandcamp", "spotify"]);
  });

  it("falls back to defaults when the record is not JSON", () => {
    const store = memoryStore();
    store.setItem("verse.prefs", "{not json");
    expect(loadPrefs(store)).toEqual(DEFAULT_PREFS);
  });
});
