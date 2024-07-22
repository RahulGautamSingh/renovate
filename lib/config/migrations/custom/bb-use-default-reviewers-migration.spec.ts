import { BbUseDefaultReviewersMigration } from './bb-use-default-reviewers-migration';

describe('config/migrations/custom/bb-use-default-reviewers-migration', () => {
  it('should migrate "auto" to "global"', () => {
    expect(BbUseDefaultReviewersMigration).toMigrate(
      {
        bbUseDefaultReviewers: true,
      },
      {
        platformOptions: {
          bbUseDefaultReviewers: true,
        },
      },
    );
  });

  it('should not migrate', () => {
    expect(BbUseDefaultReviewersMigration).toMigrate(
      {
        platformOptions: {
          bbUseDefaultReviewers: true,
        },
      },
      {
        platformOptions: {
          bbUseDefaultReviewers: true,
        },
      },
      false,
    );
  });
});
