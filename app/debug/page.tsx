'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function DebugPage() {
  const [data, setData] = useState<any[] | null>(null)
  const [error, setError] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchResources() {
      const { data, error } = await supabase.from('resources').select('*')
      setData(data)
      setError(error)
      setLoading(false)
      console.log('📦 Debug Response:', { data, error })
    }

    // Run only on client
    if (typeof window !== 'undefined') {
      fetchResources()
    }
  }, [])

  return (
    <main className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Debug Resources Fetch</h1>

      {loading && <p>Loading...</p>}

      {!loading && (
        <>
          <h2 className="text-xl font-semibold mb-2">Data</h2>
          <pre className="bg-gray-100 p-4 mb-6 rounded overflow-x-auto">
            {JSON.stringify(data, null, 2)}
          </pre>

          <h2 className="text-xl font-semibold mb-2">Error</h2>
          <pre className="bg-red-100 p-4 rounded overflow-x-auto text-red-600">
            {JSON.stringify(error, null, 2)}
          </pre>
        </>
      )}
    </main>
  )
}
