#!/usr/bin/env bash
# Recreates the first-run project of analysis/06-ux-and-agents.md (6.1):
# 5 modules and 4 test files with typical weaknesses, Vitest 5, TypeScript.
# Usage: create-project.sh <dir> [mootant.tgz]
# Without a tarball the script stops before installing Mootant: npm has only
# the 0.0.0 placeholder (BUG-653).
set -eu
dir=${1:?target directory}
tgz=${2:-}
mkdir -p "$dir/src" "$dir/test"
cd "$dir"
cat > package.json <<'EOF'
{
  "name": "first-run",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run"
  }
}
EOF
cat > .gitignore <<'EOF'
node_modules
EOF
cat > src/format.ts <<'EOF'
export function formatPrice(value: number, currency = 'USD'): string {
  return `${value.toFixed(2)} ${currency}`
}

export function pluralize(count: number, word: string): string {
  return count === 1 ? `${count} ${word}` : `${count} ${word}s`
}
EOF
cat > src/price.ts <<'EOF'
export interface Item {
  price: number
  quantity: number
}

/**
 * Discount in percent: 10% for orders of 100 or more, 5% for members.
 */
export function getDiscount(total: number, isMember: boolean): number {
  if (total >= 100) {
    return 10
  }
  return isMember ? 5 : 0
}

export function getTotal(items: Item[]): number {
  let total = 0
  for (let item of items) {
    total += item.price * item.quantity
  }
  return Math.round(total * 100) / 100
}

export function applyDiscount(total: number, percent: number): number {
  if (percent <= 0) {
    return total
  }
  return total - (total * percent) / 100
}
EOF
cat > src/retry.ts <<'EOF'
export async function retry<T>(
  task: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await task()
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}
EOF
cat > src/slug.ts <<'EOF'
/**
 * Turns a title into a URL slug.
 */
export function slugify(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 64
}
EOF
cat > src/user.ts <<'EOF'
export interface User {
  name: string
  email?: string
  age?: number
}

export function validateUser(user: User): string[] {
  let errors: string[] = []
  if (user.name.trim() === '') {
    errors.push('name is required')
  }
  if (user.email !== undefined && !user.email.includes('@')) {
    errors.push('email is invalid')
  }
  if (user.age !== undefined && (user.age < 0 || user.age > 150)) {
    errors.push('age is out of range')
  }
  return errors
}

export function displayName(user: User): string {
  console.log('displayName called')
  return user.name || user.email || 'Anonymous'
}
EOF
cat > test/price.test.ts <<'EOF'
import { describe, expect, it } from 'vitest'

import { applyDiscount, getDiscount, getTotal } from '../src/price'

describe('getDiscount', () => {
  it('gives large orders 10% off', () => {
    expect(getDiscount(150, false)).toBe(10)
  })

  it('gives members 5% off', () => {
    expect(getDiscount(50, true)).toBe(5)
  })

  it('gives small orders nothing', () => {
    expect(getDiscount(50, false)).toBe(0)
  })
})

describe('getTotal', () => {
  it('sums items', () => {
    expect(getTotal([{ price: 10, quantity: 1 }])).toBe(10)
  })

  it('returns a number', () => {
    expect(typeof getTotal([])).toBe('number')
  })
})

describe('applyDiscount', () => {
  it('applies a percent', () => {
    expect(applyDiscount(100, 10)).toBe(90)
  })
})
EOF
cat > test/retry.test.ts <<'EOF'
import { expect, it } from 'vitest'

import { retry } from '../src/retry'

it('returns the result', async () => {
  await expect(retry(async () => 42)).resolves.toBe(42)
})
EOF
cat > test/slug.test.ts <<'EOF'
import { expect, it } from 'vitest'

import { isValidSlug, slugify } from '../src/slug'

it('slugifies a title', () => {
  expect(slugify('Hello World')).toBe('hello-world')
})

it('accepts a valid slug', () => {
  expect(isValidSlug('hello-world')).toBe(true)
})
EOF
cat > test/user.test.ts <<'EOF'
import { expect, it } from 'vitest'

import { displayName, validateUser } from '../src/user'

it('reports errors', () => {
  let errors = validateUser({ name: '', email: 'nope', age: 200 })
  expect(errors.length).toBeGreaterThan(0)
})

it('accepts a valid user', () => {
  expect(validateUser({ name: 'Ann', email: 'ann@example.com', age: 30 })).toEqual([])
})

it('shows a name', () => {
  expect(displayName({ name: 'Ann' })).toBeTruthy()
})
EOF
git init -q -b main
npm install -D vitest@5 typescript
npm test
if [ -n "$tgz" ]; then
  npm install -D "$tgz"
  git add -A && git -c user.email=ux@example.com -c user.name=ux commit -qm "initial project"
  echo "next: npx mootant list src; npx mootant run src; npx mootant run src --html"
else
  echo "Mootant is not installed: pass a tarball built from the repository (pnpm build && pnpm pack)."
fi
