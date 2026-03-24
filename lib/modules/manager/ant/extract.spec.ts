import { codeBlock } from 'common-tags';
import { fs } from '~test/util.ts';
import { extractAllPackageFiles } from './extract.ts';

vi.mock('../../../util/fs/index.ts');

describe('modules/manager/ant/extract', () => {
  it('extracts inline version dependencies from build.xml', async () => {
    fs.readLocalFile.mockImplementation((fileName: string) => {
      const files: Record<string, string> = {
        'build.xml': codeBlock`
          <project>
            <artifact:dependencies>
              <dependency groupId="junit" artifactId="junit" version="4.13.2" scope="test" />
            </artifact:dependencies>
          </project>
        `,
      };
      return Promise.resolve(files[fileName] ?? null);
    });

    await expect(extractAllPackageFiles({}, ['build.xml'])).resolves.toEqual([
      {
        packageFile: 'build.xml',
        deps: [
          expect.objectContaining({
            datasource: 'maven',
            depName: 'junit:junit',
            currentValue: '4.13.2',
            depType: 'test',
            registryUrls: [],
          }),
        ],
      },
    ]);
  });

  it('extracts imported XML dependencies and resolves properties files', async () => {
    fs.readLocalFile.mockImplementation((fileName: string) => {
      const files: Record<string, string> = {
        'build.xml': codeBlock`
          <project>
            <property file="versions.properties" />
            <import file="dep.xml" />
          </project>
        `,
        'dep.xml': codeBlock`
          <project>
            <artifact:dependencies settingsFile="build/settings.xml">
              <dependency groupId="org.slf4j" artifactId="slf4j-api" version="\${slf4j.version}" />
              <dependency coords="org.apache.commons:commons-lang3:\${commons.lang3.version}" />
            </artifact:dependencies>
          </project>
        `,
        'versions.properties': codeBlock`
          slf4j.version=1.7.36
          commons.lang3.version=3.12.0
        `,
        'build/settings.xml': codeBlock`
          <settings xmlns="http://maven.apache.org/SETTINGS/1.0.0">
            <mirrors>
              <mirror>
                <url>https://repo1.maven.org/maven2</url>
              </mirror>
            </mirrors>
          </settings>
        `,
      };
      return Promise.resolve(files[fileName] ?? null);
    });

    await expect(extractAllPackageFiles({}, ['build.xml'])).resolves.toEqual([
      {
        packageFile: 'versions.properties',
        deps: [
          expect.objectContaining({
            datasource: 'maven',
            depName: 'org.slf4j:slf4j-api',
            currentValue: '1.7.36',
            depType: 'compile',
            sharedVariableName: 'slf4j.version',
            registryUrls: ['https://repo1.maven.org/maven2'],
          }),
          expect.objectContaining({
            datasource: 'maven',
            depName: 'org.apache.commons:commons-lang3',
            currentValue: '3.12.0',
            depType: 'compile',
            sharedVariableName: 'commons.lang3.version',
            registryUrls: ['https://repo1.maven.org/maven2'],
          }),
        ],
      },
    ]);
  });

  it('keeps the first property definition and ignores later overrides', async () => {
    fs.readLocalFile.mockImplementation((fileName: string) => {
      const files: Record<string, string> = {
        'build.xml': codeBlock`
          <project>
            <property file="versions-a.properties" />
            <property file="versions-b.properties" />
            <artifact:dependencies>
              <dependency groupId="junit" artifactId="junit" version="\${junit.version}" />
            </artifact:dependencies>
          </project>
        `,
        'versions-a.properties': 'junit.version=4.13.2\n',
        'versions-b.properties': 'junit.version=4.13.3\n',
      };
      return Promise.resolve(files[fileName] ?? null);
    });

    await expect(extractAllPackageFiles({}, ['build.xml'])).resolves.toEqual([
      {
        packageFile: 'versions-a.properties',
        deps: [
          expect.objectContaining({
            datasource: 'maven',
            depName: 'junit:junit',
            currentValue: '4.13.2',
            depType: 'compile',
            sharedVariableName: 'junit.version',
            registryUrls: [],
          }),
        ],
      },
    ]);
  });
});
