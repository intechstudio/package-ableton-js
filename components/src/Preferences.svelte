<svelte:options
  customElement={{ tag: "template-preference", shadow: "none" }}
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

  onMount(() => {
    messagePort.onmessage = (e) => {
      const data = e.data;
      if (data.type === "client-status") {
        myFirstVariable = data.myFirstVariable;
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
      <BlockTitle>Template Package</BlockTitle>
      <BlockBody>
        Test variable
        <MeltCheckbox
          title={"This is a persistent variable"}
          bind:target={myFirstVariable}
        />
        <MoltenButton title={"piros"} click={makeItRed} />
        <MoltenButton title={"zöld"} click={makeItGreen} />
      </BlockBody>
    </Block>
  </div>
</main-app>
