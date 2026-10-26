import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Linking, Platform, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppUpdate } from 'kickon-app/hooks/useAppUpdate';
import { QueryProvider, queryClient } from 'kickon-app/providers/QueryProvider';

let mockResponse;
const mockMaybeSingle = jest.fn(async () => mockResponse);
const mockEq = jest.fn();
const mockAppStateHandlers = new Set();
jest.mock('kickon-app/lib/supabase', () => ({
  getSupabaseClient: () => ({ from: () => ({ select: () => {
    const chain = { eq: (...args) => { mockEq(...args); return chain; },
      abortSignal: () => chain, maybeSingle: mockMaybeSingle };
    return chain;
  } }) }),
}));
jest.mock('kickon-app/store/useAppStore', () => ({
  useAppStore: { getState: () => ({ qaScenario: null }) },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => () => {}), refresh: jest.fn(async () => ({})),
}));
jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  NativeModules: { AppInfo: { appVersion: '1.0.2' }, DeviceLocale: { appVersion: '1.0.2' } },
  Linking: { getInitialURL: jest.fn(async () => null), addEventListener: jest.fn(() => ({ remove: jest.fn() })), openURL: jest.fn(async () => {}) },
  AppState: { currentState: 'active', addEventListener: jest.fn((_, callback) => {
    mockAppStateHandlers.add(callback);
    return { remove: () => mockAppStateHandlers.delete(callback) };
  }) },
}));

global.IS_REACT_ACT_ENVIRONMENT = true;
let state;
let tree;
let client;
function Probe() {
  const value = useAppUpdate();
  React.useEffect(() => { state = value; }, [value]);
  return null;
}
async function settle() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
}
async function mount(nativeProvider = false) {
  client = nativeProvider ? queryClient : new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    tree = TestRenderer.create(nativeProvider ? <QueryProvider><Probe /></QueryProvider> :
      <QueryClientProvider client={client}><Probe /></QueryClientProvider>);
  });
  await settle();
}
async function refetch() {
  await act(async () => { await state.refetch(); });
  await settle();
}
beforeEach(() => {
  global.__DEV__ = true;
  Platform.OS = 'android';
  mockResponse = { data: null, error: null };
  mockMaybeSingle.mockClear(); mockEq.mockClear();
  AsyncStorage.getItem.mockResolvedValue(null);
  Linking.getInitialURL.mockResolvedValue(null);
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  client?.clear(); tree = null;
  global.__DEV__ = true;
});

test.each(['android', 'ios'])('server controls %s independently with preview off', async platform => {
  Platform.OS = platform;
  mockResponse.data = { platform, version: '1.0.3', enabled: true };
  await mount();
  expect(mockEq).toHaveBeenCalledWith('platform', platform);
  expect(state.isUpdateAvailable).toBe(true);
  mockResponse.data = { platform, version: '1.0.2', enabled: true };
  await refetch(); expect(state.isUpdateAvailable).toBe(false);
  mockResponse.data = { platform, version: '1.0.1', enabled: true };
  await refetch(); expect(state.isUpdateAvailable).toBe(false);
  mockResponse.data = null; // Public RLS returns no row when guidance is disabled.
  await refetch(); expect(state.isUpdateAvailable).toBe(false);
});

test('failed refresh hides a formerly available update', async () => {
  mockResponse.data = { platform: 'android', version: '1.0.3', enabled: true };
  await mount(); expect(state.isUpdateAvailable).toBe(true);
  mockResponse = { data: null, error: new Error('Offline') };
  await refetch(); expect(state.isUpdateAvailable).toBe(false);
});

test('old development preview storage cannot override server settings', async () => {
  AsyncStorage.getItem.mockResolvedValue('update');
  Linking.getInitialURL.mockResolvedValue('kickon-dev://update-preview');
  await mount();
  expect(mockResponse.data).toBeNull();
  expect(state.isUpdateAvailable).toBe(false);
});

test('production ignores persisted preview and development deep links', async () => {
  global.__DEV__ = false;
  AsyncStorage.getItem.mockResolvedValue('matchday');
  Linking.getInitialURL.mockResolvedValue('kickon-dev://update-preview');
  await mount();
  expect(state.isUpdateAvailable).toBe(false);
});

test('app resume fetches fresh settings even before the stale time expires', async () => {
  mockResponse.data = { platform: 'android', version: '1.0.3', enabled: true };
  await mount(true);
  expect(state.isUpdateAvailable).toBe(true);
  const previousCalls = mockMaybeSingle.mock.calls.length;
  mockResponse.data = null;
  await act(async () => {
    for (const callback of mockAppStateHandlers) callback('background');
    for (const callback of mockAppStateHandlers) callback('active');
  });
  await settle();
  expect(AppState.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  expect(mockMaybeSingle.mock.calls.length).toBeGreaterThan(previousCalls);
  expect(state.isUpdateAvailable).toBe(false);
});
