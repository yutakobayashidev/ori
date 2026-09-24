import { useEffect, useState } from 'react'
export function useWebMCPSupported() {
  const [supported, setSupported] = useState(false)
  useEffect(() => {
    setSupported(Boolean(document.modelContext))
  }, [])
  return supported
}
