"use strict";
/**
 * RingManager — manages listeners for tracks within the Ableton session ring
 * (red box). Tracks entering or leaving the ring window are subscribed /
 * unsubscribed via a diff algorithm so that moving the ring by one position
 * doesn't tear down every listener.
 *
 * The ring is decoupled from the selected track — the selected track can be
 * outside the ring, and the ring can be moved independently.
 *
 * Events sent to Grid (via sendMessage callback):
 *   { evt: "RT_MUTE",  i: ringIndex, v: boolean }
 *   { evt: "RT_SOLO",  i: ringIndex, v: boolean }
 *   { evt: "RT_ARM",   i: ringIndex, v: boolean }
 *   { evt: "RT_VOL",   i: ringIndex, v: number  }
 *   { evt: "RT_PAN",   i: ringIndex, v: number  }
 *   { evt: "RT_SEND",  i: ringIndex, si: sendIndex, v: number }
 *   { evt: "RT_INFO",  i: ringIndex, name: string, color: [r, g, b] }
 *   { evt: "RT_SELECTED", index, ringIndex, name, color: [r, g, b] }  — selected track info
 *   { evt: "RT_PLAYING_CLIP", name: string, color: [r, g, b] }  — currently playing clip on selected track
 *   { evt: "RT_PARAM", name: string, v: number, min: number, max: number }  — selected parameter
 *   { evt: "RT_TRANSPORT", playing: boolean, recording: boolean }  — transport state
 */
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
exports.RingManager = void 0;
const subscription_group_1 = require("./subscription-group");
// ---------------------------------------------------------------------------
// RingManager
// ---------------------------------------------------------------------------
class RingManager {
    constructor(ableton, sendMessage) {
        /** Listeners on ring tracks — keyed "track:{id}:mute", "track:{id}:send:0", etc. */
        this.ringSubs = new subscription_group_1.SubscriptionGroup("ring");
        /** Global listeners owned by the ring manager (tracks list, return_tracks). */
        this.globalSubs = new subscription_group_1.SubscriptionGroup("ring-global");
        /** Track IDs currently in the ring window, in ring-index order. */
        this.currentRingTrackIds = [];
        /** Maps track ID → current ring index. Updated on every ring move so that
         *  listener closures can resolve the correct index without re-subscribing. */
        this.ringIndexByTrackId = new Map();
        /** Per-track state cache — source of truth for what was last sent to Grid. */
        this.trackStates = new Map();
        /** Cached mixer DeviceParameter objects — avoids UDP round-trips on set calls. */
        this.mixerCache = new Map();
        /** Ring dimensions and offset. */
        this.ringWidth = 0;
        this.ringScenes = 0;
        this.trackOffset = 0;
        this.sceneOffset = 0;
        /** Visible tracks in the session — excludes children of folded groups.
         *  Re-fetched on track list changes and before each ring navigation. */
        this.allTracks = [];
        /** Currently active property for `setActivePropertyValue`. */
        this.activeProperty = "volume";
        /** Cached transport state. */
        this.isPlaying = false;
        this.isRecording = false;
        // -- Selected track live state (fixes stale raw.name bug) ---------------
        /** Live-cached name of the currently selected track. */
        this.selectedTrackName = "";
        /** Live-cached color of the currently selected track. */
        this.selectedTrackColor = [0, 0, 0];
        /** Index of the currently selected track in allTracks. */
        this.selectedTrackIndex = -1;
        // -- Playing clip state (selected track) --------------------------------
        /** Name of the currently playing clip on the selected track. */
        this.playingClipName = "";
        /** Color of the currently playing clip on the selected track. */
        this.playingClipColor = [0, 0, 0];
        // -- Selected parameter state ------------------------------------------
        /** The DeviceParameter object currently selected in Ableton's UI. */
        this.selectedParam = null;
        /** Cached properties of the selected parameter. */
        this.selectedParamName = "";
        this.selectedParamValue = 0;
        this.selectedParamMin = 0;
        this.selectedParamMax = 1;
        this.selectedParamDefault = 0;
        /** Guard: true while onSelectedParameterChanged is fetching min/max.
         *  Blocks adjustSelectedParameter to prevent stale-range writes. */
        this.selectedParamSwitching = false;
        this.ableton = ableton;
        this.sendMessage = sendMessage;
    }
    /**
     * Fetch only the tracks currently visible in Ableton's session view.
     * Folded group children are excluded. Called on init, on track list
     * changes, and before each ring navigation to pick up fold changes.
     */
    refreshVisibleTracks() {
        return __awaiter(this, void 0, void 0, function* () {
            this.allTracks = yield this.ableton.song.get("visible_tracks");
        });
    }
    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------
    /**
     * Initialize: fetch master track, cache all tracks, register the global
     * tracks-list listener (reacts to tracks being added/removed in Ableton).
     * Does NOT set up the ring — call `setupRing()` after this.
     */
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            this.masterTrack = yield this.ableton.song.get("master_track");
            yield this.refreshVisibleTracks();
            // When tracks are added or removed in Ableton, refresh and re-sync.
            yield this.globalSubs.add("song:tracks", yield this.ableton.song.addListener("tracks", (_tracks) => __awaiter(this, void 0, void 0, function* () {
                // Re-fetch visible_tracks (the callback arg includes hidden tracks)
                yield this.refreshVisibleTracks();
                yield this.syncRingListeners();
            })));
            // When return tracks change, send counts may change — re-subscribe sends
            // for all ring tracks.
            yield this.globalSubs.add("song:return_tracks", yield this.ableton.song.addListener("return_tracks", () => __awaiter(this, void 0, void 0, function* () {
                yield this.resubscribeSendsForAllRingTracks();
            })));
            // When the user selects a different parameter in Ableton's UI,
            // subscribe to its value and push name + value to Grid.
            yield this.globalSubs.add("song:view:selected_parameter", yield this.ableton.song.view.addListener("selected_parameter", (param) => __awaiter(this, void 0, void 0, function* () {
                yield this.onSelectedParameterChanged(param);
            })));
            // Also fetch the initially selected parameter
            try {
                const initialParam = yield this.ableton.song.view.get("selected_parameter");
                if (initialParam) {
                    yield this.onSelectedParameterChanged(initialParam);
                }
            }
            catch (_) {
                /* no parameter selected yet */
            }
            // Transport: is_playing
            this.isPlaying = yield this.ableton.song.get("is_playing");
            yield this.globalSubs.add("song:is_playing", yield this.ableton.song.addListener("is_playing", (value) => {
                this.isPlaying = !!value;
                this.sendMessage({
                    evt: "RT_TRANSPORT",
                    playing: this.isPlaying,
                    recording: this.isRecording,
                });
            }));
            // Transport: record_mode
            this.isRecording = !!(yield this.ableton.song.get("record_mode"));
            yield this.globalSubs.add("song:record_mode", yield this.ableton.song.addListener("record_mode", (value) => {
                this.isRecording = !!value;
                this.sendMessage({
                    evt: "RT_TRANSPORT",
                    playing: this.isPlaying,
                    recording: this.isRecording,
                });
            }));
            // Send initial transport state
            this.sendMessage({
                evt: "RT_TRANSPORT",
                playing: this.isPlaying,
                recording: this.isRecording,
            });
            // When the user selects a different track in Ableton, move the ring
            // to keep it visible (if it's outside the current window).
            yield this.globalSubs.add("song:view:selected_track", yield this.ableton.song.view.addListener("selected_track", (track) => __awaiter(this, void 0, void 0, function* () {
                if (!track)
                    return;
                const trackIndex = this.allTracks.findIndex((t) => t.raw.id === track.raw.id);
                if (trackIndex !== -1) {
                    yield this.followTrackIndex(trackIndex);
                }
                this.selectedTrackIndex = trackIndex;
                // Subscribe to live name/color updates and playing clip for the new selected track
                yield this.subscribeSelectedTrack(track);
                yield this.subscribePlayingClip(track);
            })));
        });
    }
    /**
     * Set ring dimensions and move to an offset. Calls into Ableton's session
     * box API and then syncs listeners.
     */
    setupRing(numTracks_1, numScenes_1) {
        return __awaiter(this, arguments, void 0, function* (numTracks, numScenes, trackOffset = 0, sceneOffset = 0) {
            this.ringWidth = numTracks;
            this.ringScenes = numScenes;
            this.trackOffset = trackOffset;
            this.sceneOffset = sceneOffset;
            yield this.ableton.session.setupSessionBox(numTracks, numScenes);
            yield this.ableton.session.setSessionOffset(trackOffset, sceneOffset);
            yield this.syncRingListeners();
        });
    }
    /**
     * Move the ring offset. Syncs listeners via diff.
     */
    setOffset(trackOffset, sceneOffset) {
        return __awaiter(this, void 0, void 0, function* () {
            this.trackOffset = trackOffset;
            this.sceneOffset = sceneOffset;
            yield this.ableton.session.setSessionOffset(trackOffset, sceneOffset);
            yield this.syncRingListeners();
        });
    }
    /**
     * Move the ring left or right by 1 track.
     */
    navigateRing(direction) {
        return __awaiter(this, void 0, void 0, function* () {
            // Refresh visible tracks to pick up any fold/unfold changes
            yield this.refreshVisibleTracks();
            const delta = direction === "right" ? 1 : -1;
            const maxOffset = Math.max(0, this.allTracks.length - this.ringWidth);
            const newOffset = Math.max(0, Math.min(this.trackOffset + delta, maxOffset));
            if (newOffset !== this.trackOffset) {
                yield this.setOffset(newOffset, this.sceneOffset);
                // Also update Ableton's selected track so the session view follows the ring
                this.selectTrackInRing(0);
            }
        });
    }
    /**
     * Clean up all listeners managed by this RingManager.
     */
    destroy() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.ringSubs.clear();
            yield this.globalSubs.clear();
            this.currentRingTrackIds = [];
            this.ringIndexByTrackId.clear();
            this.trackStates.clear();
            this.mixerCache.clear();
            this.selectedParam = null;
            this.selectedTrackName = "";
            this.selectedTrackColor = [0, 0, 0];
            this.selectedTrackIndex = -1;
            this.playingClipName = "";
            this.playingClipColor = [0, 0, 0];
        });
    }
    // -----------------------------------------------------------------------
    // Ring-relative track actions (called from Grid commands)
    // -----------------------------------------------------------------------
    /**
     * Get the Track object at a ring index, or undefined if out of range.
     */
    getTrackAtRingIndex(ringIndex) {
        const absIndex = this.trackOffset + ringIndex;
        return this.allTracks[absIndex];
    }
    /**
     * Toggle mute on the track at a ring index.
     * Fire-and-forget — the listener callback will update cache and notify Grid.
     */
    toggleMute(ringIndex) {
        const track = this.getTrackAtRingIndex(ringIndex);
        if (!track || this.isMaster(track))
            return;
        const state = this.trackStates.get(track.raw.id);
        if (!state)
            return;
        track.set("mute", !state.mute);
    }
    /**
     * Toggle solo on the track at a ring index.
     * Fire-and-forget — the listener callback will update cache and notify Grid.
     */
    toggleSolo(ringIndex) {
        const track = this.getTrackAtRingIndex(ringIndex);
        if (!track || this.isMaster(track))
            return;
        const state = this.trackStates.get(track.raw.id);
        if (!state)
            return;
        track.set("solo", !state.solo);
    }
    /**
     * Toggle arm on the track at a ring index.
     * Fire-and-forget — the listener callback will update cache and notify Grid.
     */
    toggleArm(ringIndex) {
        const track = this.getTrackAtRingIndex(ringIndex);
        if (!track)
            return;
        const state = this.trackStates.get(track.raw.id);
        if (!state || !state.canBeArmed)
            return;
        track.set("arm", !state.arm);
    }
    /**
     * Set volume on the track at a ring index (0..1).
     * Fire-and-forget — the listener callback will update cache and notify Grid.
     */
    setVolume(ringIndex, value) {
        const track = this.getTrackAtRingIndex(ringIndex);
        if (!track)
            return;
        const state = this.trackStates.get(track.raw.id);
        if (state === null || state === void 0 ? void 0 : state.isMidi)
            return;
        const cached = this.mixerCache.get(track.raw.id);
        if (!cached)
            return;
        cached.volume.set("value", value);
    }
    /**
     * Set panning on the track at a ring index (-1..1).
     * Fire-and-forget — the listener callback will update cache and notify Grid.
     */
    setPanning(ringIndex, value) {
        const track = this.getTrackAtRingIndex(ringIndex);
        if (!track)
            return;
        const state = this.trackStates.get(track.raw.id);
        if (state === null || state === void 0 ? void 0 : state.isMidi)
            return;
        const cached = this.mixerCache.get(track.raw.id);
        if (!cached)
            return;
        cached.panning.set("value", value);
    }
    /**
     * Set a send value on the track at a ring index.
     * Fire-and-forget — the listener callback will update cache and notify Grid.
     */
    setSend(ringIndex, sendIndex, value) {
        const track = this.getTrackAtRingIndex(ringIndex);
        if (!track)
            return;
        const cached = this.mixerCache.get(track.raw.id);
        if (!cached || !cached.sends[sendIndex])
            return;
        cached.sends[sendIndex].set("value", value);
    }
    /**
     * Select the track at a ring index in Ableton's UI (updates Ableton's
     * selected track without moving the ring).
     */
    selectTrackInRing(ringIndex) {
        const track = this.getTrackAtRingIndex(ringIndex);
        if (!track)
            return;
        this.ableton.song.view.set("selected_track", track.raw.id);
    }
    /**
     * Set the active property that `setActivePropertyValue` will target.
     * Supported values: "volume", "panning", "send:N", "selected_parameter".
     * Immediately pushes the current values for the new property to Grid.
     */
    setActiveProperty(property) {
        this.activeProperty = property;
        this.sendActivePropertyState();
    }
    /**
     * Push the current value(s) of the active property to Grid,
     * so the hardware can update its display/encoder on mode switch.
     */
    sendActivePropertyState() {
        var _a;
        if (this.activeProperty === "selected_parameter") {
            // Push selected parameter info
            if (this.selectedParam) {
                const range = this.selectedParamMax - this.selectedParamMin;
                this.sendMessage({
                    evt: "RT_PARAM",
                    name: this.selectedParamName,
                    v: this.selectedParamValue,
                    nv: range !== 0
                        ? (this.selectedParamValue - this.selectedParamMin) / range
                        : 0,
                    min: this.selectedParamMin,
                    max: this.selectedParamMax,
                });
            }
            else {
                this.sendMessage({
                    evt: "RT_PARAM",
                    name: "",
                    v: 0,
                    nv: 0,
                    min: 0,
                    max: 1,
                });
            }
        }
        else {
            // Push the active property for all ring tracks
            for (const trackId of this.currentRingTrackIds) {
                const state = this.trackStates.get(trackId);
                if (!state)
                    continue;
                const i = (_a = this.ringIndexByTrackId.get(trackId)) !== null && _a !== void 0 ? _a : 0;
                if (this.activeProperty === "volume" && !state.isMidi) {
                    this.sendMessage({
                        evt: "RT_VOL",
                        i,
                        v: state.volume,
                        nv: state.volume,
                    });
                }
                else if (this.activeProperty === "panning" && !state.isMidi) {
                    this.sendMessage({
                        evt: "RT_PAN",
                        i,
                        v: state.panning,
                        nv: (state.panning + 1) / 2,
                    });
                }
                else if (this.activeProperty.startsWith("send:")) {
                    const si = parseInt(this.activeProperty.slice(5), 10);
                    if (!isNaN(si) && si < state.sends.length) {
                        this.sendMessage({
                            evt: "RT_SEND",
                            i,
                            si,
                            v: state.sends[si],
                            nv: state.sends[si],
                        });
                    }
                }
            }
        }
    }
    /**
     * Set the active property's value on the track at a ring index,
     * mapping from raw 8-bit (0–255) to the parameter's native range.
     *
     * Mapping:
     *   volume             → raw / 255                    (0..1)
     *   panning            → (raw / 255) * 2 - 1          (-1..1)
     *   send:N             → raw / 255                    (0..1)
     *   selected_parameter → raw / 255 * (max - min) + min
     */
    setActivePropertyValue(ringIndex, rawValue) {
        // Clamp to 0–255
        const clamped = Math.max(0, Math.min(255, rawValue));
        const norm = clamped / 255;
        if (this.activeProperty === "selected_parameter") {
            if (this.selectedParam && !this.selectedParamSwitching) {
                const value = this.selectedParamMin +
                    norm * (this.selectedParamMax - this.selectedParamMin);
                try {
                    this.selectedParam.set("value", value);
                }
                catch (err) {
                    console.warn("[RingManager] Failed to set selected parameter value:", err);
                }
            }
        }
        else if (this.activeProperty === "volume") {
            this.setVolume(ringIndex, norm);
        }
        else if (this.activeProperty === "panning") {
            this.setPanning(ringIndex, norm * 2 - 1);
        }
        else if (this.activeProperty.startsWith("send:")) {
            const sendIndex = parseInt(this.activeProperty.slice(5), 10);
            if (!isNaN(sendIndex)) {
                this.setSend(ringIndex, sendIndex, norm);
            }
        }
    }
    /**
     * Adjust the active property by a relative delta. This is the primary
     * method for continuous controls (encoders in relative mode) — it reads
     * the current cached value from trackStates, applies the delta, clamps,
     * and writes the result to Ableton.
     *
     * Because the package already tracks every track's values via listeners,
     * there is NO value jump when navigating to a different track — the delta
     * is always applied against the correct cached value.
     *
     * @param ringIndex  - The ring-relative track index
     * @param delta      - Signed integer from the encoder (+1, -1, +N, -N)
     * @param stepSize   - How much each delta unit moves the parameter.
     *                     Defaults to 1/127 (~0.8% of full range).
     *                     Smaller = finer control, larger = faster sweeps.
     */
    adjustActivePropertyValue(ringIndex, delta, stepSize = 1 / 127) {
        if (this.activeProperty === "selected_parameter") {
            // Route to the selected parameter — no ring track needed
            this.adjustSelectedParameter(delta, stepSize);
            return;
        }
        const track = this.getTrackAtRingIndex(ringIndex);
        if (!track)
            return;
        const state = this.trackStates.get(track.raw.id);
        if (!state)
            return;
        if (this.activeProperty === "volume") {
            // Volume range: 0..1
            const newVal = Math.max(0, Math.min(1, state.volume + delta * stepSize));
            this.setVolume(ringIndex, newVal);
        }
        else if (this.activeProperty === "panning") {
            // Panning range: -1..1 — step covers a range of 2
            const newVal = Math.max(-1, Math.min(1, state.panning + delta * stepSize * 2));
            this.setPanning(ringIndex, newVal);
        }
        else if (this.activeProperty.startsWith("send:")) {
            const sendIndex = parseInt(this.activeProperty.slice(5), 10);
            if (!isNaN(sendIndex) && sendIndex < state.sends.length) {
                // Send range: 0..1
                const newVal = Math.max(0, Math.min(1, state.sends[sendIndex] + delta * stepSize));
                this.setSend(ringIndex, sendIndex, newVal);
            }
        }
    }
    // -----------------------------------------------------------------------
    // Selected parameter (last-clicked parameter in Ableton's UI)
    // -----------------------------------------------------------------------
    /**
     * Called when the selected parameter changes in Ableton.
     * Tears down the old value listener, caches min/max/name, subscribes
     * to the new parameter's value, and pushes an RT_PARAM event to Grid.
     */
    onSelectedParameterChanged(param) {
        return __awaiter(this, void 0, void 0, function* () {
            // Block encoder adjustments while we're switching
            this.selectedParamSwitching = true;
            // Remove old value listener
            yield this.globalSubs.removeByPrefix("selected_param:value");
            if (!param) {
                this.selectedParam = null;
                this.selectedParamName = "";
                this.selectedParamValue = 0;
                this.selectedParamMin = 0;
                this.selectedParamMax = 1;
                this.selectedParamDefault = 0;
                this.selectedParamSwitching = false;
                this.sendMessage({
                    evt: "RT_PARAM",
                    name: "",
                    v: 0,
                    nv: 0,
                    min: 0,
                    max: 1,
                });
                return;
            }
            try {
                // Fetch name, value, min, max, default in parallel
                const [name, value, min, max, defaultVal] = yield Promise.all([
                    param.get("name"),
                    param.get("value"),
                    param.get("min"),
                    param.get("max"),
                    param.get("default_value"),
                ]);
                // Update all cached state atomically before unblocking
                this.selectedParam = param;
                this.selectedParamName = name;
                this.selectedParamValue = value;
                this.selectedParamMin = min;
                this.selectedParamMax = max;
                this.selectedParamDefault =
                    typeof defaultVal === "number"
                        ? defaultVal
                        : parseFloat(defaultVal) || 0;
                // Listen to value changes (e.g. automation, other controllers)
                yield this.globalSubs.add("selected_param:value", yield param.addListener("value", (v) => {
                    this.selectedParamValue = v;
                    const range = this.selectedParamMax - this.selectedParamMin;
                    this.sendMessage({
                        evt: "RT_PARAM",
                        name: this.selectedParamName,
                        v,
                        nv: range !== 0 ? (v - this.selectedParamMin) / range : 0,
                        min: this.selectedParamMin,
                        max: this.selectedParamMax,
                    });
                }));
                // Push the initial state
                const range = max - min;
                this.sendMessage({
                    evt: "RT_PARAM",
                    name,
                    v: value,
                    nv: range !== 0 ? (value - min) / range : 0,
                    min,
                    max,
                });
            }
            catch (err) {
                console.warn("[RingManager] Failed to set up selected parameter:", err);
                this.selectedParam = null;
            }
            finally {
                this.selectedParamSwitching = false;
            }
        });
    }
    /**
     * Adjust the selected parameter by a relative delta.
     * The delta is scaled to the parameter's native [min, max] range.
     *
     * @param delta    - Signed integer from the encoder (+1, -1, +N, -N)
     * @param stepSize - Fraction of full range per delta unit.
     *                   Defaults to 1/127 (~0.8% of full range).
     */
    adjustSelectedParameter(delta, stepSize = 1 / 127) {
        if (!this.selectedParam || this.selectedParamSwitching)
            return;
        const range = this.selectedParamMax - this.selectedParamMin;
        if (range === 0)
            return;
        const step = delta * stepSize * range;
        const newVal = Math.max(this.selectedParamMin, Math.min(this.selectedParamMax, this.selectedParamValue + step));
        try {
            this.selectedParam.set("value", newVal);
        }
        catch (err) {
            console.warn("[RingManager] Failed to set selected parameter value:", err);
        }
        // The value listener will update selectedParamValue and push RT_PARAM
    }
    /**
     * Reset the selected parameter to its default value.
     */
    resetSelectedParameter() {
        if (!this.selectedParam || this.selectedParamSwitching)
            return;
        const value = Math.max(this.selectedParamMin, Math.min(this.selectedParamMax, this.selectedParamDefault));
        try {
            this.selectedParam.set("value", value);
        }
        catch (err) {
            console.warn("[RingManager] Failed to reset selected parameter:", err);
        }
    }
    /**
     * Reset the active property to its default value on the track at a ring
     * index. Uses Ableton's well-known defaults:
     *   volume  → 0.85  (~0 dB)
     *   panning → 0     (center)
     *   send:N  → 0     (off)
     *   selected_parameter → factory default (via resetSelectedParameter)
     */
    resetActivePropertyValue(ringIndex) {
        if (this.activeProperty === "selected_parameter") {
            this.resetSelectedParameter();
            return;
        }
        if (this.activeProperty === "volume") {
            this.setVolume(ringIndex, 0.85);
        }
        else if (this.activeProperty === "panning") {
            this.setPanning(ringIndex, 0);
        }
        else if (this.activeProperty.startsWith("send:")) {
            const sendIndex = parseInt(this.activeProperty.slice(5), 10);
            if (!isNaN(sendIndex)) {
                this.setSend(ringIndex, sendIndex, 0);
            }
        }
    }
    // -----------------------------------------------------------------------
    // Selected track live subscriptions (fixes stale raw.name bug)
    // -----------------------------------------------------------------------
    /**
     * Subscribe to live name and color changes on the selected track.
     * This replaces the stale `track.raw.name` snapshot with a live listener
     * so that renames are immediately reflected in RT_SELECTED events.
     */
    subscribeSelectedTrack(track) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            // Tear down previous selected-track property listeners
            yield this.globalSubs.removeByPrefix("selected_track_prop");
            // Fetch live name (not stale raw snapshot)
            this.selectedTrackName = yield track.get("name");
            this.selectedTrackColor = hexToRgb(track.raw.color);
            const trackId = track.raw.id;
            // Send initial RT_SELECTED with the live name
            const ringIdx = (_a = this.ringIndexByTrackId.get(trackId)) !== null && _a !== void 0 ? _a : -1;
            this.sendMessage({
                evt: "RT_SELECTED",
                index: this.selectedTrackIndex,
                ringIndex: ringIdx,
                name: this.selectedTrackName,
                color: this.selectedTrackColor,
            });
            // Live name listener — fires when the selected track is renamed
            yield this.globalSubs.add("selected_track_prop:name", yield track.addListener("name", (value) => {
                var _a;
                this.selectedTrackName = value;
                const ri = (_a = this.ringIndexByTrackId.get(trackId)) !== null && _a !== void 0 ? _a : -1;
                this.sendMessage({
                    evt: "RT_SELECTED",
                    index: this.selectedTrackIndex,
                    ringIndex: ri,
                    name: value,
                    color: this.selectedTrackColor,
                });
            }));
            // Live color listener — fires when the selected track's color changes
            yield this.globalSubs.add("selected_track_prop:color", yield track.addListener("color", (value) => {
                var _a, _b, _c, _d;
                const rawHex = typeof value === "number"
                    ? value
                    : ((_c = (_a = value === null || value === void 0 ? void 0 : value.numberRepresentation) !== null && _a !== void 0 ? _a : (_b = value === null || value === void 0 ? void 0 : value.toJSON) === null || _b === void 0 ? void 0 : _b.call(value)) !== null && _c !== void 0 ? _c : 0);
                this.selectedTrackColor = hexToRgb(rawHex);
                const ri = (_d = this.ringIndexByTrackId.get(trackId)) !== null && _d !== void 0 ? _d : -1;
                this.sendMessage({
                    evt: "RT_SELECTED",
                    index: this.selectedTrackIndex,
                    ringIndex: ri,
                    name: this.selectedTrackName,
                    color: this.selectedTrackColor,
                });
            }));
        });
    }
    // -----------------------------------------------------------------------
    // Playing clip on selected track
    // -----------------------------------------------------------------------
    /**
     * Subscribe to the playing clip on the selected track.
     * Watches `playing_slot_index` to detect which clip is playing,
     * then subscribes to that clip's name and color for live updates.
     * Sends RT_PLAYING_CLIP events to Grid.
     */
    subscribePlayingClip(track) {
        return __awaiter(this, void 0, void 0, function* () {
            // Tear down previous playing-clip listeners
            yield this.globalSubs.removeByPrefix("selected_track_clip");
            this.playingClipName = "";
            this.playingClipColor = [0, 0, 0];
            const handleSlotIndex = (slotIndex) => __awaiter(this, void 0, void 0, function* () {
                var _a, _b, _c;
                // Remove any previous clip-property listeners
                yield this.globalSubs.removeByPrefix("selected_track_clip:props");
                if (slotIndex < 0) {
                    // No clip playing (Ableton returns -2 when stopped)
                    this.playingClipName = "";
                    this.playingClipColor = [0, 0, 0];
                    this.sendMessage({
                        evt: "RT_PLAYING_CLIP",
                        name: "",
                        color: [0, 0, 0],
                    });
                    return;
                }
                try {
                    const clipSlots = yield track.get("clip_slots");
                    if (!clipSlots || slotIndex >= clipSlots.length)
                        return;
                    const clip = yield clipSlots[slotIndex].get("clip");
                    if (!clip) {
                        this.playingClipName = "";
                        this.playingClipColor = [0, 0, 0];
                        this.sendMessage({
                            evt: "RT_PLAYING_CLIP",
                            name: "",
                            color: [0, 0, 0],
                        });
                        return;
                    }
                    // Fetch clip name and color
                    const [clipName, clipColor] = yield Promise.all([
                        clip.get("name"),
                        clip.get("color"),
                    ]);
                    const colorRgb = (clipColor === null || clipColor === void 0 ? void 0 : clipColor.rgb)
                        ? [(_a = clipColor.rgb.r) !== null && _a !== void 0 ? _a : 0, (_b = clipColor.rgb.g) !== null && _b !== void 0 ? _b : 0, (_c = clipColor.rgb.b) !== null && _c !== void 0 ? _c : 0]
                        : typeof clipColor === "number"
                            ? hexToRgb(clipColor)
                            : [0, 0, 0];
                    this.playingClipName = clipName !== null && clipName !== void 0 ? clipName : "";
                    this.playingClipColor = colorRgb;
                    this.sendMessage({
                        evt: "RT_PLAYING_CLIP",
                        name: this.playingClipName,
                        color: this.playingClipColor,
                    });
                    // Listen for live clip name changes
                    yield this.globalSubs.add("selected_track_clip:props:name", yield clip.addListener("name", (value) => {
                        this.playingClipName = value;
                        this.sendMessage({
                            evt: "RT_PLAYING_CLIP",
                            name: value,
                            color: this.playingClipColor,
                        });
                    }));
                    // Listen for live clip color changes
                    yield this.globalSubs.add("selected_track_clip:props:color", yield clip.addListener("color", (value) => {
                        var _a, _b, _c;
                        const rgb = (value === null || value === void 0 ? void 0 : value.rgb)
                            ? [(_a = value.rgb.r) !== null && _a !== void 0 ? _a : 0, (_b = value.rgb.g) !== null && _b !== void 0 ? _b : 0, (_c = value.rgb.b) !== null && _c !== void 0 ? _c : 0]
                            : typeof value === "number"
                                ? hexToRgb(value)
                                : (() => {
                                    var _a, _b, _c;
                                    const rawHex = (_c = (_a = value === null || value === void 0 ? void 0 : value.numberRepresentation) !== null && _a !== void 0 ? _a : (_b = value === null || value === void 0 ? void 0 : value.toJSON) === null || _b === void 0 ? void 0 : _b.call(value)) !== null && _c !== void 0 ? _c : 0;
                                    return hexToRgb(rawHex);
                                })();
                        this.playingClipColor = rgb;
                        this.sendMessage({
                            evt: "RT_PLAYING_CLIP",
                            name: this.playingClipName,
                            color: rgb,
                        });
                    }));
                }
                catch (err) {
                    console.warn("[RingManager] Failed to fetch playing clip info:", err);
                }
            });
            // Listen for playing slot changes on the selected track
            yield this.globalSubs.add("selected_track_clip:slot", yield track.addListener("playing_slot_index", (slotIndex) => __awaiter(this, void 0, void 0, function* () {
                yield handleSlotIndex(slotIndex);
            })));
            // Fetch the initial playing slot
            try {
                const initialSlot = yield track.get("playing_slot_index");
                yield handleSlotIndex(initialSlot);
            }
            catch (_) {
                // No slot playing initially — send empty
                this.sendMessage({
                    evt: "RT_PLAYING_CLIP",
                    name: "",
                    color: [0, 0, 0],
                });
            }
        });
    }
    // -----------------------------------------------------------------------
    // Core: diff-based listener sync
    // -----------------------------------------------------------------------
    /**
     * Compute the new ring window, diff against what's currently subscribed,
     * and add/remove listeners as needed. Sends a full state sync to Grid
     * after the diff completes.
     */
    syncRingListeners() {
        return __awaiter(this, void 0, void 0, function* () {
            // Compute new window
            const windowTracks = this.allTracks.slice(this.trackOffset, this.trackOffset + this.ringWidth);
            const newIds = windowTracks.map((t) => t.raw.id);
            const oldIds = new Set(this.currentRingTrackIds);
            const newIdSet = new Set(newIds);
            // Tracks that left the ring — unsubscribe
            const removed = this.currentRingTrackIds.filter((id) => !newIdSet.has(id));
            for (const id of removed) {
                yield this.ringSubs.removeByPrefix(`track:${id}`);
                this.ringIndexByTrackId.delete(id);
                this.trackStates.delete(id);
                this.mixerCache.delete(id);
            }
            // Update index map for all tracks in the new window
            for (let i = 0; i < windowTracks.length; i++) {
                this.ringIndexByTrackId.set(windowTracks[i].raw.id, i);
            }
            // Tracks that entered the ring — subscribe
            const added = windowTracks.filter((t) => !oldIds.has(t.raw.id));
            for (const track of added) {
                yield this.subscribeRingTrack(track);
            }
            // Update the current ring track IDs
            this.currentRingTrackIds = newIds;
            // Send full state sync to Grid
            this.sendFullSync();
            console.log(`[RingManager] synced ring: offset=${this.trackOffset}, width=${this.ringWidth}, ` +
                `added=${added.length}, removed=${removed.length}, total subs=${this.ringSubs.size}`);
        });
    }
    // -----------------------------------------------------------------------
    // Per-track listener registration
    // -----------------------------------------------------------------------
    /**
     * Subscribe to all parameter changes for a single track within the ring.
     * The listener callbacks resolve the ring index dynamically from
     * `ringIndexByTrackId` so that index shifts (from ring movement) don't
     * require re-subscription.
     */
    subscribeRingTrack(track) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const id = track.raw.id;
            const isMaster = this.isMaster(track);
            // Helper: resolve current ring index at callback time
            const idx = () => this.ringIndexByTrackId.get(id);
            // Detect MIDI tracks — they lack meaningful volume/pan controls
            const hasMidiInput = yield track.get("has_midi_input");
            const hasAudioInput = yield track.get("has_audio_input");
            const trackIsMidi = !!hasMidiInput && !hasAudioInput;
            // Initialize state — fetch ALL values fresh from Ableton, never use
            // stale track.raw snapshots for mutable properties.
            const liveName = yield track.get("name");
            const state = {
                id,
                ringIndex: (_a = idx()) !== null && _a !== void 0 ? _a : 0,
                name: liveName,
                color: hexToRgb(track.raw.color),
                isMidi: trackIsMidi,
                mute: false,
                solo: false,
                arm: false,
                canBeArmed: false,
                volume: 0,
                panning: 0,
                sends: [],
            };
            // Name listener
            yield this.ringSubs.add(`track:${id}:name`, yield track.addListener("name", (value) => {
                var _a, _b;
                const s = this.trackStates.get(id);
                if (s)
                    s.name = value;
                const i = idx();
                if (i !== undefined) {
                    this.sendMessage({
                        evt: "RT_INFO",
                        i,
                        name: value,
                        color: (_a = s === null || s === void 0 ? void 0 : s.color) !== null && _a !== void 0 ? _a : [0, 0, 0],
                        isMidi: (_b = s === null || s === void 0 ? void 0 : s.isMidi) !== null && _b !== void 0 ? _b : false,
                    });
                }
            }));
            // Color listener (value is a Color object — convert to [r, g, b])
            yield this.ringSubs.add(`track:${id}:color`, yield track.addListener("color", (value) => {
                var _a, _b, _c, _d, _e;
                const rawHex = typeof value === "number"
                    ? value
                    : ((_c = (_a = value === null || value === void 0 ? void 0 : value.numberRepresentation) !== null && _a !== void 0 ? _a : (_b = value === null || value === void 0 ? void 0 : value.toJSON) === null || _b === void 0 ? void 0 : _b.call(value)) !== null && _c !== void 0 ? _c : 0);
                const rgb = hexToRgb(rawHex);
                const s = this.trackStates.get(id);
                if (s)
                    s.color = rgb;
                const i = idx();
                if (i !== undefined) {
                    this.sendMessage({
                        evt: "RT_INFO",
                        i,
                        name: (_d = s === null || s === void 0 ? void 0 : s.name) !== null && _d !== void 0 ? _d : "",
                        color: rgb,
                        isMidi: (_e = s === null || s === void 0 ? void 0 : s.isMidi) !== null && _e !== void 0 ? _e : false,
                    });
                }
            }));
            // Mute — fetch current value, not stale track.raw.mute
            if (!isMaster) {
                state.mute = yield track.get("mute");
                yield this.ringSubs.add(`track:${id}:mute`, yield track.addListener("mute", (value) => {
                    const s = this.trackStates.get(id);
                    if (s)
                        s.mute = value;
                    const i = idx();
                    if (i !== undefined) {
                        this.sendMessage({ evt: "RT_MUTE", i, v: value });
                    }
                }));
            }
            // Solo — fetch current value, not stale track.raw.solo
            if (!isMaster) {
                const soloVal = yield track.get("solo");
                state.solo = !!soloVal;
                yield this.ringSubs.add(`track:${id}:solo`, yield track.addListener("solo", (value) => {
                    const s = this.trackStates.get(id);
                    if (s)
                        s.solo = !!value;
                    const i = idx();
                    if (i !== undefined) {
                        this.sendMessage({ evt: "RT_SOLO", i, v: !!value });
                    }
                }));
            }
            // Arm
            const canArm = yield track.get("can_be_armed");
            state.canBeArmed = !!canArm;
            if (canArm) {
                state.arm = yield track.get("arm");
                yield this.ringSubs.add(`track:${id}:arm`, yield track.addListener("arm", (value) => {
                    const s = this.trackStates.get(id);
                    if (s)
                        s.arm = !!value;
                    const i = idx();
                    if (i !== undefined) {
                        this.sendMessage({ evt: "RT_ARM", i, v: !!value });
                    }
                }));
            }
            // Mixer device params
            const mixer = yield track.get("mixer_device");
            // Volume & Panning — skip for MIDI tracks (no meaningful mixer controls)
            let volumeParam = null;
            let panningParam = null;
            if (!trackIsMidi) {
                volumeParam = yield mixer.get("volume");
                state.volume = volumeParam.raw.value;
                yield this.ringSubs.add(`track:${id}:volume`, yield volumeParam.addListener("value", (value) => {
                    const s = this.trackStates.get(id);
                    if (s)
                        s.volume = value;
                    const i = idx();
                    if (i !== undefined) {
                        this.sendMessage({ evt: "RT_VOL", i, v: value, nv: value });
                    }
                }));
                panningParam = yield mixer.get("panning");
                state.panning = panningParam.raw.value;
                yield this.ringSubs.add(`track:${id}:panning`, yield panningParam.addListener("value", (value) => {
                    const s = this.trackStates.get(id);
                    if (s)
                        s.panning = value;
                    const i = idx();
                    if (i !== undefined) {
                        this.sendMessage({
                            evt: "RT_PAN",
                            i,
                            v: value,
                            nv: (value + 1) / 2,
                        });
                    }
                }));
            }
            // Sends (array — one DeviceParameter per return track)
            let sendParams = [];
            if (!isMaster) {
                sendParams = yield mixer.get("sends");
                state.sends = sendParams.map((s) => s.raw.value);
                for (let si = 0; si < sendParams.length; si++) {
                    const send = sendParams[si];
                    yield this.ringSubs.add(`track:${id}:send:${si}`, yield send.addListener("value", (value) => {
                        const s = this.trackStates.get(id);
                        if (s)
                            s.sends[si] = value;
                        const i = idx();
                        if (i !== undefined) {
                            this.sendMessage({ evt: "RT_SEND", i, si, v: value, nv: value });
                        }
                    }));
                }
            }
            // Cache mixer DeviceParameter refs so set calls skip UDP round-trips
            this.mixerCache.set(id, {
                volume: volumeParam,
                panning: panningParam,
                sends: sendParams,
            });
            // Store state
            this.trackStates.set(id, state);
        });
    }
    // -----------------------------------------------------------------------
    // Sends re-subscription (when return tracks change)
    // -----------------------------------------------------------------------
    /**
     * When return tracks are added/removed, the sends array length changes
     * for every track. Re-subscribe sends for all currently ring-subscribed tracks.
     */
    resubscribeSendsForAllRingTracks() {
        return __awaiter(this, void 0, void 0, function* () {
            for (const trackId of this.currentRingTrackIds) {
                // Remove old send subs for this track
                yield this.ringSubs.removeByPrefix(`track:${trackId}:send`);
                // Find the track object
                const track = this.allTracks.find((t) => t.raw.id === trackId);
                if (!track || this.isMaster(track))
                    continue;
                const mixer = yield track.get("mixer_device");
                const sends = yield mixer.get("sends");
                const state = this.trackStates.get(trackId);
                if (state) {
                    state.sends = sends.map((s) => s.raw.value);
                }
                // Update mixer cache with new sends
                const cached = this.mixerCache.get(trackId);
                if (cached) {
                    cached.sends = sends;
                }
                const idx = () => this.ringIndexByTrackId.get(trackId);
                for (let si = 0; si < sends.length; si++) {
                    const send = sends[si];
                    yield this.ringSubs.add(`track:${trackId}:send:${si}`, yield send.addListener("value", (value) => {
                        const s = this.trackStates.get(trackId);
                        if (s)
                            s.sends[si] = value;
                        const i = idx();
                        if (i !== undefined) {
                            this.sendMessage({ evt: "RT_SEND", i, si, v: value, nv: value });
                        }
                    }));
                }
            }
            // Push updated sends state
            this.sendFullSync();
        });
    }
    // -----------------------------------------------------------------------
    // State sync to Grid
    // -----------------------------------------------------------------------
    /**
     * Send the full state for all ring tracks by emitting individual RT_*
     * events for each track, so Grid Lua handles them with the same code
     * path as real-time changes — no separate RT_SYNC parsing needed.
     */
    sendFullSync() {
        var _a;
        for (const trackId of this.currentRingTrackIds) {
            const state = this.trackStates.get(trackId);
            if (!state)
                continue;
            const i = (_a = this.ringIndexByTrackId.get(trackId)) !== null && _a !== void 0 ? _a : 0;
            state.ringIndex = i;
            this.sendMessage({ evt: "RT_MUTE", i, v: state.mute });
            this.sendMessage({ evt: "RT_SOLO", i, v: state.solo });
            this.sendMessage({ evt: "RT_ARM", i, v: state.arm });
            if (!state.isMidi) {
                this.sendMessage({
                    evt: "RT_VOL",
                    i,
                    v: state.volume,
                    nv: state.volume,
                });
                this.sendMessage({
                    evt: "RT_PAN",
                    i,
                    v: state.panning,
                    nv: (state.panning + 1) / 2,
                });
            }
            this.sendMessage({
                evt: "RT_INFO",
                i,
                name: state.name,
                color: state.color,
                isMidi: state.isMidi,
            });
            for (let si = 0; si < state.sends.length; si++) {
                this.sendMessage({
                    evt: "RT_SEND",
                    i,
                    si,
                    v: state.sends[si],
                    nv: state.sends[si],
                });
            }
        }
    }
    // -----------------------------------------------------------------------
    // Utilities
    // -----------------------------------------------------------------------
    isMaster(track) {
        return (this.masterTrack !== undefined && track.raw.id === this.masterTrack.raw.id);
    }
    /**
     * Move the ring so that the given track index is visible within the ring
     * window. If the track is already visible, no move occurs.
     * Called when the user selects a track in Ableton's UI.
     */
    followTrackIndex(trackIndex) {
        return __awaiter(this, void 0, void 0, function* () {
            if (trackIndex < 0 || trackIndex >= this.allTracks.length)
                return;
            // Already visible in the current ring window — no move needed
            if (trackIndex >= this.trackOffset &&
                trackIndex < this.trackOffset + this.ringWidth) {
                return;
            }
            // Move the ring so the selected track is at the left edge of the window.
            // Clamp to valid range.
            const maxOffset = Math.max(0, this.allTracks.length - this.ringWidth);
            const newOffset = Math.max(0, Math.min(trackIndex, maxOffset));
            yield this.setOffset(newOffset, this.sceneOffset);
        });
    }
    /** Expose current ring info for debugging / Preferences UI. */
    getRingInfo() {
        return {
            width: this.ringWidth,
            scenes: this.ringScenes,
            trackOffset: this.trackOffset,
            sceneOffset: this.sceneOffset,
            trackIds: [...this.currentRingTrackIds],
            subCount: this.ringSubs.size,
        };
    }
    /**
     * Request a full state dump — pushes all ring track data, the currently
     * selected track, and the currently selected parameter to Grid.
     * Call this from Grid on module init / reconnect.
     */
    requestFullState() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            // Refresh visible tracks to pick up any fold/unfold changes
            yield this.refreshVisibleTracks();
            yield this.syncRingListeners();
            // 1. Push all ring track states
            this.sendFullSync();
            // 2. Push currently selected track info (uses live-cached values)
            try {
                const selectedTrack = yield this.ableton.song.view.get("selected_track");
                if (selectedTrack) {
                    const trackIndex = this.allTracks.findIndex((t) => t.raw.id === selectedTrack.raw.id);
                    const ringIdx = trackIndex !== -1
                        ? ((_a = this.ringIndexByTrackId.get(selectedTrack.raw.id)) !== null && _a !== void 0 ? _a : -1)
                        : -1;
                    this.selectedTrackIndex = trackIndex;
                    this.sendMessage({
                        evt: "RT_SELECTED",
                        index: trackIndex,
                        ringIndex: ringIdx,
                        name: this.selectedTrackName,
                        color: this.selectedTrackColor,
                    });
                }
            }
            catch (err) {
                console.warn("[RingManager] Failed to fetch selected track on state request:", err);
            }
            // 3. Push playing clip state
            this.sendMessage({
                evt: "RT_PLAYING_CLIP",
                name: this.playingClipName,
                color: this.playingClipColor,
            });
            // 4. Push transport state
            this.sendMessage({
                evt: "RT_TRANSPORT",
                playing: this.isPlaying,
                recording: this.isRecording,
            });
            // 4. Push currently selected parameter info
            if (this.selectedParam) {
                const range = this.selectedParamMax - this.selectedParamMin;
                this.sendMessage({
                    evt: "RT_PARAM",
                    name: this.selectedParamName,
                    v: this.selectedParamValue,
                    nv: range !== 0
                        ? (this.selectedParamValue - this.selectedParamMin) / range
                        : 0,
                    min: this.selectedParamMin,
                    max: this.selectedParamMax,
                });
            }
            else {
                this.sendMessage({
                    evt: "RT_PARAM",
                    name: "",
                    v: 0,
                    nv: 0,
                    min: 0,
                    max: 1,
                });
            }
        });
    }
}
exports.RingManager = RingManager;
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Convert a raw hex color integer (0xRRGGBB) to an [r, g, b] tuple. */
function hexToRgb(hex) {
    return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}
