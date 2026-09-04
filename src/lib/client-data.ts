"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeToConsoleEnvironment } from "@/lib/environment";

const DATA_CHANGED_EVENT = "kickon-admin-data-changed";

export function invalidateAdminData() {
  window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
}

export function useClientData<T>(loader: () => Promise<T>, dependencies: readonly unknown[] = []) {
  const loaderRef = useRef(loader);
  const requestIdRef = useRef(0);
  const dataRef = useRef<T | null>(null);
  const dependencyKeyRef = useRef<string | null>(null);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const dependencyKey = JSON.stringify(dependencies);

  useEffect(() => {
    loaderRef.current = loader;
  }, [loader]);

  const reload = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const isInitialLoad = dataRef.current === null;
    if (isInitialLoad) setLoading(true);
    setError(null);
    try {
      const nextData = await loaderRef.current();
      if (requestId === requestIdRef.current) {
        dataRef.current = nextData;
        setData(nextData);
      }
    } catch (caught) {
      if (requestId === requestIdRef.current && dataRef.current === null) {
        setError(caught instanceof Error ? caught.message : "데이터를 불러오지 못했습니다.");
      }
    } finally {
      if (requestId === requestIdRef.current && isInitialLoad) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const dependenciesChanged = dependencyKeyRef.current !== null && dependencyKeyRef.current !== dependencyKey;
    dependencyKeyRef.current = dependencyKey;
    const timer = window.setTimeout(() => {
      if (dependenciesChanged) {
        dataRef.current = null;
        setData(null);
        setError(null);
        setLoading(true);
      }
      void reload();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      requestIdRef.current += 1;
    };
  }, [reload, dependencyKey]);

  useEffect(() => {
    const handleDataChange = () => void reload();
    const handleEnvironmentChange = () => {
      // Never show data from the previous project under the newly selected
      // environment label. Reset only the page body; AppShell stays mounted.
      requestIdRef.current += 1;
      dataRef.current = null;
      setData(null);
      setError(null);
      setLoading(true);
      void reload();
    };
    const unsubscribeEnvironment = subscribeToConsoleEnvironment(handleEnvironmentChange);
    window.addEventListener(DATA_CHANGED_EVENT, handleDataChange);
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, handleDataChange);
      unsubscribeEnvironment();
    };
  }, [reload]);

  return { data, error, loading, reload };
}
