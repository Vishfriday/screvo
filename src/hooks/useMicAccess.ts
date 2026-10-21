import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Platform } from "react-native";
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  getRecordingPermissionsAsync,
  setAudioModeAsync,
  PermissionStatus,
} from "expo-audio";
import type { RecordingInput, PermissionResponse } from "expo-audio";

export type MicPermState = "unknown" | "granted" | "denied" | "undetermined";

/**
 * Real microphone permission handling for Ask Screvo's voice command panel,
 * backed by `expo-audio`. Once permission is granted, the OS routes recording
 * input to whatever is currently active — the phone's built-in mic, a wired
 * headset, or a connected Bluetooth headset — with no extra code required;
 * `getAvailableInputs` / `getCurrentInput` surface that device by name so the
 * UI can show (and let the user switch) exactly what it's listening through.
 */
export function useMicAccess() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [status, setStatus] = useState<MicPermState>("unknown");
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [inputs, setInputs] = useState<RecordingInput[]>([]);
  const [current, setCurrent] = useState<RecordingInput | null>(null);
  const prepared = useRef(false);

  const refreshInputs = useCallback(async () => {
    try {
      if (!prepared.current) {
        await recorder.prepareToRecordAsync();
        prepared.current = true;
      }
      setInputs(recorder.getAvailableInputs());
      setCurrent(await recorder.getCurrentInput());
    } catch {
      // Some platforms/devices don't expose input switching — fail quietly,
      // the mic still works for the default input.
    }
  }, [recorder]);

  const toMicState = (res: PermissionResponse): MicPermState =>
    res.granted ? "granted" : res.status === PermissionStatus.DENIED ? "denied" : "undetermined";

  const check = useCallback(async () => {
    const res = await getRecordingPermissionsAsync();
    setStatus(toMicState(res));
    setCanAskAgain(res.canAskAgain ?? true);
    return res;
  }, []);

  useEffect(() => {
    check().then((res) => {
      if (res.granted) refreshInputs();
    });
  }, [check, refreshInputs]);

  const request = useCallback(async () => {
    setRequesting(true);
    const res = await requestRecordingPermissionsAsync();
    setStatus(toMicState(res));
    setCanAskAgain(res.canAskAgain ?? true);
    if (res.granted) {
      await setAudioModeAsync({ allowsRecording: true });
      await refreshInputs();
    }
    setRequesting(false);
    return res.granted;
  }, [refreshInputs]);

  const selectInput = useCallback(
    (uid: string) => {
      try {
        recorder.setInput(uid);
        refreshInputs();
      } catch {
        // ignore — device doesn't support manual input selection
      }
    },
    [recorder, refreshInputs],
  );

  const openSettings = useCallback(() => {
    Linking.openSettings();
  }, []);

  return {
    status,
    granted: status === "granted",
    canAskAgain,
    requesting,
    inputs,
    current,
    request,
    check,
    selectInput,
    openSettings,
    platform: Platform.OS,
  };
}

export type MicAccess = ReturnType<typeof useMicAccess>;
