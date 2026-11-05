import { Suspense, type ReactNode } from "react";
import { StartupSplashScreen } from "@/screens/startup-splash-screen";

const STARTUP_FALLBACK = <StartupSplashScreen />;

export function RouteSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={STARTUP_FALLBACK}>{children}</Suspense>;
}
