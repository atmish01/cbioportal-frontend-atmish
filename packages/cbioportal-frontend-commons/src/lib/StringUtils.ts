export function longestCommonStartingSubstring(str1: string, str2: string) {
    // from https://github.com/cBioPortal/mutation-mapper/blob/master/src/js/util/cbio-util.js
    let i = 0;

    while (i < str1.length && i < str2.length) {
        if (str1[i] === str2[i]) {
            i++;
        } else {
            break;
        }
    }

    return str1.substring(0, i);
}

export function stringListToSet(
    alos: ReadonlyArray<string>
): { [s: string]: boolean } {
    return stringListToMap(alos, () => true);
}

export function stringListToIndexSet(
    alos: ReadonlyArray<string>
): { [s: string]: number } {
    return stringListToMap(alos, (s: string, i: number) => i);
}

export function stringListToMap<T>(
    alos: ReadonlyArray<string>,
    mapFn: (s: string, index: number, array: ReadonlyArray<string>) => T
): { [s: string]: T } {
    return alos.reduce(
        (map: { [s: string]: T }, next: string, index: number) => {
            map[next] = mapFn(next, index, alos);
            return map;
        },
        {}
    );
}

/**
 * Unquote a string wrapped with single or double quotes.
 *
 * @param {string} str  input string wrapped with single or double quotes
 */
export function unquote(str: string): string {
    return str.replace(/(^")|(^')|("$)|('$)/g, '');
}

/**
 * Replaces escaped tab ("\\t") and new line ("\\n") substrings with actual tab ("\t") and new line ("\n") characters.
 *
 * @param {string} str  input string with "\\t" and "\\n" substrings
 */
export function unescapeTabDelimited(str: string): string {
    return str.replace(/\\t/g, '\t').replace(/\\n/g, '\n');
}

export function pluralize(base: string, num: number, pluralSuffix = 's') {
    return `${base}${num === 1 ? '' : pluralSuffix}`;
}

export function capitalize(str: string) {
    if (str.length === 0) {
        return str;
    } else {
        return str[0].toLocaleUpperCase() + str.slice(1);
    }
}

export function lowerCaseAndCapitalizeString(str: string) {
    // this is heurisitic.  if it's a short string, it could
    // be an acronym and shouldn't be lowercased
    if (str.length < 5) {
        return str;
    } else {
        return str.toLowerCase().replace(/^./g, s => {
            return s.toUpperCase();
        });
    }
}

export function isUrl(str: string) {
    const pattern = /^http[s]?:\/\//;
    return pattern.test(str);
}

export const LESS_THAN_HTML_ENTITY = '&lt;';
export const GREATER_THAN_HTML_ENTITY = '&gt;';

// This method is only designed to trim off html tags <**> </**>
// A full solution could be https://www.npmjs.com/package/string-strip-html
// But there is an issue related to template literals (https://gitlab.com/codsen/codsen/-/issues/31)
export function trimOffHtmlTagEntities(str: string) {
    // I previously explored Regex but does not work really well in multiple matches
    return (str || '')
        .split(LESS_THAN_HTML_ENTITY)
        .map(match => {
            const elements = match.split(GREATER_THAN_HTML_ENTITY);
            if (elements.length > 1) {
                return elements[1];
            } else {
                return elements.length === 0 ? '' : elements[0];
            }
        })
        .join('');
}
