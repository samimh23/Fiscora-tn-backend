import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The running API only executes the migrations listed in AppModule, while the
 * CLI (`npm run migration:run`) finds every file. A file missing from the list
 * passes local checks but never runs on staging or production.
 */
describe('database migrations', () => {
  it('registers every migration file in AppModule', () => {
    const directory = join(__dirname, 'migrations');
    const appModule = readFileSync(
      join(__dirname, '..', 'app.module.ts'),
      'utf8',
    );
    const missing = readdirSync(directory)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
      .map((file) => {
        const source = readFileSync(join(directory, file), 'utf8');
        const className = /export class (\w+)/.exec(source)?.[1];
        return { file, className };
      })
      .filter(
        ({ className }) =>
          !className ||
          !new RegExp(`^\\s+${className},?$`, 'm').test(appModule),
      )
      .map(({ file }) => file);
    expect(missing).toEqual([]);
  });
});
