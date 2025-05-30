"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.init = init;
exports.close = close;
exports.setupSessionBox = setupSessionBox;
exports.setSessionBoxOffset = setSessionBoxOffset;
const ableton_js_1 = require("ableton-js");
// Log all messages to the console
const ableton = new ableton_js_1.Ableton({ logger: console });
let SESSION_RING = {
    tracks: 0,
    scenes: 0,
    scene_offset: 0,
    track_offset: 0,
};
let unsubList = [];
let sendMessageToModule = () => { };
function init(sendMessage) {
    return __awaiter(this, void 0, void 0, function* () {
        yield ableton.start();
        setupSessionBox(4, 4);
        unsubList.push(yield ableton.song.addListener("scenes", (scenes) => {
            console.log("Scenes changed");
            updateSessionBoxListeners();
        }));
        unsubList.push(yield ableton.song.addListener("tracks", (tracks) => {
            console.log("Tracks changed");
            updateSessionBoxListeners();
        }));
        selectionListener();
        sendMessageToModule = sendMessage;
    });
}
function close() {
    return __awaiter(this, void 0, void 0, function* () {
        yield ableton.close();
        unsubList.forEach((e) => e());
    });
}
function setupSessionBox(num_tracks, num_scenes) {
    return __awaiter(this, void 0, void 0, function* () {
        SESSION_RING.tracks = num_tracks;
        SESSION_RING.scenes = num_scenes;
        ableton.session.setupSessionBox(num_tracks, num_scenes);
        updateSessionBoxListeners();
    });
}
function setSessionBoxOffset(track_offset, scene_offset) {
    return __awaiter(this, void 0, void 0, function* () {
        SESSION_RING.track_offset = track_offset;
        SESSION_RING.scene_offset = scene_offset;
        ableton.session.setSessionOffset(track_offset, scene_offset);
        updateSessionBoxListeners();
    });
}
var EVENT;
(function (EVENT) {
    EVENT["COLOR"] = "COLOR";
    EVENT["CLIP_EXISTS"] = "CLIP_EXISTS";
    EVENT["CLIP_TRIGGERING"] = "CLIP_TRIGGERING";
    EVENT["CLIP_PLAYING"] = "CLIP_PLAYING";
    EVENT["MIXER_VOLUME_RX"] = "MIXER_VOLUME_RX";
    EVENT["MIXER_VOLUME_TX"] = "MIXER_VOLUME_TX";
    EVENT["MIXER_PAN_RX"] = "MIXER_PAN_RX";
    EVENT["MIXER_PAN_TX"] = "MIXER_PAN_TX";
    EVENT["MIXER_SEND_TX"] = "MIXER_SEND_TX";
    EVENT["MIXER_SEND_RX"] = "MIXER_SEND_RX";
    EVENT["TRACK_ARM_TX"] = "TRACK_ARM_TX";
    EVENT["TRACK_ARM_RX"] = "TRACK_ARM_RX";
    EVENT["TRACK_SOLO_TX"] = "TRACK_SOLO_TX";
    EVENT["TRACK_SOLO_RX"] = "TRACK_SOLO_RX";
    EVENT["TRACK_MUTE_TX"] = "TRACK_MUTE_TX";
    EVENT["TRACK_MUTE_RX"] = "TRACK_MUTE_RX";
    EVENT["TRACK_VIEW_SELECTED_DEVICE_TX"] = "TRACK_VIEW_SELECTED_DEVICE_TX";
    EVENT["VIEW_PARAMETER_RX"] = "VIEW_PARAMETER_RX";
    EVENT["VIEW_PARAMETER_TX"] = "VIEW_PARAMETER_TX";
    EVENT["VIEW_TRACK_RX"] = "VIEW_TRACK_RX";
    EVENT["VIEW_TRACK_TX"] = "VIEW_TRACK_TX";
})(EVENT || (EVENT = {}));
function selectionListener() {
    return __awaiter(this, void 0, void 0, function* () {
        unsubList.push(yield ableton.song.view.addListener("selected_parameter", (parameter) => __awaiter(this, void 0, void 0, function* () {
            if (parameter) {
                const [min, max] = yield Promise.all([parameter.get("min"), parameter.get("max")]);
                console.log(EVENT.VIEW_PARAMETER_RX, parameter.raw.name, parameter.raw.value, min, max);
            }
            else {
                console.log(EVENT.VIEW_PARAMETER_RX, null);
            }
        })));
        unsubList.push(yield ableton.song.view.addListener("selected_track", (track) => __awaiter(this, void 0, void 0, function* () {
            if (track) {
                const value = yield track.get("mixer_device").then(md => md.get("volume")).then(v => v.raw.value.toFixed(2));
                sendMessageToModule([EVENT.VIEW_TRACK_RX, hexToRgb(track.raw.color)]);
                console.log(`${EVENT.VIEW_TRACK_RX} ${track.raw.name}, color: ${hexToRgb(track.raw.color)} solo: ${track.raw.solo}, mute: ${track.raw.mute}, volume: ${value}`);
            }
            else {
                console.log(EVENT.VIEW_TRACK_RX, null);
            }
        })));
    });
}
let clipSlotListeners = [];
let clipSlotPromises = [];
function updateSessionBoxListeners() {
    return __awaiter(this, void 0, void 0, function* () {
        const scenes = yield ableton.song.get("scenes");
        const tracks = yield ableton.song.get("tracks");
        // this should be just a scenes split, based on scene offset.
        scenes.forEach((scene, sceneIndex) => {
            // setup clip_slot listeneres to get updates on clip colors and clip launch states!
            scene.get("clip_slots").then((clip_slots) => {
                clip_slots.forEach((clip_slot, clipSlotIndex) => __awaiter(this, void 0, void 0, function* () {
                    // check active range, this return true now, but could be mapped to SESSION track and offset
                    if (activeRange(clipSlotIndex, sceneIndex)) {
                        // setup on init, all colors are dumped here!
                        clipColorListener(clip_slot, clipSlotIndex, sceneIndex);
                        // listen to clip changes (add / remove)
                        unsubList.push(yield clip_slot.addListener("has_clip", (has_clip) => {
                            // call the color listener again, when the clip has been changed i.e. removed or added
                            clipColorListener(clip_slot, clipSlotIndex, sceneIndex);
                            console.log(`${EVENT.CLIP_EXISTS} Scene ${sceneIndex} at slot ${clipSlotIndex} CHANGED has_clip ${has_clip}`);
                        }));
                        // get triggered change
                        unsubList.push(yield clip_slot.addListener("is_triggered", (bool) => __awaiter(this, void 0, void 0, function* () {
                            console.log(EVENT.CLIP_TRIGGERING, bool);
                            // to check which clip is actually playing on a channel, we need to listen for that on tracks!
                        })));
                    }
                }));
            });
        });
        tracks.forEach((track, trackIndex) => __awaiter(this, void 0, void 0, function* () {
            // used to check which clip is playing
            unsubList.push(yield track.addListener("playing_slot_index", (sceneIndex) => {
                // this return "-2" when clips in channel stop playing
                console.log(EVENT.CLIP_PLAYING, trackIndex, sceneIndex);
            }));
            // get the mixer device for each track and setup volume, pan listeners
            const mixerDevice = yield track.get("mixer_device");
            mixerDeviceListener(mixerDevice, trackIndex);
            // arm, mute, solo
            trackListener(track, trackIndex);
            // selected device
            selectedDeviceListener(track, trackIndex);
        }));
        setMixerDeviceVolume(1, Math.random());
        setMixerDevicePan(1, Math.random() * 2 - 1);
        setTrackProperty(0, "mute", true);
    });
}
function mixerDeviceListener(mixerDevice, trackIndex) {
    return __awaiter(this, void 0, void 0, function* () {
        // channel fader
        const fader = yield mixerDevice.get("volume");
        const initialFaderValue = yield fader.get("value");
        console.log(EVENT.MIXER_VOLUME_TX, trackIndex, initialFaderValue.toFixed(2));
        unsubList.push(yield fader.addListener("value", (data) => {
            console.log(EVENT.MIXER_VOLUME_TX, trackIndex, data.toFixed(2));
        }));
        // panning
        const pan = yield mixerDevice.get("panning");
        const initialPanValue = yield fader.get("value");
        console.log(EVENT.MIXER_PAN_TX, trackIndex, initialPanValue.toFixed(2));
        unsubList.push(yield pan.addListener("value", (data) => {
            console.log(EVENT.MIXER_PAN_TX, trackIndex, data.toFixed(2));
        }));
        // sends
        const sends = yield mixerDevice.get("sends");
        sends.forEach((send, sendIndex) => __awaiter(this, void 0, void 0, function* () {
            // ! I think we should limit this to certain number of sends, but it's ok as it is
            const initialSendValue = yield send.get("value");
            console.log(`${EVENT.MIXER_SEND_TX} track: ${trackIndex} send: ${sendIndex} ${initialSendValue.toFixed(2)}`);
            unsubList.push(yield send.addListener("value", (data) => {
                console.log(`${EVENT.MIXER_SEND_TX} track: ${trackIndex} send: ${sendIndex} ${data.toFixed(2)}`);
            }));
        }));
    });
}
function trackListener(track, trackIndex) {
    return __awaiter(this, void 0, void 0, function* () {
        unsubList.push(yield track.addListener("arm", (data) => {
            console.log(EVENT.TRACK_ARM_TX, data, trackIndex);
        }));
        unsubList.push(yield track.addListener("solo", (data) => {
            console.log(EVENT.TRACK_SOLO_TX, data, trackIndex);
        }));
        unsubList.push(yield track.addListener("mute", (data) => {
            console.log(EVENT.TRACK_MUTE_TX, data, trackIndex);
        }));
    });
}
function selectedDeviceListener(track, trackIndex) {
    return __awaiter(this, void 0, void 0, function* () {
        unsubList.push(yield track.view.addListener("selected_device", (device) => {
            console.log(EVENT.TRACK_VIEW_SELECTED_DEVICE_TX, device.raw.class_name, trackIndex);
        }));
    });
}
// set arm, mute or solo
function setTrackProperty(trackIndex, property, value) {
    return __awaiter(this, void 0, void 0, function* () {
        yield ableton.song
            .get("tracks")
            .then((tracks) => tracks[trackIndex])
            .then((track) => track.set(property, value));
    });
}
// change volume of a channel
function setMixerDeviceVolume(trackIndex, volume) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(EVENT.MIXER_VOLUME_RX, trackIndex, volume);
        if (!(volume <= 1 && volume >= 0))
            return;
        yield ableton.song
            .get("tracks")
            .then((tracks) => tracks[trackIndex])
            .then((track) => track.get("mixer_device"))
            .then((md) => md.get("volume"))
            .then((v) => v.set("value", volume));
    });
}
// change pan on channel
function setMixerDevicePan(trackIndex, pan) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(EVENT.MIXER_PAN_RX, trackIndex, pan);
        if (!(pan <= 1 && pan >= -1))
            return;
        yield ableton.song
            .get("tracks")
            .then((tracks) => tracks[trackIndex])
            .then((track) => track.get("mixer_device"))
            .then((md) => md.get("panning"))
            .then((v) => v.set("value", pan));
    });
}
function clipColorListener(clip_slot, track, scene) {
    return __awaiter(this, void 0, void 0, function* () {
        clip_slot
            .get("clip")
            .then((clip) => __awaiter(this, void 0, void 0, function* () {
            if (clip) {
                unsubList.push(yield clip.addListener("color", (color) => {
                    console.log(EVENT.COLOR, track, scene, color.rgb);
                }));
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
            }
            else {
                console.log(EVENT.COLOR, track, scene, { r: 0, g: 0, b: 0 });
                return new Promise((res, rej) => {
                    res({ track, scene, color: "000000" });
                    rej({ track, scene, color: "000000" });
                });
            }
        }))
            .catch((error) => {
            console.error("An error occurred:", error);
            return { track, scene, color: "000000" };
        });
    });
}
let activeSceneSubscribtions = [];
function sceneListener(scenes) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            activeSceneSubscribtions.forEach((sub) => sub());
            activeSceneSubscribtions = [];
            const promises = scenes.map((scene, row) => __awaiter(this, void 0, void 0, function* () {
                const sceneListener = yield scene.addListener("is_triggered", (bool) => __awaiter(this, void 0, void 0, function* () {
                    // lookup or other method should be used, previously based on lookuptable BUTTONS
                    const led = row;
                    console.log("setGridLedColor", led, bool, false);
                }));
                activeSceneSubscribtions.push(sceneListener);
                return scene.get("color").then((color) => {
                    return { row: row, color: color.rgb };
                });
            }));
            const sceneColors = yield Promise.all(promises);
            console.log("These are the scene colors", sceneColors);
            // send immediate
        }
        catch (error) {
            console.warn(error);
        }
    });
}
// 2, 3
function activeRange(track_index, scene_index) {
    // to do.. based on the track_index and scene_index, return if it is within the range defined by SESSION_RING
    return true;
}
function fireSelectedScene() {
    return __awaiter(this, void 0, void 0, function* () {
        yield ableton.song.view
            .get("selected_scene")
            .then((scene) => scene.fire())
            .catch((error) => {
            console.warn(error);
        });
    });
}
function getClipSlot(rowNumber, columnNumber) {
    return __awaiter(this, void 0, void 0, function* () {
        if (rowNumber == undefined || columnNumber == undefined)
            return;
        return yield ableton.song
            .get("tracks")
            .then((tracks) => tracks[columnNumber]
            .get("clip_slots")
            .then((clip_slots) => __awaiter(this, void 0, void 0, function* () { return clip_slots[rowNumber]; })))
            .catch((error) => {
            console.warn(error);
        });
    });
}
function listenForAddedOrDeletedScenes() {
    return __awaiter(this, void 0, void 0, function* () {
        unsubList.push(yield ableton.song.addListener("scenes", (scenes) => __awaiter(this, void 0, void 0, function* () {
            console.log("new scene");
        })));
    });
}
function launchClip(rowNumber, columnNumber) {
    return __awaiter(this, void 0, void 0, function* () {
        const clipSlot = yield getClipSlot(rowNumber, columnNumber);
        // firing empty clip slot will stop clips on track
        if (clipSlot) {
            clipSlot.fire();
        }
    });
}
function launchScene(rowNumber) {
    return __awaiter(this, void 0, void 0, function* () {
        const scene = yield ableton.song
            .get("scenes")
            .then((scenes) => scenes[rowNumber]);
        scene.fire();
    });
}
function hexToRgb(hex) {
    var bigint = parseInt(hex, 16);
    var r = (bigint >> 16) & 255;
    var g = (bigint >> 8) & 255;
    var b = bigint & 255;
    return [r, g, b];
}
