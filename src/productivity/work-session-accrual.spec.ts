import { WorkSession, WorkSessionStatus } from '../database/entities';
import { ProductivityService } from './productivity.service';

describe('Work session pause accrual', () => {
  const service = Object.create(
    ProductivityService.prototype,
  ) as ProductivityService;
  const session = () =>
    ({
      status: WorkSessionStatus.Active,
      activeSeconds: 30,
      inactiveSeconds: 0,
      heartbeatCount: 1,
      idleTimeoutSeconds: 120,
      lastHeartbeatAtUtc: new Date('2026-09-30T12:00:00Z'),
    }) as WorkSession;
  it('keeps the active partial interval before a manual pause', () => {
    const item = session();
    service['accrueSession'](
      item,
      new Date('2026-09-30T12:00:16Z'),
      false,
      true,
    );
    expect(item.activeSeconds).toBe(46);
    expect(item.inactiveSeconds).toBe(0);
    expect(item.status).toBe(WorkSessionStatus.Paused);
  });
  it('still excludes inactivity and long missing-heartbeat gaps', () => {
    for (const [elapsed, active, manual] of [
      [16, false, false],
      [221, false, true],
      [221, true, false],
    ] as const) {
      const item = session();
      service['accrueSession'](
        item,
        new Date(item.lastHeartbeatAtUtc.getTime() + elapsed * 1000),
        active,
        manual,
      );
      expect(item.activeSeconds).toBe(30);
      expect(item.inactiveSeconds).toBe(elapsed);
    }
  });
  it('does not count the paused interval when resuming', () => {
    const item = session();
    item.status = WorkSessionStatus.Paused;
    service['accrueSession'](item, new Date('2026-09-30T12:00:20Z'), true);
    expect(item.activeSeconds).toBe(30);
    expect(item.inactiveSeconds).toBe(20);
    expect(item.status).toBe(WorkSessionStatus.Active);
  });
});
