<svelte:options customElement={{ tag: "ableton-preference", shadow: "none" }} />

<script>
  import {
    Block,
    BlockBody,
    BlockRow,
    BlockTitle,
    MoltenButton,
    MoltenInput,
  } from "@intechstudio/grid-uikit";
  import { onMount } from "svelte";

  import "./app.css";

  // @ts-ignore
  const messagePort = {}; // createPackageMessagePort("package-ableton-js");

  onMount(() => {
    messagePort.start();
    messagePort.postMessage({
      type: "request-configuration",
    });
    return () => {
      messagePort.close();
    };
  });

  function makeItGreen() {
    messagePort.postMessage({
      type: "led-update",
      data: {
        color: "green",
      },
    });
  }

  function makeItRed() {
    messagePort.postMessage({
      type: "scroll-up",
      data: {
        color: "red",
      },
    });
  }

  const clipGrid = [
    [0, 1, 3, 4],
    [5, 6, 7, 8],
    [9, 10, 11, 12],
    [13, 14, 15, 16],
  ];
</script>

<main-app>
  <div class="px-4">
    <div></div>
    no
    <Block>
      yes
      {#each clipGrid as gridColumn, gridColumnIndex}
        <div>Column {gridColumnIndex}</div>
        {#each gridColumn as gridRow, gridRowIndex}
          <div>{gridColumn} {gridRow}</div>
        {/each}
      {/each}
      <BlockTitle>Ableton JS demo</BlockTitle>
      <div class="flex flex-row">
        <MoltenButton title={"piros"} click={makeItRed} />
        <MoltenButton title={"zöld"} click={makeItGreen} />
      </div>
    </Block>
  </div>
</main-app>
