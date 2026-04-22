import { Pool } from 'pg';

// Neon PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Types
interface Business {
  id: string;
  phone: string;
  name: string | null;
  language: string;
  plan: 'free' | 'pro' | 'business';
  createdAt: Date;
}

interface Transaction {
  id: string;
  businessId: string;
  customerId: string | null;
  itemName: string | null;
  quantity: number | null;
  unit: string | null;
  price: number;
  type: string;
  date: Date;
  aiConfidence: number | null;
  sourceType: string | null;
  sourceImageUrl: string | null;
  rawText: string | null;
  isConfirmed: boolean;
  createdAt: Date;
}

interface Customer {
  id: string;
  businessId: string;
  name: string;
  phone: string | null;
  totalUdhar: number;
  createdAt: Date;
}

class NeonDatabase {

  // Business operations
  async findBusinessByPhone(phone: string): Promise<Business | null> {
    const result = await pool.query(
      'SELECT * FROM "Business" WHERE phone = $1',
      [phone]
    );
    return result.rows[0] || null;
  }

  async createBusiness(data: { phone: string; name?: string | null; language?: string; plan?: 'free' | 'pro' | 'business' }): Promise<Business> {
    const result = await pool.query(
      'INSERT INTO "Business" (phone, name, language, plan) VALUES ($1, $2, $3, $4) RETURNING *',
      [data.phone, data.name || null, data.language || 'hi', data.plan || 'free']
    );
    return result.rows[0];
  }

  async findBusinessById(id: string): Promise<Business | null> {
    const result = await pool.query(
      'SELECT * FROM "Business" WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async updateBusinessPlan(businessId: string, plan: 'free' | 'pro' | 'business'): Promise<Business | null> {
    const result = await pool.query(
      'UPDATE "Business" SET plan = $1 WHERE id = $2 RETURNING *',
      [plan, businessId]
    );
    return result.rows[0] || null;
  }

  async getBusinessUsageStats(businessId: string): Promise<{
    transactionCount: number;
    customerCount: number;
    plan: 'free' | 'pro' | 'business';
  }> {
    const businessResult = await pool.query(
      'SELECT plan FROM "Business" WHERE id = $1',
      [businessId]
    );

    if (!businessResult.rows[0]) {
      throw new Error('Business not found');
    }

    const transactionResult = await pool.query(
      'SELECT COUNT(*) as count FROM "Transaction" WHERE "businessId" = $1',
      [businessId]
    );

    const customerResult = await pool.query(
      'SELECT COUNT(*) as count FROM "Customer" WHERE "businessId" = $1',
      [businessId]
    );

    return {
      plan: businessResult.rows[0].plan,
      transactionCount: parseInt(transactionResult.rows[0].count),
      customerCount: parseInt(customerResult.rows[0].count),
    };
  }

  // Transaction operations
  async createTransaction(data: Omit<Transaction, 'id' | 'createdAt'>): Promise<Transaction> {
    const result = await pool.query(`
      INSERT INTO "Transaction" (
        "businessId", "customerId", "itemName", quantity, unit,
        price, type, date, "aiConfidence", "sourceType",
        "sourceImageUrl", "rawText", "isConfirmed"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      data.businessId, data.customerId, data.itemName, data.quantity,
      data.unit, data.price, data.type, data.date, data.aiConfidence,
      data.sourceType, data.sourceImageUrl, data.rawText, data.isConfirmed
    ]);
    return result.rows[0];
  }

  async getTransactionsByBusiness(businessId: string): Promise<Transaction[]> {
    const result = await pool.query(
      'SELECT * FROM "Transaction" WHERE "businessId" = $1 ORDER BY date DESC',
      [businessId]
    );
    return result.rows;
  }

  // Customer operations
  async createCustomer(data: Omit<Customer, 'id' | 'createdAt'>): Promise<Customer> {
    const result = await pool.query(
      'INSERT INTO "Customer" ("businessId", name, phone, "totalUdhar") VALUES ($1, $2, $3, $4) RETURNING *',
      [data.businessId, data.name, data.phone, data.totalUdhar]
    );
    return result.rows[0];
  }

  async getCustomersByBusiness(businessId: string): Promise<Customer[]> {
    const result = await pool.query(
      'SELECT * FROM "Customer" WHERE "businessId" = $1 ORDER BY "createdAt" DESC',
      [businessId]
    );
    return result.rows;
  }

  async findCustomerById(id: string): Promise<Customer | null> {
    const result = await pool.query(
      'SELECT * FROM "Customer" WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async updateCustomer(id: string, data: Partial<Customer>): Promise<Customer | null> {
    const fields = Object.keys(data)
      .filter(key => key !== 'id')
      .map((key, index) => `"${key}" = $${index + 2}`)
      .join(', ');
    const values = Object.entries(data)
      .filter(([key]) => key !== 'id')
      .map(([, value]) => value);

    const result = await pool.query(
      `UPDATE "Customer" SET ${fields} WHERE id = $1 RETURNING *`,
      [id, ...values]
    );
    return result.rows[0] || null;
  }

  // Test connection
  async testConnection(): Promise<boolean> {
    try {
      const result = await pool.query('SELECT 1 as test');
      return result.rows[0].test === 1;
    } catch (error) {
      console.error('Database connection test failed:', error);
      return false;
    }
  }
}

export const neonDb = new NeonDatabase();

