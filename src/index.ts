import { Ableton } from "ableton-js";
import { NavDirection } from "ableton-js/ns/application-view";
import { Scene } from "ableton-js/ns/scene";

// Log all messages to the console
const ableton = new Ableton({ logger: console });

interface SessionRing {
    tracks: number,
    scenes: number,
    scene_offset: number,
    track_offset: number
}

let SESSION_RING: SessionRing = {
    tracks: 0,
    scenes: 0,
    scene_offset: 0,
    track_offset: 0
};

const init = async () => {
  await ableton.start();
  setupSessionBox(4,4);
};

init();

export async function setupSessionBox(num_tracks: number, num_scenes: number){
    SESSION_RING.tracks = num_tracks;
    SESSION_RING.scenes = num_scenes;
    ableton.session.setupSessionBox(num_tracks,num_scenes);
    updateSessionBoxListeners();
}

export async function setSessionBoxOffset(track_offset: number, scene_offset: number){
    SESSION_RING.track_offset = track_offset;
    SESSION_RING.scene_offset = scene_offset;
    ableton.session.setSessionOffset(track_offset,scene_offset);
    updateSessionBoxListeners();
}


async function updateSessionBoxListeners() {
    console.log("We runing")
    const scenes = await ableton.song.get("scenes");
    scenes.forEach((scene, sceneIndex) => {
        scene.get("clip_slots").then(clip_slots => {
            clip_slots.forEach((clip_slot, clipSlotIndex) => {
                clip_slot.get("color").then(color => {
                    console.log(`Scene ${sceneIndex} at slot ${clipSlotIndex} has color ${color?.rgb}`)
                })
            })
        })
    })
}


async function sessionScroll(dir: NavDirection) {
    await ableton.application.view
      .scrollView("Session", dir)
      .then(() => {
        currentBox()
        currentScenes()
      })
      .catch((error) => {
        console.warn(error);
      });
  }
  
  async function fireSelectedScene() {
    await ableton.song.view
      .get("selected_scene")
      .then((scene) => scene.fire())
      .catch((error) => {
        console.warn(error);
      });
  }
  
  async function getClipSlot(rowNumber, columnNumber) {
    if (rowNumber == undefined || columnNumber == undefined) return;
    return await ableton.song
      .get("tracks")
      .then((tracks) =>
        tracks[columnNumber]
          .get("clip_slots")
          .then(async (clip_slots) => clip_slots[rowNumber]),
      )
      .catch((error) => {
        console.warn(error);
      });
  }
  
  async function listenForAddedOrDeletedScenes() {
    ableton.song.addListener("scenes", async (scenes) => {
      console.log("new scene")
    })
  }
  
  
  async function currentBox() {
    const scenes = await ableton.song.get("scenes");
    const selectedScene = await ableton.song.view.get('selected_scene')
    const selectedSceneIndex = scenes.findIndex(scene => scene.raw.id === selectedScene.raw.id)
    clipListenerBox(scenes.slice(selectedSceneIndex, selectedSceneIndex + 4))
  }
  
  async function currentScenes() {
    const scenes = await ableton.song.get("scenes");
    const selectedScene = await ableton.song.view.get('selected_scene')
    const selectedSceneIndex = scenes.findIndex(scene => scene.raw.id === selectedScene.raw.id)
    // USED FOR IS TRIGGERED CHCEK!
    sceneListener(scenes.slice(selectedSceneIndex, selectedSceneIndex + 4))
  }
  
  let activeSceneSubscribtions: Array< () => Promise<boolean | undefined>> = [];
  async function sceneListener(scenes: Scene[]) {
    try {
  
      activeSceneSubscribtions.forEach(sub => sub());
  
      activeSceneSubscribtions = [];
  
      const promises = scenes.map(async (scene, row) => {
  
        const sceneListener = await scene.addListener("is_triggered", async (bool: boolean) => {
            // lookup or other method should be used, previously based on lookuptable BUTTONS
            const led = row 
            setGridLedAnimation(led, bool, false);
        });
  
        activeSceneSubscribtions.push(sceneListener);
  
        return scene.get('color').then(color => { return { row: row, color: color.rgb } })
      });
  
      const sceneColors = await Promise.all(promises);
  
      console.log("These are the scene colors",sceneColors)
      // send immediate
  
  
    } catch (error) {
      console.warn(error)
    }
  }
  
  
  let activeClipSubscribtions: Array< () => Promise<boolean | undefined>>  = [];
  async function clipListenerBox(scenes: Scene[]) {
  
    try {
      // cleanup subscribers
      await Promise.all(activeClipSubscribtions.map(sub => sub()));
  
      activeClipSubscribtions = [];
  
      // promises are in 2D array, rows are scenes, columns are tracks
      // getting here all the clip colors to immediately update them on Grid
      const promises = scenes.map((scene, row) => {
        return scene.get('clip_slots').then(async clip_slots => {
          const clipSlotPromises: Array<Promise<any>> = [];
          for (let col = 0; col < 4; col++) {
            const clip_slot = clip_slots[col];
  
            // Collect promises for each clip_slot
            const clipPromise = clip_slot.get("clip").then(clip => {
              if (clip) {
                return clip.get("color").then(color => {
                  return { row, col, color: color.rgb }
                })
                .catch(error => {
                  console.error('An error occurred:', error);
                  return { row, col, color: "000000" }
                })
              } else {
                return new Promise((res, rej) => {
                  res({ row, col, color: "000000" })
                  rej({ row, col, color: "000000" })
                })
              }
            }).catch(error => {
                console.error('An error occurred:', error);
                return { row, col, color: "000000" }
            });
  
            clipSlotPromises.push(clipPromise as Promise<any>);
  
            // Collect subscription promises
            const subscriberPromise = await clip_slot.addListener("is_triggered", async (bool: boolean) => {
              const led = {index: 3}
              setGridLedAnimation(led, bool, clip_slot.raw.has_clip);
            });
  
            activeClipSubscribtions.push(subscriberPromise);
  
          }
          return Promise.all(clipSlotPromises); // Wait for all clip_slot promises to complete
        });
      });
  
      // wait for all scene promises to complete
      const clipMatrix = await Promise.all(promises).catch(error => {
        console.error('An error occurred:', error);
      });
  
      multiSetGridLedColor(clipMatrix)
  
    } catch (error) {
      console.warn(error)
    }
  
  }
  
  async function multiSetGridLedColor(clipMatix) {
  
    let script = "";
  
    try {
      clipMatix.forEach((scene) => {
        scene.forEach((clip) => {
          const { row, col, color } = clip;
          // BUTTON_ARRAY[row][col];
          const BUTTON = row*col
          const rgb = hexToRgb(color);
  
          script += ` glc(${0},1,${rgb[0]},${rgb[1]},${rgb[2]})`
          if (color !== "000000") {
            script += ` glp(${0},1,50) `
          }
        })
      })
  
      console.log(script)
  
      //sendImmediate(0, -1, script);
    } catch (error) {
      console.warn(error);
    }
  
  
  
  }
  
  function setGridLedAnimation(led, isTriggered, hasClip) {
    try {
      const BUTTON = {index: 1}
  
      let script = "";
      if (isTriggered == true) {
        // start animation
        script = `glpfs(${BUTTON.index},1,0,4,1)`;
      } else if (isTriggered == false && hasClip == true) {
        // stop animation and set brightness if clip exists
        script = `glpfs(${BUTTON.index},1,0,0,0) glp(${BUTTON.index},1,255)`;
      } else {
        // stop animation
        script = `glpfs(${BUTTON.index},1,0,0,0)`;
      }
  
      //sendImmediate(BUTTON.dx, BUTTON.dy, script);
    } catch (error) {
      console.warn(error);
    }
  }
  
  
  async function launchClip(rowNumber: number, columnNumber: number) {
    const clipSlot = await getClipSlot(rowNumber, columnNumber);
    // firing empty clip slot will stop clips on track
    if(clipSlot){
        clipSlot.fire()
    }
  }
  
  async function launchScene(rowNumber) {
    const scene = await ableton.song.get("scenes").then(scenes => scenes[rowNumber]);
    scene.fire();
  }
  
  function hexToRgb(hex) {
    var bigint = parseInt(hex, 16);
    var r = (bigint >> 16) & 255;
    var g = (bigint >> 8) & 255;
    var b = bigint & 255;
    return [r, g, b];
  }
  
  async function setGridLedColor(row, col, color) {
    try {
      const BUTTON = {index: 2}
      const rgb = hexToRgb(color);
      const ledColorScript = `glc(${BUTTON.index},1,${rgb[0]},${rgb[1]},${rgb[2]})`;
      //sendImmediate(BUTTON.dx, BUTTON.dy, ledColorScript);
      console.log("setGridLedColor", row, col, rgb)
    } catch (error) {
      console.warn(error);
    }
  
  }
  
  async function setGridLedStatus(row, col, clip_slot) {
    if (!clip_slot) return;
  
  
    try {
      const BUTTON = {index: 0}
  
      let ledAnimationScript = "";
      if (clip_slot.raw.is_triggered == true) {
        // start animation
        ledAnimationScript = `glpfs(${BUTTON.index},1,0,4,1)`;
      } else {
        // stop animation
        ledAnimationScript = `glpfs(${BUTTON.index},1,0,0,0)`;
      }
  
      //sendImmediate(BUTTON.dx, BUTTON.dy, ledAnimationScript);
  
      let intensity = 0;
  
      if (clip_slot.raw.is_playing == true) {
        intensity = 255;
      } else {
        intensity = 0;
      }
  
      let ledIntensityScript = `glp(${BUTTON.index},1,${intensity}) `;
  
      //sendImmediate(BUTTON.dx, BUTTON.dy, ledIntensityScript);
    } catch (error) {
      console.warn(error);
    }
  
  
  }
  
  async function setGridLedIntensity(row, col, intensity = 0) {
    try {
        //BUTTON_ARRAY[row][col];
      const BUTTON = 0 
  
      let ledIntensityScript = `glp(${0},1,${intensity}) `;
  
      //sendImmediate(BUTTON.dx, BUTTON.dy, ledIntensityScript);
    } catch (error) {
      console.warn(error);
    }
  
  }