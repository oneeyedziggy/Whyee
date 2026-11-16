import type { PreparedCorrelation } from '../src/lib/correlationKernel';
import type { CorrelationRequest } from '../src/types/correlation';

type Posted = Record<string, unknown> & { requestId: number };
type Handler = (event: { data: unknown }) => void;

const scope = globalThis as unknown as {
  onmessage: Handler | null;
  postMessage: (message: unknown) => void;
};

type Send = (event: { data: unknown }) => Posted[];

const loadWorker = (): Send => {
  const saved = { onmessage: scope.onmessage, postMessage: scope.postMessage };
  const responses: Posted[] = [];
  let handler!: Handler;
  jest.isolateModules(() => {
    require('../src/workers/correlationWorker.web');
    handler = scope.onmessage as Handler;
  });
  scope.onmessage = saved.onmessage;
  return (event) => {
    scope.postMessage = (message) => responses.push(message as Posted);
    try {
      handler(event);
    } finally {
      scope.postMessage = saved.postMessage;
    }
    return responses.splice(0);
  };
};

const request: CorrelationRequest = {
  categories: [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
  ],
  records: [
    { categoryId: 'a', dateKey: '2026-01-01', value: 1 },
    { categoryId: 'a', dateKey: '2026-01-02', value: 4 },
    { categoryId: 'a', dateKey: '2026-01-03', value: 9 },
    { categoryId: 'b', dateKey: '2026-01-01', value: 2 },
    { categoryId: 'b', dateKey: '2026-01-02', value: 5 },
    { categoryId: 'b', dateKey: '2026-01-03', value: 30 },
  ],
  offsets: [0],
};

describe('correlation web worker script', () => {
  it('prepares, installs, and computes ranges for the active generation', () => {
    const send = loadWorker();
    const [prepared] = send({
      data: { type: 'prepare', requestId: 1, generation: 1, request },
    });
    expect(prepared).toMatchObject({ type: 'prepared', requestId: 1 });
    expect(prepared.prepared).toMatchObject({ offsets: [0] });

    expect(
      send({
        data: { type: 'compute', requestId: 2, generation: 1, start: 0, end: 2 },
      }),
    ).toEqual([
      {
        type: 'result',
        requestId: 2,
        cells: [
          expect.objectContaining({ leftCategoryId: 'a', rightCategoryId: 'b' }),
          expect.objectContaining({ leftCategoryId: 'b', rightCategoryId: 'a' }),
        ],
      },
    ]);

    const other = loadWorker();
    expect(
      other({
        data: {
          type: 'install',
          requestId: 3,
          generation: 1,
          prepared: prepared.prepared,
        },
      }),
    ).toEqual([{ type: 'installed', requestId: 3 }]);
    expect(
      other({
        data: { type: 'compute', requestId: 4, generation: 1, start: 1, end: 9 },
      })[0].cells,
    ).toHaveLength(1);
  });

  it('reports an error when nothing or another generation is installed', () => {
    const send = loadWorker();
    const compute = { type: 'compute', requestId: 5, generation: 2, start: 0, end: 1 };
    const replaced = {
      type: 'error',
      requestId: 5,
      message: 'Correlation worker generation was replaced',
    };
    expect(send({ data: compute })).toEqual([replaced]);
    send({ data: { type: 'prepare', requestId: 6, generation: 1, request } });
    expect(send({ data: compute })).toEqual([replaced]);
  });

  it('reports thrown errors and non-error values as error messages', () => {
    const send = loadWorker();
    expect(
      send({ data: { type: 'prepare', requestId: 7, generation: 1, request: null } }),
    ).toEqual([
      expect.objectContaining({ type: 'error', requestId: 7, message: expect.any(String) }),
    ]);

    const throwing = {
      get pairs(): PreparedCorrelation['pairs'] {
        throw 'pairs unavailable';
      },
    };
    send({ data: { type: 'install', requestId: 8, generation: 3, prepared: throwing } });
    expect(
      send({ data: { type: 'compute', requestId: 9, generation: 3, start: 0, end: 1 } }),
    ).toEqual([{ type: 'error', requestId: 9, message: 'pairs unavailable' }]);
  });
});
