"use client";

import { useEffect } from "react";
import { initializeDemo } from "@/lib/seed";

export function SeedInit() {
  useEffect(() => {
    if (
      process.env.NODE_ENV === "production" &&
      process.env.NEXT_PUBLIC_ENABLE_DEMO_SEED !== "true"
    ) {
      return;
    }
    initializeDemo();
  }, []);
  return null;
}
