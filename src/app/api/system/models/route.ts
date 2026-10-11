import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

export const AVAILABLE_MODELS = [
  { id: 'User', name: 'Users (Staff & Admins)', category: 'Auth & Security', primaryKey: 'id', description: 'System logins, roles, and credentials' },
  { id: 'LoginAttempt', name: 'Login Attempts', category: 'Auth & Security', primaryKey: 'id', description: 'Security audit trail of successful and failed authentication attempts' },
  { id: 'LoginHistory', name: 'Login History', category: 'Auth & Security', primaryKey: 'id', description: 'User login sessions, active states, and logout timestamps' },
  { id: 'Table', name: 'Tables', category: 'Floor & Orders', primaryKey: 'id', description: 'Restaurant floor tables and occupancy statuses' },
  { id: 'Order', name: 'Orders', category: 'Floor & Orders', primaryKey: 'id', description: 'Customer dining & takeaway orders' },
  { id: 'OrderItem', name: 'Order Items', category: 'Floor & Orders', primaryKey: 'id', description: 'Individual line items with quantities and notes' },
  { id: 'Payment', name: 'Payments', category: 'Finance', primaryKey: 'id', description: 'Settlements, payment channels, and discounts' },
  { id: 'Cancellation', name: 'Cancellations', category: 'Finance & Audit', primaryKey: 'id', description: 'Manager-approved item cancellations and reasons' },
  { id: 'Category', name: 'Categories', category: 'Catalog', primaryKey: 'id', description: 'Menu classifications (Food, Drinks, Spirits)' },
  { id: 'MenuItem', name: 'Menu Items', category: 'Catalog', primaryKey: 'id', description: 'Products, prices, stock levels, and bottle links' },
  { id: 'Ingredient', name: 'Ingredients', category: 'Inventory', primaryKey: 'id', description: 'Raw materials (coffee beans, milk, sugar) with cost' },
  { id: 'Recipe', name: 'Recipes', category: 'Inventory', primaryKey: 'id', description: 'Depletion formulas mapping items to ingredients' },
  { id: 'InventoryLog', name: 'Inventory Logs', category: 'Inventory', primaryKey: 'id', description: 'Stock movement and adjustment history' },
  { id: 'WasteLog', name: 'Waste Logs', category: 'Inventory', primaryKey: 'id', description: 'Dedicated waste, spoilage, and damage loss audit records' },
  { id: 'DevAuditLog', name: 'Developer Audit Logs', category: 'System', primaryKey: 'id', description: 'Self-audit trail of portal mutations' },
]

export async function GET() {
  const session = await getSession()
  if (session?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
  }

  return NextResponse.json({ models: AVAILABLE_MODELS })
}
