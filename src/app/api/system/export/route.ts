import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

function getModelDelegate(modelName: string): any {
  const delegateName = modelName.charAt(0).toLowerCase() + modelName.slice(1)
  return (prisma as any)[delegateName]
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (session?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const model = searchParams.get('model')

  if (!model) {
    return NextResponse.json({ error: 'Missing model parameter' }, { status: 400 })
  }

  const delegate = getModelDelegate(model)
  if (!delegate) {
    return NextResponse.json({ error: `Invalid model: ${model}` }, { status: 400 })
  }

  try {
    const records = await delegate.findMany({
      take: 5000,
      orderBy: { createdAt: 'desc' },
    }).catch(async () => {
      return delegate.findMany({ take: 5000 })
    })

    const jsonString = JSON.stringify(records, null, 2)
    return new NextResponse(jsonString, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${model}_export_${new Date().toISOString().slice(0, 10)}.json"`,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Export failed' }, { status: 500 })
  }
}
