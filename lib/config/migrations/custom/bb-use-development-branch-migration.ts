import is from '@sindresorhus/is';
import { AbstractMigration } from '../base/abstract-migration';

export class BbUseDevelopmentBranchMigration extends AbstractMigration {
  override readonly propertyName = 'bbUseDevelopmentBranch';

  override run(value: unknown, key: string, parentKey?: string): void {
    if (is.boolean(value) && parentKey !== 'platformOptions') {
      const platformOptions = this.get('platformOptions') ?? {};
      this.delete();
      this.setHard('platformOptions', {
        ...platformOptions,
        bbUseDevelopmentBranch: value,
      });
    }
  }
}
