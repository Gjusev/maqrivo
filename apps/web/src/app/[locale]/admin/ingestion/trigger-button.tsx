"use client";

import { useState } from "react";
import { triggerJobAction } from "./actions";

type JobKey =
  | "promotion-expiry"
  | "pantry-consumption"
  | "openprices-sync"
  | "catalogue-sync"
  | "page-extraction"
  | "store-discovery";

const LABELS: Record<JobKey, string> = {
  "promotion-expiry": "expiry",
  "pantry-consumption": "pantry",
  "openprices-sync": "openprices",
  "catalogue-sync": "catalogues",
  "page-extraction": "extract",
  "store-discovery": "stores",
};

export function TriggerButton({ jobKey }: { jobKey: JobKey }) {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      className="btn-secondary text-xs"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await triggerJobAction(jobKey);
        setTimeout(() => setPending(false), 1500);
      }}
    >
      {pending ? "…" : LABELS[jobKey]}
    </button>
  );
}
