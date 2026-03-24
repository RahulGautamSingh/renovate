import { codeBlock } from 'common-tags';
import { updateDependency } from './update.ts';

describe('modules/manager/ant/update', () => {
  it('updates XML version attributes', () => {
    const fileContent = codeBlock`
      <project>
        <artifact:dependencies>
          <dependency groupId="junit" artifactId="junit" version="4.13.2" />
        </artifact:dependencies>
      </project>
    `;

    expect(
      updateDependency({
        fileContent,
        upgrade: {
          depName: 'junit:junit',
          currentValue: '4.13.2',
          newValue: '4.13.3',
          fileReplacePosition: fileContent.indexOf('4.13.2'),
        },
      }),
    ).toContain('version="4.13.3"');
  });

  it('updates XML coords attributes', () => {
    const fileContent = codeBlock`
      <project>
        <artifact:dependencies>
          <dependency coords="org.apache.commons:commons-lang3:3.12.0" />
        </artifact:dependencies>
      </project>
    `;

    expect(
      updateDependency({
        fileContent,
        upgrade: {
          depName: 'org.apache.commons:commons-lang3',
          currentValue: '3.12.0',
          newValue: '3.13.0',
          fileReplacePosition: fileContent.indexOf('3.12.0'),
        },
      }),
    ).toContain('commons-lang3:3.13.0');
  });

  it('updates properties file values', () => {
    const fileContent = codeBlock`
      slf4j.version=1.7.36
      commons.lang3.version=3.12.0
    `;

    expect(
      updateDependency({
        fileContent,
        upgrade: {
          depName: 'org.slf4j:slf4j-api',
          currentValue: '1.7.36',
          newValue: '2.0.17',
          fileReplacePosition: fileContent.indexOf('1.7.36'),
          sharedVariableName: 'slf4j.version',
        },
      }),
    ).toContain('slf4j.version=2.0.17');
  });
});
