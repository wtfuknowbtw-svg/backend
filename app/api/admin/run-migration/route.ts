import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// One-time migration endpoint – DELETE THIS FILE after running once
// Call with: POST /api/admin/run-migration  { "secret": "apnakhata-migrate-2026" }

export async function POST(request: Request) {
    const body = await request.json().catch(() => ({}));

    if (body.secret !== 'apnakhata-migrate-2026') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const results: { step: string; status: string; error?: string }[] = [];

    const steps = [
        {
            name: 'Add invoiceCounter to Business',
            sql: `ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "invoiceCounter" INTEGER NOT NULL DEFAULT 0`,
        },
        {
            name: 'Create WholesalePurchase table',
            sql: `CREATE TABLE IF NOT EXISTS "WholesalePurchase" (
                "id" TEXT NOT NULL,
                "businessId" TEXT NOT NULL,
                "itemName" TEXT NOT NULL,
                "quantity" DOUBLE PRECISION NOT NULL,
                "unit" TEXT NOT NULL,
                "totalPrice" DOUBLE PRECISION NOT NULL,
                "supplierName" TEXT,
                "purchaseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "WholesalePurchase_pkey" PRIMARY KEY ("id")
            )`,
        },
        {
            name: 'Create Invoice table',
            sql: `CREATE TABLE IF NOT EXISTS "Invoice" (
                "id" TEXT NOT NULL,
                "invoiceNumber" TEXT NOT NULL,
                "businessId" TEXT NOT NULL,
                "customerName" TEXT NOT NULL,
                "customerPhone" TEXT,
                "customerAddress" TEXT,
                "subtotal" DOUBLE PRECISION NOT NULL,
                "gstRate" DOUBLE PRECISION NOT NULL,
                "gstAmount" DOUBLE PRECISION NOT NULL,
                "totalAmount" DOUBLE PRECISION NOT NULL,
                "notes" TEXT,
                "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
            )`,
        },
        {
            name: 'Create InvoiceItem table',
            sql: `CREATE TABLE IF NOT EXISTS "InvoiceItem" (
                "id" TEXT NOT NULL,
                "invoiceId" TEXT NOT NULL,
                "itemName" TEXT NOT NULL,
                "quantity" DOUBLE PRECISION NOT NULL,
                "unit" TEXT NOT NULL,
                "pricePerUnit" DOUBLE PRECISION NOT NULL,
                "totalPrice" DOUBLE PRECISION NOT NULL,
                CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
            )`,
        },
        {
            name: 'FK: WholesalePurchase → Business',
            sql: `DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'WholesalePurchase_businessId_fkey') THEN
                    ALTER TABLE "WholesalePurchase" ADD CONSTRAINT "WholesalePurchase_businessId_fkey"
                        FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
                END IF;
            END $$`,
        },
        {
            name: 'FK: Invoice → Business',
            sql: `DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'Invoice_businessId_fkey') THEN
                    ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_businessId_fkey"
                        FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
                END IF;
            END $$`,
        },
        {
            name: 'FK: InvoiceItem → Invoice (cascade)',
            sql: `DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'InvoiceItem_invoiceId_fkey') THEN
                    ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey"
                        FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
                END IF;
            END $$`,
        },
        {
            name: 'Mark migration in _prisma_migrations',
            sql: `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
                VALUES (
                    gen_random_uuid()::text,
                    'manual_20260605001800',
                    NOW(),
                    '20260605001800_add_invoices_wholesale',
                    NULL, NULL, NOW(), 1
                ) ON CONFLICT DO NOTHING`,
        },
    ];

    for (const step of steps) {
        try {
            await prisma.$executeRawUnsafe(step.sql);
            results.push({ step: step.name, status: 'ok' });
        } catch (err: any) {
            results.push({ step: step.name, status: 'error', error: err.message });
        }
    }

    const hasErrors = results.some(r => r.status === 'error');
    return NextResponse.json({
        success: !hasErrors,
        message: hasErrors
            ? 'Some steps failed – see results'
            : '✅ Migration applied! Delete /api/admin/run-migration now.',
        results,
    }, { status: hasErrors ? 500 : 200 });
}
