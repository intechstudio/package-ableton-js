let controller;
let preferenceMessagePort = undefined;

let myFirstVariable = false;

let messagePorts = new Set();
let windowMessagePort;

const ableton = require("./src/index.js");
const { execSync } = require("child_process");
const path = require("path");

exports.loadPackage = async function (gridController, persistedData) {
  controller = gridController;

  // const actionIconSvg = fs.readFileSync(
  //   path.resolve(__dirname, "ableton-js-black-logo.svg"),
  //   { encoding: "utf-8" }
  // );

  // gridController.sendMessageToEditor({
  //   type: "add-action",
  //   info: {
  //     actionId: 0,
  //     rendering: "standard",
  //     category: "template",
  //     color: "#5865F2",
  //     icon: actionIconSvg,
  //     blockIcon: actionIconSvg,
  //     selectable: true,
  //     movable: true,
  //     hideIcon: false,
  //     type: "single",
  //     toggleable: true,
  //     short: "xta",
  //     displayName: "Template Action",
  //     defaultLua: 'gps("package-ableton-js", val)',
  //     actionComponent: "ableton-js-action",
  //   },
  // });

  myFirstVariable = persistedData?.myFirstVariable ?? false;

  ableton.init((args) => {
    gridController.sendMessageToEditor({
      type: "execute-lua-script",
      script: `ableton_js_callback(${jsonToLuaTable(args)})`,
    });
  });
};

exports.unloadPackage = async function () {
  controller.sendMessageToEditor({
    type: "remove-action",
    actionId: 0,
  });
  controller = undefined;
  messagePorts.forEach((port) => port.close());
  messagePorts.clear();
  windowMessagePort?.close();
  windowMessagePort = undefined;
  ableton.close();
};

exports.addMessagePort = async function (port, senderId) {
  if (senderId == "preferences") {
    preferenceMessagePort?.close();
    preferenceMessagePort = port;
    port.on("close", () => {
      preferenceMessagePort = undefined;
    });
    port.on("message", (e) => {
      if (e.data.type === "install-midi-script") {
        try {
          const scriptPath = path.join(
            __dirname,
            "scripts/copy-midi-script.js"
          );
          execSync(`node "${scriptPath}"`, { stdio: "inherit" });
          port.postMessage({
            type: "midi-script-status",
            success: true,
            message:
              "MIDI script installed successfully! Please restart Ableton.",
          });
        } catch (error) {
          console.error("Error installing MIDI script:", error);
          port.postMessage({
            type: "midi-script-status",
            success: false,
            message: "Error installing MIDI script. Check console for details.",
          });
        }
      }

      if (e.data.type === "open-remote-scripts") {
        try {
          const scriptPath = path.join(
            __dirname,
            "scripts/open-remote-scripts.js"
          );
          execSync(`node "${scriptPath}"`, { stdio: "inherit" });
        } catch (error) {
          console.error("Error opening Remote Scripts folder:", error);
        }
      }

      if (e.data.type === "open-midi-script-source") {
        try {
          const scriptPath = path.join(
            __dirname,
            "scripts/open-midi-script-source.js"
          );
          execSync(`node "${scriptPath}"`, { stdio: "inherit" });
        } catch (error) {
          console.error("Error opening MIDI script source:", error);
        }
      }

      if (e.data.type === "offset") {
        const { track_offset, scene_offset } = e.data;
        ableton.ringSetOffset(track_offset, scene_offset);
      }

      if (e.data.type === "set-setting") {
        myFirstVariable = e.data.myFirstVariable;
        controller.sendMessageToEditor({
          type: "persist-data",
          data: {
            myFirstVariable,
          },
        });
      }
    });
    port.start();
    notifyStatusChange();
  }
};

function onMessage(msg) {
  console.log("onMessage", msg);
}

async function sendImmediate(dx, dy, script) {
  controller.sendMessageToEditor({
    type: "immediate",
    target_dx: dx,
    target_dy: dy,
    script: `<?lua ${script} ?>`,
  });
}

// Command dispatch table — O(1) lookup instead of sequential if-chain
const commandMap = {
  play_or_stop: (args) => ableton.playOrStop(),
  record: (args) => ableton.record(),
  navigate: (args) => ableton.navigate(args[1]),
  ring_setup: (args) => ableton.ringSetup(args[1], args[2], args[3], args[4]),
  ring_set_offset: (args) => ableton.ringSetOffset(args[1], args[2]),
  ring_navigate: (args) => ableton.ringNavigate(args[1]),
  ring_toggle_mute: (args) => ableton.ringToggleMute(args[1]),
  ring_toggle_solo: (args) => ableton.ringToggleSolo(args[1]),
  ring_toggle_arm: (args) => ableton.ringToggleArm(args[1]),
  ring_set_volume: (args) => ableton.ringSetVolume(args[1], args[2]),
  ring_set_panning: (args) => ableton.ringSetPanning(args[1], args[2]),
  ring_set_send: (args) => ableton.ringSetSend(args[1], args[2], args[3]),
  ring_select_track: (args) => ableton.ringSelectTrack(args[1]),
};

exports.sendMessage = function (args) {
  const handler = commandMap[args[0]];
  if (handler) handler(args);
};

function notifyStatusChange() {
  preferenceMessagePort?.postMessage({
    type: "client-status",
    myFirstVariable,
  });
}

function jsonToLuaTable(obj, indent = 0) {
  const spaces = "  ".repeat(indent);

  if (Array.isArray(obj)) {
    const items = obj
      .map((item) => spaces + "  " + jsonToLuaTable(item, indent + 1))
      .join(",\n");
    return `{\n${items}\n${spaces}}`;
  } else if (typeof obj === "object" && obj !== null) {
    const pairs = Object.entries(obj)
      .map(([key, value]) => {
        const luaKey = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)
          ? key
          : `["${key}"]`;
        return `${spaces}  ${luaKey} = ${jsonToLuaTable(value, indent + 1)}`;
      })
      .join(",\n");
    return `{\n${pairs}\n${spaces}}`;
  } else if (typeof obj === "string") {
    return `"${obj.replace(/"/g, '\\"')}"`;
  } else {
    return String(obj);
  }
}
