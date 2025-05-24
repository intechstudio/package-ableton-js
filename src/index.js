"use strict";
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done
          ? resolve(result.value)
          : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupSessionBox = setupSessionBox;
exports.setSessionBoxOffset = setSessionBoxOffset;
const ableton_js_1 = require("ableton-js");
// Log all messages to the console
const ableton = new ableton_js_1.Ableton({ logger: console });
let SESSION_RING = {
  tracks: 0,
  scenes: 0,
  scene_offset: 0,
  track_offset: 0,
};
const init = () =>
  __awaiter(void 0, void 0, void 0, function* () {
    yield ableton.start();
    setupSessionBox(4, 4);
  });
init();
function setupSessionBox(num_tracks, num_scenes) {
  return __awaiter(this, void 0, void 0, function* () {
    SESSION_RING.tracks = num_tracks;
    SESSION_RING.scenes = num_scenes;
    ableton.session.setupSessionBox(num_tracks, num_scenes);
    updateSessionBoxListeners();
  });
}
function setSessionBoxOffset(track_offset, scene_offset) {
  return __awaiter(this, void 0, void 0, function* () {
    SESSION_RING.track_offset = track_offset;
    SESSION_RING.scene_offset = scene_offset;
    ableton.session.setSessionOffset(track_offset, scene_offset);
    updateSessionBoxListeners();
  });
}
function updateSessionBoxListeners() {
  return __awaiter(this, void 0, void 0, function* () {
    console.log("We runing");
    const scenes = yield ableton.song.get("scenes");
    scenes.forEach((scene, sceneIndex) => {
      scene.get("clip_slots").then((clip_slots) => {
        clip_slots.forEach((clip_slot, clipSlotIndex) => {
          clip_slot.get("color").then((color) => {
            console.log(
              `Scene ${sceneIndex} at slot ${clipSlotIndex} has color ${
                color === null || color === void 0 ? void 0 : color.rgb
              }`
            );
          });
        });
      });
    });
  });
}
function sessionScroll(dir) {
  return __awaiter(this, void 0, void 0, function* () {
    yield ableton.application.view
      .scrollView("Session", dir)
      .then(() => {
        currentBox();
        currentScenes();
      })
      .catch((error) => {
        console.warn(error);
      });
  });
}
function fireSelectedScene() {
  return __awaiter(this, void 0, void 0, function* () {
    yield ableton.song.view
      .get("selected_scene")
      .then((scene) => scene.fire())
      .catch((error) => {
        console.warn(error);
      });
  });
}
function getClipSlot(rowNumber, columnNumber) {
  return __awaiter(this, void 0, void 0, function* () {
    if (rowNumber == undefined || columnNumber == undefined) return;
    return yield ableton.song
      .get("tracks")
      .then((tracks) =>
        tracks[columnNumber].get("clip_slots").then((clip_slots) =>
          __awaiter(this, void 0, void 0, function* () {
            return clip_slots[rowNumber];
          })
        )
      )
      .catch((error) => {
        console.warn(error);
      });
  });
}
function listenForAddedOrDeletedScenes() {
  return __awaiter(this, void 0, void 0, function* () {
    ableton.song.addListener("scenes", (scenes) =>
      __awaiter(this, void 0, void 0, function* () {
        console.log("new scene");
      })
    );
  });
}
function currentBox() {
  return __awaiter(this, void 0, void 0, function* () {
    const scenes = yield ableton.song.get("scenes");
    const selectedScene = yield ableton.song.view.get("selected_scene");
    const selectedSceneIndex = scenes.findIndex(
      (scene) => scene.raw.id === selectedScene.raw.id
    );
    clipListenerBox(scenes.slice(selectedSceneIndex, selectedSceneIndex + 4));
  });
}
function currentScenes() {
  return __awaiter(this, void 0, void 0, function* () {
    const scenes = yield ableton.song.get("scenes");
    const selectedScene = yield ableton.song.view.get("selected_scene");
    const selectedSceneIndex = scenes.findIndex(
      (scene) => scene.raw.id === selectedScene.raw.id
    );
    // USED FOR IS TRIGGERED CHCEK!
    sceneListener(scenes.slice(selectedSceneIndex, selectedSceneIndex + 4));
  });
}
let activeSceneSubscribtions = [];
function sceneListener(scenes) {
  return __awaiter(this, void 0, void 0, function* () {
    try {
      activeSceneSubscribtions.forEach((sub) => sub());
      activeSceneSubscribtions = [];
      const promises = scenes.map((scene, row) =>
        __awaiter(this, void 0, void 0, function* () {
          const sceneListener = yield scene.addListener(
            "is_triggered",
            (bool) =>
              __awaiter(this, void 0, void 0, function* () {
                // lookup or other method should be used, previously based on lookuptable BUTTONS
                const led = row;
                setGridLedAnimation(led, bool, false);
              })
          );
          activeSceneSubscribtions.push(sceneListener);
          return scene.get("color").then((color) => {
            return { row: row, color: color.rgb };
          });
        })
      );
      const sceneColors = yield Promise.all(promises);
      console.log("These are the scene colors", sceneColors);
      // send immediate
    } catch (error) {
      console.warn(error);
    }
  });
}
let activeClipSubscribtions = [];
function clipListenerBox(scenes) {
  return __awaiter(this, void 0, void 0, function* () {
    try {
      // cleanup subscribers
      yield Promise.all(activeClipSubscribtions.map((sub) => sub()));
      activeClipSubscribtions = [];
      // promises are in 2D array, rows are scenes, columns are tracks
      // getting here all the clip colors to immediately update them on Grid
      const promises = scenes.map((scene, row) => {
        return scene.get("clip_slots").then((clip_slots) =>
          __awaiter(this, void 0, void 0, function* () {
            const clipSlotPromises = [];
            for (let col = 0; col < 4; col++) {
              const clip_slot = clip_slots[col];
              // Collect promises for each clip_slot
              const clipPromise = clip_slot
                .get("clip")
                .then((clip) => {
                  if (clip) {
                    return clip
                      .get("color")
                      .then((color) => {
                        return { row, col, color: color.rgb };
                      })
                      .catch((error) => {
                        console.error("An error occurred:", error);
                        return { row, col, color: "000000" };
                      });
                  } else {
                    return new Promise((res, rej) => {
                      res({ row, col, color: "000000" });
                      rej({ row, col, color: "000000" });
                    });
                  }
                })
                .catch((error) => {
                  console.error("An error occurred:", error);
                  return { row, col, color: "000000" };
                });
              clipSlotPromises.push(clipPromise);
              // Collect subscription promises
              const subscriberPromise = yield clip_slot.addListener(
                "is_triggered",
                (bool) =>
                  __awaiter(this, void 0, void 0, function* () {
                    const led = { index: 3 };
                    setGridLedAnimation(led, bool, clip_slot.raw.has_clip);
                  })
              );
              activeClipSubscribtions.push(subscriberPromise);
            }
            return Promise.all(clipSlotPromises); // Wait for all clip_slot promises to complete
          })
        );
      });
      // wait for all scene promises to complete
      const clipMatrix = yield Promise.all(promises).catch((error) => {
        console.error("An error occurred:", error);
      });
      multiSetGridLedColor(clipMatrix);
    } catch (error) {
      console.warn(error);
    }
  });
}
function multiSetGridLedColor(clipMatix) {
  return __awaiter(this, void 0, void 0, function* () {
    let script = "";
    try {
      clipMatix.forEach((scene) => {
        scene.forEach((clip) => {
          const { row, col, color } = clip;
          // BUTTON_ARRAY[row][col];
          const BUTTON = row * col;
          const rgb = hexToRgb(color);
          script += ` glc(${0},1,${rgb[0]},${rgb[1]},${rgb[2]})`;
          if (color !== "000000") {
            script += ` glp(${0},1,50) `;
          }
        });
      });
      console.log(script);
      //sendImmediate(0, -1, script);
    } catch (error) {
      console.warn(error);
    }
  });
}
function setGridLedAnimation(led, isTriggered, hasClip) {
  try {
    const BUTTON = { index: 1 };
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
function launchClip(rowNumber, columnNumber) {
  return __awaiter(this, void 0, void 0, function* () {
    const clipSlot = yield getClipSlot(rowNumber, columnNumber);
    // firing empty clip slot will stop clips on track
    if (clipSlot) {
      clipSlot.fire();
    }
  });
}
function launchScene(rowNumber) {
  return __awaiter(this, void 0, void 0, function* () {
    const scene = yield ableton.song
      .get("scenes")
      .then((scenes) => scenes[rowNumber]);
    scene.fire();
  });
}
function hexToRgb(hex) {
  var bigint = parseInt(hex, 16);
  var r = (bigint >> 16) & 255;
  var g = (bigint >> 8) & 255;
  var b = bigint & 255;
  return [r, g, b];
}
function setGridLedColor(row, col, color) {
  return __awaiter(this, void 0, void 0, function* () {
    try {
      const BUTTON = { index: 2 };
      const rgb = hexToRgb(color);
      const ledColorScript = `glc(${BUTTON.index},1,${rgb[0]},${rgb[1]},${rgb[2]})`;
      //sendImmediate(BUTTON.dx, BUTTON.dy, ledColorScript);
      console.log("setGridLedColor", row, col, rgb);
    } catch (error) {
      console.warn(error);
    }
  });
}
function setGridLedStatus(row, col, clip_slot) {
  return __awaiter(this, void 0, void 0, function* () {
    if (!clip_slot) return;
    try {
      const BUTTON = { index: 0 };
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
  });
}
function setGridLedIntensity(row_1, col_1) {
  return __awaiter(
    this,
    arguments,
    void 0,
    function* (row, col, intensity = 0) {
      try {
        //BUTTON_ARRAY[row][col];
        const BUTTON = 0;
        let ledIntensityScript = `glp(${0},1,${intensity}) `;
        //sendImmediate(BUTTON.dx, BUTTON.dy, ledIntensityScript);
      } catch (error) {
        console.warn(error);
      }
    }
  );
}
