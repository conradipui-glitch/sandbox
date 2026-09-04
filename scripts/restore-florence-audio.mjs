import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const partsDirectory = `${projectRoot}audio-parts`;
const outputDirectory = `${projectRoot}public/audio`;

const tracks = {
  "music-11-florence-threshold.mp3": "a0f6d972c55d487ef49969c21caac7e41dd06d2b53a3ba2590083fa9fb59409f",
  "music-12-florence-workshop-night.mp3": "e4e31ba7a498a034534b27c4d0a58100d56092aa3dcf55e77e2900196f172a73",
  "music-13-florence-guildhall.mp3": "d1023d84708f59228896aec3807cb8a00aab10d5e5431bb133beba60f89107f5",
  "music-14-florence-deadline.mp3": "0da018600d576c3cab7963ccbf419115046f72605ae83c1011f0f99844eeb802",
  "music-15-florence-decision-reveal.mp3": "8b98f67290f0d866da1dd8e442f181993ed0df27bfc83d7cd11bddbe5cd06500",
  "music-16-florence-dawn-finale.mp3": "ad73b0ee54970a151355eb8a5cbc7f725a22431e03108ef1746ba58989e8ed26",
};

function checksum(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function validExistingTrack(path, expectedHash) {
  try {
    await access(path);
    return checksum(await readFile(path)) === expectedHash;
  } catch {
    return false;
  }
}

await mkdir(outputDirectory, { recursive: true });
const availableParts = await readdir(partsDirectory);

for (const [name, expectedHash] of Object.entries(tracks)) {
  const outputPath = `${outputDirectory}/${name}`;
  if (await validExistingTrack(outputPath, expectedHash)) continue;

  const partNames = availableParts.filter((part) => part.startsWith(`${name}.part-`)).sort();
  if (!partNames.length) throw new Error(`Missing bundled audio parts for ${name}`);

  const bytes = Buffer.concat(await Promise.all(partNames.map((part) => readFile(`${partsDirectory}/${part}`))));
  const actualHash = checksum(bytes);
  if (actualHash !== expectedHash) throw new Error(`Audio checksum mismatch for ${name}: ${actualHash}`);

  await writeFile(outputPath, bytes);
  console.log(`Restored ${name}`);
}
