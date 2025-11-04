#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const platform = process.platform;

/**
 * Get the Ableton Remote Scripts directory based on the operating system
 */
function getRemoteScriptsDir() {
  if (platform === 'darwin') {
    // macOS
    return path.join(
      process.env.HOME,
      'Music/Ableton/User Library/Remote Scripts'
    );
  } else if (platform === 'win32') {
    // Windows
    const userProfile = process.env.USERPROFILE;
    return path.join(
      userProfile,
      'Documents/Ableton/User Library/Remote Scripts'
    );
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Open the directory in the file explorer
 */
function openDirectory(dir) {
  // Create directory if it doesn't exist
  if (!fs.existsSync(dir)) {
    console.log(`📁 Directory doesn't exist. Creating: ${dir}`);
    fs.mkdirSync(dir, { recursive: true });
  }

  console.log(`📂 Opening Remote Scripts folder...\n${dir}\n`);

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
    const remoteScriptsDir = getRemoteScriptsDir();
    openDirectory(remoteScriptsDir);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
