/**
 * Sample TypeScript file for testing
 * This file contains various TypeScript constructs
 */

// Type aliases
type ID = string | number;
type Callback<T> = (result: T) => void;

// Interface definition
interface User {
  id: ID;
  name: string;
  email: string;
  age?: number;
  roles: string[];
}

// Enum
enum Status {
  Pending = "PENDING",
  Active = "ACTIVE",
  Completed = "COMPLETED",
  Failed = "FAILED",
}

// Generic class
class GenericRepository<T extends { id: ID }> {
  private items: Map<ID, T> = new Map();

  add(item: T): void {
    this.items.set(item.id, item);
  }

  get(id: ID): T | undefined {
    return this.items.get(id);
  }

  update(id: ID, updates: Partial<T>): T | undefined {
    const item = this.items.get(id);
    if (item) {
      const updated = { ...item, ...updates };
      this.items.set(id, updated);
      return updated;
    }
    return undefined;
  }

  delete(id: ID): boolean {
    return this.items.delete(id);
  }

  findAll(): T[] {
    return Array.from(this.items.values());
  }

  findBy(predicate: (item: T) => boolean): T[] {
    return this.findAll().filter(predicate);
  }
}

// Abstract class
abstract class Shape {
  abstract area(): number;
  abstract perimeter(): number;

  describe(): string {
    return `Area: ${this.area()}, Perimeter: ${this.perimeter()}`;
  }
}

// Implementing abstract class
class Rectangle extends Shape {
  constructor(
    private width: number,
    private height: number,
  ) {
    super();
  }

  area(): number {
    return this.width * this.height;
  }

  perimeter(): number {
    return 2 * (this.width + this.height);
  }
}

class Circle extends Shape {
  constructor(private radius: number) {
    super();
  }

  area(): number {
    return Math.PI * this.radius ** 2;
  }

  perimeter(): number {
    return 2 * Math.PI * this.radius;
  }
}

// Union types and type guards
type Result<T> = { success: true; data: T } | { success: false; error: string };

function isSuccess<T>(result: Result<T>): result is { success: true; data: T } {
  return result.success === true;
}

// Async function with generics
async function fetchData<T>(url: string): Promise<Result<T>> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return {
        success: false,
        error: `HTTP error! status: ${response.status}`,
      };
    }
    const data = await response.json();
    return {
      success: true,
      data: data as T,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Decorator (experimental)
function log(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const original = descriptor.value;
  descriptor.value = function (...args: any[]) {
    console.log(`Calling ${propertyKey} with args:`, args);
    const result = original.apply(this, args);
    console.log(`Result:`, result);
    return result;
  };
  return descriptor;
}

// Class with decorators
class MathService {
  @log
  add(a: number, b: number): number {
    return a + b;
  }

  @log
  multiply(a: number, b: number): number {
    return a * b;
  }
}

// Namespace
namespace Utils {
  export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number,
  ): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }

  export function throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number,
  ): (...args: Parameters<T>) => void {
    let inThrottle: boolean;
    return (...args: Parameters<T>) => {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  }
}

// Mapped types
type Readonly<T> = {
  readonly [P in keyof T]: T[P];
};

type Partial<T> = {
  [P in keyof T]?: T[P];
};

// Conditional types
type IsArray<T> = T extends any[] ? true : false;
type ElementType<T> = T extends (infer E)[] ? E : never;

// Template literal types
type HTTPMethod = "GET" | "POST" | "PUT" | "DELETE";
type Endpoint = `/api/${string}`;
type APIRoute = `${HTTPMethod} ${Endpoint}`;

// Utility type usage
type PartialUser = Partial<User>;
type ReadonlyUser = Readonly<User>;
type UserWithoutEmail = Omit<User, "email">;
type UserNameAndEmail = Pick<User, "name" | "email">;

// Function overloading
function process(value: string): string;
function process(value: number): number;
function process(value: string | number): string | number {
  if (typeof value === "string") {
    return value.toUpperCase();
  }
  return value * 2;
}

// Module augmentation example
declare global {
  interface Array<T> {
    customMap<U>(callback: (item: T) => U): U[];
  }
}

Array.prototype.customMap = function <T, U>(callback: (item: T) => U): U[] {
  const result: U[] = [];
  for (const item of this) {
    result.push(callback(item));
  }
  return result;
};

// Export statements
export {
  User,
  Status,
  GenericRepository,
  Shape,
  Rectangle,
  Circle,
  Result,
  fetchData,
  MathService,
  Utils,
};

// Default export
export default GenericRepository;
