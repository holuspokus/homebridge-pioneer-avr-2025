const displayChars = {
    '00': ' ',
    '01': '[🔁🔀]',
    '02': '🔁',
    '03': '🔀',
    '04': '↕️',
    '05': '◀',
    '06': '▶',
    '07': 'I',
    '08': 'II',
    '09': '<',
    '0a': '>',
    '0b': '❤️',
    '0c': '.',
    '0d': '.0',
    '0e': '.5',
    '0f': 'Ω',
    '10': '0',
    '11': '1',
    '12': '2',
    '13': '3',
    '14': '4',
    '15': '5',
    '16': '6',
    '17': '7',
    '18': '8',
    '19': '9',
    '1a': 'A',
    '1b': 'B',
    '1c': 'C',
    '1d': 'D',
    '1e': 'E',
    '1f': 'F',
    '20': ' ',
    '21': '!',
    '22': '\'',
    '23': '#',
    '24': '$',
    '25': '%',
    '26': '&',
    '27': '\'',
    '28': '(',
    '29': ')',
    '2a': '*',
    '2b': '+',
    '2c': ',',
    '2d': '-',
    '2e': '.',
    '2f': '/',
    '30': '0',
    '31': '1',
    '32': '2',
    '33': '3',
    '34': '4',
    '35': '5',
    '36': '6',
    '37': '7',
    '38': '8',
    '39': '9',
    '3a': ':',
    '3b': ';',
    '3c': '<',
    '3d': '=',
    '3e': '>',
    '3f': '?',
    '40': '@',
    '41': 'A',
    '42': 'B',
    '43': 'C',
    '44': 'D',
    '45': 'E',
    '46': 'F',
    '47': 'G',
    '48': 'H',
    '49': 'I',
    '4a': 'J',
    '4b': 'K',
    '4c': 'L',
    '4d': 'M',
    '4e': 'N',
    '4f': 'O',
    '50': 'P',
    '51': 'Q',
    '52': 'R',
    '53': 'S',
    '54': 'T',
    '55': 'U',
    '56': 'V',
    '57': 'W',
    '58': 'X',
    '59': 'Y',
    '5a': 'Z',
    '5b': '[',
    '5c': '\\',
    '5d': ']',
    '5e': '^',
    '5f': '_',
    '60': '`',
    '61': 'a',
    '62': 'b',
    '63': 'c',
    '64': 'd',
    '65': 'e',
    '66': 'f',
    '67': 'g',
    '68': 'h',
    '69': 'i',
    '6a': 'j',
    '6b': 'k',
    '6c': 'l',
    '6d': 'm',
    '6e': 'n',
    '6f': 'o',
    '70': 'p',
    '71': 'q',
    '72': 'r',
    '73': 's',
    '74': 't',
    '75': 'u',
    '76': 'v',
    '77': 'w',
    '78': 'x',
    '79': 'y',
    '7a': 'z',
    '7b': '{',
    '7c': '|',
    '7d': '}',
    '7e': '~',
    '7f': '⌂',
    '80': 'Œ',
    '81': 'œ',
    '82': 'Ĳ',
    '83': 'ĳ',
    '84': '∏',
    '85': '∓',
    '86': '•',
    '87': '×',
    '88': '÷',
    '89': '∫',
    '8a': '∂',
    '8b': 'π',
    '8c': '←',
    '8d': '↑',
    '8e': '→',
    '8f': '↓',
    '90': '+',
    '91': '♪',
    '92': '📁',
    '93': '℗',
    '94': '™',
    '95': '✓',
    '96': '✕',
    '97': ' ',
    '98': ' ',
    '99': ' ',
    '9a': ' ',
    '9b': ' ',
    '9c': ' ',
    '9d': ' ',
    '9e': ' ',
    '9f': ' ',
    'a0': ' ',
    'a1': '¡',
    'a2': '¢',
    'a3': '£',
    'a4': '¤',
    'a5': '¥',
    'a6': '¦',
    'a7': '§',
    'a8': '¨',
    'a9': '©',
    'aa': 'ª',
    'ab': '«',
    'ac': '¬',
    'ad': '-',
    'ae': '®',
    'af': '¯',
    'b0': '°',
    'b1': '±',
    'b2': '²',
    'b3': '³',
    'b4': '´',
    'b5': 'µ',
    'b6': '¶',
    'b7': '·',
    'b8': '¸',
    'b9': '¹',
    'ba': 'º',
    'bb': '»',
    'bc': '¼',
    'bd': '½',
    'be': '¾',
    'bf': '¿',
    'c0': 'À',
    'c1': 'Á',
    'c2': 'Â',
    'c3': 'Ã',
    'c4': 'Ä',
    'c5': 'Å',
    'c6': 'Æ',
    'c7': 'Ç',
    'c8': 'È',
    'c9': 'É',
    'ca': 'Ê',
    'cb': 'Ë',
    'cc': 'Ì',
    'cd': 'Í',
    'ce': 'Î',
    'cf': 'Ï',
    'd0': 'Ð',
    'd1': 'Ñ',
    'd2': 'Ò',
    'd3': 'Ó',
    'd4': 'Ô',
    'd5': 'Õ',
    'd6': 'Ö',
    'd7': '×',
    'd8': 'Ø',
    'd9': 'Ù',
    'da': 'Ú',
    'db': 'Û',
    'dc': 'Ü',
    'dd': 'Ý',
    'de': 'Þ',
    'df': 'ß',
    'e0': 'à',
    'e1': 'á',
    'e2': 'â',
    'e3': 'ã',
    'e4': 'ä',
    'e5': 'å',
    'e6': 'æ',
    'e7': 'ç',
    'e8': 'è',
    'e9': 'é',
    'ea': 'ê',
    'eb': 'ë',
    'ec': 'ì',
    'ed': 'í',
    'ee': 'î',
    'ef': 'ï',
    'f0': 'ð',
    'f1': 'ñ',
    'f2': 'ò',
    'f3': 'ó',
    'f4': 'ô',
    'f5': 'õ',
    'f6': 'ö',
    'f7': '÷',
    'f8': 'ø',
    'f9': 'ù',
    'fa': 'ú',
    'fb': 'û',
    'fc': 'ü',
    'fd': 'ý',
    'fe': 'þ',
    'ff': 'ÿ',
};

export default displayChars;
