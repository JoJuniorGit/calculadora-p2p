import { useSyncExternalStore } from 'react';
import {
  getInstallPromptState,
  subscribeInstallPrompt,
  type InstallPromptState,
} from './installSupport';

export function useInstallPromptState(): InstallPromptState {
  return useSyncExternalStore(subscribeInstallPrompt, getInstallPromptState);
}
