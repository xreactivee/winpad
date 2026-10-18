import { describe, expect, it } from "vitest";
import type { App } from "./api";
import { categorize, libraryGroups } from "./categories";

describe("categorize", () => {
  it("maps well-known apps", () => {
    expect(categorize("Visual Studio Code")).toBe("developer");
    expect(categorize("Spotify")).toBe("music");
    expect(categorize("WhatsApp")).toBe("social");
    expect(categorize("Adobe Photoshop 2025")).toBe("graphics");
    expect(categorize("Fotoğraflar")).toBe("photo");
    expect(categorize("ChatGPT")).toBe("productivity");
    expect(categorize("Google Chrome")).toBe("reading");
    expect(categorize("Steam")).toBe("entertainment");
    expect(categorize("Hesap Makinesi")).toBe("utilities");
    expect(categorize("Some Unknown Tool")).toBe("other");
  });

  it("matches short keywords only as whole words", () => {
    expect(categorize("Unicode Explorer")).toBe("utilities");
    expect(categorize("Gitar Akor")).toBe("other");
  });

  it("honours user overrides", () => {
    expect(categorize("Spotify", { sp: "social" }, "sp")).toBe("social");
  });
});

describe("libraryGroups", () => {
  const app = (name: string): App => ({ id: name, name, target: null, icon: null });
  const apps = ["Spotify", "Steam", "Zoom", "Secret"].map(app);

  it("lists recent apps first, then categories, then hidden apps", () => {
    const groups = libraryGroups(apps, ["Steam", "Secret", "gone"], ["Secret"], {});
    expect(groups.map((g) => g.key)).toEqual(["recent", "music", "entertainment", "social", "hidden"]);
    expect(groups[0].apps.map((a) => a.id)).toEqual(["Steam"]);
    expect(groups.at(-1)!.apps.map((a) => a.id)).toEqual(["Secret"]);
  });
});
