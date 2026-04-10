
# Zentra

### Your life, clearly seen. Your data, fully yours

Zentra brings together the quiet signals of your day—movement, rest, focus, and digital habits—into one calm, private space.
No noise. No tracking. No hidden systems watching you. Just clarity.

---

## A calmer way to understand your life

Most tools collect your data. Zentra gives it back to you.

Every step you take, every moment of rest, every pattern in your day—Zentra organizes it into a simple, beautiful timeline you can actually understand.

No dashboards built for advertisers. No metrics designed to keep you hooked. Just your life, presented with care.

---

## Built on a simple principle: your data belongs to you

Zentra is designed from the ground up with privacy as a default, not a feature.

- **Stored on your device** — your data never leaves unless you choose
- **No external tracking** — no hidden analytics, no third-party sharing
- **Full export control** — download your data anytime, in your format

You don’t need to trust us with your data. Because we don’t take it.

---

## See patterns you didn’t know existed

Zentra doesn’t just collect data—it reveals rhythm.

- When your energy peaks
- How your routines actually evolve
- Where your time really goes
- How rest, movement, and focus connect

Over time, these signals become something more: a clearer understanding of yourself.

---

## Designed to feel calm, not clinical

Zentra is not a medical dashboard. It’s not a fitness tracker. It’s not another productivity tool.

It’s a quiet, intentional space—somewhere between a journal and an instrument—where your daily life becomes something you can reflect on, not just measure.

---

## Product Vision & Principles

**Zentra** is a privacy-first Android app that passively collects multi-modal signals from your phone, normalizes them into a single schema, presents them through a calm, instrument-grade dashboard, and lets you export the raw data on demand. **The MVP runs entirely on-device with no external communication.**

**Product Principles:**

1. **Local-first.** No network calls in the MVP. The phone is the database.
2. **User owns the data.** Export must be trivial, complete, and machine-readable.
3. **ML-ready from day one.** The schema is designed so future feature engineering and biomarker pipelines can be built without migration.
4. **Honest about inference.** Every record carries a confidence score and a clear source label. Inferred data is never presented as measured data.
5. **Permission minimalism.** The app works with whatever the user grants and degrades gracefully—zero permissions still produces a functional shell.
6. **Calm by design.** The UI is a vault, not a feed. No streaks, no nags, no gamification.

---

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
