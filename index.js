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
      //clipListeners()
      sceneListeners();
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

// /**
//  * @description Listen to clip slots in predefined grid
//  */
// async function clipListeners() {
//   const columns = 6; // tracks
//   const rows = 4; // scenes
//   for (let row = 0; row < rows; row++) {
//     for (let col = 0; col < columns; col++) {
//       getClipSlot(row, col).then(clip_slot => {
//         clip_slot.addListener('is_triggered', (d) => {
//           // after trigger, refetch the clip slot status
//           getClipSlot(row, col).then(clip_slot => {
//             if (clip_slot) {
//               setGridLedStatus(row, col, clip_slot)
//             }
//           })
//         })

//         // current clip setup
//         clip_slot.get('clip').then(clip => {

//           if (clip) {
//             clip.get('color').then(color => {
//               setGridLedColor(row, col, color.color)
//               setGridLedIntensity(row, col, 255)
//             })
//           } else {
//             setGridLedColor(row, col, "000000")
//           }
//         })
//       }).catch(error => {

//         console.warn(error)
//       })
//     }
//   }
// }

// const currentScene = await ableton.song.view.get('selected_scene')
// const selectedSceneIndex = allScenes.findIndex(scene => scene.raw.id === currentScene.raw.id)

async function sceneListeners() {
  // const columns = 6; // tracks
  // const rows = 20; // scenes
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
  clipSlot.fire();
}

function hexToRgb(hex) {
  var bigint = parseInt(hex, 16);
  var r = (bigint >> 16) & 255;
  var g = (bigint >> 8) & 255;
  var b = bigint & 255;
  return [r, g, b];
}

async function setGridLedColor(row, col, color) {
  const BUTTON = BUTTON_ARRAY[row][col];
  const rgb = hexToRgb(color);
  const ledColorScript = `glc(${BUTTON.index},1,${rgb[0]},${rgb[1]},${rgb[2]})`;
  sendImmediate(BUTTON.dx, BUTTON.dy, ledColorScript);
}

async function setGridLedStatus(row, col, clip_slot) {
  if (!clip_slot) return;

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
}

async function setGridLedIntensity(row, col, intensity = 0) {
  const BUTTON = BUTTON_ARRAY[row][col];

  let ledIntensityScript = `glp(${BUTTON.index},1,${intensity}) `;

  sendImmediate(BUTTON.dx, BUTTON.dy, ledIntensityScript);
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
