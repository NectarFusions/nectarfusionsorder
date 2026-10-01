import { useCallback, useEffect, useRef, useState } from "react";

const NATIVE_FORMATS = ["code_128", "qr_code", "ean_13", "ean_8", "upc_a", "upc_e"];

const stopTracks = (stream) => {
  stream?.getTracks?.().forEach((track) => {
    try { track.stop(); } catch {}
  });
};

export default function NfosCameraScanner({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const controlsRef = useRef(null);
  const rafRef = useRef(0);
  const scanLockedRef = useRef(false);
  const mountedRef = useRef(true);
  const [status, setStatus] = useState("Requesting camera…");
  const [error, setError] = useState("");
  const [engine, setEngine] = useState("");

  const stop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    try { controlsRef.current?.stop?.(); } catch {}
    controlsRef.current = null;

    const video = videoRef.current;
    const stream = streamRef.current || video?.srcObject;
    stopTracks(stream);
    streamRef.current = null;

    if (video) {
      try { video.pause(); } catch {}
      video.srcObject = null;
    }
  }, []);

  const finish = useCallback((rawValue) => {
    const value = String(rawValue || "").trim();
    if (!value || scanLockedRef.current) return;
    scanLockedRef.current = true;

    try { navigator.vibrate?.(70); } catch {}
    stop();
    onDetected?.(value);
  }, [onDetected, stop]);

  useEffect(() => {
    mountedRef.current = true;

    const startFallback = async () => {
      setStatus("Starting compatible scanner…");
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      if (!mountedRef.current) return;

      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        videoRef.current,
        (result) => {
          if (result) finish(result.getText());
        }
      );

      if (!mountedRef.current) {
        try { controls?.stop?.(); } catch {}
        return;
      }

      controlsRef.current = controls;
      setEngine("ZXing fallback");
      setStatus("Point the camera at the NFOS barcode.");
    };

    const startNative = async () => {
      const NativeDetector = globalThis.BarcodeDetector;
      if (!NativeDetector?.getSupportedFormats) return false;

      const supported = await NativeDetector.getSupportedFormats();
      const formats = NATIVE_FORMATS.filter((format) => supported.includes(format));
      if (!formats.includes("code_128")) return false;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      if (!mountedRef.current) {
        stopTracks(stream);
        return true;
      }

      streamRef.current = stream;
      const video = videoRef.current;
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      await video.play();

      const detector = new NativeDetector({ formats });
      let detecting = false;

      const tick = async () => {
        if (!mountedRef.current || scanLockedRef.current) return;

        if (!detecting && video.readyState >= 2) {
          detecting = true;
          try {
            const results = await detector.detect(video);
            const match = results?.find((result) => String(result?.rawValue || "").trim());
            if (match) {
              finish(match.rawValue);
              return;
            }
          } catch {
            // Keep scanning. A single undecodable frame is normal.
          } finally {
            detecting = false;
          }
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      setEngine("Native camera scanner");
      setStatus("Point the camera at the NFOS barcode.");
      tick();
      return true;
    };

    const start = async () => {
      setError("");

      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser cannot access the camera. You can still type the barcode below.");
        return;
      }

      try {
        const nativeStarted = await startNative();
        if (!nativeStarted) await startFallback();
      } catch (err) {
        stop();

        const permissionDenied = err?.name === "NotAllowedError" || err?.name === "SecurityError";
        if (permissionDenied) {
          setError("Camera access was blocked. Allow camera access for nectar-fusions.com, then try again.");
          return;
        }

        try {
          await startFallback();
        } catch (fallbackError) {
          setError(fallbackError?.message || err?.message || "Could not start the barcode camera.");
        }
      }
    };

    start();

    return () => {
      mountedRef.current = false;
      stop();
    };
  }, [finish, stop]);

  const close = () => {
    stop();
    onClose?.();
  };

  return (
    <div className="nfos-camera-scanner">
      <div className="nfos-camera-head">
        <div>
          <strong>Phone barcode scanner</strong>
          <div className="nfos-muted nfos-small">{status}</div>
        </div>
        <button className="nfos-btn ghost" type="button" onClick={close}>Close</button>
      </div>

      {error ? (
        <div className="nfos-error">{error}</div>
      ) : (
        <div className="nfos-camera-stage">
          <video ref={videoRef} muted playsInline aria-label="NFOS barcode camera preview" />
          <div className="nfos-camera-guide" aria-hidden="true">
            <span />
          </div>
        </div>
      )}

      <div className="nfos-camera-foot">
        <span>Use the rear camera and hold the barcode steady inside the frame.</span>
        {engine && <span className="nfos-pill">{engine}</span>}
      </div>
    </div>
  );
}
