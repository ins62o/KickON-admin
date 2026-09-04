import { useSyncExternalStore } from "react";

export type ConsoleEnvironment = "development" | "production";

const STORAGE_KEY = "kickon-console-environment";
export const CONSOLE_ENVIRONMENT_EVENT = "kickon-console-environment-changed";

function normalizeEnvironment(value: string | null | undefined): ConsoleEnvironment | null {
  if (value === "development" || value === "production") return value;
  return null;
}

export function getBuildEnvironment(): ConsoleEnvironment {
  return process.env.NEXT_PUBLIC_KICKON_DEFAULT_ENVIRONMENT === "development" ? "development" : "production";
}

export function getActiveConsoleEnvironment(): ConsoleEnvironment {
  if (typeof window === "undefined") return getBuildEnvironment();
  return normalizeEnvironment(window.localStorage.getItem(STORAGE_KEY)) ?? getBuildEnvironment();
}

export function setActiveConsoleEnvironment(environment: ConsoleEnvironment) {
  if (typeof window === "undefined") return;
  if (getActiveConsoleEnvironment() === environment) return;
  window.localStorage.setItem(STORAGE_KEY, environment);
  window.dispatchEvent(new CustomEvent(CONSOLE_ENVIRONMENT_EVENT, { detail: environment }));
}

export function subscribeToConsoleEnvironment(listener: (environment: ConsoleEnvironment) => void) {
  if (typeof window === "undefined") return () => undefined;
  const handleChange = (event: Event) => {
    const environment = normalizeEnvironment((event as CustomEvent<string>).detail) ?? getActiveConsoleEnvironment();
    listener(environment);
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    listener(normalizeEnvironment(event.newValue) ?? getBuildEnvironment());
  };
  window.addEventListener(CONSOLE_ENVIRONMENT_EVENT, handleChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(CONSOLE_ENVIRONMENT_EVENT, handleChange);
    window.removeEventListener("storage", handleStorage);
  };
}

export function useConsoleEnvironment() {
  // Kept in a separate client-safe module so every data reader and interactive
  // control resolves the same mode without routing to a second deployment.
  return useSyncExternalStore(
    (listener) => {
      const unsubscribe = subscribeToConsoleEnvironment(() => listener());
      return unsubscribe;
    },
    getActiveConsoleEnvironment,
    getBuildEnvironment,
  );
}

export function environmentLabel(environment: ConsoleEnvironment) {
  return environment === "production" ? "운영 서버" : "개발 서버";
}
