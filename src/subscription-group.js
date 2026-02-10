"use strict";
/**
 * SubscriptionGroup manages a keyed set of ableton-js listener unsubscribe functions.
 *
 * Keys follow the convention: "track:{id}:mute", "track:{id}:send:0", etc.
 * This enables selective cleanup by prefix (e.g. remove all listeners for a track)
 * without tearing down the entire group.
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
exports.SubscriptionGroup = void 0;
class SubscriptionGroup {
    constructor(name) {
        this.subs = new Map();
        this.name = name;
    }
    /**
     * Add a subscription. If the key already exists, the old subscription
     * is unsubscribed first (prevents duplicate listeners on the same property).
     */
    add(key, unsubFn) {
        return __awaiter(this, void 0, void 0, function* () {
            const existing = this.subs.get(key);
            if (existing) {
                try {
                    yield existing();
                }
                catch (e) {
                    console.warn(`[${this.name}] Failed to unsub existing key "${key}":`, e);
                }
            }
            this.subs.set(key, unsubFn);
        });
    }
    /**
     * Remove and unsubscribe a single key.
     */
    remove(key) {
        return __awaiter(this, void 0, void 0, function* () {
            const unsub = this.subs.get(key);
            if (unsub) {
                try {
                    yield unsub();
                }
                catch (e) {
                    console.warn(`[${this.name}] Failed to unsub key "${key}":`, e);
                }
                this.subs.delete(key);
            }
        });
    }
    /**
     * Remove and unsubscribe all entries whose key starts with `prefix`.
     * Useful for cleaning up all listeners for a specific track:
     *   removeByPrefix("track:42") removes "track:42:mute", "track:42:send:0", etc.
     */
    removeByPrefix(prefix) {
        return __awaiter(this, void 0, void 0, function* () {
            const toRemove = [];
            this.subs.forEach((_, key) => {
                if (key.startsWith(prefix)) {
                    toRemove.push(key);
                }
            });
            yield Promise.all(toRemove.map((key) => this.remove(key)));
        });
    }
    /**
     * Unsubscribe and remove everything in this group.
     */
    clear() {
        return __awaiter(this, void 0, void 0, function* () {
            const entries = Array.from(this.subs.entries());
            this.subs.clear();
            yield Promise.all(entries.map((_a) => __awaiter(this, [_a], void 0, function* ([key, unsub]) {
                try {
                    yield unsub();
                }
                catch (e) {
                    console.warn(`[${this.name}] Failed to unsub key "${key}" during clear:`, e);
                }
            })));
        });
    }
    /** Number of active subscriptions in this group. */
    get size() {
        return this.subs.size;
    }
    /** Check if a key exists. */
    has(key) {
        return this.subs.has(key);
    }
}
exports.SubscriptionGroup = SubscriptionGroup;
