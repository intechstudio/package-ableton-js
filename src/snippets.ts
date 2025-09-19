
// export async function autoSetSelectedTrackMixerDeviceVolume(volume) {
//   console.log(EVENT.MIXER_VOLUME_RX, volume);
//   volume = volume / 100;
//   if (!(volume <= 1 && volume >= 0)) return;
//   if(selectedTrackMixerDevice){
//     selectedTrackMixerDevice.get("volume").then(v => v.set("value",volume))
//   }
// }

// export async function autoSetSelectedTrackMixerDevicePanning(panning) {
//   console.log(EVENT.MIXER_PAN_RX, panning);
//   panning = panning / 100;
//   if (!(panning <= 1 && panning >= -1)) return;
//   if(selectedTrackMixerDevice){
//     selectedTrackMixerDevice.get("panning").then(v => v.set("value",panning))
//   }
// }

// export async function autoSetSelectedTrackMixerDeviceSend(index: number, volume: number) {
//   console.log(EVENT.MIXER_SEND_RX, volume);
//   volume = volume / 100;
//   if (!(volume <= 1 && volume >= -1)) return;
//   if(selectedTrackMixerDevice){
//     const sends = await selectedTrackMixerDevice.get("sends");
//     if(sends[index]){
//       sends[index].set("value",volume)
//     }
//   }
// }

// export async function autoSetSelectedDeviceParameter(value){
//   if(selectedParameter.parameter){
//     selectedParameter.parameter.set("value", value)
//   }
// }

// // change volume of a channel
// async function setMixerDeviceVolume(trackIndex, volume) {
//   console.log(EVENT.MIXER_VOLUME_RX, trackIndex, volume);
//   if (!(volume <= 1 && volume >= 0)) return;
//   await ableton.song
//     .get("tracks")
//     .then((tracks) => tracks[trackIndex])
//     .then((track) => track.get("mixer_device"))
//     .then((md) => md.get("volume"))
//     .then((v) => v.set("value", volume));
// }

// // change pan on channel
// async function setMixerDevicePan(trackIndex, pan) {
//   console.log(EVENT.MIXER_PAN_RX, trackIndex, pan);
//   if (!(pan <= 1 && pan >= -1)) return;
//   await ableton.song
//     .get("tracks")
//     .then((tracks) => tracks[trackIndex])
//     .then((track) => track.get("mixer_device"))
//     .then((md) => md.get("panning"))
//     .then((v) => v.set("value", pan));
// }

// async function clipColorListener(
//   clip_slot: ClipSlot,
//   track: number,
//   scene: number,
// ) {
//   clip_slot
//     .get("clip")
//     .then(async (clip) => {
//       if (clip) {
//         unsubList.push(
//           await clip.addListener("color", (color) => {
//             sendMessageToModule({
//               evt: EVENT.COLOR,
//               t: track,
//               s: scene,
//               c: Object.values(color.rgb)
//             });
//             console.log(EVENT.COLOR, track, scene, color.rgb);
//           }),
//         );
//         return clip
//           .get("color")
//           .then((color) => {
//             console.log(EVENT.COLOR, track, scene, color.rgb);
//             sendMessageToModule({
//               evt: EVENT.COLOR,
//               t: track,
//               s: scene,
//               c: Object.values(color.rgb)
//             });
//             return { track, scene, color: color.rgb };
//           })
//           .catch((error) => {
//             console.error(EVENT.COLOR, "An error occurred:", error);
//             return { track, scene, color: "000000" };
//           });
//       } else {
//         console.log(EVENT.COLOR, track, scene, { r: 0, g: 0, b: 0 });
//         sendMessageToModule({
//               evt: EVENT.COLOR,
//               t: track,
//               s: scene,
//               c: [0,0,0]
//             });
//         return new Promise((res, rej) => {
//           res({ track, scene, color: "000000" });
//           rej({ track, scene, color: "000000" });
//         });
//       }
//     })
//     .catch((error) => {
//       console.error("An error occurred:", error);
//       return { track, scene, color: "000000" };
//     });
// }

// let activeSceneSubscribtions: Array<() => Promise<boolean | undefined>> = [];
// async function sceneListener(scenes: Scene[]) {
//   try {
//     activeSceneSubscribtions.forEach((sub) => sub());

//     activeSceneSubscribtions = [];

//     const promises = scenes.map(async (scene, row) => {
//       const sceneListener = await scene.addListener(
//         "is_triggered",
//         async (bool: boolean) => {
//           // lookup or other method should be used, previously based on lookuptable BUTTONS
//           const led = row;
//           console.log("setGridLedColor", led, bool, false);
//         },
//       );

//       activeSceneSubscribtions.push(sceneListener);

//       return scene.get("color").then((color) => {
//         return { row: row, color: color.rgb };
//       });
//     });

//     const sceneColors = await Promise.all(promises);

//     console.log("These are the scene colors", sceneColors);
//     // send immediate
//   } catch (error) {
//     console.warn(error);
//   }
// }

// // 2, 3
// function activeRange(track_index: number, scene_index: number): boolean {
//   // to do.. based on the track_index and scene_index, return if it is within the range defined by SESSION_RING
//   return true;
// }

// async function fireSelectedScene() {
//   await ableton.song.view
//     .get("selected_scene")
//     .then((scene) => scene.fire())
//     .catch((error) => {
//       console.warn(error);
//     });
// }

// async function getClipSlot(rowNumber, columnNumber) {
//   if (rowNumber == undefined || columnNumber == undefined) return;
//   return await ableton.song
//     .get("tracks")
//     .then((tracks) =>
//       tracks[columnNumber]
//         .get("clip_slots")
//         .then(async (clip_slots) => clip_slots[rowNumber]),
//     )
//     .catch((error) => {
//       console.warn(error);
//     });
// }

// async function listenForAddedOrDeletedScenes() {
//   unsubList.push(
//     await ableton.song.addListener("scenes", async (scenes) => {
//       console.log("new scene");
//     }),
//   );
// }

// async function launchClip(rowNumber: number, columnNumber: number) {
//   const clipSlot = await getClipSlot(rowNumber, columnNumber);
//   // firing empty clip slot will stop clips on track
//   if (clipSlot) {
//     clipSlot.fire();
//   }
// }

// async function launchScene(rowNumber) {
//   const scene = await ableton.song
//     .get("scenes")
//     .then((scenes) => scenes[rowNumber]);
//   scene.fire();
// }


// async function selectedDeviceListener(track: Track, trackIndex: number) {
//   unsubList.push(
//     await track.view.addListener("selected_device", (device) => {
//       console.log(
//         EVENT.TRACK_VIEW_SELECTED_DEVICE_TX,
//         device.raw.class_name,
//         trackIndex,
//       );
//     }),
//   );
// }



// async function updateSessionBoxListeners() {
//   const scenes = await ableton.song.get("scenes");
//   const tracks = await ableton.song.get("tracks");
//   // this should be just a scenes split, based on scene offset.
//   scenes.forEach((scene, sceneIndex) => {
//     // setup clip_slot listeneres to get updates on clip colors and clip launch states!
//     scene.get("clip_slots").then((clip_slots) => {
//       clip_slots.forEach(async (clip_slot, clipSlotIndex) => {
//         // check active range, this return true now, but could be mapped to SESSION track and offset
//         if (activeRange(clipSlotIndex, sceneIndex)) {
//           // setup on init, all colors are dumped here!
//           clipColorListener(clip_slot, clipSlotIndex, sceneIndex);
//           // listen to clip changes (add / remove)
//           unsubList.push(
//             await clip_slot.addListener("has_clip", (has_clip) => {
//               // call the color listener again, when the clip has been changed i.e. removed or added
//               clipColorListener(clip_slot, clipSlotIndex, sceneIndex);
//               console.log(
//                 `${EVENT.CLIP_EXISTS} Scene ${sceneIndex} at slot ${clipSlotIndex} CHANGED has_clip ${has_clip}`,
//               );
//             }),
//           );

//           // get triggered change
//           unsubList.push(
//             await clip_slot.addListener(
//               "is_triggered",
//               async (bool: boolean) => {
//                 sendMessageToModule({
//                   evt: EVENT.CLIP_TRIGGERING, 
//                   v: bool, 
//                   t: clipSlotIndex, 
//                   s: sceneIndex
//                 })
//                 // to check which clip is actually playing on a channel, we need to listen for that on tracks!
//               },
//             ),
//           );
//         }
//       });
//     });
//   });

//   tracks.forEach(async (track, trackIndex) => {
//     // used to check which clip is playing
//     unsubList.push(
//       await track.addListener("playing_slot_index", (sceneIndex) => {
//         // this return "-2" when clips in channel stop playing
//         sendMessageToModule({
//           evt: EVENT.CLIP_PLAYING,
//           t: trackIndex,
//           s: sceneIndex,
//         });
//         console.log(EVENT.CLIP_PLAYING, trackIndex, sceneIndex);
//       }),
//     );

//     // get the mixer device for each track and setup volume, pan listeners
//     const mixerDevice = await track.get("mixer_device");
//     //mixerDeviceListener(mixerDevice, trackIndex);

//     // arm, mute, solo
//     //trackListener(track, trackIndex);

//     // selected device
//     selectedDeviceListener(track, trackIndex);
//   });

//   // examples...
//   setMixerDeviceVolume(1, Math.random());
//   setMixerDevicePan(1, Math.random() * 2 - 1);
//   //setTrackProperty(0, "mute", true);
// }

// async function mixerDeviceListener(
//   mixerDevice: MixerDevice,
//   trackIndex: number,
// ) {
//   // channel fader
//   const fader = await mixerDevice.get("volume");
//   const initialFaderValue = await fader.get("value");
//   console.log(EVENT.MIXER_VOLUME_TX, trackIndex, initialFaderValue.toFixed(2));
//   unsubList.push(
//     await fader.addListener("value", (data) => {
//       console.log(EVENT.MIXER_VOLUME_TX, trackIndex, data.toFixed(2));
//     }),
//   );
//   // panning
//   const pan = await mixerDevice.get("panning");
//   const initialPanValue = await fader.get("value");
//   console.log(EVENT.MIXER_PAN_TX, trackIndex, initialPanValue.toFixed(2));
//   unsubList.push(
//     await pan.addListener("value", (data) => {
//       console.log(EVENT.MIXER_PAN_TX, trackIndex, data.toFixed(2));
//     }),
//   );
//   // sends
//   const sends = await mixerDevice.get("sends");
//   sends.forEach(async (send, sendIndex) => {
//     // ! I think we should limit this to certain number of sends, but it's ok as it is
//     const initialSendValue = await send.get("value");
//     console.log(
//       `${
//         EVENT.MIXER_SEND_TX
//       } track: ${trackIndex} send: ${sendIndex} ${initialSendValue.toFixed(2)}`,
//     );
//     unsubList.push(
//       await send.addListener("value", (data) => {
//         console.log(
//           `${
//             EVENT.MIXER_SEND_TX
//           } track: ${trackIndex} send: ${sendIndex} ${data.toFixed(2)}`,
//         );
//       }),
//     );
//   });
// }