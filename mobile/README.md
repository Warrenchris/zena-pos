# Zana POS: Android app

The same React web app (`../frontend`) wrapped in a native Android shell with [Capacitor](https://capacitorjs.com),
plus a small native plugin that prints receipts to **Bluetooth Classic (SPP) thermal printers**
(`plugins/zana-bluetooth-printer`).

```
mobile/
  capacitor.config.json          app id, name, and where the built web app lives (../frontend/dist)
  android/                       the generated Android Studio project (committed, as Capacitor recommends)
  plugins/zana-bluetooth-printer native plugin: paired-printer list, connect, write ESC/POS bytes
```

The web build has no Capacitor dependency. Inside the app the web code finds the plugin through the
`window.Capacitor` object the shell provides (`frontend/src/printing/adapters/nativeBluetooth.js`), so
`frontend` still builds and runs as a normal website.

## Requirements

- Node **22+** (the Capacitor 8 CLI requires it)
- JDK **21**
- Android Studio with Android SDK Platform **36** (it installs Gradle and the build tools)

## Backend settings the app needs

The app runs from the origin `https://localhost`, so every API call is cross-origin. On the backend:

1. Add the app's origin to `ALLOWED_ORIGINS`, e.g. `ALLOWED_ORIGINS=https://your-web-app.com,https://localhost`
2. In `backend/src/app.js`, add `'Idempotency-Key'` to the CORS `allowedHeaders`:
   `allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key']`.
   The frontend sends that header on sales and payments. Same-origin web deployments never notice it is missing,
   but from the app the browser's preflight check rejects the request, so **checkout fails without this change**.
3. The API must be served over **https**. Android blocks plain http from apps.

## Build and run

```bash
cd mobile
npm install

# Build the web app pointing at your API, then copy it into the Android project
#   macOS / Linux:  VITE_API_URL=https://api.your-domain.com npm run prepare:android
#   PowerShell:     $env:VITE_API_URL = "https://api.your-domain.com"; npm run prepare:android
npm run prepare:android

npm run open          # opens Android Studio; press Run on a phone or emulator
```

A debug APK you can install directly:
`cd android && ./gradlew assembleDebug` (Windows: `gradlew.bat assembleDebug`), then
`android/app/build/outputs/apk/debug/app-debug.apk`.

Run `npm run prepare:android` again whenever the web app changes.

## Setting up a printer (what to tell cashiers)

1. Switch the printer on and pair it in **Android Settings → Bluetooth** (PIN is usually `0000` or `1234`).
2. Open Zana POS → **Settings → Receipt & Printer** (or **Printer settings** on the sale-complete screen).
3. Under **Which Bluetooth printer?** choose the printer, pick the paper width (58 or 80 mm), and tap **Print test receipt**.

The choice is saved on that device only. On Android 12+ the app asks for the "Nearby devices" permission the
first time; it does not need location.

## Limits to know about

- **Bluetooth Classic (SPP) printers only.** Printers that only speak Bluetooth Low Energy are not supported.
  Most cheap 58 mm receipt printers are Classic; a printer's manual or Bluetooth name usually tells you.
- The printer must understand **ESC/POS**, which almost all receipt printers do.
- **Browser printing is not available inside the app** (`window.print()` does not open a print dialog in an Android WebView),
  so Bluetooth is the app's only print route. A fresh install starts on Bluetooth.
- Receipts print as text. The shop **logo is not printed** over Bluetooth yet.
- A Bluetooth printer usually accepts **one connection at a time**. If another phone is connected to it, connecting
  from this app fails until that phone disconnects.

## Before publishing to Google Play

- **Change the app id** in `capacitor.config.json` (and rename `android/app/src/main/java/com/zana/pos` and the
  `applicationId` / `namespace` in `android/app/build.gradle`). It is `com.zana.pos` now and can never change after release.
- Replace the default icons and splash screen (`@capacitor/assets` can generate them from one image).
- Create a signing keystore, bump `versionCode` / `versionName` for each release, and build a release bundle.
- Google Play requires a privacy policy and the Data safety form.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Could not connect to the printer" | Printer off, out of range, not paired, or already connected to another phone |
| "Permission was denied" | Allow **Nearby devices** for the app in Android Settings → Apps |
| Every screen shows network errors | Backend CORS (see above) or the app was built without `VITE_API_URL` |
| Garbled characters on the receipt | The printer isn't ESC/POS compatible or uses an unusual code page |
| Paper doesn't cut / feeds too much | Set **Paper cutter** and **Blank lines after the receipt** in Printer settings |
| Long receipts drop lines | Printer buffer is small; report it (the send speed is adjustable in the adapter) |
