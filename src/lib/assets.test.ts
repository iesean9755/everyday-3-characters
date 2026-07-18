import { describe, expect, it } from "vitest";
import { resolveAssetPath } from "./assets";

describe("resolveAssetPath", () => {
  it("keeps local development paths at the domain root", () => {
    expect(resolveAssetPath("/audio/manifest.json", "/")).toBe(
      "/audio/manifest.json",
    );
  });

  it("prefixes GitHub Pages assets with the repository base", () => {
    expect(
      resolveAssetPath(
        "/audio/lessons/day-01-1-teaching.mp3",
        "/everyday-3-characters/",
      ),
    ).toBe(
      "/everyday-3-characters/audio/lessons/day-01-1-teaching.mp3",
    );
  });

  it("does not double-prefix or rewrite external URLs", () => {
    expect(
      resolveAssetPath(
        "/everyday-3-characters/audio/manifest.json",
        "/everyday-3-characters/",
      ),
    ).toBe("/everyday-3-characters/audio/manifest.json");
    expect(resolveAssetPath("https://example.com/audio.mp3", "/repo/")).toBe(
      "https://example.com/audio.mp3",
    );
  });
});
