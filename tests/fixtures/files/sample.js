/**
 * Sample JavaScript file for testing
 * This file contains various JavaScript constructs
 */

// Basic function
function greet(name) {
  return `Hello, ${name}!`;
}

// Arrow function
const add = (a, b) => a + b;

// Class definition
class Calculator {
  constructor() {
    this.result = 0;
  }

  add(value) {
    this.result += value;
    return this;
  }

  subtract(value) {
    this.result -= value;
    return this;
  }

  multiply(value) {
    this.result *= value;
    return this;
  }

  divide(value) {
    if (value === 0) {
      throw new Error('Division by zero');
    }
    this.result /= value;
    return this;
  }

  getResult() {
    return this.result;
  }

  reset() {
    this.result = 0;
    return this;
  }
}

// Async function
async function fetchData(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
}

// Generator function
function* fibonacci(n) {
  let [a, b] = [0, 1];
  for (let i = 0; i < n; i++) {
    yield a;
    [a, b] = [b, a + b];
  }
}

// Object with methods
const utils = {
  // Method to deep clone an object
  deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map((item) => this.deepClone(item));
    if (obj instanceof Object) {
      const clonedObj = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          clonedObj[key] = this.deepClone(obj[key]);
        }
      }
      return clonedObj;
    }
  },

  // Method to debounce a function
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  // Method to format a date
  formatDate(date, format = 'YYYY-MM-DD') {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');

    return format.replace('YYYY', year).replace('MM', month).replace('DD', day);
  },
};

// Example of closures
function createCounter() {
  let count = 0;
  return {
    increment() {
      count++;
      return count;
    },
    decrement() {
      count--;
      return count;
    },
    getCount() {
      return count;
    },
  };
}

// Promise example
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Module exports (CommonJS style comment)
// module.exports = { greet, add, Calculator, fetchData, utils };

// ES6 exports
export {
  greet,
  add,
  Calculator,
  fetchData,
  fibonacci,
  utils,
  createCounter,
  delay,
};

// Default export
export default Calculator;
