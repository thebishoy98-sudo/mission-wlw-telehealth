"use client";

import { useEffect } from "react";
import { initializeDemo } from "@/lib/seed";

export function SeedInit() {
  useEffect(() => {
    initializeDemo();
  }, []);
  return null;
}
