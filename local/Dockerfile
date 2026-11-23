# Postgres 18 with the Postgres 17 binaries next to it, which is what
# pg_upgrade needs. Both come from the PGDG packages the official image uses.
FROM postgres:18.7-bookworm
RUN sed -i 's/ main 18$/ main 18 17/' /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-17 \
 && rm -rf /var/lib/apt/lists/*
