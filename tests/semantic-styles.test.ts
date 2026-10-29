import { describe, it } from "node:test";
import assert from "node:assert/strict";
import semanticStyles from "@/data/semanticStyles.json";

interface PrintConfig {
  mode: string;
  align?: string;
  face?: string;
  spacing_before?: string;
  italic?: boolean;
  indent?: string;
}

interface SemanticStyle {
  id: string;
  label: string;
  kind: "heading" | "paragraph";
  align?: "left" | "center" | "right";
  print: PrintConfig;
  description: string;
  level?: number;
  italic?: boolean;
  indent?: string;
  class?: string;
  shortcut?: string;
}

describe("Semantic Styles Registry (semanticStyles.json)", () => {
  const styles = semanticStyles as SemanticStyle[];

  it("is a valid non-empty array of style definitions", () => {
    assert.ok(Array.isArray(styles), "semanticStyles must be an array");
    assert.ok(styles.length > 0, "semanticStyles must not be empty");
  });

  it("every style object contains required properties: id, label, kind, print, description", () => {
    const validKinds = new Set(["heading", "paragraph"]);
    const validAligns = new Set(["left", "center", "right"]);

    for (const style of styles) {
      assert.ok(typeof style.id === "string" && style.id.length > 0, `Missing id on style: ${JSON.stringify(style)}`);
      assert.ok(typeof style.label === "string" && style.label.length > 0, `Missing label on style: ${style.id}`);
      assert.ok(validKinds.has(style.kind), `Invalid kind '${style.kind}' on style: ${style.id}`);
      assert.ok(typeof style.description === "string" && style.description.length > 0, `Missing description on style: ${style.id}`);

      assert.ok(typeof style.print === "object" && style.print !== null, `Missing print object on style: ${style.id}`);
      assert.ok(typeof style.print.mode === "string" && style.print.mode.length > 0, `Missing print.mode on style: ${style.id}`);

      if (style.align) {
        assert.ok(validAligns.has(style.align), `Invalid align '${style.align}' on style: ${style.id}`);
      }
      if (style.kind === "heading") {
        assert.ok(typeof style.level === "number" && style.level >= 1 && style.level <= 6, `Invalid heading level on style: ${style.id}`);
      }
    }
  });

  it("all IDs are unique lowercase kebab-case strings", () => {
    const seenIds = new Set<string>();
    const kebabCaseRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;

    for (const style of styles) {
      assert.match(style.id, kebabCaseRegex, `Style id '${style.id}' is not valid lowercase kebab-case`);
      assert.ok(!seenIds.has(style.id), `Duplicate style id found: '${style.id}'`);
      seenIds.add(style.id);
    }
  });

  it("shortcuts are unique where specified", () => {
    const seenShortcuts = new Set<string>();

    for (const style of styles) {
      if (style.shortcut && typeof style.shortcut === "string" && style.shortcut.trim().length > 0) {
        assert.ok(!seenShortcuts.has(style.shortcut), `Duplicate shortcut '${style.shortcut}' on style ${style.id}`);
        seenShortcuts.add(style.shortcut);
      }
    }
  });
});
