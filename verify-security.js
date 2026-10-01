async function test() {
  console.log('--- 1. Testing Login ---')
  const loginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  })
  console.log('Login Status:', loginRes.status)
  const loginData = await loginRes.json()
  console.log('Login Body:', loginData)

  const cookie = loginRes.headers.get('set-cookie')
  console.log('Cookie received:', !!cookie)

  console.log('\n--- 2. Testing Unauthenticated Protected API Access ---')
  const unauthRes = await fetch('http://localhost:3000/api/tables')
  console.log('Unauthenticated /api/tables Status:', unauthRes.status)
  const unauthData = await unauthRes.json()
  console.log('Unauthenticated Body:', unauthData)

  console.log('\n--- 3. Testing Authenticated Protected API Access ---')
  const authRes = await fetch('http://localhost:3000/api/tables', {
    headers: { Cookie: cookie || '' },
  })
  console.log('Authenticated /api/tables Status:', authRes.status)
  const tables = await authRes.json()
  console.log('Authenticated Tables Count:', Array.isArray(tables) ? tables.length : 'Not array')

  console.log('\n--- 4. Testing Invalid Login Response ---')
  const invalidRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'nonexistent', password: 'wrongpassword' }),
  })
  console.log('Invalid Login Status:', invalidRes.status)
  const invalidData = await invalidRes.json()
  console.log('Invalid Login Body:', invalidData)

  console.log('\n--- 5. Testing Security Headers ---')
  const pageRes = await fetch('http://localhost:3000/login')
  console.log('X-Frame-Options:', pageRes.headers.get('x-frame-options'))
  console.log('X-Content-Type-Options:', pageRes.headers.get('x-content-type-options'))
  console.log('Referrer-Policy:', pageRes.headers.get('referrer-policy'))
  console.log('Strict-Transport-Security:', pageRes.headers.get('strict-transport-security'))
  console.log('Permissions-Policy:', pageRes.headers.get('permissions-policy'))
  console.log('Content-Security-Policy exists:', !!pageRes.headers.get('content-security-policy'))
}

test().catch(console.error)
