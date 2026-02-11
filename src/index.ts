import { Ableton } from "ableton-js";
import { RingManager } from "./ring-manager";

const ableton = new Ableton({ logger: console });

let sendMessageToModule: (
  args: any[] | { [key: string]: any }
) => void = () => {};

let ringManager: RingManager | undefined = undefined;

export async function init(sendMessage) {
  await ableton.start();
  sendMessageToModule = sendMessage;

  ringManager = new RingManager(ableton, sendMessage);
  await ringManager.init();
  // Default ring: 1 track wide, 8 scenes. Grid can reconfigure via ring_setup.
  await ringManager.setupRing(1, 8);
}

export async function close() {
  if (ringManager) {
    await ringManager.destroy();
    ringManager = undefined;
  }
  await ableton.close();
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export async function playOrStop() {
  const isPlaying = await ableton.song.get("is_playing");
  if (isPlaying == true) {
    await ableton.song.stopPlaying();
  } else {
    await ableton.song.startPlaying();
  }
}

export async function record() {
  const isRecording = await ableton.song.get("record_mode");
  if (isRecording == 1) {
    await ableton.song.set("record_mode", 0);
  } else {
    await ableton.song.set("record_mode", 1);
  }
}

/**
 * Navigate selected track left/right. The ring manager auto-follows
 * via its own selected_track listener.
 */
export async function navigate(direction: string) {
  const currentTrack = await ableton.song.view.get("selected_track");
  const allTracks = await ableton.song.get("tracks");

  const currentIndex = allTracks.findIndex(
    (track) => track.raw.id === currentTrack.raw.id
  );

  const dir = direction === "right" ? 1 : -1;
  const nextIndex = Math.max(
    0,
    Math.min(currentIndex + dir, allTracks.length - 1)
  );

  try {
    await ableton.song.view.set("selected_track", allTracks[nextIndex].raw.id);
  } catch (error) {
    console.log("Next track is out of range.");
  }
}

// ---------------------------------------------------------------------------
// Ring manager exports — called from index.js via gps() commands from Grid
// ---------------------------------------------------------------------------

/** Set up the ring dimensions and initial offset. */
export async function ringSetup(
  numTracks: number,
  numScenes: number,
  trackOffset = 0,
  sceneOffset = 0
) {
  if (ringManager) {
    await ringManager.setupRing(numTracks, numScenes, trackOffset, sceneOffset);
  }
}

/** Move the ring offset to an absolute position. */
export async function ringSetOffset(
  trackOffset: number,
  sceneOffset: number
) {
  if (ringManager) {
    await ringManager.setOffset(trackOffset, sceneOffset);
  }
}

/** Move the ring left or right by 1 track. */
export async function ringNavigate(direction: "left" | "right") {
  if (ringManager) {
    await ringManager.navigateRing(direction);
  }
}

/** Toggle mute on the track at ring index. */
export function ringToggleMute(ringIndex: number) {
  ringManager?.toggleMute(ringIndex);
}

/** Toggle solo on the track at ring index. */
export function ringToggleSolo(ringIndex: number) {
  ringManager?.toggleSolo(ringIndex);
}

/** Toggle arm on the track at ring index. */
export function ringToggleArm(ringIndex: number) {
  ringManager?.toggleArm(ringIndex);
}

/** Set volume on the track at ring index (0..1). */
export function ringSetVolume(ringIndex: number, value: number) {
  ringManager?.setVolume(ringIndex, value);
}

/** Set panning on the track at ring index (-1..1). */
export function ringSetPanning(ringIndex: number, value: number) {
  ringManager?.setPanning(ringIndex, value);
}

/** Set a send value on the track at ring index. */
export function ringSetSend(
  ringIndex: number,
  sendIndex: number,
  value: number
) {
  ringManager?.setSend(ringIndex, sendIndex, value);
}

/** Select the track at ring index in Ableton (without moving the ring). */
export function ringSelectTrack(ringIndex: number) {
  ringManager?.selectTrackInRing(ringIndex);
}

/** Set the active property mode ("volume", "panning", "send:N"). */
export function ringSetActiveProperty(property: string) {
  ringManager?.setActiveProperty(property);
}

/** Set the active property's value from a raw 8-bit Grid value (0–255). */
export function ringSetActivePropertyValue(ringIndex: number, rawValue: number) {
  ringManager?.setActivePropertyValue(ringIndex, rawValue);
}

/** Adjust the active property by a relative delta (for encoders in relative mode).
 *  No value jumps on track change — applies delta against the package's cached state. */
export function ringAdjustActivePropertyValue(ringIndex: number, delta: number, stepSize?: number) {
  ringManager?.adjustActivePropertyValue(ringIndex, delta, stepSize);
}

/** Adjust the last-selected parameter in Ableton by a relative delta. */
export function adjustSelectedParameter(delta: number, stepSize?: number) {
  ringManager?.adjustSelectedParameter(delta, stepSize);
}

/** Request a full state dump (ring tracks, selected track, selected parameter). */
export async function requestFullState() {
  await ringManager?.requestFullState();
}
