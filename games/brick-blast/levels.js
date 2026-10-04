// Brick Blast levels. 9 columns. Legend:
//  .  empty      1  normal (1 hit)     2  strong (2 hits)
//  #  unbreakable (never needs to be destroyed)      B  bonus brick (always drops a power-up)
export const LEVELS = [
  { name: 'Warm-up', rows: [
    '111111111',
    '1B11111B1',
    '111111111',
    '.1111111.',
  ] },
  { name: 'Pyramid', rows: [
    '....1....',
    '...111...',
    '..12B21..',
    '.1222221.',
    '111111111',
  ] },
  { name: 'Checkerboard', rows: [
    '#1.1.1.1#',
    '#.2.2.2.#',
    '#1.1B1.1#',
    '#.2.2.2.#',
    '#1.1.1.1#',
  ] },
  { name: 'Fortress', rows: [
    '#...B...#',
    '#2#####2#',
    '#2.....2#',
    '#2.111.2#',
    '#2#####2#',
    '..11111..',
  ] },
  { name: 'Invader', rows: [
    '.#.....#.',
    '..#...#..',
    '.1111111.',
    '11.111.11',
    '111B1B111',
    '1.11111.1',
    '1.1...1.1',
    '...2.2...',
  ] },
  { name: 'Gauntlet', rows: [
    '2B22222B2',
    '#.#.#.#.#',
    '.2.2.2.2.',
    '#.#.#.#.#',
    '2.2.B.2.2',
    '111111111',
    '2.......2',
  ] },
];
