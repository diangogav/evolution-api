# Evolution API

[![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=for-the-badge&logo=bun&logoColor=white)](https://bun.sh)
[![ElysiaJS](https://img.shields.io/badge/ElysiaJS-23c45e?style=for-the-badge&logo=elysia&logoColor=white)](https://elysiajs.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![TypeORM](https://img.shields.io/badge/TypeORM-FE0C05?style=for-the-badge&logo=typeorm&logoColor=white)](https://typeorm.io)

> The official backend API for the Evolution Yu-Gi-Oh! platform.

## About

Evolution API is a high-performance backend built with Bun and ElysiaJS, serving as the core infrastructure for the Evolution competitive Yu-Gi-Oh! platform. It manages tournaments, player rankings, ban lists, and detailed match statistics to provide a seamless experience for players and organizers.

## Key Features

- **🏆 Tournament Management**: Create, manage, and track competitive tournaments with automated bracket generation.
- **📊 Real-time Leaderboards**: Dynamic ranking systems based on match performance.
- **🚫 Ban List Management**: Maintain and enforce custom card ban lists for different formats.
- **📈 Comprehensive Scatistics**: Detailed player stats, match history, and performance analytics.
- **🎁 Season Wrapped**: Generate personalized season summaries for players.
- **🔒 Secure Authentication**: Robust JWT-based authentication for user accounts.

## Tech Stack

- **Runtime**: [Bun](https://bun.sh) - Fast all-in-one JavaScript runtime.
- **Framework**: [ElysiaJS](https://elysiajs.com) - Ergonomic web framework for Bun.
- **Database**: [PostgreSQL](https://www.postgresql.org) - Powerful open-source relational database.
- **ORM**: [TypeORM](https://typeorm.io) - Data mapping for TypeScript.
- **Validation**: TypeBox (integrated with Elysia).

## Architecture

This project follows **Hexagonal Architecture (Ports and Adapters)** and **Domain-Driven Design (DDD)** principles to ensure scalability, maintainability, and testability.

- **Domain Layer**: Contains the core business logic, entities, and value objects.
- **Application Layer**: Orchestrates use cases and application flow.
- **Infrastructure Layer**: Handles external concerns like database access, API routes, and third-party services.

> [!NOTE]
> For a detailed breakdown of our architectural patterns and available development skills, please refer to [AGENTS.md](./AGENTS.md).

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (v1.0.0 or later)
- [Docker](https://www.docs.docker.com/get-docker/) (optional, for containerized database)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/diangogav/evolution-api.git
    cd evolution-api
    ```

2.  **Install dependencies:**
    ```bash
    bun install
    ```

3.  **Environment Setup:**
    Copy the example environment file and configure it:
    ```bash
    cp .env.example .env
    ```
    Update the `.env` file with your database credentials and other configuration settings.

### Running the Application

**Development Mode:**
```bash
bun run dev
```

**Production Build:**
```bash
bun run build
bun start
```

## API Documentation

The API documentation is automatically generated using Swagger.

1.  Start the server (`bun run dev`).
2.  Navigate to `http://localhost:3000/swagger` in your browser.

## Contributing

We welcome contributions! Please check our [AGENTS.md](./AGENTS.md) for coding standards and architectural guidelines before submitting a Pull Request.

## License

This project is licensed under the [MIT License](LICENSE).