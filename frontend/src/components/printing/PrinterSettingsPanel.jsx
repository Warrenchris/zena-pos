import React, { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  PrinterIcon,
} from '@heroicons/react/24/outline';
import useCurrency from '../../hooks/useCurrency';
import usePrinterProfile from '../../hooks/usePrinterProfile';
import useReceiptSettings from '../../hooks/useReceiptSettings';
import Button from '../ui/Button';
import {
  ADAPTERS,
  CONNECTIONS,
  CONNECTION_INFO,
  CUT_MODES,
  PAPER_PRESETS,
  buildReceipt,
  getCharsPerLine,
  layoutReceipt,
  printTestReceipt,
  sampleSale,
} from '../../printing';

const PAPER_HINTS = {
  58: 'Small receipt printers, common with phones and tablets',
  80: 'Standard counter receipt printers',
};

const CUT_LABELS = {
  partial: 'Partial cut (leaves a small tab)',
  full: 'Full cut',
  none: 'No cutter (just feed the paper)',
};

const FEED_OPTIONS = Array.from({ length: 11 }, (_, i) => i);

/** 'available' | 'unsupported' (adapter exists, this device can't use it) | 'coming-soon' */
const connectionStatus = (id) => {
  const adapter = ADAPTERS[id];
  if (!adapter) return 'coming-soon';
  return adapter.isSupported() ? 'available' : 'unsupported';
};

const STATUS_BADGES = {
  'coming-soon': 'Coming soon',
  unsupported: 'Not supported on this device',
};

const fieldsetClass = 'space-y-2';
const legendClass = 'block text-small font-semibold text-text-primary mb-1.5';
const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed';

function ChoiceCard({ name, value, checked, disabled, onChange, title, description, badge }) {
  return (
    <label
      className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all ${
        checked ? 'border-primary bg-primary/5' : 'border-border-default bg-surface'
      } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:border-border-hover'}`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="mt-1 h-4 w-4 text-primary focus:ring-primary/30"
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-small font-semibold text-text-primary">{title}</span>
          {badge && (
            <span className="text-caption font-medium text-text-muted bg-surface-2 border border-border-default rounded-full px-2 py-0.5">
              {badge}
            </span>
          )}
        </span>
        <span className="block text-caption text-text-muted mt-0.5">{description}</span>
      </span>
    </label>
  );
}

function ReceiptPreview({ lines, columns, logoUrl }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border-default bg-surface-2/40 p-4">
      {/* Receipt paper is white with black text in every theme, like the real thing. */}
      <div
        role="region"
        aria-label="Receipt preview"
        data-testid="receipt-preview"
        data-columns={columns}
        className="mx-auto bg-white text-black shadow-sm px-3 py-4"
        style={{
          fontFamily: 'ui-monospace, "Courier New", monospace',
          fontSize: 12,
          lineHeight: 1.35,
          width: `calc(${columns}ch + 24px)`,
          boxSizing: 'border-box',
        }}
      >
        {logoUrl && (
          <img
            src={logoUrl}
            alt="Business logo"
            style={{ display: 'block', margin: '0 auto 8px', maxWidth: '100%', maxHeight: 80, filter: 'grayscale(1) contrast(1.5)' }}
          />
        )}
        {lines.map((line, index) => (
          <div
            key={index}
            style={{
              whiteSpace: 'pre',
              minHeight: '1.35em',
              fontWeight: line.bold ? 700 : 400,
              ...(line.double ? { fontSize: '2em', lineHeight: 1.15 } : {}),
            }}
          >
            {line.text}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * PrinterSettingsPanel — how THIS device prints receipts.
 *
 * Settings are stored on the device (not the shop account) and save as you
 * change them. Used in Settings → Receipt & Printer and from the POS
 * sale-complete screen.
 */
export default function PrinterSettingsPanel({ showHeading = true }) {
  const { profile, update, reset } = usePrinterProfile();
  const { format: formatMoney } = useCurrency();
  const shop = useSelector((state) => state.shop?.shop);
  const receiptSettings = useReceiptSettings();
  const [testState, setTestState] = useState(null);

  const columns = getCharsPerLine(profile);
  const usesBrowser = profile.connection === 'browser';
  const selectedStatus = connectionStatus(profile.connection);

  const previewLines = useMemo(() => {
    const business = shop?.name ? shop : { ...shop, name: 'Your Shop Name' };
    return layoutReceipt(buildReceipt(sampleSale(), { business, receiptSettings }), {
      charsPerLine: columns,
      formatMoney,
    });
  }, [shop, receiptSettings, columns, formatMoney]);
  const previewLogoUrl = receiptSettings.showLogo ? receiptSettings.logoUrl : null;

  const change = (patch) => {
    setTestState(null);
    update(patch);
  };

  const handleReset = () => {
    setTestState(null);
    reset();
  };

  const handleTestPrint = async () => {
    setTestState({ kind: 'pending', message: 'Sending test receipt…' });
    const result = await printTestReceipt({ formatMoney, business: shop, receiptSettings, profile });
    if (!result.ok) {
      setTestState({ kind: 'error', message: `Could not print the test receipt: ${result.error}` });
    } else if (result.fellBack) {
      setTestState({
        kind: 'warning',
        message: `Your printer could not be reached (${result.error}). The test receipt went to the browser print dialog instead.`,
      });
    } else {
      const label = ADAPTERS[result.adapterId]?.label || result.adapterId;
      setTestState({ kind: 'success', message: `Test receipt sent using ${label}.` });
    }
  };

  const statusStyles = {
    pending: 'bg-surface-2 border-border-default text-text-secondary',
    success: 'bg-success-muted border-success-border text-success-text',
    warning: 'bg-warning-muted border-warning-border text-warning-text',
    error: 'bg-danger-muted border-danger-border text-danger-text',
  };

  return (
    <section className="space-y-6" aria-labelledby={showHeading ? 'printer-settings-heading' : undefined}>
      {showHeading && (
        <div className="border-t border-border-default pt-6">
          <h3 id="printer-settings-heading" className="text-h3 font-semibold text-text-primary">
            Printer on this device
          </h3>
        </div>
      )}

      <div className="flex items-start gap-2.5 p-3.5 rounded-xl border border-border-default bg-surface-2/40 text-caption text-text-secondary">
        <InformationCircleIcon className="h-4 w-4 shrink-0 mt-0.5 text-text-muted" aria-hidden="true" />
        <p>
          These settings apply to <strong>this device only</strong>. Each phone, tablet or computer in your shop keeps
          its own printer settings. Changes save automatically.
        </p>
      </div>

      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>How does this device print?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {CONNECTIONS.map((id) => {
            const status = connectionStatus(id);
            return (
              <ChoiceCard
                key={id}
                name="printer-connection"
                value={id}
                checked={profile.connection === id}
                disabled={status !== 'available'}
                onChange={() => change({ connection: id })}
                title={CONNECTION_INFO[id].label}
                description={CONNECTION_INFO[id].hint}
                badge={STATUS_BADGES[status]}
              />
            );
          })}
        </div>
        {selectedStatus !== 'available' && (
          <p role="alert" className="flex items-start gap-2 text-caption text-warning-text">
            <ExclamationTriangleIcon className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              {CONNECTION_INFO[profile.connection].label} isn&apos;t available on this device, so receipts will print
              through the browser instead.
            </span>
          </p>
        )}
      </fieldset>

      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>Paper width</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.keys(PAPER_PRESETS).map((width) => (
            <ChoiceCard
              key={width}
              name="printer-paper-width"
              value={width}
              checked={profile.paperWidth === Number(width)}
              onChange={() => change({ paperWidth: Number(width) })}
              title={`${width} mm`}
              description={`${PAPER_HINTS[width]} (${PAPER_PRESETS[width].charsPerLine} characters per line)`}
            />
          ))}
        </div>
        <p className="text-caption text-text-muted">
          Not sure? Choose 58 mm. Its receipts also print correctly on wider paper.
        </p>
      </fieldset>

      <fieldset className={fieldsetClass} disabled={usesBrowser}>
        <legend className={legendClass}>Direct printing options</legend>
        {usesBrowser && (
          <p className="text-caption text-text-muted">
            The paper cutter, cash drawer and feed options only apply when printing directly to a Bluetooth, USB, serial
            or network printer. The browser print dialog doesn&apos;t use them.
          </p>
        )}

        <div>
          <label htmlFor="printer-cut" className="block text-caption font-semibold text-text-secondary mb-1">
            Paper cutter
          </label>
          <select
            id="printer-cut"
            value={profile.cut}
            onChange={(e) => change({ cut: e.target.value })}
            className={inputClass}
          >
            {CUT_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {CUT_LABELS[mode]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="printer-feed" className="block text-caption font-semibold text-text-secondary mb-1">
            Blank lines after the receipt
          </label>
          <select
            id="printer-feed"
            value={profile.feedLines}
            onChange={(e) => change({ feedLines: Number(e.target.value) })}
            className={inputClass}
          >
            {FEED_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <div className={`flex items-center justify-between gap-4 p-3.5 rounded-xl border border-border-default bg-surface-2/40 ${usesBrowser ? 'opacity-60' : ''}`}>
          <div>
            <label htmlFor="printer-drawer" className="text-small font-semibold text-text-primary">
              Open cash drawer after printing
            </label>
            <p className="text-caption text-text-muted mt-0.5">
              Sends the drawer-open signal through the printer&apos;s cash drawer port.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              id="printer-drawer"
              type="checkbox"
              role="switch"
              checked={profile.openDrawer}
              onChange={(e) => change({ openDrawer: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-surface-3 peer-focus:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border-default after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
          </label>
        </div>
      </fieldset>

      <div className="space-y-2">
        <h4 className={legendClass}>Receipt preview</h4>
        <ReceiptPreview lines={previewLines} columns={columns} logoUrl={previewLogoUrl} />
        <p className="text-caption text-text-muted">
          Sample receipt at {columns} characters per line, using your shop details, currency, and the receipt header,
          footer and logo from Settings.
        </p>
        {previewLogoUrl && !usesBrowser && (
          <p className="text-caption text-text-muted">
            The logo prints with browser printing only for now. Direct printing prints the receipt text without it.
          </p>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="primary"
            size="md"
            leftIcon={PrinterIcon}
            loading={testState?.kind === 'pending'}
            onClick={handleTestPrint}
          >
            Print test receipt
          </Button>
          <Button type="button" variant="ghost" size="md" onClick={handleReset}>
            Restore defaults
          </Button>
        </div>

        {testState && (
          <div
            role="status"
            className={`flex items-start gap-2.5 p-3.5 rounded-xl border text-small ${statusStyles[testState.kind]}`}
          >
            {testState.kind === 'success' && <CheckCircleIcon className="h-5 w-5 shrink-0" aria-hidden="true" />}
            {(testState.kind === 'warning' || testState.kind === 'error') && (
              <ExclamationTriangleIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
            )}
            <span>{testState.message}</span>
          </div>
        )}
      </div>
    </section>
  );
}
