import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect } from "react";
import { colors } from "../theme";

export type PlayerStatus = "loading" | "ready" | "error";

/**
 * The platform video player (expo-video) with its native controls: play, pause, seek and
 * fullscreen, which also rotates to landscape. Kept small so screens can be tested without it.
 * It reports the position once a second and its status.
 */
export function NativePlayer({
  url,
  startAt,
  rate,
  onTick,
  onStatus,
  label,
}: {
  url: string;
  startAt: number;
  rate: number;
  onTick: (positionSeconds: number, playing: boolean) => void;
  onStatus: (s: PlayerStatus) => void;
  label: string;
}) {
  const player = useVideoPlayer(url, (p) => {
    p.timeUpdateEventInterval = 1;
    if (startAt > 0) p.currentTime = startAt;
  });
  const { status } = useEvent(player, "statusChange", { status: player.status });
  useEffect(() => {
    onStatus(status === "readyToPlay" ? "ready" : status === "error" ? "error" : "loading");
  }, [status, onStatus]);
  useEffect(() => {
    player.playbackRate = rate;
  }, [player, rate]);
  useEffect(() => {
    const sub = player.addListener("timeUpdate", (e) => onTick(e.currentTime, player.playing));
    return () => sub.remove();
  }, [player, onTick]);
  return (
    <VideoView
      player={player}
      nativeControls
      fullscreenOptions={{ enable: true }}
      contentFit="contain"
      accessibilityLabel={label}
      style={{ width: "100%", aspectRatio: 16 / 9, backgroundColor: colors.ink }}
    />
  );
}
