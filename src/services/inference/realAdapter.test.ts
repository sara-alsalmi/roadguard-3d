import { describe, expect, it } from "vitest";
import { demoAdapter } from "./demoAdapter";
import { normaliseClass, parsePredictResponse } from "./realAdapter";

describe("real adapter response parsing", () => {
  it("normalises bboxes and passes real confidence through", () => {
    const r = parsePredictResponse({
      image_width: 1000,
      image_height: 500,
      detections: [{ class_name: "Potholes", bbox: [100, 50, 300, 250], confidence: 0.87 }],
      annotated_image: "data:image/jpeg;base64,AAA",
    });
    expect(r.adapter).toBe("real");
    expect(r.detections[0]).toMatchObject({ cls: "pothole", source: "model", confidence: 0.87 });
    expect(r.detections[0].bbox).toEqual([0.1, 0.1, 0.2, 0.4]);
    expect(r.annotatedImageUrl).toBe("data:image/jpeg;base64,AAA");
  });
  it("drops classes the app does not manage", () => {
    const r = parsePredictResponse({ image_width: 10, image_height: 10, detections: [{ class_name: "car", bbox: [0, 0, 5, 5], confidence: 0.9 }] });
    expect(r.detections).toHaveLength(0);
    expect(normaliseClass("Excavation Barriers")).toBe("barrier");
  });
});

describe("demo adapter", () => {
  it("never fabricates confidence", async () => {
    const r = await demoAdapter.predict({ kind: "sample", sampleId: "sample-pothole" });
    expect(r.detections.every((d) => d.confidence === undefined && d.source === "demo")).toBe(true);
    expect(r.disclosure).toMatch(/Demo/i);
  });
  it("refuses to pretend to analyse an uploaded file", async () => {
    await expect(demoAdapter.predict({ kind: "file", file: new File(["x"], "a.jpg") })).rejects.toThrow(/no model/i);
  });
});
