import { useEffect, useRef, useState } from 'react'
import { ZoomIn, ZoomOut, RotateCcw, Scan, Eye, AlertCircle } from 'lucide-react'
import { token } from '../api.js'

/**
 * Draws the OCR region a finding rests on, directly over the photograph the
 * officer took. A finding the officer cannot see on the pack is not evidence.
 */
export default function EvidenceViewer({ imageUrl, bbox, caption }) {
  const [src, setSrc] = useState(null)
  const [natural, setNatural] = useState(null)
  const [error, setError] = useState('')
  const [zoom, setZoom] = useState(1)
  const imgRef = useRef(null)

  useEffect(() => {
    if (!imageUrl) { setSrc(null); return }
    let revoked = null
    setError('')
    setZoom(1)
    fetch(imageUrl, { headers: { Authorization: `Bearer ${token.get()}` } })
      .then((r) => { if (!r.ok) throw new Error('unavailable'); return r.blob() })
      .then((b) => { revoked = URL.createObjectURL(b); setSrc(revoked) })
      .catch(() => setError('The stored evidence photograph could not be loaded.'))
    return () => { if (revoked) URL.revokeObjectURL(revoked) }
  }, [imageUrl])

  if (!imageUrl) {
    return (
      <div className="panel p-6 text-center text-slate-400 bg-slate-50/50">
        <Scan className="w-8 h-8 mx-auto mb-2 text-slate-300" />
        <p className="text-xs font-medium text-slate-600">No linked photograph region</p>
        <p className="text-[11px] text-slate-400 mt-0.5">This declaration does not point to a localized OCR bounding box.</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="panel p-4 text-center text-red-600 bg-red-50/50 flex items-center justify-center gap-2">
        <AlertCircle className="w-4 h-4" />
        <span className="text-xs font-medium">{error}</span>
      </div>
    )
  }

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
    <figure className="panel overflow-hidden border border-slate-200/90 shadow-subtle bg-slate-900 rounded-xl">
      {/* Zoom / View toolbar */}
      <div className="px-3 py-1.5 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between text-white text-2xs">
        <div className="flex items-center gap-1.5 text-slate-300 font-mono">
          <Scan className="w-3.5 h-3.5 text-emerald-400" />
          <span>Forensic Evidence View</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
            onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))}
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <span className="px-1 text-[10px] font-mono text-slate-400">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
            onClick={() => setZoom((z) => Math.max(0.75, z - 0.25))}
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          {zoom !== 1 && (
            <button
              type="button"
              className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
              onClick={() => setZoom(1)}
              title="Reset Zoom"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <div className="relative overflow-auto max-h-[380px] bg-slate-950 flex items-center justify-center p-2">
        <div
          className="relative transition-transform duration-200 ease-out origin-center inline-block"
          style={{ transform: `scale(${zoom})` }}
        >
          {src && (
            <img
              ref={imgRef}
              src={src}
              alt={caption || 'Package evidence photograph'}
              className="block max-w-full h-auto rounded shadow-lg border border-slate-800"
              onLoad={(e) => setNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
            />
          )}
          {overlay && (
            <div
              className="absolute border-2 border-red-500 shadow-[0_0_0_9999px_rgba(15,23,42,0.60)] pointer-events-none rounded-sm transition-all"
              style={overlay}
            >
              <div className="absolute -top-5 left-0 px-1.5 py-0.2 rounded bg-red-600 text-white font-mono text-[9px] font-bold uppercase tracking-wider">
                Target OCR Region
              </div>
            </div>
          )}
        </div>
      </div>

      {caption && (
        <figcaption className="px-3 py-2 text-xs text-slate-700 bg-white border-t border-slate-200 font-mono">
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Verified OCR Excerpt</div>
          <div className="text-slate-800 mt-0.5">{caption}</div>
        </figcaption>
      )}
    </figure>
  )
}
