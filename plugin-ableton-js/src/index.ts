import { Ableton } from "ableton-js";

// Log all messages to the console
const ableton = new Ableton({ logger: console });

const test = async () => {
    // Establishes a connection with Live
    await ableton.start();

    // Observe the current playback state and tempo
    ableton.song.addListener("is_playing", (p) => console.log("Playing:", p));
    ableton.song.addListener("tempo", (t) => console.log("Tempo:", t));

    // Get the current tempo
    const tempo = await ableton.song.get("tempo");
    console.log("Current tempo:", tempo);

    // Set the tempo
    await ableton.song.set("tempo", 85);
};

let activeClipSubscribtions = [];

async function clipListener(row: number, column: number) {
    const scenes = await ableton.song.get("scenes");
    scenes[row].get("clip_slots").then(async clip_slots => {
        const clip_slot = clip_slots[column];
        console.log("raw clip slot", clip_slot.raw)

        activeClipSubscribtions.push(clip_slot?.addListener("is_triggered", (is_triggered) => {
            console.log(`Clip at ${row},${column} is triggered: ${is_triggered}`);
        }));

        clip_slot.get('clip').then(clip => {
        })

        // Collect promises for each clip_slot
        // const clipPromise = clip_slot.get("clip").then(clip => {
        //     if (clip) {
        //         return clip.get("color").then(color => {
        //             return { row, col, color: color.color }
        //         });
        //     } else {
        //         return new Promise((res, rej) => {
        //             res({ row, col, color: "000000" })
        //         })
        //     }
        // });
    })
}


test().then(() => {
    clipListener(2, 0)
})