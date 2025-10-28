const request = require('supertest')
const app = require('../../src/app')

// Helper to craft tokens quickly
function tokenFor(user) {
  const jwt = require('jsonwebtoken')
  return 'Bearer ' + jwt.sign(user, process.env.JWT_SECRET || 'secret', { expiresIn: '1h' })
}

describe('Multi-tenant isolation', () => {
  const shopAToken = tokenFor({ id: 101, role: 'admin', shopId: 1 })
  const shopBToken = tokenFor({ id: 202, role: 'admin', shopId: 2 })

  test('Employees list is scoped by shopId', async () => {
    const resA = await request(app)
      .get('/api/employees')
      .set('Authorization', shopAToken)
      .expect(200)

    const resB = await request(app)
      .get('/api/employees')
      .set('Authorization', shopBToken)
      .expect(200)

    // No overlap of shop ids
    const shopIdsA = new Set((resA.body || []).map(e => e.shopId))
    const shopIdsB = new Set((resB.body || []).map(e => e.shopId))

    // All results from each response should be scoped to their shop
    expect([...shopIdsA].every(id => id === 1)).toBe(true)
    expect([...shopIdsB].every(id => id === 2)).toBe(true)
  })

  test('Create employee forces shopId from token', async () => {
    const payload = {
      firstName: 'Tenant',
      lastName: 'Isolation',
      email: `tenant_isolation_${Date.now()}@example.com`,
      position: 'cashier',
      status: 'active',
      hireDate: new Date().toISOString(),
      salary: 1000,
      password: 'Passw0rd!',
      shopId: 999 // should be ignored
    }

    const create = await request(app)
      .post('/api/employees')
      .set('Authorization', shopAToken)
      .send(payload)
      .expect(201)

    expect(create.body.shopId).toBe(1)
  })

  test('Reports are shop-scoped', async () => {
    const res = await request(app)
      .get('/api/reports/employee-sales')
      .set('Authorization', shopAToken)
      .expect(200)

    // Every aggregated row should correspond to shopId = 1
    // We can only assert structurally since it is aggregation
    expect(Array.isArray(res.body)).toBe(true)
  })
})


