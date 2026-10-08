import { expect, test } from "bun:test";
import { DOOR, PY, mortselGround } from "./mortsel";

test("the street, the platforms, and the stairs between them", () => {
  expect(mortselGround(DOOR.x, DOOR.z - 1, 0)).toBe(0); // at the front door
  expect(mortselGround(-6, -40, PY)).toBe(PY); // perron 2
  expect(mortselGround(6, -10, PY)).toBe(PY); // perron 1
  // the stairs climb from the platform (south) to the station building (north)
  expect(mortselGround(8.3, -21, PY)).toBeCloseTo(PY);
  expect(mortselGround(8.3, -27, PY / 2)).toBeCloseTo(PY / 2);
  expect(mortselGround(8.3, -33, 0)).toBeCloseTo(0);
  expect(mortselGround(8.3, -34, 0)).toBe(0); // and on into the building
});

test("no walking on the tracks, into the cutting, or off the stairs", () => {
  expect(mortselGround(0, -30, PY)).toBeNull(); // the tracks
  expect(mortselGround(2, -30, PY - 0.85)).toBeNull();
  expect(mortselGround(0, -60, 0)).toBeNull(); // over the open cutting
  expect(mortselGround(8.3, -27, 0)).toBeNull(); // into the stairwell from up top
  expect(mortselGround(8.3, -27, PY)).toBeNull(); // (under the stairs: solid)
  expect(mortselGround(6, -75, PY)).toBeNull(); // past the end of the platform
});

test("walking up the stairs from the platform, and down again", () => {
  for (const x of [-8.3, 8.3]) {
    let y = PY;
    for (let z = -19; z >= -35; z -= 0.06) {
      const g = mortselGround(x, z, y);
      expect(g).not.toBeNull();
      y = g!;
    }
    expect(y).toBe(0); // up in the station building
    for (let z = -35; z <= -19; z += 0.06) y = mortselGround(x, z, y)!;
    expect(y).toBe(PY); // back on the platform
  }
});
