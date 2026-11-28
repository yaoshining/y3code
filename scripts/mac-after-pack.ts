// @effect-diagnostics nodeBuiltinImport:off -- electron-builder invokes this hook in its Node packaging process.
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeModule from "node:module";
import * as NodePath from "node:path";

const prepareServerCompileCache: (context: AfterPackContext) => Promise<void> =
  NodeModule.createRequire(import.meta.url)("./prepare-server-compile-cache.cjs");

interface AfterPackContext {
  readonly appOutDir: string;
  readonly electronPlatformName: string;
  readonly arch: number;
  readonly packager: {
    readonly appInfo: { readonly id: string; readonly productFilename: string };
    readonly info: { readonly framework: { readonly version: string } };
  };
}

type SliceUuid = { readonly arch: string; readonly uuid: string };

export function readMachOUuids(output: string): ReadonlyArray<SliceUuid> {
  const slices = [
    ...output.matchAll(/^UUID: ([\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}) \((\w+)\)/gimu),
  ].map(([, uuid, arch]) => ({ uuid: uuid!.toLowerCase(), arch: arch! }));
  if (slices.length === 0 || new Set(slices.map(({ arch }) => arch)).size !== slices.length) {
    throw new Error("Expected exactly one Mach-O UUID per architecture from dwarfdump");
  }
  return slices;
}

function appUuid(appId: string, electronVersion: string, arch: string): string {
  const hash = NodeCrypto.createHash("sha256")
    .update(JSON.stringify(["electron-executable", appId, electronVersion, arch]))
    .digest();
  hash[6] = (hash[6]! & 0x0f) | 0x80;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function namespaceMachOUuids(
  executable: Buffer,
  slices: ReadonlyArray<SliceUuid>,
  appId: string,
  electronVersion: string,
): ReadonlyArray<SliceUuid> {
  return slices.map(({ arch, uuid }) => {
    const expected = appUuid(appId, electronVersion, arch);
    if (expected !== uuid) {
      // LC_UUID + cmdsize for little-endian x86_64 / arm64 images, including slices of a fat binary.
      const command = Buffer.from(`1b00000018000000${uuid.replaceAll("-", "")}`, "hex");
      const offset = executable.indexOf(command);
      if (offset < 0 || executable.indexOf(command, offset + 1) >= 0) {
        throw new Error(`Cannot locate an unambiguous LC_UUID for ${arch}: ${uuid}`);
      }
      Buffer.from(expected.replaceAll("-", ""), "hex").copy(executable, offset + 8);
    }
    return { arch, uuid: expected };
  });
}

export default async function afterPack(context: AfterPackContext): Promise<void> {
  await prepareServerCompileCache(context);
  const { id, productFilename } = context.packager.appInfo;
  const executablePath = NodePath.join(
    context.appOutDir,
    `${productFilename}.app`,
    "Contents",
    "MacOS",
    productFilename,
  );
  const inspect = () =>
    readMachOUuids(
      NodeChildProcess.execFileSync("/usr/bin/dwarfdump", ["--uuid", executablePath], {
        encoding: "utf8",
      }),
    );
  const original = inspect();
  const executable = await NodeFSP.readFile(executablePath);
  // TN3178: a shared Electron UUID can couple otherwise distinct apps' LAN permissions.
  // Run after bytecode preparation but before electron-builder re-signs the staged executable.
  const expected = namespaceMachOUuids(
    executable,
    original,
    id,
    context.packager.info.framework.version,
  );
  if (original.every(({ uuid }, index) => uuid === expected[index]?.uuid)) return;
  await NodeFSP.writeFile(executablePath, executable);
  const verified = inspect();
  if (
    verified.length !== expected.length ||
    !expected.every(({ arch, uuid }) =>
      verified.some((slice) => slice.arch === arch && slice.uuid === uuid),
    )
  ) {
    throw new Error(`dwarfdump did not confirm the namespaced UUIDs for ${executablePath}`);
  }
}
