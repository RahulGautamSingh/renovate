import is from '@sindresorhus/is';
import { AbstractMigration } from '../base/abstract-migration';

export class AzureWorkItemIdMigration extends AbstractMigration {
  override readonly propertyName = 'azureWorkItemId';

  override run(value: unknown, key: string, parentKey?: string): void {
    if (is.number(value) && parentKey !== 'platformOptions') {
      const platformOptions = this.get('platformOptions') ?? {};
      this.delete();
      this.setHard('platformOptions', {
        ...platformOptions,
        azureWorkItemId: value,
      });
    }
  }
}
