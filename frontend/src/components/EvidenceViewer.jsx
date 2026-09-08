import { useEffect, useRef, useState } from 'react'
import { token } from '../api.js'

/**
 * Draws the OCR region a finding rests on, directly over the photograph the
 * officer took. A finding the officer cannot see on the pack is not evidence.
 */
export default function EvidenceViewer({ imageUrl, bbox, caption }) {
  const [src, setSrc] = useState(null)
  const [natural, setNatural] = useState(null)
  const [error, setError] = useState('')
  const imgRef = useRef(null)

  useEffect(() => {
    if (!imageUrl) { setSrc(null); return }
    let revoked = null
    setError('')
    fetch(imageUrl, { headers: { Authorization: `Bearer ${token.get()}` } })
      .then((r) => { if (!r.ok) throw new Error('unavailable'); return r.blob() })
      .then((b) => { revoked = URL.createObjectURL(b); setSrc(revoked) })
      .catch(() => setError('The stored image could not be loaded.'))
    return () => { if (revoked) URL.revokeObjectURL(revoked) }
  }, [imageUrl])

  if (!imageUrl) {
    return (
      <div className="panel p-4 text-center text-muted">
        No image region is linked to this declaration.
      </div>
    )
  }
  if (error) return <div className="panel p-4 text-center text-fail">{error}</div>

  // bbox is in pixels of the processed image; convert to percentages so the
  // overlay tracks the rendered size at any zoom or screen width.
  let overlay = null
  if (bbox && natural) {
    const [x1, y1, x2, y2] = bbox
    overlay = {
      left: `${(x1 / natural.w) * 100}%`,
      top: `${(y1 / natural.h) * 100}%`,
      width: `${((x2 - x1) / natural.w) * 100}%`,
      height: `${((y2 - y1) / natural.h) * 100}%`
    }
  }

  return (
    <figure className="panel overflow-hidden">
      <div className="relative bg-ink/5">
        {src && (
          <img
            ref={imgRef}
            src={src}
            alt={caption || 'Package evidence'}
            className="block w-full h-auto"
            onLoad={(e) => setNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
          />
        )}
        {overlay && (
          <div
            className="absolute border-2 border-fail shadow-[0_0_0_9999px_rgba(27,42,58,0.42)] pointer-events-none"
            style={overlay}
          />
        )}
      </div>
      {caption && <figcaption className="px-2.5 py-1.5 text-2xs text-muted border-t border-rule">{caption}</figcaption>}
    </figure>
  )
}
