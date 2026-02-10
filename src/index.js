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
exports.playOrStop = playOrStop;
exports.record = record;
exports.navigate = navigate;
exports.ringSetup = ringSetup;
exports.ringSetOffset = ringSetOffset;
exports.ringNavigate = ringNavigate;
exports.ringToggleMute = ringToggleMute;
exports.ringToggleSolo = ringToggleSolo;
exports.ringToggleArm = ringToggleArm;
exports.ringSetVolume = ringSetVolume;
exports.ringSetPanning = ringSetPanning;
exports.ringSetSend = ringSetSend;
exports.ringSelectTrack = ringSelectTrack;
const ableton_js_1 = require("ableton-js");
const ring_manager_1 = require("./ring-manager");
const ableton = new ableton_js_1.Ableton({ logger: console });
let sendMessageToModule = () => { };
let ringManager = undefined;
function init(sendMessage) {
    return __awaiter(this, void 0, void 0, function* () {
        yield ableton.start();
        sendMessageToModule = sendMessage;
        ringManager = new ring_manager_1.RingManager(ableton, sendMessage);
        yield ringManager.init();
        // Default ring: 1 track wide, 8 scenes. Grid can reconfigure via ring_setup.
        yield ringManager.setupRing(1, 8);
    });
}
function close() {
    return __awaiter(this, void 0, void 0, function* () {
        if (ringManager) {
            yield ringManager.destroy();
            ringManager = undefined;
        }
        yield ableton.close();
    });
}
// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------
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
/**
 * Navigate selected track left/right. The ring manager auto-follows
 * via its own selected_track listener.
 */
function navigate(direction) {
    return __awaiter(this, void 0, void 0, function* () {
        const currentTrack = yield ableton.song.view.get("selected_track");
        const allTracks = yield ableton.song.get("tracks");
        const currentIndex = allTracks.findIndex((track) => track.raw.id === currentTrack.raw.id);
        const dir = direction === "right" ? 1 : -1;
        const nextIndex = Math.max(0, Math.min(currentIndex + dir, allTracks.length - 1));
        try {
            yield ableton.song.view.set("selected_track", allTracks[nextIndex].raw.id);
        }
        catch (error) {
            console.log("Next track is out of range.");
        }
    });
}
// ---------------------------------------------------------------------------
// Ring manager exports — called from index.js via gps() commands from Grid
// ---------------------------------------------------------------------------
/** Set up the ring dimensions and initial offset. */
function ringSetup(numTracks_1, numScenes_1) {
    return __awaiter(this, arguments, void 0, function* (numTracks, numScenes, trackOffset = 0, sceneOffset = 0) {
        if (ringManager) {
            yield ringManager.setupRing(numTracks, numScenes, trackOffset, sceneOffset);
        }
    });
}
/** Move the ring offset to an absolute position. */
function ringSetOffset(trackOffset, sceneOffset) {
    return __awaiter(this, void 0, void 0, function* () {
        if (ringManager) {
            yield ringManager.setOffset(trackOffset, sceneOffset);
        }
    });
}
/** Move the ring left or right by 1 track. */
function ringNavigate(direction) {
    return __awaiter(this, void 0, void 0, function* () {
        if (ringManager) {
            yield ringManager.navigateRing(direction);
        }
    });
}
/** Toggle mute on the track at ring index. */
function ringToggleMute(ringIndex) {
    ringManager === null || ringManager === void 0 ? void 0 : ringManager.toggleMute(ringIndex);
}
/** Toggle solo on the track at ring index. */
function ringToggleSolo(ringIndex) {
    ringManager === null || ringManager === void 0 ? void 0 : ringManager.toggleSolo(ringIndex);
}
/** Toggle arm on the track at ring index. */
function ringToggleArm(ringIndex) {
    ringManager === null || ringManager === void 0 ? void 0 : ringManager.toggleArm(ringIndex);
}
/** Set volume on the track at ring index (0..1). */
function ringSetVolume(ringIndex, value) {
    ringManager === null || ringManager === void 0 ? void 0 : ringManager.setVolume(ringIndex, value);
}
/** Set panning on the track at ring index (-1..1). */
function ringSetPanning(ringIndex, value) {
    ringManager === null || ringManager === void 0 ? void 0 : ringManager.setPanning(ringIndex, value);
}
/** Set a send value on the track at ring index. */
function ringSetSend(ringIndex, sendIndex, value) {
    ringManager === null || ringManager === void 0 ? void 0 : ringManager.setSend(ringIndex, sendIndex, value);
}
/** Select the track at ring index in Ableton (without moving the ring). */
function ringSelectTrack(ringIndex) {
    ringManager === null || ringManager === void 0 ? void 0 : ringManager.selectTrackInRing(ringIndex);
}
