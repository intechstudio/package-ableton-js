#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const platform = process.platform;

/**
 * Get the Ableton Remote Scripts directory based on the operating system
 */
function getRemoteScriptsDir() {
  if (platform === "darwin") {
    // macOS
    return path.join(
      process.env.HOME,
      "Music/Ableton/User Library/Remote Scripts"
    );
  } else if (platform === "win32") {
    // Windows
    const userProfile = process.env.USERPROFILE;
    return path.join(
      userProfile,
      "Documents/Ableton/User Library/Remote Scripts"
    );
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Get the source midi-script directory
 */
function getMidiScriptSource() {
  // First try from node_modules
  const nodeModulesPath = path.join(
    __dirname,
    "../node_modules/ableton-js/midi-script"
  );

  if (fs.existsSync(nodeModulesPath)) {
    return nodeModulesPath;
  }

  // Fallback to local midi-script directory
  const localPath = path.join(__dirname, "../midi-script");
  if (fs.existsSync(localPath)) {
    return localPath;
  }

  throw new Error("Could not find midi-script source directory");
}

/**
 * Copy directory recursively
 */
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Main function to copy the MIDI script
 */
function main() {
  try {
    console.log("🎹 Setting up AbletonJS MIDI Script...\n");

    const remoteScriptsDir = getRemoteScriptsDir();
    const midiScriptSource = getMidiScriptSource();
    const targetDir = path.join(remoteScriptsDir, "AbletonJS");

    console.log(`Platform: ${platform}`);
    console.log(`Source: ${midiScriptSource}`);
    console.log(`Target: ${targetDir}\n`);

    // Create Remote Scripts directory if it doesn't exist
    if (!fs.existsSync(remoteScriptsDir)) {
      console.log("📁 Creating Remote Scripts directory...");
      fs.mkdirSync(remoteScriptsDir, { recursive: true });
    }

    // Remove existing AbletonJS directory if it exists
    if (fs.existsSync(targetDir)) {
      console.log("🗑️  Removing existing AbletonJS script...");
      fs.rmSync(targetDir, { recursive: true, force: true });
    }

    // Copy the midi-script to Remote Scripts
    console.log("📋 Copying MIDI script files...");
    copyDir(midiScriptSource, targetDir);

    // Clean up .pyc files
    console.log("🧹 Cleaning up compiled Python files...");
    const pycFiles = [];

    function findPycFiles(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          findPycFiles(fullPath);
        } else if (entry.name.endsWith(".pyc")) {
          pycFiles.push(fullPath);
        }
      }
    }

    findPycFiles(targetDir);
    pycFiles.forEach((file) => fs.unlinkSync(file));

    // Remove _Framework if it exists
    const frameworkDir = path.join(targetDir, "_Framework");
    if (fs.existsSync(frameworkDir)) {
      fs.rmSync(frameworkDir, { recursive: true, force: true });
    }

    console.log("\n✅ AbletonJS MIDI script installed successfully!");
    console.log("\n📝 Next steps:");
    console.log("   1. Restart Ableton Live");
    console.log("   2. Go to Preferences > MIDI");
    console.log('   3. Select "AbletonJS" as a Control Surface\n');
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

main();
