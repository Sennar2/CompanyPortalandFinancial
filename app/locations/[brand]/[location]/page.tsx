'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useParams } from 'next/navigation'

export default function LocationPage() {
  // Tell TS what we expect from the dynamic route
  const rawParams = useParams() as {
    brand?: string
    location?: string
  }

  // Graceful fallbacks
  const brand = rawParams.brand ?? ''
  const location = rawParams.location ?? ''

  const [resources, setResources] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!brand || !location) return

    const fetchData = async () => {
      const { data, error } = await supabase
        .from('resources')
        .select('*')
        .eq('brand', brand)
        .eq('location', location)

      if (error) {
        setError(error.message)
      } else {
        setResources(data || [])
      }
    }

    fetchData()
  }, [brand, location])

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold mb-4 capitalize">
        {brand} / {location}
      </h1>

      {error && <p className="text-red-600">{error}</p>}

      {resources.length === 0 ? (
        <p>No resources found.</p>
      ) : (
        <div className="grid gap-4">
          {resources.map((r) => (
            <div
              key={r.id}
              className="bg-white border p-4 rounded shadow"
            >
              <h2 className="font-medium">{r.title}</h2>
              <p className="text-sm text-gray-600 mb-2">
                {r.category}
              </p>
              <a
                href={r.link}
                className="text-blue-600 underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                View Resource
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}