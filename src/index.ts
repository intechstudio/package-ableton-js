import { Ableton } from "ableton-js";
import { NavDirection } from "ableton-js/ns/application-view";
import { ClipSlot } from "ableton-js/ns/clip-slot";
import { Device } from "ableton-js/ns/device";
import { DeviceParameter } from "ableton-js/ns/device-parameter";
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

let sendMessageToModule: (args: any[] | {[key: string]: any}) => void = () => {};

export async function init(sendMessage) {
  await ableton.start();
  setupSessionBox(1, 8);
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
}

export async function setSessionBoxOffset(
  track_offset: number,
  scene_offset: number,
) {
  SESSION_RING.track_offset = track_offset;
  SESSION_RING.scene_offset = scene_offset;
  ableton.session.setSessionOffset(track_offset, scene_offset);
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

let selectedTrack: Track | undefined = undefined;
let selectedTrackMixerDevice: MixerDevice | undefined = undefined;
let selectedParameter: {parameter: DeviceParameter, min: number, max: number} | undefined = undefined;

// v2
let activeTrackSendValues = []
let activeTrackVolumeValue;
let activeTrackPanningValue;
let activeTrackMuteState;
let activeTrackArmState;
let activeTrackSoloState;

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
          selectedParameter = {
            parameter,
            min,
            max
          }
          sendActivePropertyToGrid();
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
        selectedTrack = track;
        const mixerDevice = await track.get("mixer_device");
        selectedTrackMixerDevice = mixerDevice;    

        // master channel has no sends!
        const sends = await mixerDevice.get("sends");
        if(sends.length && activePropertyIndex !== undefined){
          console.log(sends[activePropertyIndex].raw)
          activeTrackSendValues[activePropertyIndex] = sends[activePropertyIndex].raw.value.toFixed(2);
          unsubList.push(
            await mixerDevice.addListener("sends", (sends)=>{
              sends.forEach(async (send, index) => {
                activeTrackSendValues[index] = await send.get("value")
                // If we send right away the set changes, circular triggers are present
                // sendActivePropertyToGrid();
              })
            }
          ))
        }

        // volume (fader)
        const volume = await mixerDevice.get("volume");
        activeTrackVolumeValue = volume.raw.value.toFixed(2);
        unsubList.push(
          await volume.addListener("value", (v)=>{
            activeTrackVolumeValue = v.toFixed(2);
            // If we send right away the set changes, circular triggers are present
            console.log("GREG", activeTrackVolumeValue)
            // sendActivePropertyToGrid();
          })
        )


        //  panning
        const panning = await mixerDevice.get("panning");
        activeTrackPanningValue = panning.raw.value.toFixed(2)
        unsubList.push(
          await panning.addListener("value", (v)=>{
            activeTrackPanningValue = v.toFixed(2)
            // If we send right away the set changes, circular triggers are present
            // sendActivePropertyToGrid();
          })
        )

        if(await track.get("can_be_armed")){
          activeTrackArmState = await track.get("arm");
        }
        activeTrackMuteState = track.raw.mute;
        activeTrackSoloState = track.raw.solo;

        sendActivePropertyToGrid();

        console.log(
          `${EVENT.VIEW_TRACK_RX} ${track.raw.name}, color: ${hexToRgb(track.raw.color)} solo: ${track.raw.solo}, mute: ${track.raw.mute}`,
        );
      } else {
        console.log(EVENT.VIEW_TRACK_RX, null);
      }
    }),
  );
}

export async function autoSetActivePropertyValue(value: number){
  if(selectedTrackMixerDevice){
    if(activeProperty == "volume"){
      selectedTrackMixerDevice.get(activeProperty).then(prop => {
        prop.set("value",value)
      })
    }
    if(activeProperty == "panning"){
      selectedTrackMixerDevice.get(activeProperty).then(prop => {
        prop.set("value",value)
      })
    }
    if(activeProperty == "sends"){
      const sends = await selectedTrackMixerDevice.get(activeProperty)
      if(sends.length && activePropertyIndex !== undefined){
        selectedTrackMixerDevice.get(activeProperty).then(props => {
          props[activePropertyIndex].set("value",value)
        })
      }
    }
  }
  if(activeProperty == "lastTouched"){
    if(selectedParameter){
      selectedParameter.parameter.set("value", value);
    }
  }
}


export async function autoResetActiveProperty(){
 if(selectedTrackMixerDevice){
    if(activeProperty == "volume"){
      const prop = await selectedTrackMixerDevice.get(activeProperty);
      const defaultPropValue = await prop.get("default_value");
      prop.set("value",Number(defaultPropValue))
    }
    if(activeProperty == "panning"){
      const prop = await selectedTrackMixerDevice.get(activeProperty);
      const defaultPropValue = await prop.get("default_value");
      prop.set("value",Number(defaultPropValue))
    }
    if(activeProperty == "sends"){
      const sends = await selectedTrackMixerDevice.get(activeProperty)
      if(sends.length && activePropertyIndex !== undefined){
        const defaultPropValue = await sends[0].get("default_value");
        selectedTrackMixerDevice.get(activeProperty).then(props => {
          props[activePropertyIndex].set("value",Number(defaultPropValue))
        })
      }
    }
  }
  if(activeProperty == "lastTouched"){
    if(selectedParameter){
      const defaultPropValue = await selectedParameter.parameter.get("default_value");
      selectedParameter.parameter.set("value", Number(defaultPropValue));
    }
  }
}

let activeProperty: string | undefined = undefined;
let activePropertyIndex: number | undefined = undefined;
async function sendActivePropertyToGrid(){
    if(activeProperty == "volume"){
      sendMessageToModule({
        evt: "ST_VOL",
        v: activeTrackVolumeValue,
        min: 0,
        max: 1
      })
    }
    if(activeProperty == "panning"){
      sendMessageToModule({
        evt: "ST_PAN",
        v: activeTrackPanningValue,
        min: -1,
        max: 1
      })
    }
    if(activeProperty == "sends" ){
      sendMessageToModule({
        evt: "ST_SEND",
        v: activeTrackSendValues[activePropertyIndex],
        min: 0,
        max: 1
      })
    }

    if(activeProperty == "lastTouched" ){
      sendMessageToModule({
        evt: "ST_LAST",
        n: selectedParameter.parameter.raw.name,
        v: selectedParameter.parameter.raw.value,
        min: selectedParameter.min,
        max: selectedParameter.max
      })
    }

    // track defaults
    sendMessageToModule({
      evt: "ST_DEFAULT",
      a: activeTrackArmState,
      s: activeTrackSoloState,
      m: activeTrackMuteState
    })
}
export async function autoSetActiveProperty(prop: string, index: number){
  activeProperty = prop;
  activePropertyIndex = index;
  console.log("autoSetActiveProperty",activeProperty, activePropertyIndex)
  // When property selection is triggered on Grid, send back to Grid the property details
  sendActivePropertyToGrid()
}

// set arm, mute or solo
export async function autoSetActiveTrackArmMuteSolo(
  property: "arm" | "mute" | "solo",
) {
  if(selectedTrack){
    let currentState;
    // groups, returns and master has no arm!
    if(property == "arm"){
      const can_be_armed = await selectedTrack.get("can_be_armed")
      console.log("can_be_armed",can_be_armed)
      if(can_be_armed){
        currentState = await selectedTrack.get(property);
        selectedTrack.set(property, !currentState);
      }
    } else {
      currentState = await selectedTrack.get(property);
      selectedTrack.set(property, !currentState);
    } 

    if(property == "arm"){
      activeTrackArmState = !currentState;
    }
    if(property == "mute"){
      activeTrackMuteState = !currentState;
    }
    if(property == "solo"){
      activeTrackSoloState = !currentState
    }
    sendMessageToModule({
      evt: "ST_DEFAULT",
      a: activeTrackArmState,
      s: activeTrackSoloState,
      m: activeTrackMuteState
    })
  }
}

export async function navigate(direction: string){
  const currentTrack = await ableton.song.view.get("selected_track");
  const allTracks = await ableton.song.get("tracks");

  // Find current track index
  const currentIndex = allTracks.findIndex(track => track.raw.id === currentTrack.raw.id);

  // Navigate 
  const dir = direction == "right" ? 1 : -1;
  const nextIndex = Math.max(0, Math.min(currentIndex + dir, allTracks.length - 1));
  await ableton.song.view.set("selected_track", allTracks[nextIndex].raw.id);
  
  // Update session box offset to follow the selected track
  const newTrackOffset = Math.max(0, nextIndex - Math.floor(SESSION_RING.tracks / 2));
  await setSessionBoxOffset(newTrackOffset, SESSION_RING.scene_offset);
}

function hexToRgb(hex) {
  var bigint = parseInt(hex, 16);
  var r = (bigint >> 16) & 255;
  var g = (bigint >> 8) & 255;
  var b = bigint & 255;
  return [r, g, b];
}

