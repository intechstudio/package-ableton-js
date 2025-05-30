import { Ableton } from "ableton-js";
import { NavDirection } from "ableton-js/ns/application-view";
import { ClipSlot } from "ableton-js/ns/clip-slot";
import { MixerDevice } from "ableton-js/ns/mixer-device";
import { Scene } from "ableton-js/ns/scene";
import { Track } from "ableton-js/ns/track";

// Log all messages to the console
const ableton = new Ableton({ logger: console });

interface SessionRing {
  tracks: number;
  scenes: number;
  scene_offset: number;
  track_offset: number;
}

let SESSION_RING: SessionRing = {
  tracks: 0,
  scenes: 0,
  scene_offset: 0,
  track_offset: 0,
};

let unsubList: (() => Promise<boolean | undefined>)[] = [];

let sendMessageToModule: (args: any[]) => void = () => {};

export async function init(sendMessage) {
  await ableton.start();
  setupSessionBox(4, 4);
  unsubList.push(
    await ableton.song.addListener("scenes", (scenes) => {
      console.log("Scenes changed");
      updateSessionBoxListeners();
    }),
  );

  unsubList.push(
    await ableton.song.addListener("tracks", (tracks) => {
      console.log("Tracks changed");
      updateSessionBoxListeners();
    }),
  );

  selectionListener();

  sendMessageToModule = sendMessage;
}

export async function close() {
  await ableton.close();
  unsubList.forEach((e) => e());
}

export async function setupSessionBox(num_tracks: number, num_scenes: number) {
  SESSION_RING.tracks = num_tracks;
  SESSION_RING.scenes = num_scenes;
  ableton.session.setupSessionBox(num_tracks, num_scenes);
  updateSessionBoxListeners();
}

export async function setSessionBoxOffset(
  track_offset: number,
  scene_offset: number,
) {
  SESSION_RING.track_offset = track_offset;
  SESSION_RING.scene_offset = scene_offset;
  ableton.session.setSessionOffset(track_offset, scene_offset);
  updateSessionBoxListeners();
}

enum EVENT {
  COLOR = "COLOR",
  CLIP_EXISTS = "CLIP_EXISTS",
  CLIP_TRIGGERING = "CLIP_TRIGGERING",
  CLIP_PLAYING = "CLIP_PLAYING",
  MIXER_VOLUME_RX = "MIXER_VOLUME_RX",
  MIXER_VOLUME_TX = "MIXER_VOLUME_TX",
  MIXER_PAN_RX = "MIXER_PAN_RX",
  MIXER_PAN_TX = "MIXER_PAN_TX",
  MIXER_SEND_TX = "MIXER_SEND_TX",
  MIXER_SEND_RX = "MIXER_SEND_RX",
  TRACK_ARM_TX = "TRACK_ARM_TX",
  TRACK_ARM_RX = "TRACK_ARM_RX",
  TRACK_SOLO_TX = "TRACK_SOLO_TX",
  TRACK_SOLO_RX = "TRACK_SOLO_RX",
  TRACK_MUTE_TX = "TRACK_MUTE_TX",
  TRACK_MUTE_RX = "TRACK_MUTE_RX",
  TRACK_VIEW_SELECTED_DEVICE_TX = "TRACK_VIEW_SELECTED_DEVICE_TX",
  VIEW_PARAMETER_RX = "VIEW_PARAMETER_RX",
  VIEW_PARAMETER_TX = "VIEW_PARAMETER_TX",
  VIEW_TRACK_RX = "VIEW_TRACK_RX",
  VIEW_TRACK_TX = "VIEW_TRACK_TX",
}

async function selectionListener() {
  unsubList.push(
    await ableton.song.view.addListener(
      "selected_parameter",
      async (parameter) => {
        if (parameter) {
          const [min, max] = await Promise.all([
            parameter.get("min"),
            parameter.get("max"),
          ]);
          console.log(
            EVENT.VIEW_PARAMETER_RX,
            parameter.raw.name,
            parameter.raw.value,
            min,
            max,
          );
        } else {
          console.log(EVENT.VIEW_PARAMETER_RX, null);
        }
      },
    ),
  );

  unsubList.push(
    await ableton.song.view.addListener("selected_track", async (track) => {
      if (track) {
        const value = await track
          .get("mixer_device")
          .then((md) => md.get("volume"))
          .then((v) => v.raw.value.toFixed(2));
        sendMessageToModule([EVENT.VIEW_TRACK_RX, hexToRgb(track.raw.color)]);
        console.log(
          `${EVENT.VIEW_TRACK_RX} ${track.raw.name}, color: ${hexToRgb(track.raw.color)} solo: ${track.raw.solo}, mute: ${track.raw.mute}, volume: ${value}`,
        );
      } else {
        console.log(EVENT.VIEW_TRACK_RX, null);
      }
    }),
  );
}

let clipSlotListeners: Array<() => Promise<any>> = [];
let clipSlotPromises: any[] = [];
async function updateSessionBoxListeners() {
  const scenes = await ableton.song.get("scenes");
  const tracks = await ableton.song.get("tracks");
  // this should be just a scenes split, based on scene offset.
  scenes.forEach((scene, sceneIndex) => {
    // setup clip_slot listeneres to get updates on clip colors and clip launch states!
    scene.get("clip_slots").then((clip_slots) => {
      clip_slots.forEach(async (clip_slot, clipSlotIndex) => {
        // check active range, this return true now, but could be mapped to SESSION track and offset
        if (activeRange(clipSlotIndex, sceneIndex)) {
          // setup on init, all colors are dumped here!
          clipColorListener(clip_slot, clipSlotIndex, sceneIndex);
          // listen to clip changes (add / remove)
          unsubList.push(
            await clip_slot.addListener("has_clip", (has_clip) => {
              // call the color listener again, when the clip has been changed i.e. removed or added
              clipColorListener(clip_slot, clipSlotIndex, sceneIndex);
              console.log(
                `${EVENT.CLIP_EXISTS} Scene ${sceneIndex} at slot ${clipSlotIndex} CHANGED has_clip ${has_clip}`,
              );
            }),
          );

          // get triggered change
          unsubList.push(
            await clip_slot.addListener(
              "is_triggered",
              async (bool: boolean) => {
                console.log(EVENT.CLIP_TRIGGERING, bool);
                // to check which clip is actually playing on a channel, we need to listen for that on tracks!
              },
            ),
          );
        }
      });
    });
  });

  tracks.forEach(async (track, trackIndex) => {
    // used to check which clip is playing
    unsubList.push(
      await track.addListener("playing_slot_index", (sceneIndex) => {
        // this return "-2" when clips in channel stop playing
        console.log(EVENT.CLIP_PLAYING, trackIndex, sceneIndex);
      }),
    );

    // get the mixer device for each track and setup volume, pan listeners
    const mixerDevice = await track.get("mixer_device");
    mixerDeviceListener(mixerDevice, trackIndex);

    // arm, mute, solo
    trackListener(track, trackIndex);

    // selected device
    selectedDeviceListener(track, trackIndex);
  });

  setMixerDeviceVolume(1, Math.random());
  setMixerDevicePan(1, Math.random() * 2 - 1);
  setTrackProperty(0, "mute", true);
}

async function mixerDeviceListener(
  mixerDevice: MixerDevice,
  trackIndex: number,
) {
  // channel fader
  const fader = await mixerDevice.get("volume");
  const initialFaderValue = await fader.get("value");
  console.log(EVENT.MIXER_VOLUME_TX, trackIndex, initialFaderValue.toFixed(2));
  unsubList.push(
    await fader.addListener("value", (data) => {
      console.log(EVENT.MIXER_VOLUME_TX, trackIndex, data.toFixed(2));
    }),
  );
  // panning
  const pan = await mixerDevice.get("panning");
  const initialPanValue = await fader.get("value");
  console.log(EVENT.MIXER_PAN_TX, trackIndex, initialPanValue.toFixed(2));
  unsubList.push(
    await pan.addListener("value", (data) => {
      console.log(EVENT.MIXER_PAN_TX, trackIndex, data.toFixed(2));
    }),
  );
  // sends
  const sends = await mixerDevice.get("sends");
  sends.forEach(async (send, sendIndex) => {
    // ! I think we should limit this to certain number of sends, but it's ok as it is
    const initialSendValue = await send.get("value");
    console.log(
      `${
        EVENT.MIXER_SEND_TX
      } track: ${trackIndex} send: ${sendIndex} ${initialSendValue.toFixed(2)}`,
    );
    unsubList.push(
      await send.addListener("value", (data) => {
        console.log(
          `${
            EVENT.MIXER_SEND_TX
          } track: ${trackIndex} send: ${sendIndex} ${data.toFixed(2)}`,
        );
      }),
    );
  });
}

async function trackListener(track: Track, trackIndex: number) {
  unsubList.push(
    await track.addListener("arm", (data) => {
      console.log(EVENT.TRACK_ARM_TX, data, trackIndex);
    }),
  );
  unsubList.push(
    await track.addListener("solo", (data) => {
      console.log(EVENT.TRACK_SOLO_TX, data, trackIndex);
    }),
  );
  unsubList.push(
    await track.addListener("mute", (data) => {
      console.log(EVENT.TRACK_MUTE_TX, data, trackIndex);
    }),
  );
}

async function selectedDeviceListener(track: Track, trackIndex: number) {
  unsubList.push(
    await track.view.addListener("selected_device", (device) => {
      console.log(
        EVENT.TRACK_VIEW_SELECTED_DEVICE_TX,
        device.raw.class_name,
        trackIndex,
      );
    }),
  );
}

// set arm, mute or solo
async function setTrackProperty(
  trackIndex,
  property: "arm" | "mute" | "solo",
  value: boolean,
) {
  await ableton.song
    .get("tracks")
    .then((tracks) => tracks[trackIndex])
    .then((track) => track.set(property, value));
}

// change volume of a channel
async function setMixerDeviceVolume(trackIndex, volume) {
  console.log(EVENT.MIXER_VOLUME_RX, trackIndex, volume);
  if (!(volume <= 1 && volume >= 0)) return;
  await ableton.song
    .get("tracks")
    .then((tracks) => tracks[trackIndex])
    .then((track) => track.get("mixer_device"))
    .then((md) => md.get("volume"))
    .then((v) => v.set("value", volume));
}

// change pan on channel
async function setMixerDevicePan(trackIndex, pan) {
  console.log(EVENT.MIXER_PAN_RX, trackIndex, pan);
  if (!(pan <= 1 && pan >= -1)) return;
  await ableton.song
    .get("tracks")
    .then((tracks) => tracks[trackIndex])
    .then((track) => track.get("mixer_device"))
    .then((md) => md.get("panning"))
    .then((v) => v.set("value", pan));
}

async function clipColorListener(
  clip_slot: ClipSlot,
  track: number,
  scene: number,
) {
  clip_slot
    .get("clip")
    .then(async (clip) => {
      if (clip) {
        unsubList.push(
          await clip.addListener("color", (color) => {
            console.log(EVENT.COLOR, track, scene, color.rgb);
          }),
        );
        return clip
          .get("color")
          .then((color) => {
            console.log(EVENT.COLOR, track, scene, color.rgb);
            return { track, scene, color: color.rgb };
          })
          .catch((error) => {
            console.error(EVENT.COLOR, "An error occurred:", error);
            return { track, scene, color: "000000" };
          });
      } else {
        console.log(EVENT.COLOR, track, scene, { r: 0, g: 0, b: 0 });
        return new Promise((res, rej) => {
          res({ track, scene, color: "000000" });
          rej({ track, scene, color: "000000" });
        });
      }
    })
    .catch((error) => {
      console.error("An error occurred:", error);
      return { track, scene, color: "000000" };
    });
}

let activeSceneSubscribtions: Array<() => Promise<boolean | undefined>> = [];
async function sceneListener(scenes: Scene[]) {
  try {
    activeSceneSubscribtions.forEach((sub) => sub());

    activeSceneSubscribtions = [];

    const promises = scenes.map(async (scene, row) => {
      const sceneListener = await scene.addListener(
        "is_triggered",
        async (bool: boolean) => {
          // lookup or other method should be used, previously based on lookuptable BUTTONS
          const led = row;
          console.log("setGridLedColor", led, bool, false);
        },
      );

      activeSceneSubscribtions.push(sceneListener);

      return scene.get("color").then((color) => {
        return { row: row, color: color.rgb };
      });
    });

    const sceneColors = await Promise.all(promises);

    console.log("These are the scene colors", sceneColors);
    // send immediate
  } catch (error) {
    console.warn(error);
  }
}

// 2, 3
function activeRange(track_index: number, scene_index: number): boolean {
  // to do.. based on the track_index and scene_index, return if it is within the range defined by SESSION_RING
  return true;
}

async function fireSelectedScene() {
  await ableton.song.view
    .get("selected_scene")
    .then((scene) => scene.fire())
    .catch((error) => {
      console.warn(error);
    });
}

async function getClipSlot(rowNumber, columnNumber) {
  if (rowNumber == undefined || columnNumber == undefined) return;
  return await ableton.song
    .get("tracks")
    .then((tracks) =>
      tracks[columnNumber]
        .get("clip_slots")
        .then(async (clip_slots) => clip_slots[rowNumber]),
    )
    .catch((error) => {
      console.warn(error);
    });
}

async function listenForAddedOrDeletedScenes() {
  unsubList.push(
    await ableton.song.addListener("scenes", async (scenes) => {
      console.log("new scene");
    }),
  );
}

async function launchClip(rowNumber: number, columnNumber: number) {
  const clipSlot = await getClipSlot(rowNumber, columnNumber);
  // firing empty clip slot will stop clips on track
  if (clipSlot) {
    clipSlot.fire();
  }
}

async function launchScene(rowNumber) {
  const scene = await ableton.song
    .get("scenes")
    .then((scenes) => scenes[rowNumber]);
  scene.fire();
}

function hexToRgb(hex) {
  var bigint = parseInt(hex, 16);
  var r = (bigint >> 16) & 255;
  var g = (bigint >> 8) & 255;
  var b = bigint & 255;
  return [r, g, b];
}
