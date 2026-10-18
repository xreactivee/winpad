# winpad

A macOS Launchpad style Start menu for Windows

## Features
- Replaces or supplements the Windows Start menu with a full-screen macOS Launchpad interface
- Resolves and manages installed Windows applications and shortcuts
- Customizes behavior and settings via a dedicated settings window with local store persistence
- Intercepts and masks Windows key events via low-level keyboard hooks
- Watches system wallpaper and supports window management integration

## Tech Stack
- TypeScript
- React 19
- Tauri 2
- Rust
- Vite
- Tailwind CSS / custom glass CSS

## Installation
```bash
git clone https://github.com/xreactivee/winpad.git
cd winpad
npm install
```

## Usage
```bash
# Run in development mode
npm run tauri dev

# Build production application
npm run tauri build
```

## License
MIT