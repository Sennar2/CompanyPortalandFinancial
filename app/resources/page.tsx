'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function AllResourcesPage() {
  const [resources, setResources] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      const { data, error } = await supabase.from('resources').select('*')

      console.log('📦 Fetched from Supabase:', { data, error })

      if (error) console.error('❌ Supabase error:', error.message)
      else setResources(data || [])

      setLoading(false)
    }

    fetchData()
  }, [])

  return (
    <main className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">All Resources</h1>

      {loading ? (
        <p>Loading...</p>
      ) : resources.length === 0 ? (
        <p className="text-gray-500">No resources found in Supabase.</p>
      ) : (
        <ul className="space-y-4">
          {resources.map((res) => (
            <li key={res.id} className="border p-4 rounded shadow bg-white">
              <p><strong>Title:</strong> {res.title}</p>
              <p><strong>Brand:</strong> {res.brand}</p>
              <p><strong>Location:</strong> {res.location}</p>
              <p><a href={res.link} target="_blank" className="text-blue-600 underline">Open link</a></p>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
