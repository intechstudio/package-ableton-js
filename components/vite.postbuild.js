"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyEditorAfterBuildPlugin = notifyEditorAfterBuildPlugin;
const ws_1 = require("ws");
const path_1 = __importDefault(require("path"));
function notifyEditorAfterBuildPlugin() {
    return {
        name: "postbuild-notify-editor",
        closeBundle: () => new Promise((resolve) => {
            let timeout = setTimeout(() => {
                console.log("No connection to Editor, closing websocket connection");
                ws.close();
                resolve();
            }, 3000);
            let packageId = require("../package.json").name;
            let ws = new ws_1.WebSocket("ws://localhost:9000");
            ws.on("open", () => {
                ws.send(JSON.stringify({
                    type: "developer-package",
                    event: "components-build-complete",
                    id: packageId,
                    rootPath: path_1.default.resolve(__dirname, ".."),
                }));
                ws.close();
                clearTimeout(timeout);
                resolve();
            });
            ws.on("error", (err) => {
                console.error(err);
                clearTimeout(timeout);
                resolve();
            });
        }),
    };
}
