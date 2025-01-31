import { DateTime } from 'luxon';
import { logger } from '../../../logger';
import type { PackageFile } from '../../../modules/manager/types';

export function calculateLibYears(
  packageFiles?: Record<string, PackageFile[]>,
): void {
  if (!packageFiles) {
    return;
  }

  // if same dep is present twice with 2 diffferent version it is counted twice
  const allDeps = new Set();
  const depWithUpdates = new Set();
  const managerLibYears: Record<string, number> = {};
  for (const [manager, files] of Object.entries(packageFiles)) {
    const managerDeps = new Set<string>();
    for (const file of files) {
      let fileLibYears = 0;
      for (const dep of file.deps) {
        const depKey = `${dep.depName}@${dep.currentVersion ?? dep.currentValue}`;
        allDeps.add(depKey);
        if (dep.updates?.length) {
          if (depWithUpdates.has(depKey) || managerDeps.has(depKey)) {
            continue;
          }

          for (const update of dep.updates) {
            if (!update.releaseTimestamp) {
              logger.debug(
                `No releaseTimestamp for ${dep.depName} update to ${update.newVersion}`,
              );
              continue;
            }
            if (!dep.currentVersionTimestamp) {
              logger.debug(`No currentVersionTimestamp for ${dep.depName}`);
              continue;
            }
            // timestamps are in ISO format
            const currentVersionDate = DateTime.fromISO(
              dep.currentVersionTimestamp,
            );
            const releaseDate = DateTime.fromISO(update.releaseTimestamp);
            const libYears = releaseDate.diff(
              currentVersionDate,
              'years',
            ).years;
            if (libYears >= 0) {
              update.libYears = libYears;
            }
          }
          // Set the highest libYears for the dep
          const depLibYears = Math.max(
            ...dep.updates.map((update) => update.libYears ?? 0),
            0,
          );

          depWithUpdates.add(depKey);
          managerDeps.add(depKey);
          fileLibYears += depLibYears;
        }
      }
      managerLibYears[manager] ??= 0;
      managerLibYears[manager] += fileLibYears;
    }
  }
  // Sum up the libYears for the repo
  let totalLibYears = 0;
  for (const libYears of Object.values(managerLibYears)) {
    totalLibYears += libYears;
  }
  logger.debug(
    {
      managerLibYears,
      totalLibYears,
      totalDeps: allDeps.size,
      outdateDeps: depWithUpdates.size,
    },
    'Repository libYears',
  );
}
