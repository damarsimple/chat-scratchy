// One-time importer: moves legacy sessions.json into Postgres.
// Each old session becomes a Session row attached to a single "Legacy" class
// (owned by a placeholder "Legacy Import" teacher) so nothing is lost.
//
// Usage: node scripts/migrate-json.mjs [path-to-sessions.json]
// Safe to re-run: skips sessions whose id already exists.

import { readFileSync, existsSync } from 'fs';
import { prisma } from '../lib/db.js';

const JSON_PATH = process.argv[2] ?? '../sessions.json';

async function main() {
  if (!existsSync(JSON_PATH)) {
    console.error(`No file at ${JSON_PATH} — nothing to import.`);
    process.exit(0);
  }

  let data;
  try {
    data = JSON.parse(readFileSync(JSON_PATH, 'utf-8'));
  } catch (e) {
    console.error('Failed to parse sessions.json:', e.message);
    process.exit(1);
  }

  const entries = Object.entries(data);
  console.log(`Found ${entries.length} legacy sessions in ${JSON_PATH}`);

  // Placeholder teacher + class to hang legacy sessions off of.
  const teacher = await prisma.teacher.upsert({
    where: { email: 'legacy@import.local' },
    update: {},
    create: {
      email: 'legacy@import.local',
      // Unusable hash; this account exists only to own the Legacy class.
      passwordHash: '!',
      name: 'Legacy Import',
    },
  });

  const legacyClass = await prisma.class.upsert({
    where: { joinCode: 'LEGACY' },
    update: {},
    create: { name: 'Legacy (imported)', joinCode: 'LEGACY', teacherId: teacher.id },
  });

  let imported = 0;
  let skipped = 0;
  for (const [id, session] of entries) {
    const existing = await prisma.session.findUnique({ where: { id } });
    if (existing) { skipped++; continue; }

    const messages = Array.isArray(session.messages) ? session.messages : [];
    const firstUser = messages.find((m) => m.role === 'user');
    const title = (firstUser?.content ?? '').slice(0, 50) || 'New Chat';

    await prisma.session.create({
      data: {
        id,
        title,
        messages,
        classId: legacyClass.id,
        createdAt: session.createdAt ? new Date(session.createdAt) : undefined,
        updatedAt: session.updatedAt ? new Date(session.updatedAt) : undefined,
        lastActiveAt: session.updatedAt ? new Date(session.updatedAt) : undefined,
      },
    });
    imported++;
  }

  console.log(`Imported ${imported} sessions, skipped ${skipped} (already present).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
