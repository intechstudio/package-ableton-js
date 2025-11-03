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
exports.autoSetActivePropertyValue = autoSetActivePropertyValue;
exports.autoResetActiveProperty = autoResetActiveProperty;
exports.autoSetActiveProperty = autoSetActiveProperty;
exports.autoSetActiveTrackArmMuteSolo = autoSetActiveTrackArmMuteSolo;
exports.navigate = navigate;
exports.playOrStop = playOrStop;
exports.record = record;
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
        setupSessionBox(1, 8);
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
    });
}
function setSessionBoxOffset(track_offset, scene_offset) {
    return __awaiter(this, void 0, void 0, function* () {
        SESSION_RING.track_offset = track_offset;
        SESSION_RING.scene_offset = scene_offset;
        ableton.session.setSessionOffset(track_offset, scene_offset);
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
let selectedTrack = undefined;
let selectedTrackMixerDevice = undefined;
let selectedParameter = undefined;
// v2
let activeTrackSendValues = [];
let activeTrackVolumeValue;
let activeTrackPanningValue;
let activeTrackMuteState;
let activeTrackArmState;
let activeTrackSoloState;
// v3
let activeTrackName;
function selectionListener() {
    return __awaiter(this, void 0, void 0, function* () {
        unsubList.push(yield ableton.song.view.addListener("selected_parameter", (parameter) => __awaiter(this, void 0, void 0, function* () {
            if (parameter) {
                const [min, max] = yield Promise.all([
                    parameter.get("min"),
                    parameter.get("max"),
                ]);
                selectedParameter = {
                    parameter,
                    min,
                    max,
                };
                sendActivePropertyToGrid();
                console.log(EVENT.VIEW_PARAMETER_RX, parameter.raw.name, parameter.raw.value, min, max);
            }
            else {
                console.log(EVENT.VIEW_PARAMETER_RX, null);
            }
        })));
        unsubList.push(yield ableton.song.view.addListener("selected_track", (track) => __awaiter(this, void 0, void 0, function* () {
            if (track) {
                selectedTrack = track;
                const mixerDevice = yield track.get("mixer_device");
                selectedTrackMixerDevice = mixerDevice;
                // master channel has no sends!
                // sends!
                const sends = yield mixerDevice.get("sends");
                if (sends.length > 0) {
                    sends.forEach((send, index) => __awaiter(this, void 0, void 0, function* () {
                        activeTrackSendValues[index] = yield send.raw.value.toFixed(2);
                        unsubList.push(yield send.addListener("value", (v) => {
                            activeTrackSendValues[index] = v.toFixed(2);
                        }));
                    }));
                }
                // volume (fader)
                const volume = yield mixerDevice.get("volume");
                activeTrackVolumeValue = volume.raw.value.toFixed(2);
                unsubList.push(yield volume.addListener("value", (v) => {
                    activeTrackVolumeValue = v.toFixed(2);
                }));
                //  panning
                const panning = yield mixerDevice.get("panning");
                activeTrackPanningValue = panning.raw.value.toFixed(2);
                unsubList.push(yield panning.addListener("value", (v) => {
                    activeTrackPanningValue = v.toFixed(2);
                }));
                // track arm
                if (yield track.get("can_be_armed")) {
                    activeTrackArmState = yield track.get("arm");
                    unsubList.push(yield track.addListener("arm", (data) => {
                        activeTrackArmState = data;
                        sendActivePropertyToGrid();
                    }));
                }
                // track mute
                activeTrackMuteState = track.raw.mute;
                unsubList.push(yield track.addListener("mute", (data) => {
                    activeTrackMuteState = data;
                    sendActivePropertyToGrid();
                }));
                // track solo
                activeTrackSoloState = track.raw.solo;
                unsubList.push(yield track.addListener("solo", (data) => {
                    activeTrackSoloState = data;
                    sendActivePropertyToGrid();
                }));
                activeTrackName = track.raw.name;
                sendActivePropertyToGrid();
                sendMessageToModule({
                    gui: true,
                    tn: activeTrackName,
                    c: Array.from(hexToRgb(track.raw.color))
                });
                console.log(`${EVENT.VIEW_TRACK_RX} ${track.raw.name}, color: ${hexToRgb(track.raw.color)} solo: ${track.raw.solo}, mute: ${track.raw.mute}`);
            }
            else {
                console.log(EVENT.VIEW_TRACK_RX, null);
            }
        })));
    });
}
function autoSetActivePropertyValue(value) {
    return __awaiter(this, void 0, void 0, function* () {
        if (selectedTrackMixerDevice) {
            if (activeProperty == "volume") {
                selectedTrackMixerDevice.get(activeProperty).then((prop) => {
                    prop.set("value", value);
                });
            }
            if (activeProperty == "panning") {
                selectedTrackMixerDevice.get(activeProperty).then((prop) => {
                    prop.set("value", value);
                });
            }
            if (activeProperty == "sends") {
                const sends = yield selectedTrackMixerDevice.get(activeProperty);
                if (sends.length && activePropertyIndex !== undefined) {
                    selectedTrackMixerDevice.get(activeProperty).then((props) => {
                        props[activePropertyIndex].set("value", value);
                    });
                }
            }
        }
        if (activeProperty == "lastTouched") {
            if (selectedParameter) {
                selectedParameter.parameter.set("value", value);
            }
        }
    });
}
function autoResetActiveProperty() {
    return __awaiter(this, void 0, void 0, function* () {
        if (selectedTrackMixerDevice) {
            if (activeProperty == "volume") {
                const prop = yield selectedTrackMixerDevice.get(activeProperty);
                const defaultPropValue = yield prop.get("default_value");
                prop.set("value", Number(defaultPropValue));
            }
            if (activeProperty == "panning") {
                const prop = yield selectedTrackMixerDevice.get(activeProperty);
                const defaultPropValue = yield prop.get("default_value");
                prop.set("value", Number(defaultPropValue));
            }
            if (activeProperty == "sends") {
                const sends = yield selectedTrackMixerDevice.get(activeProperty);
                if (sends.length && activePropertyIndex !== undefined) {
                    const defaultPropValue = yield sends[0].get("default_value");
                    selectedTrackMixerDevice.get(activeProperty).then((props) => {
                        props[activePropertyIndex].set("value", Number(defaultPropValue));
                    });
                }
            }
        }
        if (activeProperty == "lastTouched") {
            if (selectedParameter) {
                const defaultPropValue = yield selectedParameter.parameter.get("default_value");
                if (defaultPropValue) {
                    selectedParameter.parameter.set("value", Number(defaultPropValue));
                }
            }
        }
    });
}
let activeProperty = undefined;
let activePropertyIndex = undefined;
function sendActivePropertyToGrid() {
    return __awaiter(this, void 0, void 0, function* () {
        if (activeProperty == "volume") {
            sendMessageToModule({
                evt: "ST_VOL",
                v: activeTrackVolumeValue,
                min: 0,
                max: 1,
            });
        }
        if (activeProperty == "panning") {
            sendMessageToModule({
                evt: "ST_PAN",
                v: activeTrackPanningValue,
                min: -1,
                max: 1,
            });
        }
        if (activeProperty == "sends") {
            console.log("ST_SEND ST_SEND", activeTrackSendValues);
            sendMessageToModule({
                evt: "ST_SEND",
                ap: activePropertyIndex,
                v: activeTrackSendValues, // sends an array! (table)
                min: 0,
                max: 1,
            });
        }
        if (activeProperty == "lastTouched") {
            sendMessageToModule({
                evt: "ST_LAST",
                n: selectedParameter.parameter.raw.name,
                v: selectedParameter.parameter.raw.value,
                min: selectedParameter.min,
                max: selectedParameter.max,
            });
        }
        // track defaults
        sendMessageToModule({
            evt: "ST_DEFAULT",
            a: activeTrackArmState,
            s: activeTrackSoloState,
            m: activeTrackMuteState,
        });
    });
}
function autoSetActiveProperty(prop, index) {
    return __awaiter(this, void 0, void 0, function* () {
        activeProperty = prop;
        activePropertyIndex = index;
        console.log("autoSetActiveProperty", activeProperty, activePropertyIndex);
        // When property selection is triggered on Grid, send back to Grid the property details
        sendActivePropertyToGrid();
    });
}
// set arm, mute or solo
function autoSetActiveTrackArmMuteSolo(property) {
    return __awaiter(this, void 0, void 0, function* () {
        if (selectedTrack) {
            let currentState;
            // groups, returns and master has no arm!
            if (property == "arm") {
                const can_be_armed = yield selectedTrack.get("can_be_armed");
                if (can_be_armed) {
                    currentState = yield selectedTrack.get(property);
                    selectedTrack.set(property, !currentState);
                }
            }
            else {
                currentState = yield selectedTrack.get(property);
                selectedTrack.set(property, !currentState);
            }
            if (property == "arm") {
                activeTrackArmState = !currentState;
            }
            if (property == "mute") {
                activeTrackMuteState = !currentState;
            }
            if (property == "solo") {
                activeTrackSoloState = !currentState;
            }
            sendMessageToModule({
                evt: "ST_DEFAULT",
                a: activeTrackArmState,
                s: activeTrackSoloState,
                m: activeTrackMuteState,
            });
        }
    });
}
function navigate(direction) {
    return __awaiter(this, void 0, void 0, function* () {
        const currentTrack = yield ableton.song.view.get("selected_track");
        const allTracks = yield ableton.song.get("tracks");
        // Find current track index
        const currentIndex = allTracks.findIndex((track) => track.raw.id === currentTrack.raw.id);
        // Navigate
        const dir = direction == "right" ? 1 : -1;
        const nextIndex = Math.max(0, Math.min(currentIndex + dir, allTracks.length - 1));
        yield ableton.song.view.set("selected_track", allTracks[nextIndex].raw.id);
        // Update session box offset to follow the selected track
        const newTrackOffset = Math.max(0, nextIndex - Math.floor(SESSION_RING.tracks / 2));
        yield setSessionBoxOffset(newTrackOffset, SESSION_RING.scene_offset);
    });
}
function playOrStop() {
    return __awaiter(this, void 0, void 0, function* () {
        const isPlaying = yield ableton.song.get("is_playing");
        if (isPlaying == true) {
            yield ableton.song.stopPlaying();
        }
        else {
            yield ableton.song.startPlaying();
        }
    });
}
function record() {
    return __awaiter(this, void 0, void 0, function* () {
        const isRecording = yield ableton.song.get("record_mode");
        if (isRecording == 1) {
            yield ableton.song.set("record_mode", 0);
        }
        else {
            yield ableton.song.set("record_mode", 1);
        }
    });
}
function hexToRgb(hex) {
    var bigint = parseInt(hex, 16);
    var r = (bigint >> 16) & 255;
    var g = (bigint >> 8) & 255;
    var b = bigint & 255;
    return [r, g, b];
}
