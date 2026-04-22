FROM python:3.12-slim

# Install postgresql-client so pg_dump / psql are available for backup and restore
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod +x entrypoint.sh

EXPOSE 3010

ENTRYPOINT ["./entrypoint.sh"]
