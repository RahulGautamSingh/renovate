import { AzureWorkItemIdMigration } from './azure-work-item-id-migration';

describe('config/migrations/custom/azure-work-item-id-migration', () => {
  it('should migrate', () => {
    expect(AzureWorkItemIdMigration).toMigrate(
      {
        azureWorkItemId: 10,
      },
      {
        platformOptions: {
          azureWorkItemId: 10,
        },
      },
    );
  });

  it('should not migrate', () => {
    expect(AzureWorkItemIdMigration).toMigrate(
      {
        platformOptions: {
          azureWorkItemId: 10,
        },
      },
      {
        platformOptions: {
          azureWorkItemId: 10,
        },
      },
      false,
    );
  });
});
