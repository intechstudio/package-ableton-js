#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Copy the midi-script from node_modules to the package directory
 * This ensures it's included in the package bundle
 */
function prepareMidiScript() {
  const sourcePath = path.join(
    __dirname,
    '../node_modules/ableton-js/midi-script'
  );
  const targetPath = path.join(__dirname, '../midi-script');

  if (!fs.existsSync(sourcePath)) {
    console.error('❌ Could not find midi-script in node_modules/ableton-js');
    console.error('   Please run: npm install');
    process.exit(1);
  }

  console.log('📋 Copying midi-script to package directory...');

  // Remove existing midi-script directory if it exists
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }

  // Copy the directory
  copyDir(sourcePath, targetPath);

  console.log('✅ MIDI script prepared for packaging!');
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

prepareMidiScript();
