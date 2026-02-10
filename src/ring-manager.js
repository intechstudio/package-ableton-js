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
 *   { evt: "RT_SELECTED", name, color, ringIndex }  — selected track info
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
        /** All tracks in the session — cached, refreshed on `tracks` listener. */
        this.allTracks = [];
        this.ableton = ableton;
        this.sendMessage = sendMessage;
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
            this.allTracks = yield this.ableton.song.get("tracks");
            // When tracks are added or removed in Ableton, refresh and re-sync.
            yield this.globalSubs.add("song:tracks", yield this.ableton.song.addListener("tracks", (tracks) => __awaiter(this, void 0, void 0, function* () {
                this.allTracks = tracks;
                yield this.syncRingListeners();
            })));
            // When return tracks change, send counts may change — re-subscribe sends
            // for all ring tracks.
            yield this.globalSubs.add("song:return_tracks", yield this.ableton.song.addListener("return_tracks", () => __awaiter(this, void 0, void 0, function* () {
                yield this.resubscribeSendsForAllRingTracks();
            })));
            // When the user selects a different track in Ableton, move the ring
            // to keep it visible (if it's outside the current window).
            yield this.globalSubs.add("song:view:selected_track", yield this.ableton.song.view.addListener("selected_track", (track) => __awaiter(this, void 0, void 0, function* () {
                var _a;
                if (!track)
                    return;
                const trackIndex = this.allTracks.findIndex((t) => t.raw.id === track.raw.id);
                if (trackIndex !== -1) {
                    yield this.followTrackIndex(trackIndex);
                }
                // Notify Grid of the selected track's info
                this.sendMessage({
                    evt: "RT_SELECTED",
                    name: track.raw.name,
                    color: hexToRgb(track.raw.color),
                    ringIndex: trackIndex !== -1
                        ? (_a = this.ringIndexByTrackId.get(track.raw.id)) !== null && _a !== void 0 ? _a : -1
                        : -1,
                });
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
            const delta = direction === "right" ? 1 : -1;
            const maxOffset = Math.max(0, this.allTracks.length - this.ringWidth);
            const newOffset = Math.max(0, Math.min(this.trackOffset + delta, maxOffset));
            if (newOffset !== this.trackOffset) {
                yield this.setOffset(newOffset, this.sceneOffset);
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
            // Initialize state
            const state = {
                id,
                ringIndex: (_a = idx()) !== null && _a !== void 0 ? _a : 0,
                name: track.raw.name,
                color: hexToRgb(track.raw.color),
                mute: false,
                solo: false,
                arm: false,
                canBeArmed: false,
                volume: 0,
                panning: 0,
                sends: [],
            };
            // Mute
            if (!isMaster) {
                state.mute = track.raw.mute;
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
            // Solo
            if (!isMaster) {
                state.solo = track.raw.solo;
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
            // Volume
            const volumeParam = yield mixer.get("volume");
            state.volume = volumeParam.raw.value;
            yield this.ringSubs.add(`track:${id}:volume`, yield volumeParam.addListener("value", (value) => {
                const s = this.trackStates.get(id);
                if (s)
                    s.volume = value;
                const i = idx();
                if (i !== undefined) {
                    this.sendMessage({ evt: "RT_VOL", i, v: value });
                }
            }));
            // Panning
            const panningParam = yield mixer.get("panning");
            state.panning = panningParam.raw.value;
            yield this.ringSubs.add(`track:${id}:panning`, yield panningParam.addListener("value", (value) => {
                const s = this.trackStates.get(id);
                if (s)
                    s.panning = value;
                const i = idx();
                if (i !== undefined) {
                    this.sendMessage({ evt: "RT_PAN", i, v: value });
                }
            }));
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
                            this.sendMessage({ evt: "RT_SEND", i, si, v: value });
                        }
                    }));
                }
            }
            // Cache mixer DeviceParameter refs so set calls skip UDP round-trips
            this.mixerCache.set(id, { volume: volumeParam, panning: panningParam, sends: sendParams });
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
                            this.sendMessage({ evt: "RT_SEND", i, si, v: value });
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
            this.sendMessage({ evt: "RT_VOL", i, v: state.volume });
            this.sendMessage({ evt: "RT_PAN", i, v: state.panning });
            this.sendMessage({ evt: "RT_INFO", i, name: state.name, color: state.color });
            for (let si = 0; si < state.sends.length; si++) {
                this.sendMessage({ evt: "RT_SEND", i, si, v: state.sends[si] });
            }
        }
    }
    // -----------------------------------------------------------------------
    // Utilities
    // -----------------------------------------------------------------------
    isMaster(track) {
        return this.masterTrack !== undefined && track.raw.id === this.masterTrack.raw.id;
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
}
exports.RingManager = RingManager;
// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function hexToRgb(hex) {
    const r = (hex >> 16) & 255;
    const g = (hex >> 8) & 255;
    const b = hex & 255;
    return [r, g, b];
}
