# Celebplayer

A private, Plex-style media player for local video collections with automatic thumbnail generation.

Celebplayer is an Electron-based application designed to bring order to your video library. It features a modern, dark user interface, automatic thumbnail creation using FFmpeg, and persistent settings for volume and recent folders.

## Features

- **Plex-Style UI:** A sleek, modern interface for browsing your video collection.
- **Recursive Scanning:** Automatically finds videos in all subfolders (perfect for series or categorized collections).
- **Poster Support:** Uses existing `poster.jpg`, `folder.jpg`, or `cover.jpg` images from your video folders as high-quality covers.
- **Automatic Thumbnails:** If no poster is found, it automatically generates a preview using FFmpeg.
- **Persistent Settings:** Remembers your volume levels, mute status, and last used video directory.
- **Efficient Streaming:** A local Node.js backend (bundled with esbuild) handles video delivery with full support for seeking.
- **Search:** Quickly filter your library to find specific videos.

## Screenshots

*(Add screenshots here)*

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [FFmpeg](https://ffmpeg.org/) installed on your system

#### Installing FFmpeg

**Linux (Ubuntu/Mint/Debian):**
```bash
sudo apt update && sudo apt install ffmpeg -y
```

**macOS (via Homebrew):**
```bash
brew install ffmpeg
```

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/pulto2405-prog/celebplayer.git
   cd celebplayer
   ```

2. Run the automated setup:
   ```bash
   npm run setup
   ```
   *This will install all dependencies and build the backend and frontend components.*

## Usage

### Run the Player

```bash
npm start
```

### Build Executable (AppImage)

**For PC (x64):**
```bash
npm run build:linux
```

**For Raspberry Pi 5 / ARM64:**
```bash
npm run build:arm64
```

The resulting executable will be available in the `dist-app/` directory.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
