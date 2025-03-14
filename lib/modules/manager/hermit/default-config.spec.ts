import { minimatch } from '../../../util/minimatch';
import { matchRegexOrGlobList } from '../../../util/string-match';
import { defaultConfig } from './default-config';
import { regexMatches } from '~test/util';

describe('modules/manager/hermit/default-config', () => {
  describe('excludeCommitPaths', () => {
    function miniMatches(target: string, patterns: string[]): boolean {
      return patterns.some((patt: string) => {
        return minimatch(patt, { dot: true }).match(target);
      });
    }

    it.each`
      path                          | expected
      ${'bin/hermit'}               | ${true}
      ${'gradle/bin/hermit'}        | ${true}
      ${'nested/module/bin/hermit'} | ${true}
      ${'nested/testbin/hermit'}    | ${false}
      ${'other'}                    | ${false}
      ${'nested/other'}             | ${false}
      ${'nested/module/other'}      | ${false}
    `('minimatches("$path") === $expected', ({ path, expected }) => {
      expect(miniMatches(path, defaultConfig.excludeCommitPaths)).toBe(
        expected,
      );
    });
  });

  describe('filePatterns', () => {
    it.each`
      path                          | expected
      ${'bin/hermit'}               | ${true}
      ${'gradle/bin/hermit'}        | ${true}
      ${'nested/module/bin/hermit'} | ${true}
      ${'nested/testbin/hermit'}    | ${false}
      ${'other'}                    | ${false}
      ${'nested/other'}             | ${false}
      ${'nested/module/other'}      | ${false}
    `('matchRegexOrGlobList("$path") === $expected', ({ path, expected }) => {
      expect(matchRegexOrGlobList(path, defaultConfig.filePatterns)).toBe(
        expected,
      );
    });
  });
});
