import Preferences from "./Preferences.svelte";

const app = new Preferences({
    target: document.getElementById('app'),
    props: {
        // assuming App.svelte contains something like
        // `export let answer`:
    }
});

export default app;