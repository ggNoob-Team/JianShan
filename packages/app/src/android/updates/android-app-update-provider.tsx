import { AppState, type AppStateStatus } from "react-native";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ANDROID_UPDATE_CHECK_INTERVAL_MS,
  checkAndroidAppUpdate,
  openAndroidAppUpdate,
  resolveAndroidAppVersion,
  shouldCheckAndroidAppUpdate,
  type AndroidAppUpdateCheckResult,
} from "./android-app-update";

export type AndroidAppUpdateStatus = "idle" | "checking" | "up-to-date" | "available" | "error";

export interface AndroidAppUpdateContextValue {
  supported: boolean;
  status: AndroidAppUpdateStatus;
  result: AndroidAppUpdateCheckResult | null;
  errorMessage: string | null;
  lastCheckedAt: number | null;
  isChecking: boolean;
  checkForUpdates: () => Promise<AndroidAppUpdateCheckResult | null>;
  downloadUpdate: () => Promise<void>;
}

const AndroidAppUpdateContext = createContext<AndroidAppUpdateContextValue | null>(null);

export function AndroidAppUpdateProvider({ children }: { children: ReactNode }) {
  const supported = useMemo(() => shouldCheckAndroidAppUpdate(), []);
  const [status, setStatus] = useState<AndroidAppUpdateStatus>("idle");
  const [result, setResult] = useState<AndroidAppUpdateCheckResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const mountedRef = useRef(true);
  const checkingRef = useRef(false);
  const lastCheckedAtRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const checkForUpdates = useCallback(async () => {
    if (!supported || checkingRef.current) return null;
    checkingRef.current = true;
    setStatus("checking");
    setErrorMessage(null);
    try {
      const next = await checkAndroidAppUpdate({ currentVersion: resolveAndroidAppVersion() });
      const checkedAt = Date.now();
      lastCheckedAtRef.current = checkedAt;
      if (!mountedRef.current) return next;
      setResult(next);
      setLastCheckedAt(checkedAt);
      setErrorMessage(next.errorMessage);
      let nextStatus: AndroidAppUpdateStatus = "up-to-date";
      if (next.errorMessage) nextStatus = "error";
      else if (next.hasUpdate) nextStatus = "available";
      setStatus(nextStatus);
      return next;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (mountedRef.current) {
        setStatus("error");
        setErrorMessage(message);
      }
      return null;
    } finally {
      checkingRef.current = false;
    }
  }, [supported]);

  useEffect(() => {
    if (!supported) return undefined;

    void checkForUpdates();
    const interval = setInterval(() => {
      void checkForUpdates();
    }, ANDROID_UPDATE_CHECK_INTERVAL_MS);
    const appStateSubscription = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state !== "active") return;
      const lastChecked = lastCheckedAtRef.current;
      if (lastChecked === null || Date.now() - lastChecked >= ANDROID_UPDATE_CHECK_INTERVAL_MS) {
        void checkForUpdates();
      }
    });

    return () => {
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, [checkForUpdates, supported]);

  const downloadUpdate = useCallback(async () => {
    const downloadUrl = result?.downloadUrl;
    if (!downloadUrl) return;
    try {
      await openAndroidAppUpdate(downloadUrl);
    } catch (error) {
      if (mountedRef.current) {
        setStatus("error");
        setErrorMessage(error instanceof Error ? error.message : String(error));
      }
    }
  }, [result?.downloadUrl]);

  const value = useMemo<AndroidAppUpdateContextValue>(
    () => ({
      supported,
      status,
      result,
      errorMessage,
      lastCheckedAt,
      isChecking: status === "checking",
      checkForUpdates,
      downloadUpdate,
    }),
    [checkForUpdates, downloadUpdate, errorMessage, lastCheckedAt, result, status, supported],
  );

  return (
    <AndroidAppUpdateContext.Provider value={value}>{children}</AndroidAppUpdateContext.Provider>
  );
}

export function useAndroidAppUpdate(): AndroidAppUpdateContextValue {
  const value = useContext(AndroidAppUpdateContext);
  if (!value) {
    return {
      supported: false,
      status: "idle",
      result: null,
      errorMessage: null,
      lastCheckedAt: null,
      isChecking: false,
      checkForUpdates: async () => null,
      downloadUpdate: async () => {},
    };
  }
  return value;
}
