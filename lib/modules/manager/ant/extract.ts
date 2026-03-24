import upath from 'upath';
import type { XmlElement } from 'xmldoc';
import { XmlDocument } from 'xmldoc';
import { logger } from '../../../logger/index.ts';
import { readLocalFile } from '../../../util/fs/index.ts';
import { newlineRegex, regEx } from '../../../util/regex.ts';
import { MavenDatasource } from '../../datasource/maven/index.ts';
import { extractRegistries } from '../maven/extract.ts';
import type {
  ExtractConfig,
  PackageDependency,
  PackageFile,
} from '../types.ts';

interface AntProperty {
  fileReplacePosition: number;
  key: string;
  packageFile: string;
  value: string;
}

interface WalkContext {
  propertyMap: Map<string, AntProperty>;
  visitedFiles: Set<string>;
}

const scopeNames = new Set([
  'compile',
  'test',
  'runtime',
  'provided',
  'system',
]);

function isXmlElement(node: unknown): node is XmlElement {
  return !!node && typeof node === 'object' && 'name' in node && 'attr' in node;
}

function readAttributeRange(
  content: string,
  node: XmlElement,
  attrName: string,
  attrValue: string,
): { quote: '"' | "'"; valuePosition: number } | null {
  const startTagPosition = node.startTagPosition ?? node.position;
  if (startTagPosition === undefined || startTagPosition === null) {
    return null;
  }

  const tagEnd = content.indexOf('>', startTagPosition);
  if (tagEnd === -1) {
    return null;
  }

  const tagContent = content.slice(startTagPosition, tagEnd + 1);
  const attrRegex = regEx(
    `\\b${attrName}\\s*=\\s*(?<quote>["'])(?<value>${escapeRegex(attrValue)})\\k<quote>`,
  );
  const match = attrRegex.exec(tagContent);
  if (!match?.groups?.quote || !match.groups.value) {
    return null;
  }

  const matchIndex = match.index + match[0].indexOf(match.groups.value);
  return {
    quote: match.groups.quote as '"' | "'",
    valuePosition: startTagPosition + matchIndex,
  };
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parsePropertiesFile(
  content: string,
  packageFile: string,
): AntProperty[] {
  const properties: AntProperty[] = [];
  let offset = 0;
  const isCrLf = content.includes('\r\n');
  const lineBreakLength = isCrLf ? 2 : 1;

  for (const line of content.split(newlineRegex)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) {
      offset += line.length + lineBreakLength;
      continue;
    }

    const separatorMatch = /[:=]/.exec(line);
    if (!separatorMatch?.index && separatorMatch?.index !== 0) {
      offset += line.length + lineBreakLength;
      continue;
    }

    const separatorIndex = separatorMatch.index;
    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1);
    const leftPartLength = separatorIndex + 1 + rawValue.search(/\S|$/);
    const value = rawValue.trim();
    if (!key || !value) {
      offset += line.length + lineBreakLength;
      continue;
    }

    properties.push({
      key,
      value,
      packageFile,
      fileReplacePosition: offset + leftPartLength,
    });
    offset += line.length + lineBreakLength;
  }

  return properties;
}

function collectBlockRegistries(node: XmlElement): string[] {
  const registryUrls: string[] = [];

  for (const child of node.children.filter(isXmlElement)) {
    if (child.name !== 'remoteRepository') {
      continue;
    }

    const url = child.attr.url ?? child.valueWithPath('url')?.trim();
    if (url) {
      registryUrls.push(url);
    }
  }

  return registryUrls;
}

function addProperty(
  propertyMap: Map<string, AntProperty>,
  property: AntProperty,
): void {
  if (!propertyMap.has(property.key)) {
    propertyMap.set(property.key, property);
  }
}

function resolvePropertyString(
  input: string,
  propertyMap: Map<string, AntProperty>,
  seen = new Set<string>(),
): string | null {
  let result = input;
  let changed = true;

  while (changed) {
    changed = false;
    result = result.replace(regEx(/\$\{([^}]+)\}/g), (match, key: string) => {
      const property = propertyMap.get(key);
      if (!property) {
        return match;
      }
      if (seen.has(key)) {
        result = '';
        return match;
      }
      seen.add(key);
      const resolved = resolvePropertyString(property.value, propertyMap, seen);
      seen.delete(key);
      if (resolved === null) {
        result = '';
        return match;
      }
      changed = true;
      return resolved;
    });

    if (!result && input) {
      return null;
    }
  }

  if (regEx(/\$\{[^}]+\}/).test(result)) {
    return null;
  }

  return result;
}

function resolveVersionReference(
  rawValue: string,
  propertyMap: Map<string, AntProperty>,
): {
  currentValue: string | null;
  fileReplacePosition?: number;
  packageFile?: string;
  sharedVariableName?: string;
} {
  const variableMatch = regEx(/^\$\{([^}]+)\}$/).exec(rawValue);
  if (!variableMatch?.[1]) {
    return {
      currentValue: resolvePropertyString(rawValue, propertyMap),
    };
  }

  const sharedVariableName = variableMatch[1];
  const property = propertyMap.get(sharedVariableName);
  if (!property) {
    return { currentValue: null, sharedVariableName };
  }

  const currentValue = resolvePropertyString(property.value, propertyMap);
  if (currentValue === null) {
    return { currentValue: null, sharedVariableName };
  }

  return {
    currentValue,
    fileReplacePosition: property.fileReplacePosition,
    packageFile: property.packageFile,
    sharedVariableName,
  };
}

function getDependencyType(node: XmlElement, coordsDepType?: string): string {
  if (coordsDepType) {
    return coordsDepType;
  }

  const scope = node.attr.scope?.trim();
  if (scope && scopeNames.has(scope)) {
    return scope;
  }

  return 'compile';
}

function parseCoords(coords: string): {
  depName: string;
  depType?: string;
  rawVersion: string;
} | null {
  const parts = coords.split(':');
  if (parts.length < 3) {
    return null;
  }

  const [groupId, artifactId] = parts;
  if (!groupId || !artifactId) {
    return null;
  }

  let depType: string | undefined;
  let rawVersion: string;

  if (parts.length >= 5 && scopeNames.has(parts.at(-1)!)) {
    depType = parts.at(-1);
    rawVersion = parts.at(-2)!;
  } else {
    rawVersion = parts.at(-1)!;
  }

  return {
    depName: `${groupId}:${artifactId}`,
    rawVersion,
    depType,
  };
}

function collectDependency(
  content: string,
  node: XmlElement,
  packageFile: string,
  propertyMap: Map<string, AntProperty>,
  registryUrls: string[],
): { packageFile: string; dependency: PackageDependency } | null {
  if (node.name !== 'dependency') {
    return null;
  }

  if (node.attr.groupId && node.attr.artifactId && node.attr.version) {
    const resolvedVersion = resolveVersionReference(
      node.attr.version,
      propertyMap,
    );
    const range = readAttributeRange(
      content,
      node,
      'version',
      node.attr.version,
    );
    if (!range) {
      return null;
    }

    const dep: PackageDependency = {
      datasource: MavenDatasource.id,
      depName: `${node.attr.groupId}:${node.attr.artifactId}`,
      currentValue: resolvedVersion.currentValue ?? node.attr.version,
      depType: getDependencyType(node),
      registryUrls,
      fileReplacePosition:
        resolvedVersion.fileReplacePosition ?? range.valuePosition,
    };

    if (resolvedVersion.sharedVariableName) {
      dep.sharedVariableName = resolvedVersion.sharedVariableName;
    }

    if (!resolvedVersion.currentValue) {
      dep.skipReason = 'contains-variable';
    }

    return {
      packageFile: resolvedVersion.packageFile ?? packageFile,
      dependency: dep,
    };
  }

  if (node.attr.coords) {
    const coords = parseCoords(node.attr.coords);
    if (!coords) {
      return null;
    }

    const resolvedVersion = resolveVersionReference(
      coords.rawVersion,
      propertyMap,
    );
    const range = readAttributeRange(content, node, 'coords', node.attr.coords);
    if (!range) {
      return null;
    }

    const versionPositionInCoords = node.attr.coords.lastIndexOf(
      coords.rawVersion,
    );
    if (versionPositionInCoords === -1) {
      return null;
    }

    const dep: PackageDependency = {
      datasource: MavenDatasource.id,
      depName: coords.depName,
      currentValue: resolvedVersion.currentValue ?? coords.rawVersion,
      depType: getDependencyType(node, coords.depType),
      registryUrls,
      fileReplacePosition:
        resolvedVersion.fileReplacePosition ??
        range.valuePosition + versionPositionInCoords,
    };

    if (resolvedVersion.sharedVariableName) {
      dep.sharedVariableName = resolvedVersion.sharedVariableName;
    }

    if (!resolvedVersion.currentValue) {
      dep.skipReason = 'contains-variable';
    }

    return {
      packageFile: resolvedVersion.packageFile ?? packageFile,
      dependency: dep,
    };
  }

  return null;
}

async function readSettingsRegistries(
  currentFile: string,
  settingsFile: string,
): Promise<string[]> {
  const resolvedSettingsFile = upath.normalize(
    upath.join(upath.dirname(currentFile), settingsFile),
  );
  const settingsContent = await readLocalFile(resolvedSettingsFile, 'utf8');
  if (!settingsContent) {
    return [];
  }

  return extractRegistries(settingsContent);
}

async function walkXmlFile(
  packageFile: string,
  context: WalkContext,
  packageDeps: Map<string, PackageDependency[]>,
): Promise<void> {
  if (context.visitedFiles.has(packageFile)) {
    return;
  }
  context.visitedFiles.add(packageFile);

  const content = await readLocalFile(packageFile, 'utf8');
  if (!content) {
    logger.debug({ packageFile }, 'Ant manager could not read file');
    return;
  }

  let xml: XmlDocument;
  try {
    xml = new XmlDocument(content);
  } catch (err) {
    logger.debug({ err, packageFile }, 'Ant manager failed to parse XML');
    return;
  }

  await walkNode(xml, packageFile, content, context, packageDeps, []);
}

async function walkPropertiesFile(
  packageFile: string,
  context: WalkContext,
): Promise<void> {
  if (context.visitedFiles.has(packageFile)) {
    return;
  }
  context.visitedFiles.add(packageFile);

  const content = await readLocalFile(packageFile, 'utf8');
  if (!content) {
    logger.debug({ packageFile }, 'Ant manager could not read properties file');
    return;
  }

  for (const property of parsePropertiesFile(content, packageFile)) {
    addProperty(context.propertyMap, property);
  }
}

async function walkNode(
  node: XmlElement,
  packageFile: string,
  content: string,
  context: WalkContext,
  packageDeps: Map<string, PackageDependency[]>,
  inheritedRegistryUrls: string[],
): Promise<void> {
  let registryUrls = inheritedRegistryUrls;
  if (node.attr.settingsFile) {
    const settingsRegistries = await readSettingsRegistries(
      packageFile,
      node.attr.settingsFile,
    );
    registryUrls = [
      ...new Set([...inheritedRegistryUrls, ...settingsRegistries]),
    ];
  }

  if (node.name === 'artifact:dependencies') {
    registryUrls = [
      ...new Set([...registryUrls, ...collectBlockRegistries(node)]),
    ];
  }

  if (node.name === 'property' && node.attr.name && node.attr.value) {
    const range = readAttributeRange(content, node, 'value', node.attr.value);
    if (range) {
      addProperty(context.propertyMap, {
        key: node.attr.name,
        value: node.attr.value,
        packageFile,
        fileReplacePosition: range.valuePosition,
      });
    }
  }

  if (node.name === 'property' && node.attr.file) {
    const propertyFile = upath.normalize(
      upath.join(upath.dirname(packageFile), node.attr.file),
    );
    await walkPropertiesFile(propertyFile, context);
  }

  if (node.name === 'import' && node.attr.file) {
    const importedFile = upath.normalize(
      upath.join(upath.dirname(packageFile), node.attr.file),
    );
    await walkXmlFile(importedFile, context, packageDeps);
  }

  const collected = collectDependency(
    content,
    node,
    packageFile,
    context.propertyMap,
    registryUrls,
  );
  if (collected) {
    const currentDeps = packageDeps.get(collected.packageFile) ?? [];
    currentDeps.push(collected.dependency);
    packageDeps.set(collected.packageFile, currentDeps);
  }

  for (const child of node.children.filter(isXmlElement)) {
    await walkNode(
      child,
      packageFile,
      content,
      context,
      packageDeps,
      registryUrls,
    );
  }
}

export async function extractAllPackageFiles(
  _config: ExtractConfig,
  packageFiles: string[],
): Promise<PackageFile[] | null> {
  const packageDeps = new Map<string, PackageDependency[]>();

  for (const packageFile of packageFiles) {
    const context: WalkContext = {
      propertyMap: new Map(),
      visitedFiles: new Set(),
    };
    await walkXmlFile(packageFile, context, packageDeps);
  }

  const results: PackageFile[] = [];
  for (const [packageFile, deps] of packageDeps.entries()) {
    results.push({ packageFile, deps });
  }

  return results.length ? results : null;
}
