import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Check, LoaderCircle, RotateCcw, Save, Settings2 } from "lucide-react";
import { DEFAULT_OPTIONS } from "../shared/constants";
import { sendBackgroundMessage } from "../shared/messages";
import type { CaptureOptions } from "../shared/types";
import "./options.css";

function Options() {
  const [options, setOptions] = useState<CaptureOptions>(DEFAULT_OPTIONS);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void sendBackgroundMessage({ type: "GET_OPTIONS" }).then((response) => {
      if (response.ok && "options" in response) setOptions(response.options);
      if (!response.ok) setError(response.error);
    });
  }, []);

  const update = <Key extends keyof CaptureOptions>(
    key: Key,
    value: CaptureOptions[Key]
  ) => {
    setOptions((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const save = async () => {
    setBusy(true);
    setError(undefined);
    const response = await sendBackgroundMessage({
      type: "SAVE_OPTIONS",
      options
    });
    if (response.ok && "options" in response) {
      setOptions(response.options);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } else if (!response.ok) {
      setError(response.error);
    }
    setBusy(false);
  };

  return (
    <main className="options-shell">
      <header>
        <div className="title-block">
          <div className="brand-mark"><Settings2 size={18} /></div>
          <div>
            <h1>Capture settings</h1>
            <p>Applies to new single-page and domain recordings.</p>
          </div>
        </div>
        <div className="header-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setOptions(DEFAULT_OPTIONS);
              setSaved(false);
            }}
          >
            <RotateCcw size={15} />
            Reset
          </button>
          <button className="primary-button" type="button" onClick={() => void save()} disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={15} /> : saved ? <Check size={15} /> : <Save size={15} />}
            {saved ? "Saved" : "Save"}
          </button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <section>
        <div className="section-copy">
          <h2>Capture behavior</h2>
          <p>Control when each route is snapshotted and how large the session can grow.</p>
        </div>
        <div className="settings-panel">
          <NumberSetting
            label="Capture delay"
            description="Wait for hydration and late assets before reading the DOM."
            value={options.captureDelayMs}
            suffix="ms"
            min={250}
            max={15000}
            step={50}
            onChange={(value) => update("captureDelayMs", value)}
          />
          <NumberSetting
            label="Maximum elements"
            description="Element inventory limit per frame."
            value={options.maxElements}
            suffix="elements"
            min={100}
            max={100000}
            step={100}
            onChange={(value) => update("maxElements", value)}
          />
          <NumberSetting
            label="DOM payload target"
            description="HTML serialization target per frame."
            value={Math.round(options.maxHtmlBytes / 1024 / 1024)}
            suffix="MB"
            min={1}
            max={64}
            step={1}
            onChange={(value) => update("maxHtmlBytes", value * 1024 * 1024)}
          />
          <NumberSetting
            label="Per-resource ceiling"
            description="Larger bodies remain indexed without their payload."
            value={Math.round(options.maxResourceBytes / 1024 / 1024)}
            suffix="MB"
            min={1}
            max={256}
            step={1}
            onChange={(value) => update("maxResourceBytes", value * 1024 * 1024)}
          />
          <NumberSetting
            label="Session ceiling"
            description="Maximum stored response bodies across the session."
            value={Math.round(options.maxSessionBytes / 1024 / 1024)}
            suffix="MB"
            min={10}
            max={2048}
            step={10}
            onChange={(value) => update("maxSessionBytes", value * 1024 * 1024)}
          />
        </div>
      </section>

      <section>
        <div className="section-copy">
          <h2>Output</h2>
          <p>Snapshot pages are always inert. Live pages require the generated local server.</p>
        </div>
        <div className="settings-panel">
          <ToggleSetting
            label="Include live replay"
            description="Package original HTML, captured scripts, and the local network shim."
            checked={options.includeLiveView}
            onChange={(checked) => update("includeLiveView", checked)}
          />
          <ToggleSetting
            label="Auto-export on stop"
            description="Send the ZIP to Downloads as soon as recording stops."
            checked={options.autoExportOnStop}
            onChange={(checked) => update("autoExportOnStop", checked)}
          />
          <ToggleSetting
            label="Redact sensitive headers"
            description="Remove authorization, cookie, API key, and CSRF values from metadata."
            checked={options.redactSensitiveHeaders}
            onChange={(checked) => update("redactSensitiveHeaders", checked)}
          />
        </div>
      </section>

      <footer>
        <span>PrprprWarp v26.0 Alpha 1</span>
        <a href="https://github.com/StarsailsClover/PrprprWarp" target="_blank" rel="noreferrer">GitHub</a>
      </footer>
    </main>
  );
}

function NumberSetting(props: {
  label: string;
  description: string;
  value: number;
  suffix: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="setting-row">
      <span className="setting-copy">
        <strong>{props.label}</strong>
        <span>{props.description}</span>
      </span>
      <span className="number-field">
        <input
          type="number"
          value={props.value}
          min={props.min}
          max={props.max}
          step={props.step}
          onChange={(event) =>
            props.onChange(Math.max(props.min, Math.min(props.max, Number(event.target.value))))
          }
        />
        <span>{props.suffix}</span>
      </span>
    </label>
  );
}

function ToggleSetting(props: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="setting-row">
      <span className="setting-copy">
        <strong>{props.label}</strong>
        <span>{props.description}</span>
      </span>
      <input
        className="switch"
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
      />
    </label>
  );
}

createRoot(document.getElementById("root")!).render(<Options />);
