---
name: ddd-implementation
description: Guide for implementing Domain-Driven Design (DDD) in TypeScript, focusing on Entities, Value Objects, Aggregates, and Domain Services.
---

# DDD Implementation Guide

This skill provides patterns and templates for implementing Domain-Driven Design (DDD) in TypeScript. It follows principles from [Domain-Driven Design in TypeScript](https://spaceout.pl/domain-driven-design-in-typescript).

## Core Building Blocks

### 1. Value Objects
Value Objects are immutable and defined by their attributes. They encapsulate validation logic.

**Template:**
```typescript
interface AddressProps {
  street: string;
  city: string;
  zip: string;
}

export class Address {
  constructor(public readonly props: AddressProps) {
    this.validate();
  }

  private validate(): void {
    if (!this.props.street || !this.props.city || !this.props.zip) {
      throw new Error("Address incomplete");
    }
  }

  public equals(other: Address): boolean {
    return (
      this.props.street === other.props.street &&
      this.props.city === other.props.city &&
      this.props.zip === other.props.zip
    );
  }
}
```

**Rules:**
- Use `readonly` properties.
- Implement `equals()` for comparison.
- Validate in the constructor.

### 2. Entities
Entities have a unique identity that persists over time.

**Template:**
```typescript
export class Customer {
  constructor(
    public readonly id: string,
    public name: string,
    public email: string
  ) {}

  public changeName(newName: string): void {
    if (!newName) throw new Error("Name cannot be empty");
    this.name = newName;
  }
}
```

**Rules:**
- Identity (`id`) must be unique and immutable.
- State mutation should be done through semantic methods (e.g., `changeName`), not direct property assignment.

### 3. Aggregates
Aggregates are clusters of objects treated as a unit. Access is only allowed through the Aggregate Root.

**Template:**
```typescript
export class Order {
  private items: OrderItem[] = [];

  constructor(public readonly id: string, public readonly customerId: string) {}

  public addItem(item: OrderItem): void {
    // Invariant check
    if (this.isValidItem(item)) {
      this.items.push(item);
    }
  }

  public get total(): number {
    return this.items.reduce((sum, item) => sum + item.price, 0);
  }
  
  private isValidItem(item: OrderItem): boolean {
    // validation logic
    return true;
  }
}
```

**Rules:**
- The Root (e.g., `Order`) controls access to internal entities (`OrderItem`).
- Enforce consistency boundaries within the Aggregate.
- Reference other aggregates by ID, not by object.

### 4. Domain Services
Services contain domain logic that doesn't fit into a single Entity or Value Object.

**Template:**
```typescript
export class PaymentService {
  constructor(private readonly paymentGateway: PaymentGateway) {}

  public async processPayment(order: Order, paymentDetails: PaymentDetails): Promise<boolean> {
    // Logic involving multiple aggregates or external services integration
    return this.paymentGateway.charge(order.total, paymentDetails);
  }
}
```

**Rules:**
- Stateless.
- Use when an operation involves multiple aggregates.

### 5. Factories
Factories encapsulate complex creation logic, especially for aggregates.

**Template:**
```typescript
export class BankAccountFactory {
  static openAccount(id: string, initialBalance: number): BankAccount {
    if (initialBalance < 0) throw new Error('Initial balance must be non-negative');
    return new BankAccount(id, initialBalance);
  }
}
```

### 6. Repositories
Repositories abstract persistence. They work with Aggregates, not Entities or Value Objects directly.

**Template:**
```typescript
interface OrderRepository {
  findById(id: string): Promise<Order | null>;
  save(order: Order): Promise<void>;
}
```

## Advanced Patterns

### Specification Pattern
Encapsulate business rules as reusable, composable objects.

**Template:**
```typescript
interface Specification<T> {
  isSatisfiedBy(candidate: T): boolean;
}

export class OverdraftAllowed implements Specification<BankAccount> {
  isSatisfiedBy(account: BankAccount): boolean {
    return account.balance >= 0;
  }
}
```

### Strategic Design & Anti-Corruption Layer (ACL)
Use an ACL to translate external models to your internal domain model.

**Template:**
```typescript
// External API model
type ExternalOrder = { order_id: string; total: number };

// Internal model
class Order {
  constructor(public readonly id: string, public readonly total: number) {}
}

// Anticorruption Layer
function mapExternalOrder(external: ExternalOrder): Order {
  return new Order(external.order_id, external.total);
}
```

## Best Practices

### Ubiquitous Language
Use the same vocabulary in code as in conversations with domain experts.
- **Bad:** `const x = new Booking(y, z);`
- **Good:** `const booking = new Booking(cargo, voyage);`

### Testing
Test aggregates, value objects, and business rules in isolation.
- Use mocks for repositories and services.
- Test that aggregates enforce invariants.

```typescript
test('BankAccount deposit increases balance', () => {
  const account = new BankAccount('id', 100);
  account.deposit(50);
  expect(account.balance).toBe(150);
});
```

## Directory Structure

```
src/
  modules/
    [module-name]/
      domain/
        entities/
        value-objects/
        services/
        repositories/ (interfaces)
```
