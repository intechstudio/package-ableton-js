let controller;
let preferenceMessagePort = undefined;

let myFirstVariable = false;

let messagePorts = new Set();
let windowMessagePort;

const ableton = require("./src/index.js");

exports.loadPackage = async function (gridController, persistedData) {
  controller = gridController;

  gridController.sendMessageToEditor({
    type: "add-action",
    info: {
      actionId: 0,
      rendering: "standard",
      category: "template",
      color: "#5865F2",
      icon: "<div />",
      blockIcon: "<div />",
      selectable: true,
      movable: true,
      hideIcon: false,
      type: "single",
      toggleable: true,
      short: "xta",
      displayName: "Template Action",
      defaultLua: 'gps("package-ableton-js", val)',
      actionComponent: "ableton-js-action",
    },
  });

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
      if (e.data.type === "offset") {
        const { track_offset, scene_offset } = e.data;
        ableton.setSessionBoxOffset(track_offset, scene_offset);
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

exports.sendMessage = async function (args) {

  console.log("sendMessage", args);
  const type = args[0];
  if(type == "selected_track_arm_mute_solo"){
    ableton.autoSetSelectedTrackProperty(args[1])
  }
  if(type == "selected_track_volume"){
    ableton.autoSetSelectedTrackMixerDeviceVolume(args[1])
  }
  if(type == "selected_track_panning"){
    ableton.autoSetSelectedTrackMixerDevicePanning(args[1])
  }
  if(type == "selected_track_send"){
    ableton.autoSetSelectedTrackMixerDeviceSend(args[1], args[2])
  }

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

function notifyStatusChange() {
  preferenceMessagePort?.postMessage({
    type: "client-status",
    myFirstVariable,
  });
}

function jsonToLuaTable(obj, indent = 0) {
    const spaces = '  '.repeat(indent);
    
    if (Array.isArray(obj)) {
        const items = obj.map(item => 
            spaces + '  ' + jsonToLuaTable(item, indent + 1)
        ).join(',\n');
        return `{\n${items}\n${spaces}}`;
    } else if (typeof obj === 'object' && obj !== null) {
        const pairs = Object.entries(obj).map(([key, value]) => {
            const luaKey = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) ? key : `["${key}"]`;
            return `${spaces}  ${luaKey} = ${jsonToLuaTable(value, indent + 1)}`;
        }).join(',\n');
        return `{\n${pairs}\n${spaces}}`;
    } else if (typeof obj === 'string') {
        return `"${obj.replace(/"/g, '\\"')}"`;
    } else {
        return String(obj);
    }
}