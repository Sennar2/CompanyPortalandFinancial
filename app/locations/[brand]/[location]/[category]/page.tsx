'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useParams } from 'next/navigation'

export default function CategoryPage() {
  // ✅ Tell TS exactly what params we expect in this route
  const rawParams = useParams() as {
    brand?: string
    location?: string
    category?: string
  }

  // ✅ Destructure with safe fallbacks so `undefined` won't explode in .eq()
  const brand = rawParams.brand ?? ''
  const location = rawParams.location ?? ''
  const category = rawParams.category ?? ''

  const [resources, setResources] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // don't query until all 3 are non-empty
    if (!brand || !location || !category) return

    const fetchData = async () => {
      const { data, error } = await supabase
        .from('resources')
        .select('*')
        .eq('brand', brand)
        .eq('location', location)
        .eq('category', category)

      if (error) {
        setError(error.message)
      } else {
        setResources(data || [])
      }
    }

    fetchData()
  }, [brand, location, category])

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold mb-4 capitalize">
        {brand} / {location} / {category}
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