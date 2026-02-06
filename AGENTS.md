# Repository Guidelines

## How to Use This Guide

- Start here for project norms and development patterns.
- This project is the backend API (`evolution-api`) for the Evolution Yu-Gi-Oh! platform.
- Consult specific skills in the `skills/` directory for detailed implementation guides.

## Available Skills

Use these skills for detailed patterns on-demand:

### Generic Skills
| Skill | Description | URL |
|-------|-------------|-----|
| `ddd-implementation` | Patterns for Entities, Value Objects, Aggregates, and Domain Services in TypeScript | [SKILL.md](skills/ddd-implementation/SKILL.md) |
| `hexagonal-architecture` | Guide for Ports and Adapters, layer responsibilities, and dependency rules | [SKILL.md](skills/hexagonal-architecture/SKILL.md) |

### Project-Specific Skills
| Skill | Description | URL |
|-------|-------------|-----|
| `evolution-server` | Reference to EDOpro-server-ts for stats calculation and game logic | [SKILL.md](skills/evolution-server/SKILL.md) |

### Auto-invoke Skills

When performing these actions, ALWAYS invoke the corresponding skill FIRST:

| Action | Skill |
|--------|-------|
| Implementing Business Logic | `ddd-implementation` |
| Creating new Use Cases/Endpoints | `hexagonal-architecture` |
| Designing Domain Models | `ddd-implementation` |
| Checking Stats/Game Logic | `evolution-server` |

---

## Project Overview

This is the **Backend API** for the Evolution project.
**Goal**: Provide a robust, scalable API using Domain-Driven Design and Hexagonal Architecture.

### Tech Stack
- **Runtime**: Bun
- **Framework**: ElysiaJS
- **Database**: PostgreSQL (via TypeORM)
- **Language**: TypeScript
- **Architecture**: Hexagonal + DDD

---

## Development Guidelines

### Architecture & Design
- **Hexagonal Architecture**: Strictly follow the dependency rule: `Infrastructure -> Application -> Domain`.
- **DDD**: Use Aggregates, Entities, and Value Objects. Logic belongs in the Domain layer.
- **DTOs**: Always use DTOs for input/output in the Application layer. Never expose Domain entities directly in Controllers.

### Code Style
- Use `camelCase` for variables and functions.
- Use `PascalCase` for classes and types.
- **Always** use strict typing.
- Follow the directory structure defined in `hexagonal-architecture`.
