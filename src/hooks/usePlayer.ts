import { useCallback, useEffect, useRef, useState } from "react";
import { api, assetUrl } from "../lib/api";
import { loadPrefs, savePrefs } from "../lib/prefs";
import type { Track } from "../lib/types";

export type RepeatMode = "off" | "all" | "one";

export type Player = {
  current: Track | null;
  queue: Track[];
  playing: boolean;
  position: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
  audio: HTMLAudioElement | null;
  playQueue: (tracks: Track[], startIndex: number) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (ms: number) => void;
  changeVolume: (value: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
};

export function usePlayer(): Player {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [current, setCurrent] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  // Read once at mount so a restart keeps the listener's volume, shuffle and repeat.
  const [initialPrefs] = useState(loadPrefs);
  const [volume, setVolume] = useState(initialPrefs.volume);
  const [shuffle, setShuffle] = useState(initialPrefs.shuffle);
  const [repeat, setRepeat] = useState<RepeatMode>(initialPrefs.repeat);

  const queueRef = useRef<Track[]>([]);
  const indexRef = useRef(-1);
  const shuffleRef = useRef(initialPrefs.shuffle);
  const repeatRef = useRef<RepeatMode>(initialPrefs.repeat);

  useEffect(() => {
    savePrefs({ volume, shuffle, repeat });
  }, [volume, shuffle, repeat]);

  useEffect(() => {
    const element = new Audio();
    element.preload = "auto";
    audioRef.current = element;
    setAudio(element);

    const onTime = () => setPosition(element.currentTime * 1000);
    const onMeta = () =>
      setDuration(Number.isFinite(element.duration) ? element.duration * 1000 : 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    element.addEventListener("timeupdate", onTime);
    element.addEventListener("durationchange", onMeta);
    element.addEventListener("loadedmetadata", onMeta);
    element.addEventListener("play", onPlay);
    element.addEventListener("pause", onPause);

    return () => {
      element.pause();
      element.src = "";
      element.removeEventListener("timeupdate", onTime);
      element.removeEventListener("durationchange", onMeta);
      element.removeEventListener("loadedmetadata", onMeta);
      element.removeEventListener("play", onPlay);
      element.removeEventListener("pause", onPause);
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const load = useCallback((track: Track) => {
    const element = audioRef.current;
    if (!element) return;
    element.src = assetUrl(track.path);
    setCurrent(track);
    setPosition(0);
    setDuration(track.durationMs);
    void element.play().catch(() => setPlaying(false));
    void api.markPlayed(track.id).catch(() => undefined);
  }, []);

  const playAt = useCallback(
    (list: Track[], index: number) => {
      if (index < 0 || index >= list.length) return;
      queueRef.current = list;
      indexRef.current = index;
      setQueue(list);
      load(list[index]);
    },
    [load],
  );

  const advance = useCallback(
    (direction: 1 | -1) => {
      const element = audioRef.current;
      const list = queueRef.current;
      if (!element || list.length === 0) return;

      if (direction === 1 && repeatRef.current === "one") {
        element.currentTime = 0;
        void element.play();
        return;
      }

      let index = indexRef.current;
      if (direction === 1 && shuffleRef.current && list.length > 1) {
        do {
          index = Math.floor(Math.random() * list.length);
        } while (index === indexRef.current);
      } else {
        index += direction;
      }

      if (index >= list.length) {
        if (repeatRef.current === "all") index = 0;
        else {
          element.pause();
          element.currentTime = 0;
          setPosition(0);
          setPlaying(false);
          return;
        }
      }
      if (index < 0) {
        index = repeatRef.current === "off" ? 0 : list.length - 1;
      }

      playAt(list, index);
    },
    [playAt],
  );

  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;
    const onEnded = () => advance(1);
    element.addEventListener("ended", onEnded);
    return () => element.removeEventListener("ended", onEnded);
  }, [advance]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const element = audioRef.current;
      if (element) setPosition(element.currentTime * 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  useEffect(() => {
    if (!current || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist,
      album: current.album,
    });
  }, [current]);

  const toggle = useCallback(() => {
    const element = audioRef.current;
    if (!element || !current) return;
    if (element.paused) void element.play();
    else element.pause();
  }, [current]);

  const seek = useCallback((ms: number) => {
    const element = audioRef.current;
    if (!element) return;
    element.currentTime = Math.max(0, ms) / 1000;
    setPosition(Math.max(0, ms));
  }, []);

  const toggleShuffle = useCallback(() => {
    setShuffle((value) => {
      shuffleRef.current = !value;
      return !value;
    });
  }, []);

  const cycleRepeat = useCallback(() => {
    setRepeat((value) => {
      const next: RepeatMode = value === "off" ? "all" : value === "all" ? "one" : "off";
      repeatRef.current = next;
      return next;
    });
  }, []);

  return {
    current,
    queue,
    playing,
    position,
    duration,
    volume,
    shuffle,
    repeat,
    audio,
    playQueue: playAt,
    toggle,
    next: () => advance(1),
    previous: () => advance(-1),
    seek,
    changeVolume: setVolume,
    toggleShuffle,
    cycleRepeat,
  };
}
