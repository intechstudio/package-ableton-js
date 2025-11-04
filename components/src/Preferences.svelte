<svelte:options
  customElement={{ tag: "ableton-js-preferences", shadow: "none" }}
/>

<script>
  import {
    Block,
    BlockBody,
    BlockTitle,
    MeltCheckbox,
    MoltenButton,
  } from "@intechstudio/grid-uikit";
  import { Scene } from "ableton-js/ns/scene";
  import { onMount } from "svelte";

  // @ts-ignore
  const messagePort = createPackageMessagePort(
    "package-ableton-js",
    "preferences"
  );

  let myFirstVariable = false;

  let installationStatus = "";
  let installationSuccess = false;

  $: myFirstVariable, handleDataChange();

  function handleDataChange() {
    messagePort.postMessage({
      type: "set-setting",
      myFirstVariable,
    });
  }

  function makeItGreen() {
    messagePort.postMessage({
      type: "offset",
      track_offset: 1,
      scene_offset: 2,
    });
  }

  function makeItRed() {
    messagePort.postMessage({
      type: "offset",
      track_offset: 2,
      scene_offset: 2,
    });
  }

  // MIDI Script Installation Functions
  function installMidiScript() {
    messagePort.postMessage({
      type: "install-midi-script",
    });
  }

  function openRemoteScriptsFolder() {
    messagePort.postMessage({
      type: "open-remote-scripts",
    });
  }

  function openMidiScriptSource() {
    messagePort.postMessage({
      type: "open-midi-script-source",
    });
  }

  onMount(() => {
    messagePort.onmessage = (e) => {
      const data = e.data;
      if (data.type === "client-status") {
        myFirstVariable = data.myFirstVariable;
      }
      if (data.type === "midi-script-status") {
        installationStatus = data.message;
        installationSuccess = data.success;
        // Clear the message after 5 seconds
        setTimeout(() => {
          installationStatus = "";
        }, 5000);
      }
    };
    messagePort.start();
    return () => {
      messagePort.close();
    };
  });
</script>

<main-app>
  <div class="px-4">
    <Block>
      <BlockTitle>AbletonJS MIDI Script Setup</BlockTitle>
      <BlockBody>
        <p class="mb-4 opacity-80">
          To use AbletonJS with Grid, you need to install the MIDI script to
          your Ableton Remote Scripts folder.
        </p>

        <div class="mb-4">
          <h3 class="text-sm font-semibold mb-2">
            📦 Automatic Installation (Recommended)
          </h3>
          <p class=" mb-2 opacity-70">
            Click this button to automatically copy the MIDI script to Ableton.
          </p>
          <MoltenButton
            title={"🚀 Install MIDI Script"}
            click={installMidiScript}
          />
          {#if installationStatus}
            <div
              class="mt-2 p-2 rounded text-xs {installationSuccess
                ? 'bg-green-900/30 text-green-400'
                : 'bg-red-900/30 text-red-400'}"
            >
              {installationStatus}
            </div>
          {/if}
          <p class="mt-2 opacity-60">
            After installation: Restart Ableton → Preferences → MIDI → Select
            "AbletonJS"
          </p>
        </div>

        <div class="border-t border-gray-700 pt-4">
          <h3 class="text-sm font-semibold mb-2">📂 Manual Installation</h3>
          <p class=" mb-2 opacity-70">
            Open folders to manually copy the MIDI script files.
          </p>
          <div class="flex gap-2">
            <MoltenButton
              title={"Open Destination Folder"}
              click={openRemoteScriptsFolder}
            />
            <MoltenButton
              title={"Open Source Folder"}
              click={openMidiScriptSource}
            />
          </div>
          <p class="mt-2 opacity-60">
            Copy all files from Source → Destination/AbletonJS
          </p>
        </div>
      </BlockBody>
    </Block>
  </div>
</main-app>
