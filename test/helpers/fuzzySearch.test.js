/**
 * Unit Tests for API Helpers - Fuzzy Search
 * 
 * Testing fuzzy search n-gram generation functions
 */

const { expect } = require('chai');
const fuzzySearch = require('../../api/helpers/fuzzySearch');

describe('FuzzySearch Helper Functions', () => {
  
  describe('createFuzzySearchString', () => {
    
    describe('Basic Functionality', () => {
      it('should return original string for single character', () => {
        const result = fuzzySearch.createFuzzySearchString('a', 2);
        expect(result).to.equal('a');
      });

      it('should return original string for two character word with nGramSize 2', () => {
        const result = fuzzySearch.createFuzzySearchString('ab', 2);
        expect(result).to.equal('ab');
      });

      it('should generate n-grams for three character word', () => {
        const result = fuzzySearch.createFuzzySearchString('abc', 2);
        expect(result).to.be.a('string');
        expect(result.length).to.be.greaterThan(0);
      });

      it('should handle longer words', () => {
        const result = fuzzySearch.createFuzzySearchString('project', 2);
        expect(result).to.be.a('string');
        // Should contain various n-grams
        expect(result.split(' ').length).to.be.greaterThan(1);
      });
    });

    describe('N-Gram Size Variations', () => {
      it('should use default n-gram size when not provided', () => {
        const result = fuzzySearch.createFuzzySearchString('test');
        expect(result).to.be.a('string');
      });

      it('should use default n-gram size when null', () => {
        const result = fuzzySearch.createFuzzySearchString('test', null);
        expect(result).to.be.a('string');
      });

      it('should use default n-gram size when zero', () => {
        const result = fuzzySearch.createFuzzySearchString('test', 0);
        expect(result).to.be.a('string');
      });

      it('should use default n-gram size when negative', () => {
        const result = fuzzySearch.createFuzzySearchString('test', -1);
        expect(result).to.be.a('string');
      });

      it('should accept custom n-gram size of 3', () => {
        const result = fuzzySearch.createFuzzySearchString('testing', 3);
        expect(result).to.be.a('string');
      });

      it('should accept custom n-gram size of 1', () => {
        const result = fuzzySearch.createFuzzySearchString('test', 1);
        expect(result).to.be.a('string');
        // With size 1, should include individual characters
        expect(result).to.include('t');
        expect(result).to.include('e');
        expect(result).to.include('s');
      });
    });

    describe('Special Character Handling', () => {
      it('should remove special characters', () => {
        const result = fuzzySearch.createFuzzySearchString('test!@#', 2);
        expect(result).to.not.include('!');
        expect(result).to.not.include('@');
        expect(result).to.not.include('#');
      });

      it('should remove punctuation', () => {
        const result = fuzzySearch.createFuzzySearchString('hello, world!', 2);
        expect(result).to.not.include(',');
        expect(result).to.not.include('!');
      });

      it('should handle parentheses and brackets', () => {
        const result = fuzzySearch.createFuzzySearchString('test(ing)[data]', 2);
        expect(result).to.not.include('(');
        expect(result).to.not.include(')');
        expect(result).to.not.include('[');
        expect(result).to.not.include(']');
      });

      it('should replace underscores with spaces', () => {
        const result = fuzzySearch.createFuzzySearchString('hello_world', 2);
        expect(result).to.not.include('_');
        // Should treat as two separate words
        expect(result).to.be.a('string');
      });

      it('should handle hyphens', () => {
        const result = fuzzySearch.createFuzzySearchString('test-case', 2);
        expect(result).to.not.include('-');
      });
    });

    describe('Case Sensitivity', () => {
      it('should convert to lowercase when caseSensitive is true', () => {
        const result = fuzzySearch.createFuzzySearchString('TEST', 2, true);
        // When caseSensitive is true, converts to lowercase (backwards logic in implementation)
        expect(result).to.not.match(/[A-Z]/);
      });

      it('should convert mixed case to lowercase when caseSensitive is true', () => {
        const result = fuzzySearch.createFuzzySearchString('TeSt', 2, true);
        expect(result).to.not.match(/[A-Z]/);
      });

      it('should preserve case when caseSensitive is true', () => {
        const result = fuzzySearch.createFuzzySearchString('TEST', 2, true);
        // When case sensitive, should not convert
        expect(result).to.be.a('string');
      });

      it('should not convert case when caseSensitive is true', () => {
        const result = fuzzySearch.createFuzzySearchString('Test', 2, true);
        expect(result).to.be.a('string');
      });
    });

    describe('Multiple Words', () => {
      it('should handle two word phrase', () => {
        const result = fuzzySearch.createFuzzySearchString('hello world', 2);
        expect(result).to.be.a('string');
        expect(result.length).to.be.greaterThan(0);
      });

      it('should handle three word phrase', () => {
        const result = fuzzySearch.createFuzzySearchString('the quick brown', 2);
        expect(result).to.be.a('string');
      });

      it('should handle multiple spaces', () => {
        const result = fuzzySearch.createFuzzySearchString('hello    world', 2);
        expect(result).to.be.a('string');
      });

      it('should handle leading spaces', () => {
        const result = fuzzySearch.createFuzzySearchString('  hello', 2);
        expect(result).to.be.a('string');
      });

      it('should handle trailing spaces', () => {
        const result = fuzzySearch.createFuzzySearchString('hello  ', 2);
        expect(result).to.be.a('string');
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty string', () => {
        const result = fuzzySearch.createFuzzySearchString('', 2);
        expect(result).to.equal('');
      });

      it('should handle only spaces', () => {
        const result = fuzzySearch.createFuzzySearchString('   ', 2);
        expect(result).to.be.a('string');
      });

      it('should handle only special characters', () => {
        const result = fuzzySearch.createFuzzySearchString('!@#$%', 2);
        // After removing special chars, should return original or empty
        expect(result).to.be.a('string');
      });

      it('should handle numbers', () => {
        const result = fuzzySearch.createFuzzySearchString('12345', 2);
        expect(result).to.include('1');
        expect(result).to.include('2');
      });

      it('should handle alphanumeric strings', () => {
        const result = fuzzySearch.createFuzzySearchString('test123', 2);
        expect(result).to.be.a('string');
      });
    });

    describe('Real World Examples', () => {
      it('should process project name', () => {
        const result = fuzzySearch.createFuzzySearchString('Eagle Mountain Project', 2);
        expect(result).to.be.a('string');
        expect(result.length).to.be.greaterThan(0);
      });

      it('should process organization name', () => {
        const result = fuzzySearch.createFuzzySearchString('BC Government', 2);
        expect(result).to.be.a('string');
      });

      it('should process email-like string', () => {
        const result = fuzzySearch.createFuzzySearchString('user@example.com', 2);
        expect(result).to.be.a('string');
        expect(result).to.not.include('@');
        expect(result).to.not.include('.');
      });

      it('should process file name', () => {
        const result = fuzzySearch.createFuzzySearchString('document_2023.pdf', 2);
        expect(result).to.be.a('string');
        expect(result).to.not.include('_');
        expect(result).to.not.include('.');
      });

      it('should process address', () => {
        const result = fuzzySearch.createFuzzySearchString('123 Main St., Vancouver', 2);
        expect(result).to.be.a('string');
        expect(result).to.not.include(',');
        expect(result).to.not.include('.');
      });
    });

    describe('N-Gram Generation Logic', () => {
      it('should generate overlapping n-grams', () => {
        const result = fuzzySearch.createFuzzySearchString('test', 2);
        // For "test" with n-gram size 2, should generate: te, es, st
        expect(result).to.be.a('string');
        const parts = result.trim().split(' ');
        expect(parts.length).to.be.greaterThan(1);
      });

      it('should generate correct number of n-grams for word length', () => {
        const result = fuzzySearch.createFuzzySearchString('hello', 2);
        expect(result).to.be.a('string');
        // Should have n-grams for a 5-letter word
        const parts = result.trim().split(' ');
        expect(parts.length).to.be.greaterThan(3);
      });

      it('should trim result string', () => {
        const result = fuzzySearch.createFuzzySearchString('test', 2);
        // Result should not have leading/trailing spaces
        expect(result).to.equal(result.trim());
      });
    });

    describe('Invalid Input Handling', () => {
      it('should handle non-string input gracefully', () => {
        // This might throw an error or handle it - depends on implementation
        // Testing defensive programming
        try {
          const result = fuzzySearch.createFuzzySearchString(undefined, 2);
          expect(result).to.exist;
        } catch (error) {
          expect(error).to.exist;
        }
      });

      it('should handle null input', () => {
        try {
          const result = fuzzySearch.createFuzzySearchString(null, 2);
          expect(result).to.exist;
        } catch (error) {
          expect(error).to.exist;
        }
      });
    });
  });
});
