#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const platform = process.platform;

/**
 * Get the midi-script source directory
 */
function getMidiScriptSource() {
  // First try from node_modules
  const nodeModulesPath = path.join(
    __dirname,
    '../node_modules/ableton-js/midi-script'
  );
  
  if (fs.existsSync(nodeModulesPath)) {
    return nodeModulesPath;
  }
  
  // Fallback to local midi-script directory
  const localPath = path.join(__dirname, '../midi-script');
  if (fs.existsSync(localPath)) {
    return localPath;
  }
  
  throw new Error('Could not find midi-script source directory');
}

/**
 * Open the directory in the file explorer
 */
function openDirectory(dir) {
  if (!fs.existsSync(dir)) {
    throw new Error(`Directory doesn't exist: ${dir}`);
  }

  console.log(`📂 Opening MIDI script source folder...\n${dir}\n`);

  try {
    if (platform === 'darwin') {
      // macOS - use 'open' command
      execSync(`open "${dir}"`);
    } else if (platform === 'win32') {
      // Windows - use 'explorer' command
      execSync(`explorer "${dir}"`);
    } else {
      // Linux - try xdg-open
      execSync(`xdg-open "${dir}"`);
    }
    console.log('✅ Folder opened successfully!');
  } catch (error) {
    console.error('❌ Error opening folder:', error.message);
    console.log(`\nPlease manually navigate to: ${dir}`);
    process.exit(1);
  }
}

/**
 * Main function
 */
function main() {
  try {
    const midiScriptSource = getMidiScriptSource();
    openDirectory(midiScriptSource);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
