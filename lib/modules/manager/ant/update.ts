import { logger } from '../../../logger/index.ts';
import type { UpdateDependencyConfig } from '../types.ts';

function versionFromPropertiesContent(
  content: string,
  offset: number,
): string | null {
  const lineEnd = content.indexOf('\n', offset);
  const end = lineEnd === -1 ? content.length : lineEnd;
  return content.slice(offset, end).trim();
}

function versionFromQuotedAttribute(
  content: string,
  offset: number,
): { quote: '"' | "'"; value: string; valuePosition: number } | null {
  const doubleQuoteStart = content.lastIndexOf('"', offset);
  const singleQuoteStart = content.lastIndexOf("'", offset);
  const quoteStart = Math.max(doubleQuoteStart, singleQuoteStart);
  if (quoteStart === -1) {
    return null;
  }

  const quote = content[quoteStart];
  if (quote !== '"' && quote !== "'") {
    return null;
  }

  const end = content.indexOf(quote, offset);
  if (end === -1) {
    return null;
  }

  return {
    quote,
    value: content.slice(quoteStart + 1, end),
    valuePosition: quoteStart + 1,
  };
}

export function updateDependency({
  fileContent,
  upgrade,
}: UpdateDependencyConfig): string | null {
  const {
    currentValue,
    depName,
    fileReplacePosition,
    newValue,
    sharedVariableName,
  } = upgrade;

  if (!fileReplacePosition || !newValue) {
    logger.debug({ depName }, 'Missing fileReplacePosition or newValue');
    return null;
  }

  const quotedAttribute = versionFromQuotedAttribute(
    fileContent,
    fileReplacePosition,
  );
  if (quotedAttribute) {
    if (quotedAttribute.value.includes(currentValue ?? '')) {
      if (quotedAttribute.value.includes(newValue)) {
        return fileContent;
      }

      const replacedValue = quotedAttribute.value.replace(
        currentValue!,
        newValue,
      );
      return (
        fileContent.slice(0, quotedAttribute.valuePosition) +
        replacedValue +
        fileContent.slice(
          quotedAttribute.valuePosition + quotedAttribute.value.length,
        )
      );
    }

    if (
      quotedAttribute.value !== currentValue &&
      !sharedVariableName &&
      quotedAttribute.value !== newValue
    ) {
      logger.debug(
        { currentValue, depName, foundValue: quotedAttribute.value, newValue },
        'Unknown Ant XML value',
      );
      return null;
    }

    return (
      fileContent.slice(0, fileReplacePosition) +
      newValue +
      fileContent.slice(fileReplacePosition + quotedAttribute.value.length)
    );
  }

  const currentLineValue = versionFromPropertiesContent(
    fileContent,
    fileReplacePosition,
  );
  if (!currentLineValue) {
    logger.debug({ depName }, 'Could not detect Ant properties value');
    return null;
  }

  if (
    currentLineValue !== currentValue &&
    !sharedVariableName &&
    currentLineValue !== newValue
  ) {
    logger.debug(
      { currentValue, depName, foundValue: currentLineValue, newValue },
      'Unknown Ant properties value',
    );
    return null;
  }

  return (
    fileContent.slice(0, fileReplacePosition) +
    newValue +
    fileContent.slice(fileReplacePosition + currentLineValue.length)
  );
}
