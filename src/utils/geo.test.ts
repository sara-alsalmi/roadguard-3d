import { describe, expect, it } from "vitest";
import { ROUTE_LATLON, INSPECTION_EVENTS } from "../data/route";
import { buildPolyline, pointAt, project, routeLocation, slicePath } from "./geo";
import { newDispatchSim, newInspectionSim, stepDispatch, stepInspection } from "./simModel";

const pl = buildPolyline(ROUTE_LATLON);

describe("route geometry", () => {
  it("has a plausible demo length", () => {
    expect(pl.total).toBeGreaterThan(1400);
    expect(pl.total).toBeLessThan(1800);
  });
  it("projects points back onto the route", () => {
    const p = pointAt(pl, 700);
    const r = project(pl, p.lon, p.lat);
    expect(Math.abs(r.s - 700)).toBeLessThan(0.5);
    expect(r.off).toBeLessThan(0.5);
  });
  it("lateral offsets are the requested distance from the road", () => {
    const [lon, lat] = routeLocation(pl, 500, 12);
    expect(project(pl, lon, lat).off).toBeCloseTo(12, 0);
  });
  it("slices in both directions", () => {
    expect(slicePath(pl, 100, 600).length).toBeGreaterThan(2);
    const back = slicePath(pl, 600, 100);
    expect(back[0]).toEqual([pointAt(pl, 600).lon, pointAt(pl, 600).lat]);
  });
});

describe("inspection simulation determinism", () => {
  const run = (dt: number, mult: number) => {
    let sim = newInspectionSim(pl.total);
    const log: string[] = [];
    for (let i = 0; i < 100000 && sim.s < sim.total; i++) {
      const r = stepInspection(sim, dt, mult);
      sim = r.sim;
      if (r.event) log.push(`${r.event.id}@${r.sim.s}`);
    }
    return { sim, log };
  };
  it("fires every scripted event exactly once, in order", () => {
    const { log } = run(0.05, 1);
    expect(log).toEqual(INSPECTION_EVENTS.map((e) => `${e.id}@${e.atMeters}`));
  });
  it("is repeatable", () => {
    expect(run(0.05, 2)).toEqual(run(0.05, 2));
  });
  it("speed multiplier shortens the run", () => {
    const count = (m: number) => {
      let sim = newInspectionSim(pl.total);
      let n = 0;
      while (sim.s < sim.total && n < 1e6) {
        sim = stepInspection(sim, 0.05, m).sim;
        n++;
      }
      return n;
    };
    expect(count(1) / count(4)).toBeGreaterThan(3.5);
  });
});

describe("dispatch simulation", () => {
  it("travels, works, then completes", () => {
    let d = newDispatchSim(300);
    const phases = new Set<string>();
    for (let i = 0; i < 5000 && d.phase !== "done"; i++) {
      d = stepDispatch(d, 0.1, 1, 15, 6);
      phases.add(d.phase);
    }
    expect([...phases]).toEqual(["enroute", "working", "done"]);
  });
});
