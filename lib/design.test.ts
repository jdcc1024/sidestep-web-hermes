import { describe, expect, it } from "vitest";
import {
  CANVA_LINK_MAX_LENGTH,
  EMPTY_DESIGN,
  JERSEY_STYLE_MAX_LENGTH,
  NECKLINES,
  SLEEVE_STYLES,
  TITLE_MAX_LENGTH,
  isHttpUrl,
  isNeckline,
  isSleeveStyle,
  toDesignPayload,
  validateDesign,
  type DesignInput,
} from "./design";
import { TEXT_BODY_MAX_LENGTH } from "./designBlock";

function validInput(overrides: Partial<DesignInput> = {}): DesignInput {
  return {
    title: "Spring season kits",
    overview: "Retro 90s look, cobalt blue with cream accents.",
    canvaLink: "",
    jerseyStyle: "",
    neckline: "",
    sleeveStyle: "",
    fileCount: 1,
    ...overrides,
  };
}

describe("validateDesign — happy path", () => {
  it("accepts a fully populated design", () => {
    expect(validateDesign(validInput())).toEqual({});
  });

  it("accepts an empty canva link (optional)", () => {
    expect(validateDesign(validInput({ canvaLink: "" }))).toEqual({});
  });

  it("accepts a valid https canva link", () => {
    expect(
      validateDesign(
        validInput({ canvaLink: "https://www.canva.com/design/abc/edit" }),
      ),
    ).toEqual({});
  });
});

describe("validateDesign — required fields", () => {
  it("flags every required field when the form is empty", () => {
    const errors = validateDesign(EMPTY_DESIGN);
    expect(errors.title).toBeTruthy();
    expect(errors.overview).toBeTruthy();
    expect(errors.fileCount).toBeTruthy();
  });

  it("rejects a whitespace-only title", () => {
    expect(validateDesign(validInput({ title: "   " })).title).toBeTruthy();
  });

  it("rejects a whitespace-only overview", () => {
    expect(validateDesign(validInput({ overview: "   " })).overview).toBeTruthy();
  });

  it("requires at least one file", () => {
    expect(
      validateDesign(validInput({ fileCount: 0 })).fileCount,
    ).toBeTruthy();
  });

  it("accepts a file count of 1", () => {
    expect(
      validateDesign(validInput({ fileCount: 1 })).fileCount,
    ).toBeUndefined();
  });
});

describe("validateDesign — length caps", () => {
  it("rejects a title over the max length", () => {
    expect(
      validateDesign(validInput({ title: "x".repeat(TITLE_MAX_LENGTH + 1) }))
        .title,
    ).toBeTruthy();
  });

  it("accepts a title at exactly the max length", () => {
    expect(
      validateDesign(validInput({ title: "x".repeat(TITLE_MAX_LENGTH) }))
        .title,
    ).toBeUndefined();
  });

  it("rejects an overview over the max length", () => {
    expect(
      validateDesign(validInput({ overview: "x".repeat(TEXT_BODY_MAX_LENGTH + 1) }))
        .overview,
    ).toBeTruthy();
  });

  it("accepts an overview at exactly the max length", () => {
    expect(
      validateDesign(validInput({ overview: "x".repeat(TEXT_BODY_MAX_LENGTH) }))
        .overview,
    ).toBeUndefined();
  });

  it("rejects a canva link over the max length", () => {
    const tooLong = "https://canva.com/" + "x".repeat(CANVA_LINK_MAX_LENGTH);
    expect(
      validateDesign(validInput({ canvaLink: tooLong })).canvaLink,
    ).toBeTruthy();
  });
});

describe("validateDesign — canva link format", () => {
  it("rejects a link without a scheme", () => {
    expect(
      validateDesign(validInput({ canvaLink: "canva.com/design/abc" }))
        .canvaLink,
    ).toBeTruthy();
  });

  it("rejects a javascript: pseudo-url", () => {
    expect(
      validateDesign(validInput({ canvaLink: "javascript:alert(1)" }))
        .canvaLink,
    ).toBeTruthy();
  });

  it("rejects garbled text", () => {
    expect(
      validateDesign(validInput({ canvaLink: "not a url at all" }))
        .canvaLink,
    ).toBeTruthy();
  });

  it("accepts plain http://", () => {
    expect(
      validateDesign(validInput({ canvaLink: "http://canva.com/design/abc" }))
        .canvaLink,
    ).toBeUndefined();
  });
});

describe("isHttpUrl", () => {
  it.each([
    "https://canva.com/design/abc",
    "http://example.com",
    "https://sub.example.co.uk/path?q=1",
  ])("accepts %s", (value) => {
    expect(isHttpUrl(value)).toBe(true);
  });

  it.each([
    "canva.com",
    "ftp://example.com",
    "javascript:alert(1)",
    "",
    "   ",
    "not a url",
  ])("rejects %s", (value) => {
    expect(isHttpUrl(value)).toBe(false);
  });
});

describe("silhouette spec allowlists", () => {
  it("NECKLINES has the expected members", () => {
    expect(NECKLINES).toEqual(["Crew Neck", "V-Neck"]);
  });

  it("SLEEVE_STYLES has the expected members", () => {
    expect(SLEEVE_STYLES).toEqual(["Regular", "Raglan"]);
  });

  it("caps jersey style at 120 characters", () => {
    expect(JERSEY_STYLE_MAX_LENGTH).toBe(120);
  });

  it("isNeckline accepts every member of NECKLINES", () => {
    for (const value of NECKLINES) expect(isNeckline(value)).toBe(true);
  });

  it("isNeckline rejects anything else", () => {
    expect(isNeckline("")).toBe(false);
    expect(isNeckline("Boat Neck")).toBe(false);
  });

  it("isSleeveStyle accepts every member of SLEEVE_STYLES", () => {
    for (const value of SLEEVE_STYLES) expect(isSleeveStyle(value)).toBe(true);
  });

  it("isSleeveStyle rejects anything else", () => {
    expect(isSleeveStyle("")).toBe(false);
    expect(isSleeveStyle("Sleeveless")).toBe(false);
  });
});

describe("validateDesign — silhouette specs (optional)", () => {
  it("accepts a design with no specs set", () => {
    expect(validateDesign(validInput())).toEqual({});
  });

  it("accepts valid specs", () => {
    expect(
      validateDesign(
        validInput({
          jerseyStyle: "Soccer jersey",
          neckline: "Crew Neck",
          sleeveStyle: "Raglan",
        }),
      ),
    ).toEqual({});
  });

  it("rejects a jersey style over the length cap", () => {
    expect(
      validateDesign(
        validInput({ jerseyStyle: "x".repeat(JERSEY_STYLE_MAX_LENGTH + 1) }),
      ).jerseyStyle,
    ).toBeTruthy();
  });

  it("accepts a jersey style at exactly the max length", () => {
    expect(
      validateDesign(
        validInput({ jerseyStyle: "x".repeat(JERSEY_STYLE_MAX_LENGTH) }),
      ).jerseyStyle,
    ).toBeUndefined();
  });

  it("rejects a neckline outside the allowlist", () => {
    expect(
      validateDesign(validInput({ neckline: "Turtle" })).neckline,
    ).toBeTruthy();
  });

  it("rejects a sleeve style outside the allowlist", () => {
    expect(
      validateDesign(validInput({ sleeveStyle: "Sleeveless" })).sleeveStyle,
    ).toBeTruthy();
  });
});

describe("toDesignPayload — silhouette specs", () => {
  it("omits specs when blank", () => {
    const payload = toDesignPayload(validInput());
    expect(payload).not.toHaveProperty("jerseyStyle");
    expect(payload).not.toHaveProperty("neckline");
    expect(payload).not.toHaveProperty("sleeveStyle");
  });

  it("trims and includes specs when present", () => {
    const payload = toDesignPayload(
      validInput({
        jerseyStyle: "  Hockey jersey  ",
        neckline: "V-Neck",
        sleeveStyle: "Regular",
      }),
    );
    expect(payload.jerseyStyle).toBe("Hockey jersey");
    expect(payload.neckline).toBe("V-Neck");
    expect(payload.sleeveStyle).toBe("Regular");
  });
});

describe("toDesignPayload", () => {
  it("trims whitespace from all string fields", () => {
    const payload = toDesignPayload(
      validInput({ title: "  Kits  ", overview: "  overview here  " }),
    );
    expect(payload.title).toBe("Kits");
    expect(payload.overview).toBe("overview here");
  });

  it("omits canvaLink when blank", () => {
    expect(
      toDesignPayload(validInput({ canvaLink: "" })).canvaLink,
    ).toBeUndefined();
  });

  it("omits canvaLink when whitespace only", () => {
    expect(
      toDesignPayload(validInput({ canvaLink: "   " })).canvaLink,
    ).toBeUndefined();
  });

  it("includes canvaLink when present", () => {
    expect(
      toDesignPayload(
        validInput({ canvaLink: "  https://canva.com/design/abc  " }),
      ).canvaLink,
    ).toBe("https://canva.com/design/abc");
  });
});
