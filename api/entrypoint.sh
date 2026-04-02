#!/bin/sh
set -e

echo "Pushing schema to database..."
# Note: For production, replace with 'prisma migrate deploy' after generating migrations
npx prisma db push

echo "Running database seed..."
node -e "
const { execSync } = require('child_process');
try {
  execSync('npx prisma db seed', { stdio: 'inherit' });
} catch(e) {
  console.log('Seed already applied or failed (non-fatal):', e.message);
}
"

echo "Starting application..."
exec node dist/main
