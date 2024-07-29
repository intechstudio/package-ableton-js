<svelte:options customElement={{tag: 'ableton-preference', shadow: 'none'}} />
<script>
    import { Block, BlockBody, BlockRow, BlockTitle, MoltenButton, MoltenInput } from "@intechstudio/grid-uikit";
    import { onMount } from "svelte";

  // @ts-ignore
  const messagePort = createPackageMessagePort("package-ableton-js");

  onMount(() => {
    messagePort.start();
    messagePort.postMessage({
      type: "request-configuration",
    });
    return () => {
      messagePort.close();
    }
  })

  
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
</script>

<main-app>
  <div class="px-4">
    <Block>
      <BlockTitle> Ableton JS demo </BlockTitle>
      <div class="flex flex-row">
        <MoltenButton title={"piros"} click={makeItRed} />
        <MoltenButton title={"zöld"} click={makeItGreen} />
      </div>
    </Block>
  </div>
</main-app>