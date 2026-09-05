"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { importOffProductAction } from "@/server/products/actions";
import { BarcodeIcon } from "@phosphor-icons/react/dist/csr/Barcode";

/** Barcode entry with optional camera scanning (BarcodeDetector). */
export function ImportBarcode() {
  const t = useTranslations("Products");
  const router = useRouter();
  const [barcode, setBarcode] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  async function importBarcode(code: string) {
    setPending(true);
    setStatus(null);
    const result = await importOffProductAction(code);
    setPending(false);
    stopScanner();
    if (result.ok && result.data) {
      router.push(`/products/${result.data.id}`);
      router.refresh();
    } else if (result.error === "off-not-found") {
      setStatus(t("offNotFound"));
    } else {
      setStatus(t("offNotFound"));
    }
  }

  async function startScanner() {
    const detectorAvailable = "BarcodeDetector" in window;
    if (!detectorAvailable || !navigator.mediaDevices?.getUserMedia) {
      setStatus(t("enterBarcode"));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setScanning(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const Detector = (window as unknown as { BarcodeDetector: new (opts?: unknown) => { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
      const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
      const poll = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const value = codes[0]?.rawValue;
          if (value) {
            setBarcode(value);
            await importBarcode(value);
            return;
          }
        } catch {
          // detection hiccups are normal between frames
        }
        setTimeout(() => void poll(), 350);
      };
      void poll();
    } catch {
      setStatus(t("enterBarcode"));
    }
  }

  function stopScanner() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[60%] flex-1">
          <BarcodeIcon size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden />
          <input
            value={barcode}
            onChange={(e) => setBarcode(e.target.value.replace(/\D/g, "").slice(0, 14))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && barcode.length >= 6) void importBarcode(barcode);
            }}
            inputMode="numeric"
            placeholder={t("enterBarcode")}
            className="pl-9"
            aria-label={t("barcode")}
          />
        </div>
        <button
          type="button"
          className="btn-secondary shrink-0 px-3"
          aria-label={t("scan")}
          onClick={() => (scanning ? stopScanner() : void startScanner())}
        >
          <BarcodeIcon size={18} aria-hidden />
        </button>
        <button
          type="button"
          className="btn-primary shrink-0 flex-1 justify-center sm:flex-none"
          disabled={pending || barcode.length < 6}
          onClick={() => void importBarcode(barcode)}
        >
          {pending ? "…" : t("importFromOff")}
        </button>
      </div>
      {scanning ? (
        <div className="mt-3 overflow-hidden rounded-lg border border-zinc-200 bg-black">
          <video ref={videoRef} muted playsInline className="h-48 w-full object-cover" />
        </div>
      ) : null}
      {status ? <p className="mt-2 text-sm text-zinc-500">{status}</p> : null}
    </div>
  );
}
