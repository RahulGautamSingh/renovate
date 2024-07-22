import { BbUseDevelopmentBranchMigration } from './bb-use-development-branch-migration';

describe('config/migrations/custom/bb-use-development-branch-migration', () => {
  it('should migrate "auto" to "global"', () => {
    expect(BbUseDevelopmentBranchMigration).toMigrate(
      {
        bbUseDevelopmentBranch: true,
      },
      {
        platformOptions: {
          bbUseDevelopmentBranch: true,
        },
      },
    );
  });

  it('should not migrate', () => {
    expect(BbUseDevelopmentBranchMigration).toMigrate(
      {
        platformOptions: {
          bbUseDevelopmentBranch: true,
        },
      },
      {
        platformOptions: {
          bbUseDevelopmentBranch: true,
        },
      },
      false,
    );
  });
});
