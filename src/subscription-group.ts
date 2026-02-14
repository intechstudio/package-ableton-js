/**
 * SubscriptionGroup manages a keyed set of ableton-js listener unsubscribe functions.
 *
 * Keys follow the convention: "track:{id}:mute", "track:{id}:send:0", etc.
 * This enables selective cleanup by prefix (e.g. remove all listeners for a track)
 * without tearing down the entire group.
 */

type UnsubFn = () => Promise<boolean | undefined>;

export class SubscriptionGroup {
  private subs = new Map<string, UnsubFn>();
  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  /**
   * Add a subscription. If the key already exists, the old subscription
   * is unsubscribed first (prevents duplicate listeners on the same property).
   */
  async add(key: string, unsubFn: UnsubFn): Promise<void> {
    const existing = this.subs.get(key);
    if (existing) {
      try {
        await existing();
      } catch (e) {
        console.warn(
          `[${this.name}] Failed to unsub existing key "${key}":`,
          e,
        );
      }
    }
    this.subs.set(key, unsubFn);
  }

  /**
   * Remove and unsubscribe a single key.
   */
  async remove(key: string): Promise<void> {
    const unsub = this.subs.get(key);
    if (unsub) {
      try {
        await unsub();
      } catch (e) {
        console.warn(`[${this.name}] Failed to unsub key "${key}":`, e);
      }
      this.subs.delete(key);
    }
  }

  /**
   * Remove and unsubscribe all entries whose key starts with `prefix`.
   * Useful for cleaning up all listeners for a specific track:
   *   removeByPrefix("track:42") removes "track:42:mute", "track:42:send:0", etc.
   */
  async removeByPrefix(prefix: string): Promise<void> {
    const toRemove: string[] = [];
    this.subs.forEach((_, key) => {
      if (key.startsWith(prefix)) {
        toRemove.push(key);
      }
    });
    await Promise.all(toRemove.map((key) => this.remove(key)));
  }

  /**
   * Unsubscribe and remove everything in this group.
   */
  async clear(): Promise<void> {
    const entries = Array.from(this.subs.entries());
    this.subs.clear();
    await Promise.all(
      entries.map(async ([key, unsub]) => {
        try {
          await unsub();
        } catch (e) {
          console.warn(
            `[${this.name}] Failed to unsub key "${key}" during clear:`,
            e,
          );
        }
      }),
    );
  }

  /** Number of active subscriptions in this group. */
  get size(): number {
    return this.subs.size;
  }

  /** Check if a key exists. */
  has(key: string): boolean {
    return this.subs.has(key);
  }
}
