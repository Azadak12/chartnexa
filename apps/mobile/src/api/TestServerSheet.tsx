import Constants from "expo-constants";
import { useState } from "react";
import { BottomSheet, Banner, Button, Text, TextField, useSubmitOnce } from "../ui";
import { apiBaseUrl } from "./client";
import { appVariant, checkServerAddress, testServer } from "./test-server";

const CHECK_MS = 8000;

/** "Preview 0.1.0 · server 192.168.1.20:3000", so testers can tell builds and servers apart. */
export function buildLabel(): string {
  const version = Constants.expoConfig?.version ?? "0.0.0";
  let host = apiBaseUrl();
  try {
    host = new URL(host).host;
  } catch {
    // Show the raw value.
  }
  const variant = appVariant();
  return `${variant[0]?.toUpperCase()}${variant.slice(1)} ${version} · server ${host}`;
}

/** Test builds only (signed out, on Welcome): choose which server this phone talks to. */
export function TestServerSection() {
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState(apiBaseUrl());
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [label, setLabel] = useState(buildLabel());

  const check = async (url: string): Promise<boolean> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHECK_MS);
    try {
      const res = await fetch(`${url}/health/ready`, { signal: controller.signal });
      if (res.ok) return true;
      setResult({
        ok: false,
        text: `The server answered ${res.status}. It may still be starting.`,
      });
      return false;
    } catch {
      setResult({
        ok: false,
        text: "Could not reach that address. Check the phone and the computer are on the same Wi-Fi, and the API is running.",
      });
      return false;
    } finally {
      clearTimeout(timer);
    }
  };

  const save = useSubmitOnce(async () => {
    setResult(null);
    const c = checkServerAddress(address);
    if ("error" in c) {
      setError(c.error);
      return;
    }
    setError(undefined);
    if (!(await check(c.url))) return;
    await testServer.save(c.url);
    setAddress(c.url);
    setLabel(buildLabel());
    setResult({ ok: true, text: "Connected. This phone now uses that server." });
  });

  if (!testServer.allowed()) return null;
  return (
    <>
      <Text variant="caption" tone="muted" testID="build-label">
        {label}
      </Text>
      <Button
        label="Test server"
        variant="tertiary"
        accessibilityLabel="Change the test server address"
        onPress={() => {
          setAddress(apiBaseUrl());
          setResult(null);
          setOpen(true);
        }}
      />
      <BottomSheet visible={open} title="Test server" onDismiss={() => setOpen(false)}>
        <Text>
          Test builds only. Enter the address of the ChartNexa API this phone should use, for
          example your computer on the same Wi-Fi.
        </Text>
        {result ? (
          <Banner
            kind={result.ok ? "success" : "error"}
            message={result.text}
            testID="server-result"
          />
        ) : null}
        <TextField
          label="Server address"
          value={address}
          onChangeText={setAddress}
          error={error}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Button label="Check and save" loading={save.pending} onPress={() => void save.run()} />
        <Button
          label="Use the built-in address"
          variant="secondary"
          onPress={() => {
            void testServer.reset().then(() => {
              setAddress(apiBaseUrl());
              setLabel(buildLabel());
              setResult({ ok: true, text: "Using the address this build came with." });
            });
          }}
        />
        <Button label="Close" variant="tertiary" onPress={() => setOpen(false)} />
      </BottomSheet>
    </>
  );
}
