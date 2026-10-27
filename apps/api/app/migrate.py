"""Apply privileged database and LangGraph checkpoint schema migrations.

Run as a separate one-off job with MIGRATION_DATABASE_URL, then remove that
credential from the API service environment before starting production.
"""

import asyncio

from app.config import settings
from app.main import migration_engine, prepare_checkpoint_schema, prepare_relational_schema


def main() -> None:
    if not settings.migration_database_url or migration_engine.dialect.name != "postgresql":
        raise RuntimeError("Migrations require a PostgreSQL MIGRATION_DATABASE_URL")
    prepare_relational_schema()
    asyncio.run(prepare_checkpoint_schema())
    print("Database schema and checkpoint tables are ready")


if __name__ == "__main__":
    main()
