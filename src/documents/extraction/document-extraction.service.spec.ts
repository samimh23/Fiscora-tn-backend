import { postgresUpdateRows } from './document-extraction.service';

describe('postgresUpdateRows', () => {
  it('unwraps TypeORM PostgreSQL UPDATE RETURNING results', () => {
    expect(postgresUpdateRows<{ id: string }>([[{ id: 'job-1' }], 1])).toEqual([
      { id: 'job-1' },
    ]);
  });

  it('does not mistake the affected count for a returned row', () => {
    expect(postgresUpdateRows([[], 0])).toEqual([]);
  });
});
