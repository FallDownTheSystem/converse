#!/usr/bin/env python3
"""
Sample Python file for testing
This file contains various Python constructs
"""

import json
import asyncio
from datetime import datetime
from typing import List, Dict, Optional, Union, Any
from dataclasses import dataclass
from enum import Enum


# Basic function
def greet(name: str) -> str:
    """Greet a person by name."""
    return f"Hello, {name}!"


# Function with default arguments
def add(a: float, b: float = 0) -> float:
    """Add two numbers together."""
    return a + b


# Class definition
class Calculator:
    """A simple calculator class."""
    
    def __init__(self):
        """Initialize calculator with result set to 0."""
        self.result = 0
    
    def add(self, value: float) -> 'Calculator':
        """Add a value to the result."""
        self.result += value
        return self
    
    def subtract(self, value: float) -> 'Calculator':
        """Subtract a value from the result."""
        self.result -= value
        return self
    
    def multiply(self, value: float) -> 'Calculator':
        """Multiply the result by a value."""
        self.result *= value
        return self
    
    def divide(self, value: float) -> 'Calculator':
        """Divide the result by a value."""
        if value == 0:
            raise ValueError("Division by zero")
        self.result /= value
        return self
    
    def get_result(self) -> float:
        """Get the current result."""
        return self.result
    
    def reset(self) -> 'Calculator':
        """Reset the result to 0."""
        self.result = 0
        return self


# Async function
async def fetch_data(url: str) -> Dict[str, Any]:
    """Fetch data from a URL asynchronously."""
    # Simulated async operation
    await asyncio.sleep(0.1)
    return {"url": url, "data": "sample data", "timestamp": datetime.now().isoformat()}


# Generator function
def fibonacci(n: int):
    """Generate Fibonacci sequence up to n numbers."""
    a, b = 0, 1
    for _ in range(n):
        yield a
        a, b = b, a + b


# Decorator
def timer(func):
    """Decorator to time function execution."""
    import time
    from functools import wraps
    
    @wraps(func)
    def wrapper(*args, **kwargs):
        start = time.time()
        result = func(*args, **kwargs)
        end = time.time()
        print(f"{func.__name__} took {end - start:.4f} seconds")
        return result
    return wrapper


# Context manager
class FileManager:
    """Context manager for file operations."""
    
    def __init__(self, filename: str, mode: str = 'r'):
        self.filename = filename
        self.mode = mode
        self.file = None
    
    def __enter__(self):
        self.file = open(self.filename, self.mode)
        return self.file
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.file:
            self.file.close()


# Enum
class Status(Enum):
    """Status enumeration."""
    PENDING = "pending"
    ACTIVE = "active"
    COMPLETED = "completed"
    FAILED = "failed"


# Dataclass
@dataclass
class Person:
    """Person dataclass."""
    name: str
    age: int
    email: Optional[str] = None
    
    def __post_init__(self):
        if self.age < 0:
            raise ValueError("Age cannot be negative")


# Utility functions
def deep_copy(obj: Any) -> Any:
    """Deep copy an object."""
    import copy
    return copy.deepcopy(obj)


def format_date(date: datetime, format_string: str = "%Y-%m-%d") -> str:
    """Format a datetime object to string."""
    return date.strftime(format_string)


# Lambda functions
square = lambda x: x ** 2
is_even = lambda x: x % 2 == 0


# List comprehension example
def get_even_squares(numbers: List[int]) -> List[int]:
    """Get squares of even numbers."""
    return [x ** 2 for x in numbers if x % 2 == 0]


# Dictionary comprehension example
def create_number_dict(n: int) -> Dict[int, int]:
    """Create a dictionary of numbers and their squares."""
    return {i: i ** 2 for i in range(n)}


# Exception handling example
def safe_divide(a: float, b: float) -> Optional[float]:
    """Safely divide two numbers."""
    try:
        return a / b
    except ZeroDivisionError:
        print("Cannot divide by zero")
        return None
    except TypeError:
        print("Invalid types for division")
        return None


# Main function
def main():
    """Main function to demonstrate usage."""
    print(greet("World"))
    
    calc = Calculator()
    result = calc.add(10).multiply(2).subtract(5).get_result()
    print(f"Calculator result: {result}")
    
    # Generator usage
    fib_nums = list(fibonacci(10))
    print(f"Fibonacci numbers: {fib_nums}")
    
    # Enum usage
    status = Status.ACTIVE
    print(f"Status: {status.value}")
    
    # Dataclass usage
    person = Person("Alice", 30, "alice@example.com")
    print(f"Person: {person}")


if __name__ == "__main__":
    main()