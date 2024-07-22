import is from '@sindresorhus/is';
import { AbstractMigration } from '../base/abstract-migration';

export class BbUseDefaultReviewersMigration extends AbstractMigration {
  override readonly propertyName = 'bbUseDefaultReviewers';

  override run(value: unknown, key: string, parentKey?: string): void {
    const platformOptions = this.get('platformOptions') ?? {};
    if (is.boolean(value) && parentKey !== 'platformOptions') {
      this.delete();
      this.setHard('platformOptions', {
        ...platformOptions,
        bbUseDefaultReviewers: value,
      });
    }
  }
}
