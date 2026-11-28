import { describe, expect, it } from "@effect/vitest";

import { namespaceMachOUuids, readMachOUuids } from "./mac-after-pack.ts";

const original = readMachOUuids(
  "UUID: 4C4C448B-5555-3144-A137-BC5609565491 (arm64) /workspace/Y3 Code\n" +
    "UUID: B6A1C19C-94AC-3659-AD62-BDF1839A8683 (x86_64) /workspace/Y3 Code\n",
);
const appId = "io.github.yaoshining.y3code";
const electron = "44.10.1";
const command = (uuid: string) => Buffer.from(`1b00000018000000${uuid.replaceAll("-", "")}`, "hex");

function fixture(slices: typeof original) {
  const padding = Buffer.from("unchanged");
  return Buffer.concat(slices.flatMap(({ uuid }) => [padding, command(uuid), padding]));
}

describe("macOS packaged executable identity", () => {
  it("writes distinct, repeatable UUIDs for both architectures without changing other bytes", () => {
    const executable = fixture(original);
    const namespaced = namespaceMachOUuids(executable, original, appId, electron);
    expect(namespaced.map(({ arch }) => arch)).toEqual(["arm64", "x86_64"]);
    expect(new Set([...original, ...namespaced].map(({ uuid }) => uuid)).size).toBe(4);
    expect(executable).toEqual(fixture(namespaced));
    expect(namespaceMachOUuids(executable, namespaced, appId, electron)).toEqual(namespaced);
    expect(executable).toEqual(fixture(namespaced));
    expect(
      namespaceMachOUuids(fixture(original), original, `${appId}.other`, electron),
    ).not.toEqual(namespaced);
    expect(namespaceMachOUuids(fixture(original), original, appId, "44.10.2")).not.toEqual(
      namespaced,
    );
  });

  it("aborts packaging if inspection or the location of a load command is ambiguous", () => {
    expect(() => readMachOUuids("")).toThrow("exactly one Mach-O UUID");
    const [slice] = original;
    if (!slice) throw new Error("missing test fixture");
    const duplicated = Buffer.concat([fixture(original), command(slice.uuid)]);
    expect(() => namespaceMachOUuids(duplicated, original, appId, electron)).toThrow(
      "unambiguous LC_UUID",
    );
  });
});
