# Hope For Humanity HR

Standalone Expo Router mobile app for HR attendance, leave, staff access control, and audit workflows.

## Requirements

- Node.js 20 or newer
- pnpm 10 or newer
- Expo Go for local device testing, or EAS for native builds

## Setup

```bash
pnpm install
cp .env.example .env
```

## Development

```bash
pnpm dev
```

Useful alternatives:

```bash
pnpm start
pnpm start:tunnel
pnpm typecheck
```

## Static Expo Go Build

The static build script needs a public deployment domain:

```bash
EXPO_PUBLIC_DOMAIN=hr.example.org pnpm build
pnpm serve
```

The build output is written to `static-build/`.

## Native Builds

Configure EAS once, then build:

```bash
npx eas build:configure
npx eas build --platform ios
npx eas build --platform android
```

## Demo Credentials

The app ships with local demo users in `context/AppContext.tsx`. This is suitable for prototype testing only. Production use should connect to a backend identity system and store no plaintext passwords on device.
