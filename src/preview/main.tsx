import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  MISSION_RENDERER_VERSION,
  PREVIEW_BRIDGE_VERSION,
  validatePreviewOutbound,
  type PreviewFrameView
} from "../shared/mission-presentation/mission-preview-bridge";
import {
  MissionChoicePanel,
  MissionEndingScreen,
  MissionIntroScreen,
  MissionSceneStage
} from "../shared/mission-presentation/components";
import "../shared/mission-presentation/tokens.css";

const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

function parentOrigin(): string | null {
  try {
    const parent = new URLSearchParams(window.location.search).get("parent");
    if (!parent) return null;
    const parsed = new URL(parent);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function App() {
  const [frame, setFrame] = useState<PreviewFrameView | null>(null);
  const [mode, setMode] = useState<"screen" | "play">("screen");
  const [nonce, setNonce] = useState<string | null>(null);
  const [status, setStatus] = useState("Ожидание кадра от Studio");

  useEffect(() => {
    const allowed = parentOrigin();
    if (!allowed) {
      setStatus("Нет parent origin: preview отклоняет все кадры");
      return;
    }
    const onMessage = (event: MessageEvent) => {
      const checked = validatePreviewOutbound(event.origin, allowed, event.data);
      if (!checked.ok) return;
      setNonce(checked.frame.nonce);
      setMode(checked.frame.mode);
      setFrame(checked.frame.frame);
      setStatus(checked.frame.mode === "screen" ? "Экран: черновик, не gameplay" : "Прохождение замороженной версии");
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage(
      { protocol: "lhc-mission-preview", version: PREVIEW_BRIDGE_VERSION, type: "ready", nonce: "", payload: null },
      allowed
    );
    (window as unknown as { __MISSION_PREVIEW__?: unknown }).__MISSION_PREVIEW__ = Object.freeze({
      rendererVersion: MISSION_RENDERER_VERSION,
      bridgeVersion: PREVIEW_BRIDGE_VERSION
    });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const post = (type: "selection" | "transform", payload: unknown) => {
    const allowed = parentOrigin();
    if (!nonce || !NONCE_PATTERN.test(nonce) || !allowed) return;
    window.parent.postMessage(
      { protocol: "lhc-mission-preview", version: PREVIEW_BRIDGE_VERSION, type, nonce, payload },
      allowed
    );
  };

  if (!frame || !nonce) {
    return (
      <main className="mp-stage">
        <p>{status}</p>
      </main>
    );
  }
  if (frame.kind === "intro") {
    return <MissionIntroScreen frame={frame} onBegin={() => post("selection", { layerId: "intro:begin" })} />;
  }
  if (frame.kind === "ending") {
    return <MissionEndingScreen frame={frame} onExit={() => post("selection", { layerId: "ending:exit" })} />;
  }
  return (
    <main>
      <MissionSceneStage frame={frame} paused={mode === "screen"} />
      <p>{status}</p>
      {mode === "play" && (
        <MissionChoicePanel
          choices={frame.choices}
          onChoose={(choiceId) => post("selection", { layerId: `choice:${choiceId}` })}
        />
      )}
    </main>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
