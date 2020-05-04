let DEFAULT_NGRAM_SIZE = 2;

/**
 * Convert the keywords string into a list of fuzzy n-grams, by the min n-gram size.
 * @param {string} keywords - Keyword string
 * @param {number} nGramSize - The minimum nGram size to use (lower = fuzzier, but poorer performance)
 * @param {boolean} caseSensitive - should we care about case?
 */
exports.createFuzzySearchString = function (keywords, nGramSize, caseSensitive) {
    // if the passed-in nGramSize is null, <=0, or not a number, use the default
    nGramSize = nGramSize && parseInt(nGramSize) && nGramSize > 0 ? nGramSize : DEFAULT_NGRAM_SIZE;

    // First, lets do some cleanup to the keywords.
    // We want to remove any special characters, set to lowercase
    // and replace underscores with spaces.

    // force lowercase
    let cleanKeywords = caseSensitive ? keywords.toLowerCase() : keywords;
    // replace special chars
    cleanKeywords = cleanKeywords.replace(/[!\"#%&\'\(\)\*\+,-\.\/:;<=>?@\[\\\]\^`\{\|\}~]/g, '');
    // underscore to spaces (underscore + fuzzy = sad panda)
    cleanKeywords = cleanKeywords.replace(/_/g, ' ');
    
    // finally, split up the words in the string into an array
    let cleanKeywordArray = cleanKeywords.split(' ');

    // Append the results of the n-gram creation to a result string
    let resultString = '';

    // Cycle through each word, creating n-grams for each one
    // once we have the set of n-grams back, join them together
    // and append to the results string
    cleanKeywordArray.forEach((word, index) => {
        // if the word is null or empty, or the same size as the min n-gram, we don't have to do anything
        if (word.length + 1 <= nGramSize) {
            // Our word is the size of the min n-gram, so just add it as is, and add a space
            resultString += word + ' ';
        } else if (word && word.length > 0) {
            let nGrams = createNGrams(word, nGramSize);
            // join with spaces, and add a space to the end if this is not the last word
            resultString += nGrams.join(' ') + ' ';
        }
    });

    // if the resultString is null or empty, return the original keywords
    return resultString && resultString !== '' ? resultString.trim() : keywords;
};

/*
 * What is an n-gram? https://en.wikipedia.org/wiki/N-gram
*/
function createNGrams(word, nGramSize) {
    // our list of resulting n-grams
    let nGrams = [];
    // our index value for the iterator. We need this to determine
    // where to slice n-grams from the word
    let index = word.length - nGramSize + 1;
    
    while (nGramSize <= word.length + 1) {
        if (index !== 0) {
            nGrams.push(word.slice(--index, index + nGramSize));
        } else {
            nGramSize++;
            index = word.length - nGramSize + 1;
        }
    }

    return nGrams;
}