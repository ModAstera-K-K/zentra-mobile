# Zentra

Zentra is a modern mobile app built with Expo and React Native, featuring a modular design system and a focus on health, activity, and trends visualization. The project is organized as a monorepo with a clear separation between UI components, app logic, and utilities.

## Features

- Modular design system for consistent UI
- Health/activity tracking and visualization
- Trend charts, heatmaps, and completeness metrics
- Extensible component architecture
- Expo-powered development for fast iteration

## Folder Structure

```
design-system/           # Shared UI design system
app/                     # Main Expo app entry and screens
  (app)/                 # App-specific layouts and screens
  (auth)/                # Authentication flows
  (tabs)/                # Tabbed navigation screens
components/              # Reusable UI and Zentra-specific components
constants/               # Theme and global constants
hooks/                   # Custom React hooks
stores/                  # State management (Zustand, etc.)
types/                   # TypeScript types
utils/                   # Utility functions
```

## Getting Started

### Prerequisites

- Node.js >= 18.x
- Yarn or npm
- Expo CLI (`npm install -g expo-cli`)

### Installation

1. Clone the repository:

   ```sh
   git clone <repo-url>
   cd zentra
   ```

2. Install dependencies:

   ```sh
   yarn install
   # or
   npm install
   ```

3. Start the Expo development server:

   ```sh
   yarn start
   # or
   npm run start
   ```

### Running on Device/Simulator

- Use the Expo Go app or your preferred iOS/Android simulator.
- Scan the QR code from the terminal or Expo DevTools.

## Contributing

Pull requests are welcome! Please open an issue first to discuss major changes. Follow the existing code style and add tests where appropriate.

## License

[MIT](LICENSE)
