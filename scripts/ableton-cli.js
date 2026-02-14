#!/usr/bin/env node

const { execSync } = require("child_process");

const commands = {
  setup: {
    description: "Install AbletonJS MIDI script to Ableton Remote Scripts",
    script: "ableton:copy-midi-script",
  },
  "open-destination": {
    description: "Open Ableton Remote Scripts folder (destination)",
    script: "ableton:open-remote-scripts",
  },
  "open-source": {
    description: "Open MIDI script source folder",
    script: "ableton:open-midi-script-source",
  },
};

function printHelp() {
  console.log("\n🎹 AbletonJS MIDI Script Manager\n");
  console.log("Usage: npm run ableton <command>\n");
  console.log("Commands:\n");

  Object.entries(commands).forEach(([name, info]) => {
    console.log(`  ${name.padEnd(20)} ${info.description}`);
  });

  console.log("\nExamples:");
  console.log("  npm run ableton:setup              # Install MIDI script");
  console.log(
    "  npm run ableton:open-remote-scripts # Open destination folder",
  );
  console.log(
    "  npm run ableton:open-midi-script-source # Open source folder\n",
  );
}

function main() {
  const args = process.argv.slice(2);

  if (
    args.length === 0 ||
    args[0] === "help" ||
    args[0] === "--help" ||
    args[0] === "-h"
  ) {
    printHelp();
    return;
  }

  const command = args[0];
  const commandInfo = commands[command];

  if (!commandInfo) {
    console.error(`❌ Unknown command: ${command}`);
    printHelp();
    process.exit(1);
  }

  try {
    execSync(`npm run ${commandInfo.script}`, { stdio: "inherit" });
  } catch (error) {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
