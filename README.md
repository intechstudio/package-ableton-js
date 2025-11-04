# package-ableton-js

Package to use abletonjs with Grid controllers

## Installation

```bash
npm install
```

## Ableton MIDI Script Setup

This package includes the AbletonJS MIDI script that needs to be installed in Ableton's Remote Scripts folder. We provide several convenient ways to manage this:

### Automatic Installation

The easiest way to install the MIDI script:

```bash
npm run ableton:setup
```

This will automatically:
- Copy the MIDI script files to your Ableton Remote Scripts folder
- Clean up unnecessary files
- Work on both macOS and Windows

**After running this command:**
1. Restart Ableton Live
2. Go to Preferences > MIDI
3. Select "AbletonJS" as a Control Surface

### Manual Installation

If you prefer to install manually, you can open the relevant folders:

**Open the Remote Scripts destination folder:**
```bash
npm run ableton:open-remote-scripts
```

**Open the MIDI script source folder:**
```bash
npm run ableton:open-midi-script-source
```

Then manually copy the contents from the source to the destination folder, creating an "AbletonJS" subfolder.

### Remote Scripts Location

The MIDI script will be installed at:

- **macOS**: `~/Music/Ableton/User Library/Remote Scripts/AbletonJS`
- **Windows**: `%USERPROFILE%\Documents\Ableton\User Library\Remote Scripts\AbletonJS`

## Development

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Development mode with hot reload
npm run dev
```

## Package Scripts

- `npm run ableton:setup` - Install MIDI script to Ableton (automatic)
- `npm run ableton:copy-midi-script` - Copy MIDI script (same as setup)
- `npm run ableton:open-remote-scripts` - Open Ableton Remote Scripts folder
- `npm run ableton:open-midi-script-source` - Open MIDI script source folder
- `npm run prepare-midi-script` - Prepare MIDI script for packaging (used before publish)

## How It Works

1. The MIDI script files are included from the `ableton-js` dependency
2. When you run the setup script, it copies these files to Ableton's Remote Scripts folder
3. The package automatically includes the MIDI script in distributions via the `files` field in package.json
