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
  created_at: Date;
}

interface Transaction {
  id: string;
  business_id: string;
  customer_id: string | null;
  item_name: string | null;
  quantity: number | null;
  unit: string | null;
  price: number;
  type: string;
  date: Date;
  ai_confidence: number | null;
  source_type: string | null;
  source_image_url: string | null;
  raw_text: string | null;
  is_confirmed: boolean;
  created_at: Date;
}

interface Customer {
  id: string;
  business_id: string;
  name: string;
  phone: string | null;
  total_udhar: number;
  created_at: Date;
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
      'SELECT COUNT(*) as count FROM "Transaction" WHERE business_id = $1',
      [businessId]
    );

    const customerResult = await pool.query(
      'SELECT COUNT(*) as count FROM "Customer" WHERE business_id = $1',
      [businessId]
    );

    return {
      plan: businessResult.rows[0].plan,
      transactionCount: parseInt(transactionResult.rows[0].count),
      customerCount: parseInt(customerResult.rows[0].count),
    };
  }

  // Transaction operations
  async createTransaction(data: Omit<Transaction, 'id' | 'created_at'>): Promise<Transaction> {
    const result = await pool.query(`
      INSERT INTO "Transaction" (
        business_id, customer_id, item_name, quantity, unit, 
        price, type, date, ai_confidence, source_type, 
        source_image_url, raw_text, is_confirmed
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
      RETURNING *
    `, [
      data.business_id, data.customer_id, data.item_name, data.quantity,
      data.unit, data.price, data.type, data.date, data.ai_confidence,
      data.source_type, data.source_image_url, data.raw_text, data.is_confirmed
    ]);
    return result.rows[0];
  }

  async getTransactionsByBusiness(businessId: string): Promise<Transaction[]> {
    const result = await pool.query(
      'SELECT * FROM "Transaction" WHERE business_id = $1 ORDER BY date DESC',
      [businessId]
    );
    return result.rows;
  }

  // Customer operations
  async createCustomer(data: Omit<Customer, 'id' | 'created_at'>): Promise<Customer> {
    const result = await pool.query(
      'INSERT INTO "Customer" (business_id, name, phone, total_udhar) VALUES ($1, $2, $3, $4) RETURNING *',
      [data.business_id, data.name, data.phone, data.total_udhar]
    );
    return result.rows[0];
  }

  async getCustomersByBusiness(businessId: string): Promise<Customer[]> {
    const result = await pool.query(
      'SELECT * FROM "Customer" WHERE business_id = $1 ORDER BY created_at DESC',
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
    const fields = Object.keys(data).filter(key => key !== 'id').map((key, index) => `${key} = $${index + 2}`).join(', ');
    const values = Object.values(data).filter((_, index) => Object.keys(data)[index] !== 'id');
    
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
