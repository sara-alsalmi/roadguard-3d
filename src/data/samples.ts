import { asset } from "../utils/asset";
import type { Annotation, IncidentClass } from "../types";

/** Illustrative demo images (generated SVG illustrations, NOT dataset photographs). */
export interface DemoSample {
  id: string;
  cls: IncidentClass;
  url: string;
  label: string;
  /** Manually authored demo annotations - NOT model predictions. */
  annotations: Annotation[];
}

export const SAMPLES: DemoSample[] = [
  {
    id: "sample-pothole",
    cls: "pothole",
    url: asset("demo/pothole.svg"),
    label: "Demo illustration · pothole",
    annotations: [{ cls: "pothole", bbox: [0.425, 0.7125, 0.2167, 0.125], source: "demo" }],
  },
  {
    id: "sample-barrier",
    cls: "barrier",
    url: asset("demo/barrier.svg"),
    label: "Demo illustration · excavation barrier",
    annotations: [{ cls: "barrier", bbox: [0.275, 0.5875, 0.4167, 0.15], source: "demo" }],
  },
  {
    id: "sample-sidewalk",
    cls: "sidewalk",
    url: asset("demo/sidewalk.svg"),
    label: "Demo illustration · dilapidated sidewalk",
    annotations: [{ cls: "sidewalk", bbox: [0.2984, 0.5651, 0.5899, 0.2919], source: "demo" }],
  },
];

export const sampleById = (id: string) => SAMPLES.find((s) => s.id === id);

/**
 * Optional real test images: drop files into public/test-images and describe them in manifest.json.
 * Entries replace the generated demo illustration of the same class (see public/test-images/README.txt).
 */
export interface TestImageEntry {
  cls: IncidentClass;
  image: string;
  label?: string;
  annotations?: Annotation[];
}

export async function loadTestImages(): Promise<number> {
  try {
    const res = await fetch(asset("test-images/manifest.json"), { cache: "no-store" });
    if (!res.ok) return 0;
    const { images } = (await res.json()) as { images: TestImageEntry[] };
    let n = 0;
    for (const e of images ?? []) {
      const sample = SAMPLES.find((x) => x.cls === e.cls);
      if (!sample || !e.image) continue;
      sample.url = e.image.startsWith("/") ? asset(e.image) : asset("test-images/" + e.image);
      sample.label = e.label ?? "Test image";
      if (e.annotations) sample.annotations = e.annotations;
      n++;
    }
    return n;
  } catch {
    return 0;
  }
}
