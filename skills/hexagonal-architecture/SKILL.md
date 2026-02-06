---
name: hexagonal-architecture
description: Guide for implementing Hexagonal Architecture (Ports and Adapters), detailing layer responsibilities and dependency rules.
---

# Hexagonal Architecture Guide

This skill guides the implementation of Hexagonal Architecture to ensure clean separation of concerns and testability.

## Architectural Layers

### 1. Domain Layer (Core)
The heart of the application. It contains business logic and rules.
- **Dependencies:** NONE. It must not depend on any outer layer.
- **Contents:** Entities, Value Objects, Aggregates, Domain Services, Repository Interfaces (Ports).

### 2. Application Layer
Orchestrates the domain objects to perform specific user tasks (Use Cases).
- **Dependencies:** Domain Layer.
- **Contents:** Use Cases (Application Services), DTOs (Data Transfer Objects).
- **Responsibility:**
  - Receives input from the Driving Adapters (controllers).
  - Validates input.
  - Calls Domain objects or services.
  - persist state using Repository Ports.

### 3. Infrastructure Layer (Adapters)
Contains the implementation of the interfaces defined in the Domain/Application layers and the entry points to the application.
- **Dependencies:** Application Layer, Domain Layer.
- **Contents:**
  - **Driving Adapters:** HTTP Controllers (Express/Fastify), Event Listeners, CLI commands.
  - **Driven Adapters:** Database Repositories (Postgres, Mongo), External APIs (Stripe, Email), File System.

## Dependency Rule
**Source Code Dependencies must point only inward, toward the Domain.**
`Infrastructure -> Application -> Domain`

### 4. Use Cases (Application Services)
Use Cases orchestrate the flow of data between the User (via DTOs) and the Domain.

**Template:**
```typescript
interface CreateOrderDTO {
  customerId: string;
  items: { productId: string; quantity: number }[];
}

export class CreateOrderUseCase {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly customerRepository: CustomerRepository
  ) {}

  public async execute(dto: CreateOrderDTO): Promise<void> {
    const customer = await this.customerRepository.findById(dto.customerId);
    if (!customer) throw new Error("Customer not found");

    const order = new Order(generateId(), customer.id);

    // ... logic to add items

    await this.orderRepository.save(order);
  }
}
```

**Rules:**
- Accept **DTOs**, not raw HTTP requests.
- Return **DTOs** or void, not Domain Entities (to avoid leaking domain logic to the controller).
- Orchestrate, don't implement core business rules (delegating them to Entities or Domain Services).

## Folder Structure

```
src/
  modules/
    [module-name]/
      domain/        # Inner Hexagon (Core)
        models/
        repositories/ (Interfaces)
      application/   # Use Cases
        use-cases/
        dtos/
      infrastructure/ # Outer Hexagon (Adapters)
        http/
          controllers/
          routes/
        persistence/
          repositories/ (Implementations)
          mappers/
```

## Implementation Rules

1. **Repositories:** Define the interface in `domain/repositories`. Implement it in `infrastructure/persistence`.
2. **DTOs:** Use DTOs to transfer data between the Controller and the Use Case. Do not pass Domain Entities to the Controller.
3. **Mappers:** Use Mappers in the Infrastructure layer to convert Database Models to Domain Entities and vice versa.
