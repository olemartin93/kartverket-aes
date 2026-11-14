import { describe, expect, it } from "vitest";
import { findScenario } from "../../src/data/scenarios";
import { project, sceneGeometry, scenarioBbox } from "../../scripts/geo";
import {
  coverageUrl,
  isSeaValue,
  isTiff,
  parseCoverageNames,
  parseTideResponse,
  pickDtmCoverage,
  tideUrl,
  toRegularSeries,
} from "../../scripts/kartverket";

const CAPS = `<?xml version="1.0"?>
<WCS_Capabilities xmlns="http://www.opengis.net/wcs" version="1.0.0">
 <ContentMetadata>
  <CoverageOfferingBrief><name>nhm_dom_topo_25833</name><label>DOM</label></CoverageOfferingBrief>
  <CoverageOfferingBrief>
    <description>Terrengmodell</description>
    <name>nhm_dtm_topo_25833</name><label>DTM</label>
  </CoverageOfferingBrief>
 </ContentMetadata>
</WCS_Capabilities>`;

const TIDE = `<?xml version="1.0" encoding="UTF-8"?>
<tide>
 <locationdata>
  <location name="ÅLESUND" code="AES" latitude="62.469414" longitude="6.151946" delay="0" factor="1.00" obsname="ÅLESUND" obscode="AES" descr="Tidal prediction for given position"/>
  <reflevelcode>NN2000</reflevelcode>
  <data type="prediction" unit="cm">
   <waterlevel value="-35.2" time="2026-11-14T00:00:00+00:00" flag="pre"/>
   <waterlevel value="12.0" time="2026-11-14T01:00:00+00:00" flag="pre"/>
   <waterlevel value="58.9" time="2026-11-14T02:00:00+00:00" flag="pre"/>
  </data>
 </locationdata>
</tide>`;

describe("WCS helpers", () => {
  it("lists coverages and picks the terrain model (DTM), not the surface model", () => {
    const names = parseCoverageNames(CAPS);
    expect(names).toEqual(["nhm_dom_topo_25833", "nhm_dtm_topo_25833"]);
    expect(pickDtmCoverage(names)).toBe("nhm_dtm_topo_25833");
    expect(pickDtmCoverage(["foo"])).toBeUndefined();
  });

  it("builds an HTTPS GetCoverage URL on Kartverket's Geonorge WCS", () => {
    const url = new URL(coverageUrl("nhm_dtm_topo_25833", [1, 2, 3, 4], 10, 20, "GeoTIFF"));
    expect(url.protocol).toBe("https:");
    expect(url.host).toBe("wcs.geonorge.no");
    expect(url.searchParams.get("request")).toBe("GetCoverage");
    expect(url.searchParams.get("bbox")).toBe("1,2,3,4");
    expect(url.searchParams.get("crs")).toBe("EPSG:25833");
  });

  it("classifies sea cells (0 m water surface or no-data) and keeps land", () => {
    expect(isSeaValue(0, -32767)).toBe(true);
    expect(isSeaValue(-0.4, null)).toBe(true);
    expect(isSeaValue(-32767, -32767)).toBe(true);
    expect(isSeaValue(Number.NaN, null)).toBe(true);
    expect(isSeaValue(-3.4e38, null)).toBe(true);
    expect(isSeaValue(0.3, -32767)).toBe(false);
    expect(isSeaValue(189, null)).toBe(false);
  });

  it("recognises TIFF magic bytes and rejects XML errors", () => {
    expect(isTiff(new Uint8Array([0x49, 0x49, 42, 0]))).toBe(true);
    expect(isTiff(new Uint8Array([0x4d, 0x4d, 0, 42]))).toBe(true);
    expect(isTiff(new TextEncoder().encode("<ServiceExceptionReport>"))).toBe(false);
  });
});

describe("tide API helpers", () => {
  it("requests NN2000 predictions in UTC from vannstand.kartverket.no", () => {
    const url = new URL(tideUrl(62.47, 6.15, new Date("2026-11-14T00:00:00Z"), new Date("2026-11-15T00:00:00Z"), 60));
    expect(url.host).toBe("vannstand.kartverket.no");
    expect(url.searchParams.get("refcode")).toBe("NN2000");
    expect(url.searchParams.get("datatype")).toBe("PRE");
    expect(url.searchParams.get("fromtime")).toBe("2026-11-14T00:00");
    expect(url.searchParams.get("tzone")).toBe("0");
  });

  it("parses water levels and station info", () => {
    const r = parseTideResponse(TIDE);
    expect(r.reference).toBe("NN2000");
    expect(r.station).toEqual({ name: "ÅLESUND", code: "AES", lat: 62.469414, lon: 6.151946 });
    expect(r.levels.map((l) => l.cm)).toEqual([-35.2, 12, 58.9]);
  });

  it("surfaces API errors", () => {
    expect(() => parseTideResponse("<tide><error>Bad request</error></tide>")).toThrow(/Bad request/);
  });

  it("builds a regular series and detects gaps", () => {
    const levels = parseTideResponse(TIDE).levels;
    expect(toRegularSeries(levels, 60).values).toEqual([-35.2, 12, 58.9]);
    expect(() => toRegularSeries([levels[0]!, levels[2]!], 60)).toThrow(/gap/);
  });
});

describe("projection", () => {
  it("projects Ålesund into EPSG:25833 (UTM 33N)", () => {
    const [e, n] = project(findScenario("alesund").city);
    expect(e).toBeGreaterThan(40_000);
    expect(e).toBeLessThan(50_000);
    expect(n).toBeGreaterThan(6_955_000);
    expect(n).toBeLessThan(6_961_000);
  });

  it("puts Aksla east of the city centre and the wave origin to the north-west (negative z)", () => {
    const s = findScenario("alesund");
    const g = sceneGeometry(s, scenarioBbox(s));
    expect(g.checks[0]!.x).toBeGreaterThan(g.city.x);
    expect(g.waveOrigin.z).toBeLessThan(g.city.z);
    expect(g.waveOrigin.x).toBeLessThan(g.city.x);
  });

  it("snaps scenario bboxes to the cell size", () => {
    for (const id of ["alesund", "geiranger", "lofoten"]) {
      const s = findScenario(id);
      const b = scenarioBbox(s);
      for (const v of b) expect(v % s.cellSize).toBe(0);
      expect(b[2]).toBeGreaterThan(b[0]);
    }
  });
});
