let controller = undefined;
let messagePorts = new Set();
let windowMessagePort;

let numberOfRows;
let selectedArea;
let timeoutValue;

const abletonjs = require("ableton-js");
const { NavDirection } = require("ableton-js/ns/application-view");
const { ClipSlot } = require("ableton-js/ns/clip-slot");

const BUTTON_ARRAY = [
  [
    { dx: 0, dy: -1, index: 3 },
    { dx: 0, dy: -1, index: 7 },
    { dx: 0, dy: -1, index: 11 },
    { dx: 0, dy: -1, index: 15 },
  ],
  [
    { dx: 0, dy: -1, index: 2 },
    { dx: 0, dy: -1, index: 6 },
    { dx: 0, dy: -1, index: 10 },
    { dx: 0, dy: -1, index: 14 },
  ],
  [
    { dx: 0, dy: -1, index: 1 },
    { dx: 0, dy: -1, index: 5 },
    { dx: 0, dy: -1, index: 9 },
    { dx: 0, dy: -1, index: 13 },
  ],
  [
    { dx: 0, dy: -1, index: 0 },
    { dx: 0, dy: -1, index: 4 },
    { dx: 0, dy: -1, index: 8 },
    { dx: 0, dy: -1, index: 12 },
  ],
];

// Log all messages to the console
const ableton = new abletonjs.Ableton({ logger: console });

async function startAbleton() {
  return await ableton.start();
}

exports.loadPackage = async function (gridController, persistedData) {
  controller = gridController;
  await startAbleton()
    .then(() => {
      listenForAddedOrDeletedScenes();
      currentBox();
      currentScenes();
    })
    .catch((error) => {
      console.warn(error);
    });
};

exports.unloadPackage = async function () {
  controller = undefined;
  messagePorts.forEach((port) => port.close());
  messagePorts.clear();
  windowMessagePort?.close();
  windowMessagePort = undefined;
};

exports.addMessagePort = async function (port, senderId) {
  if (senderId === "overlay-window") {
    windowMessagePort?.close();
    windowMessagePort = port;
    port.start();
  } else {
    port.on("message", (e) => {
      onMessage(port, e.data);
    });

    messagePorts.add(port);

    port.on("close", () => {
      messagePorts.delete(port);
    });

    port.start();
  }
};

async function sessionScroll(dir) {
  await ableton.application.view
    .scrollView("Session", NavDirection[dir])
    .then(() => {
      currentBox()
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

/**
 * @description Get the clip slot from a track
 * @param {number} rowNumber // scene
 * @param {number} columnNumber // track
 * @return {Promise<ClipSlot|void>}
 */
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
  sceneListenerBox(scenes.slice(selectedSceneIndex, selectedSceneIndex + 4))
}

let activeClipSubscribtions = [];
async function sceneListenerBox(scenes) {

  try {
    // cleanup subscribers
    await Promise.all(activeClipSubscribtions.map(sub => sub()));

    activeClipSubscribtions = [];

    // promises are in 2D array, rows are scenes, columns are tracks
    // getting here all the clip colors to immediately update them on Grid
    const promises = scenes.map((scene, row) => {
      return scene.get('clip_slots').then(async clip_slots => {
        const clipSlotPromises = [];
        for (let col = 0; col < 4; col++) {
          const clip_slot = clip_slots[col];

          // Collect promises for each clip_slot
          const clipPromise = clip_slot.get("clip").then(clip => {
            if (clip) {
              return clip.get("color").then(color => {
                return { row, col, color: color.color }
              });
            } else {
              return new Promise((res, rej) => {
                res({ row, col, color: "000000" })
              })
            }
          });

          clipSlotPromises.push(clipPromise);

          // Collect subscription promises
          const subscriberPromise = await clip_slot.addListener("is_triggered", async (bool) => {
            setGridLedAnimation(row, col, bool, clip_slot.raw.has_clip);
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
        const BUTTON = BUTTON_ARRAY[row][col];
        const rgb = hexToRgb(color);

        script += ` glc(${BUTTON.index},1,${rgb[0]},${rgb[1]},${rgb[2]})`
        if (color !== "000000") {
          script += ` glp(${BUTTON.index},1,50) `
        }
      })
    })

    console.log(script)

    sendImmediate(0, -1, script);
  } catch (error) {
    console.warn(error);
  }



}

function setGridLedAnimation(row, col, isTriggered, hasClip) {
  try {
    const BUTTON = BUTTON_ARRAY[row][col];

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

    sendImmediate(BUTTON.dx, BUTTON.dy, script);
  } catch (error) {
    console.warn(error);
  }
}

async function sceneListeners() {
  const allScenes = await ableton.song.get("scenes");
  try {
    allScenes.forEach((scene, row) => {
      scene
        .get("clip_slots")
        .then((clip_slots) => {
          clip_slots.forEach((clip_slot, col) => {
            clip_slot.addListener("is_triggered", (bool) => {
              // after trigger, refetch the clip slot status
              getClipSlot(row, col).then((clip_slot) => {
                setGridLedStatus(row, col, clip_slot);
              });
            });

            //load the clip color
            clip_slot.get("clip").then((clip) => {
              if (clip) {
                clip.get("color").then((color) => {
                  setGridLedColor(row, col, color.color);
                  setGridLedIntensity(row, col, 255);
                });
              } else {
                setGridLedColor(row, col, "000000");
              }
            });
          })
        }
        )
        .catch((error) => {
          console.warn(error);
        });
    });
  } catch (error) {
    console.warn("trycatch", error);
  }
}



/**
 * @description Fire or stop clip on track
 * @param {number} rowNumber // scene
 * @param {number} columnNumber //  track
 */
async function launchClip(rowNumber, columnNumber) {
  const clipSlot = await getClipSlot(rowNumber, columnNumber);
  // firing empty clip slot will stop clips on track
  clipSlot.fire()
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
    const BUTTON = BUTTON_ARRAY[row][col];
    const rgb = hexToRgb(color);
    const ledColorScript = `glc(${BUTTON.index},1,${rgb[0]},${rgb[1]},${rgb[2]})`;
    sendImmediate(BUTTON.dx, BUTTON.dy, ledColorScript);
    console.log("setGridLedColor", row, col, rgb)
  } catch (error) {
    console.warn(error);
  }

}

async function setGridLedStatus(row, col, clip_slot) {
  if (!clip_slot) return;


  try {
    const BUTTON = BUTTON_ARRAY[row][col];

    let ledAnimationScript = "";
    if (clip_slot.raw.is_triggered == true) {
      // start animation
      ledAnimationScript = `glpfs(${BUTTON.index},1,0,4,1)`;
    } else {
      // stop animation
      ledAnimationScript = `glpfs(${BUTTON.index},1,0,0,0)`;
    }

    sendImmediate(BUTTON.dx, BUTTON.dy, ledAnimationScript);

    let intensity = 0;

    if (clip_slot.raw.is_playing == true) {
      intensity = 255;
    } else {
      intensity = 0;
    }

    let ledIntensityScript = `glp(${BUTTON.index},1,${intensity}) `;

    sendImmediate(BUTTON.dx, BUTTON.dy, ledIntensityScript);
  } catch (error) {
    console.warn(error);
  }


}

async function setGridLedIntensity(row, col, intensity = 0) {
  try {
    const BUTTON = BUTTON_ARRAY[row][col];

    let ledIntensityScript = `glp(${BUTTON.index},1,${intensity}) `;

    sendImmediate(BUTTON.dx, BUTTON.dy, ledIntensityScript);
  } catch (error) {
    console.warn(error);
  }

}

async function sendImmediate(dx, dy, script) {
  controller.sendMessageToRuntime({
    id: "immediate",
    target_dx: dx,
    target_dy: dy,
    script: `<?lua ${script} ?>`,
  });
}

exports.sendMessage = async function (args) {
  console.log("sendMessage", args);
  if (args[0] == "launch-clip") {
    launchClip(args[1], args[2]);
  }
  if (args[0] == "session-scroll") {
    sessionScroll(args[1]);
  }
  if (args[0] == "launch-scene") {
    launchScene(args[1]);
  }
  if (args[0] == "fire-scene") {
    fireSelectedScene();
  }
};

async function onMessage(port, data) {
  console.log("ONMESSAGE", data);
  if (data.type == "scroll-up") {
    sessionScroll();
  }
}
