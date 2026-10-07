import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { RestAdjustmentSheet } from "@/components/zentra/RestAdjustmentSheet";
import type { SleepEstimate } from "@/types/zentra";

export function RestAdjustmentControl({ estimate }: { estimate: SleepEstimate }) {
  const [open, setOpen] = useState(false);
  if (!estimate.canAdjust || !estimate.startTimestamp || !estimate.endTimestamp || !estimate.wakeDate) return null;
  return <>
    <Button variant="ghost" onPress={() => setOpen(true)}>Adjust rest window</Button>
    {open ? <RestAdjustmentSheet key={estimate.wakeDate} estimate={estimate} onClose={() => setOpen(false)} /> : null}
  </>;
}
