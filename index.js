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
      defaultLua: 'gps("package-svelte-template", val)',
      actionComponent: "template-action",
    },
  });

  myFirstVariable = persistedData?.myFirstVariable ?? false;


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
        const {track_offset, scene_offset} = e.data;
        ableton.updateSessionBoxListeners(track_offset, scene_offset);
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

function onMessage(msg){
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
  console.log(args); //Can be seen in Editor logs

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

function notifyStatusChange() {
  preferenceMessagePort?.postMessage({
    type: "client-status",
    myFirstVariable,
  });
}
