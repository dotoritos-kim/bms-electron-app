/**
 * laneConfig 유닛 테스트
 * 12개 키 모드 각각의 레인 구성(개수, ID, 폭, 색상, 스크래치)을 검증한다.
 */
import { generateLaneConfig, getLaneIds, getDpSplitIndex } from '@rhythm-archive/bms-editor';
// getLaneBackground is not exported from package index, import directly
import { getLaneBackground } from '../../../bms-editor/src/chart/laneConfig';
import type { KeyMode } from '../../../bms-editor/src/chart/NoteChartViewer';

describe('generateLaneConfig', () => {
  const EXPECTED: Record<
    KeyMode,
    {
      laneCount: number;
      laneIds: string[];
      scratchLanes: string[];
      laneWidth: number;
      scratchWidth: number;
    }
  > = {
    '4K': {
      laneCount: 7,
      laneIds: ['SC', '1', '2', '4', '5', 'FZ', 'BGM'],
      scratchLanes: ['SC'],
      laneWidth: 35,
      scratchWidth: 35,
    },
    '5K': {
      laneCount: 8,
      laneIds: ['SC', '1', '2', '3', '4', '5', 'FZ', 'BGM'],
      scratchLanes: ['SC'],
      laneWidth: 31,
      scratchWidth: 35,
    },
    '6K': {
      laneCount: 9,
      laneIds: ['SC', '1', '2', '3', '5', '6', '7', 'FZ', 'BGM'],
      scratchLanes: ['SC'],
      laneWidth: 28,
      scratchWidth: 31,
    },
    '7K': {
      laneCount: 10,
      laneIds: ['SC', '1', '2', '3', '4', '5', '6', '7', 'FZ', 'BGM'],
      scratchLanes: ['SC'],
      laneWidth: 25,
      scratchWidth: 31,
    },
    '8K': {
      laneCount: 9,
      laneIds: ['1', '2', '3', '4', '5', '6', '7', '8', 'BGM'],
      scratchLanes: [],
      laneWidth: 25,
      scratchWidth: 0,
    },
    '9K': {
      laneCount: 10,
      laneIds: ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'BGM'],
      scratchLanes: [],
      laneWidth: 24,
      scratchWidth: 0,
    },
    '10K': {
      laneCount: 13,
      laneIds: ['SC', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'SC2', 'BGM'],
      scratchLanes: ['SC', 'SC2'],
      laneWidth: 18,
      scratchWidth: 28,
    },
    '12K': {
      laneCount: 13,
      laneIds: [...Array.from({ length: 12 }, (_, i) => (i + 1).toString()), 'BGM'],
      scratchLanes: [],
      laneWidth: 18,
      scratchWidth: 0,
    },
    '14K': {
      laneCount: 19,
      laneIds: ['SC', '1', '2', '3', '4', '5', '6', '7', 'FZ', '8', '9', '10', '11', '12', '13', '14', 'FZ2', 'SC2', 'BGM'],
      scratchLanes: ['SC', 'SC2'],
      laneWidth: 14,
      scratchWidth: 25,
    },
    '18K': {
      laneCount: 19,
      laneIds: [...Array.from({ length: 18 }, (_, i) => (i + 1).toString()), 'BGM'],
      scratchLanes: [],
      laneWidth: 13,
      scratchWidth: 0,
    },
    '24K': {
      laneCount: 25,
      laneIds: [...Array.from({ length: 24 }, (_, i) => (i + 1).toString()), 'BGM'],
      scratchLanes: [],
      laneWidth: 10,
      scratchWidth: 0,
    },
    '48K': {
      laneCount: 49,
      laneIds: [...Array.from({ length: 48 }, (_, i) => (i + 1).toString()), 'BGM'],
      scratchLanes: [],
      laneWidth: 5,
      scratchWidth: 0,
    },
  };

  const modes = Object.keys(EXPECTED) as KeyMode[];

  describe.each(modes)('%s mode', (mode) => {
    const expected = EXPECTED[mode];

    it(`generates ${expected.laneCount} lanes`, () => {
      const lanes = generateLaneConfig(mode);
      expect(lanes).toHaveLength(expected.laneCount);
    });

    it('has correct lane IDs in order', () => {
      const lanes = generateLaneConfig(mode);
      const ids = lanes.map((l) => l.id);
      expect(ids).toEqual(expected.laneIds);
    });

    it('has correct scratch lane flags', () => {
      const lanes = generateLaneConfig(mode);
      const scratches = lanes.filter((l) => l.isScratch).map((l) => l.id);
      expect(scratches).toEqual(expected.scratchLanes);
    });

    it('has correct lane widths', () => {
      const lanes = generateLaneConfig(mode);
      for (const lane of lanes) {
        if (lane.isBgm) continue; // BGM lane has fixed width (30)
        if (lane.isScratch) {
          expect(lane.width).toBe(expected.scratchWidth);
        } else {
          expect(lane.width).toBe(expected.laneWidth);
        }
      }
    });

    it('has monotonically increasing x positions', () => {
      const lanes = generateLaneConfig(mode);
      for (let i = 1; i < lanes.length; i++) {
        expect(lanes[i].x).toBeGreaterThan(lanes[i - 1].x);
      }
    });

    it('total width equals sum of lane widths plus gaps', () => {
      const lanes = generateLaneConfig(mode);
      const lastLane = lanes[lanes.length - 1];
      // lastLane.x + lastLane.width = total occupied width including gaps
      const totalOccupied = lastLane.x + lastLane.width;
      expect(totalOccupied).toBeGreaterThan(0);
      // All lane widths sum should be <= total (gaps add extra space)
      const sumWidths = lanes.reduce((sum, l) => sum + l.width, 0);
      expect(totalOccupied).toBeGreaterThanOrEqual(sumWidths);
    });

    it('all lanes have valid hex color strings', () => {
      const lanes = generateLaneConfig(mode);
      for (const lane of lanes) {
        expect(lane.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });

    it('has correct originalIndex for each lane', () => {
      const lanes = generateLaneConfig(mode);
      lanes.forEach((lane, i) => {
        expect(lane.originalIndex).toBe(i);
      });
    });
  });
});

describe('getLaneIds', () => {
  it('returns lane ID array matching generateLaneConfig (excluding BGM)', () => {
    const modes: KeyMode[] = ['5K', '7K', '14K', '48K'];
    for (const mode of modes) {
      const ids = getLaneIds(mode);
      const lanes = generateLaneConfig(mode).filter((l) => !l.isBgm);
      expect(ids).toEqual(lanes.map((l) => l.id));
    }
  });
});

describe('getLaneBackground', () => {
  it('returns dark purple for scratch lanes', () => {
    const lanes = generateLaneConfig('7K');
    const scratchLane = lanes.find((l) => l.id === 'SC')!;
    expect(getLaneBackground(scratchLane)).toBe('#2a1a2a');
  });

  it('returns blended color for regular lanes', () => {
    const lanes = generateLaneConfig('7K');
    const lane1 = lanes.find((l) => l.id === '1')!; // white #ffffff
    const bg = getLaneBackground(lane1);
    expect(bg).toMatch(/^#[0-9a-f]{6}$/);
    // Should be brighter than base (#1a1a30) due to white blending
    const r = parseInt(bg.slice(1, 3), 16);
    expect(r).toBeGreaterThan(0x1a);
  });

  it('returns different backgrounds for different lane colors', () => {
    const lanes = generateLaneConfig('7K');
    const whiteLane = lanes.find((l) => l.id === '1')!; // #ffffff
    const blueLane = lanes.find((l) => l.id === '2')!; // #3399ff
    expect(getLaneBackground(whiteLane)).not.toBe(getLaneBackground(blueLane));
  });
});

describe('key mode specific properties', () => {
  it('4K skips columns 3, 6, 7', () => {
    const ids = getLaneIds('4K');
    expect(ids).not.toContain('3');
    expect(ids).not.toContain('6');
    expect(ids).not.toContain('7');
  });

  it('6K skips column 4', () => {
    const ids = getLaneIds('6K');
    expect(ids).not.toContain('4');
    expect(ids).toContain('1');
    expect(ids).toContain('5');
  });

  it('8K and 9K have no scratch lanes', () => {
    expect(generateLaneConfig('8K').some((l) => l.isScratch)).toBe(false);
    expect(generateLaneConfig('9K').some((l) => l.isScratch)).toBe(false);
  });

  it('DP modes have SC2 (10K, 14K)', () => {
    expect(getLaneIds('10K')).toContain('SC2');
    expect(getLaneIds('14K')).toContain('SC2');
  });

  it('14K has FZ and FZ2 pedal lanes', () => {
    const ids = getLaneIds('14K');
    expect(ids).toContain('FZ');
    expect(ids).toContain('FZ2');
  });

  it('48K total width is 270px (48 * 5 + BGM 30)', () => {
    const lanes = generateLaneConfig('48K');
    const totalWidth = lanes.reduce((sum, l) => sum + l.width, 0);
    expect(totalWidth).toBe(270);
  });

  it('24K total width is 270px (24 * 10 + BGM 30)', () => {
    const lanes = generateLaneConfig('24K');
    const totalWidth = lanes.reduce((sum, l) => sum + l.width, 0);
    expect(totalWidth).toBe(270);
  });
});

describe('getDpSplitIndex', () => {
  it('returns null for SP and extended keyboard modes', () => {
    const nonDpModes: KeyMode[] = ['4K', '5K', '6K', '7K', '8K', '9K', '24K', '48K'];
    for (const mode of nonDpModes) {
      expect(getDpSplitIndex(mode)).toBeNull();
    }
  });

  it('returns correct split index for DP modes', () => {
    expect(getDpSplitIndex('10K')).toBe(6);
    expect(getDpSplitIndex('12K')).toBe(6);
    expect(getDpSplitIndex('14K')).toBe(9);
    expect(getDpSplitIndex('18K')).toBe(9);
  });

  it('split index is within lane array bounds', () => {
    const dpModes: KeyMode[] = ['10K', '12K', '14K', '18K'];
    for (const mode of dpModes) {
      const lanes = generateLaneConfig(mode);
      const splitIndex = getDpSplitIndex(mode);
      expect(splitIndex).not.toBeNull();
      expect(splitIndex!).toBeGreaterThan(0);
      expect(splitIndex!).toBeLessThan(lanes.length);
    }
  });
});
