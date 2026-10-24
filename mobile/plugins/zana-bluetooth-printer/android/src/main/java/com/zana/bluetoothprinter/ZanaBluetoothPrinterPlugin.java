package com.zana.bluetoothprinter;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothClass;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.IOException;
import java.io.OutputStream;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Sends raw bytes (ESC/POS receipts) to a paired Bluetooth Classic (SPP / RFCOMM)
 * thermal printer.
 *
 * Deliberately small: write-only, binary-safe (data travels as base64), one open
 * connection at a time, no background read thread, no discovery (printers are chosen
 * from the devices already paired in Android settings, so no location or scan
 * permission is needed), and receipt data is never written to the log.
 *
 * All Bluetooth I/O runs on one private worker thread, so slow connects never block
 * other Capacitor plugin calls and operations run strictly in order.
 */
@CapacitorPlugin(
    name = "ZanaBluetoothPrinter",
    permissions = { @Permission(strings = { Manifest.permission.BLUETOOTH_CONNECT }, alias = ZanaBluetoothPrinterPlugin.ALIAS_CONNECT) }
)
public class ZanaBluetoothPrinterPlugin extends Plugin {

    static final String ALIAS_CONNECT = "bluetoothConnect";

    /** Standard Serial Port Profile UUID, used by virtually every Bluetooth Classic receipt printer. */
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    private static final long CONNECT_TIMEOUT_MS = 8000;
    private static final int DEFAULT_CHUNK_SIZE = 512;
    private static final int MIN_CHUNK_SIZE = 16;
    private static final int MAX_CHUNK_SIZE = 4096;
    private static final int DEFAULT_CHUNK_DELAY_MS = 10;
    private static final int MAX_CHUNK_DELAY_MS = 200;

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Object lock = new Object();

    // Guarded by lock.
    private BluetoothSocket socket;
    private String socketAddress;

    // ------------------------------------------------------------------ permissions & state

    /** Android 12+ needs BLUETOOTH_CONNECT at runtime; older versions grant Bluetooth access at install. */
    private boolean hasPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return true;
        }
        return getContext().checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
    }

    private BluetoothAdapter getAdapter() {
        BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return manager != null ? manager.getAdapter() : null;
    }

    private static String normalizeAddress(String address) {
        return address == null ? null : address.trim().toUpperCase(Locale.US);
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    @PluginMethod
    public void requestBluetoothPermission(PluginCall call) {
        if (hasPermission()) {
            call.resolve(new JSObject().put("granted", true));
            return;
        }
        requestPermissionForAlias(ALIAS_CONNECT, call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        call.resolve(new JSObject().put("granted", hasPermission()));
    }

    @PluginMethod
    public void isBluetoothEnabled(PluginCall call) {
        BluetoothAdapter adapter = getAdapter();
        JSObject result = new JSObject();
        result.put("available", adapter != null);
        result.put("enabled", adapter != null && adapter.isEnabled());
        call.resolve(result);
    }

    // ------------------------------------------------------------------ devices

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void getPairedDevices(PluginCall call) {
        if (!hasPermission()) {
            call.reject("Bluetooth permission was not granted.", "PERMISSION_DENIED");
            return;
        }
        BluetoothAdapter adapter = getAdapter();
        if (adapter == null) {
            call.reject("This device has no Bluetooth.", "NO_BLUETOOTH");
            return;
        }
        if (!adapter.isEnabled()) {
            call.reject("Bluetooth is turned off.", "BLUETOOTH_OFF");
            return;
        }
        try {
            JSArray devices = new JSArray();
            Set<BluetoothDevice> bonded = adapter.getBondedDevices();
            if (bonded != null) {
                for (BluetoothDevice device : bonded) {
                    String name = device.getName();
                    BluetoothClass deviceClass = device.getBluetoothClass();
                    JSObject item = new JSObject();
                    item.put("name", name == null ? "" : name);
                    item.put("address", device.getAddress());
                    // Receipt printers usually (not always) report the "imaging" device class.
                    item.put("isPrinter", deviceClass != null && deviceClass.getMajorDeviceClass() == BluetoothClass.Device.Major.IMAGING);
                    devices.put(item);
                }
            }
            JSObject result = new JSObject();
            result.put("devices", devices);
            call.resolve(result);
        } catch (SecurityException e) {
            call.reject("Bluetooth permission was not granted.", "PERMISSION_DENIED", e);
        }
    }

    @PluginMethod
    public void openBluetoothSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open Bluetooth settings.", "SETTINGS_UNAVAILABLE", e);
        }
    }

    // ------------------------------------------------------------------ connection

    @PluginMethod
    public void connect(final PluginCall call) {
        final String address = normalizeAddress(call.getString("address"));
        if (address == null || !BluetoothAdapter.checkBluetoothAddress(address)) {
            call.reject("Invalid Bluetooth address.", "INVALID_ADDRESS");
            return;
        }
        if (!hasPermission()) {
            call.reject("Bluetooth permission was not granted.", "PERMISSION_DENIED");
            return;
        }
        final BluetoothAdapter adapter = getAdapter();
        if (adapter == null || !adapter.isEnabled()) {
            call.reject("Bluetooth is turned off.", "BLUETOOTH_OFF");
            return;
        }
        io.execute(() -> {
            try {
                openSocket(adapter, address);
                call.resolve(new JSObject().put("connected", true));
            } catch (Exception e) {
                call.reject("Could not connect to the printer. Check that it is switched on, in range and paired.", "CONNECT_FAILED", e);
            }
        });
    }

    /**
     * Opens an RFCOMM socket to the printer. Tries a secure connection first and falls
     * back to an insecure one, which some cheap printers with legacy pairing need. Each
     * attempt is abandoned after CONNECT_TIMEOUT_MS, since connect() can otherwise hang.
     */
    @SuppressLint("MissingPermission")
    private void openSocket(BluetoothAdapter adapter, String address) throws IOException {
        synchronized (lock) {
            closeLocked(); // one printer at a time
        }
        BluetoothDevice device = adapter.getRemoteDevice(address);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            try {
                adapter.cancelDiscovery(); // discovery makes connecting slow; needs no extra permission before Android 12
            } catch (SecurityException ignored) {
                // Continue without it.
            }
        }

        IOException last = null;
        for (int attempt = 0; attempt < 2; attempt++) {
            BluetoothSocket candidate = null;
            Runnable timeout = null;
            try {
                candidate = attempt == 0
                    ? device.createRfcommSocketToServiceRecord(SPP_UUID)
                    : device.createInsecureRfcommSocketToServiceRecord(SPP_UUID);
                final BluetoothSocket toClose = candidate;
                timeout = () -> closeQuietly(toClose);
                mainHandler.postDelayed(timeout, CONNECT_TIMEOUT_MS);
                candidate.connect();
                mainHandler.removeCallbacks(timeout);
                synchronized (lock) {
                    socket = candidate;
                    socketAddress = address;
                }
                return;
            } catch (IOException e) {
                last = e;
                if (timeout != null) {
                    mainHandler.removeCallbacks(timeout);
                }
                closeQuietly(candidate);
            }
        }
        throw last != null ? last : new IOException("Could not connect");
    }

    @PluginMethod
    public void isConnected(PluginCall call) {
        String address = normalizeAddress(call.getString("address"));
        boolean connected;
        synchronized (lock) {
            connected = socket != null && address != null && address.equals(socketAddress) && socket.isConnected();
        }
        call.resolve(new JSObject().put("connected", connected));
    }

    @PluginMethod
    public void disconnect(final PluginCall call) {
        final String address = normalizeAddress(call.getString("address"));
        io.execute(() -> {
            synchronized (lock) {
                if (address == null || address.equals(socketAddress)) {
                    closeLocked();
                }
            }
            call.resolve();
        });
    }

    // ------------------------------------------------------------------ printing

    /**
     * Writes base64-encoded bytes to the connected printer in small chunks. Resolves once
     * everything has been handed to the Bluetooth stack.
     */
    @PluginMethod
    public void write(final PluginCall call) {
        final String address = normalizeAddress(call.getString("address"));
        final String data = call.getString("data");
        if (address == null || data == null) {
            call.reject("address and data are required.", "INVALID_ARGUMENT");
            return;
        }
        final byte[] bytes;
        try {
            bytes = Base64.decode(data, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("data is not valid base64.", "INVALID_ARGUMENT", e);
            return;
        }
        final int chunkSize = clamp(call.getInt("chunkSize", DEFAULT_CHUNK_SIZE), MIN_CHUNK_SIZE, MAX_CHUNK_SIZE);
        final int chunkDelayMs = clamp(call.getInt("chunkDelayMs", DEFAULT_CHUNK_DELAY_MS), 0, MAX_CHUNK_DELAY_MS);

        io.execute(() -> {
            BluetoothSocket current;
            synchronized (lock) {
                current = socket != null && address.equals(socketAddress) ? socket : null;
            }
            if (current == null || !current.isConnected()) {
                call.reject("Not connected to the printer.", "NOT_CONNECTED");
                return;
            }
            try {
                OutputStream out = current.getOutputStream();
                for (int offset = 0; offset < bytes.length; offset += chunkSize) {
                    int length = Math.min(chunkSize, bytes.length - offset);
                    out.write(bytes, offset, length);
                    out.flush();
                    if (chunkDelayMs > 0 && offset + length < bytes.length) {
                        Thread.sleep(chunkDelayMs);
                    }
                }
                call.resolve(new JSObject().put("written", bytes.length));
            } catch (IOException e) {
                synchronized (lock) {
                    if (socket == current) {
                        closeLocked();
                    }
                }
                call.reject("Lost the connection to the printer while printing.", "WRITE_FAILED", e);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                call.reject("Printing was interrupted.", "INTERRUPTED", e);
            }
        });
    }

    // ------------------------------------------------------------------ lifecycle

    private void closeLocked() {
        closeQuietly(socket);
        socket = null;
        socketAddress = null;
    }

    private static void closeQuietly(BluetoothSocket target) {
        if (target == null) {
            return;
        }
        try {
            target.close();
        } catch (IOException ignored) {
            // Nothing more to do.
        }
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (lock) {
            closeLocked();
        }
        io.shutdownNow();
    }
}
