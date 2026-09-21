# zana-bluetooth-printer

Capacitor plugin (Android only) that sends raw ESC/POS bytes to a paired **Bluetooth Classic (SPP)** printer.

Why a custom plugin: the published Bluetooth serial plugins either send data as UTF-8 text (which corrupts binary
ESC/POS commands such as the cash-drawer pulse), run a busy read loop per connection, log the receipt data, or
only support Bluetooth Low Energy. This one is write-only, binary-safe and small.

| Method | Arguments | Result |
|---|---|---|
| `requestBluetoothPermission()` | | `{ granted }` |
| `isBluetoothEnabled()` | | `{ available, enabled }` |
| `getPairedDevices()` | | `{ devices: [{ name, address, isPrinter }] }` |
| `openBluetoothSettings()` | | |
| `connect({ address })` | MAC address | `{ connected }` (8 s timeout per attempt; secure then insecure RFCOMM) |
| `isConnected({ address })` | | `{ connected }` (local state; a printer that has gone away is only detected on write) |
| `write({ address, data, chunkSize?, chunkDelayMs? })` | `data` = base64 bytes | `{ written }` |
| `disconnect({ address? })` | | |

Errors reject with a `code`: `PERMISSION_DENIED`, `NO_BLUETOOTH`, `BLUETOOTH_OFF`, `INVALID_ADDRESS`,
`INVALID_ARGUMENT`, `CONNECT_FAILED`, `NOT_CONNECTED`, `WRITE_FAILED`, `INTERRUPTED`, `SETTINGS_UNAVAILABLE`.

One printer is connected at a time. There is no discovery: printers are chosen from the devices already paired in
Android settings, so neither location nor `BLUETOOTH_SCAN` permission is needed. The web-side wrapper is
`frontend/src/printing/adapters/bluetoothAdapter.js`.
