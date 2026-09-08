import { useState, useRef, useEffect } from 'react'
import {
  Camera,
  Scan,
  X,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Sparkles,
  Upload,
  Eye,
  Loader2,
  Check,
  Zap,
  Info
} from 'lucide-react'
import { ocrService } from '../services/ocrService.js'

export default function LiveScannerModal({
  isOpen,
  onClose,
  onCapture,
  defaultPanel = 'front',
  productName = ''
}) {
  const [selectedPanel, setSelectedPanel] = useState(defaultPanel)
  const [cameraStream, setCameraStream] = useState(null)
  const [cameraError, setCameraError] = useState(null)
  const [facingMode, setFacingMode] = useState('environment') // 'environment' (rear) or 'user' (front)
  const [isScanning, setIsScanning] = useState(false)
  const [lastScanResult, setLastScanResult] = useState(null)
  const [capturedImageBlob, setCapturedImageBlob] = useState(null)
  const [capturedImageUrl, setCapturedImageUrl] = useState(null)
  const [continuousScan, setContinuousScan] = useState(false)

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const continuousTimerRef = useRef(null)

  // Start camera stream when modal opens
  useEffect(() => {
    if (!isOpen) {
      stopCamera()
      return
    }

    startCamera(facingMode)

    return () => {
      stopCamera()
    }
  }, [isOpen, facingMode])

  // Stop camera helper
  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop())
      setCameraStream(null)
    }
    if (continuousTimerRef.current) {
      clearInterval(continuousTimerRef.current)
      continuousTimerRef.current = null
    }
  }

  // Start camera
  const startCamera = async (mode) => {
    setCameraError(null)
    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error('Camera access API is not supported in this browser environment.')
      }

      // Stop existing tracks first
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop())
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      })

      setCameraStream(stream)
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(() => {})
      }
    } catch (err) {
      console.warn('[LiveScanner] Camera init error:', err)
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Please allow camera permissions in your browser or upload a snapshot below.'
          : 'Unable to start camera stream. You can still scan by uploading an image directly.'
      )
    }
  }

  // Handle continuous scan loop
  useEffect(() => {
    if (continuousScan && !continuousTimerRef.current && cameraStream) {
      continuousTimerRef.current = setInterval(() => {
        if (!isScanning) {
          performScan(false)
        }
      }, 4000)
    } else if (!continuousScan && continuousTimerRef.current) {
      clearInterval(continuousTimerRef.current)
      continuousTimerRef.current = null
    }

    return () => {
      if (continuousTimerRef.current) {
        clearInterval(continuousTimerRef.current)
        continuousTimerRef.current = null
      }
    }
  }, [continuousScan, cameraStream, isScanning])

  // Capture current video frame to canvas
  const captureFrameToCanvas = () => {
    if (!videoRef.current || !canvasRef.current) return null

    const video = videoRef.current
    const canvas = canvasRef.current

    const w = video.videoWidth || 1280
    const h = video.videoHeight || 720

    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, w, h)

    return canvas
  }

  // Trigger OCR scan on the current frame or uploaded file
  const performScan = async (saveCapture = true) => {
    const canvas = captureFrameToCanvas()
    if (!canvas) return

    setIsScanning(true)
    try {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
      if (saveCapture) {
        setCapturedImageBlob(blob)
        if (capturedImageUrl) URL.revokeObjectURL(capturedImageUrl)
        setCapturedImageUrl(URL.createObjectURL(blob))
      }

      // Call OCR service abstraction
      const result = await ocrService.extractText(blob, {
        panelType: selectedPanel
      })

      setLastScanResult(result)
    } catch (err) {
      console.error('[LiveScanner] Scan error:', err)
      setLastScanResult({
        success: false,
        status: 'ERROR',
        error: err.message || 'Failed to read frame',
        declarations: {},
        text: ''
      })
    } finally {
      setIsScanning(false)
    }
  }

  // Manual fallback image upload
  const handleFallbackFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsScanning(true)
    try {
      setCapturedImageBlob(file)
      if (capturedImageUrl) URL.revokeObjectURL(capturedImageUrl)
      setCapturedImageUrl(URL.createObjectURL(file))

      const result = await ocrService.extractText(file, {
        panelType: selectedPanel
      })
      setLastScanResult(result)
    } catch (err) {
      setLastScanResult({
        success: false,
        status: 'ERROR',
        error: err.message || 'Failed to process file',
        declarations: {},
        text: ''
      })
    } finally {
      setIsScanning(false)
    }
  }

  // Use captured photo & data
  const handleAcceptScan = () => {
    if (!capturedImageBlob) {
      // Capture now if not yet captured
      const canvas = captureFrameToCanvas()
      if (canvas) {
        canvas.toBlob((blob) => {
          const file = new File([blob], `${selectedPanel}-scan-${Date.now()}.jpg`, {
            type: 'image/jpeg'
          })
          onCapture({
            file,
            panel: selectedPanel,
            declarations: lastScanResult?.declarations || {},
            text: lastScanResult?.text || ''
          })
          onClose()
        }, 'image/jpeg', 0.92)
        return
      }
    }

    const file = new File([capturedImageBlob], `${selectedPanel}-scan-${Date.now()}.jpg`, {
      type: 'image/jpeg'
    })

    onCapture({
      file,
      panel: selectedPanel,
      declarations: lastScanResult?.declarations || {},
      text: lastScanResult?.text || ''
    })
    onClose()
  }

  if (!isOpen) return null

  const hasDeclarations =
    lastScanResult?.declarations &&
    Object.values(lastScanResult.declarations).some((v) => v !== null && v !== undefined && v !== '')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-sm">
              <Scan className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Legal Metrology Live Packaging Scanner
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold border border-emerald-200">
                  {cameraStream ? 'Camera Live' : 'Optical Reader'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Position packaging inside the frame. Point at declarations to extract text in real-time.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Panel Selection Bar */}
        <div className="px-5 py-2.5 bg-slate-100/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-600 mr-1">Target Panel:</span>
            {[
              { id: 'front', label: '🏷️ Front / PDP', hint: 'Commodity, Net Qty' },
              { id: 'back', label: '📋 Back Panel', hint: 'MRP, Dates, Mfg Address' },
              { id: 'side', label: '📦 Side / Barcode', hint: 'Lot, Contact info' }
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPanel(p.id)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                  selectedPanel === p.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                }`}
                title={p.hint}
              >
                {p.label}
              </button>
            ))}
          </div>

          {cameraStream && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setContinuousScan(!continuousScan)}
                className={`text-xs px-2.5 py-1 rounded-lg border font-medium flex items-center gap-1.5 transition-colors ${
                  continuousScan
                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Zap className={`w-3.5 h-3.5 ${continuousScan ? 'text-amber-600' : 'text-slate-400'}`} />
                <span>{continuousScan ? 'Auto-Scan Active' : 'Auto-Scan'}</span>
              </button>

              <button
                onClick={() => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))}
                className="btn-ghost !text-xs !py-1 !px-2.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5"
                title="Switch Camera Facing"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Flip Camera</span>
              </button>
            </div>
          )}
        </div>

        {/* Viewfinder and Results Area */}
        <div className="p-4 grid grid-cols-1 md:grid-cols-12 gap-4 flex-1 overflow-y-auto">
          {/* Viewfinder Column */}
          <div className="md:col-span-7 flex flex-col items-center">
            <div className="relative w-full aspect-[4/3] bg-slate-950 rounded-xl overflow-hidden flex items-center justify-center border border-slate-800 shadow-inner">
              {cameraStream ? (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />

                  {/* Viewfinder Reticle Overlay */}
                  <div className="absolute inset-6 pointer-events-none border-2 border-indigo-400/60 rounded-xl border-dashed">
                    {/* Corner Reticle Brackets */}
                    <div className="absolute top-0 left-0 w-5 h-5 border-t-4 border-l-4 border-indigo-400 rounded-tl-sm" />
                    <div className="absolute top-0 right-0 w-5 h-5 border-t-4 border-r-4 border-indigo-400 rounded-tr-sm" />
                    <div className="absolute bottom-0 left-0 w-5 h-5 border-b-4 border-l-4 border-indigo-400 rounded-bl-sm" />
                    <div className="absolute bottom-0 right-0 w-5 h-5 border-b-4 border-r-4 border-indigo-400 rounded-br-sm" />

                    {/* Target Guideline Tag */}
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-slate-900/80 backdrop-blur-md px-3 py-1 rounded-full text-[11px] text-white font-medium flex items-center gap-1.5 border border-slate-700">
                      <Scan className="w-3 h-3 text-indigo-400 animate-pulse" />
                      <span>Align {selectedPanel.toUpperCase()} panel in frame</span>
                    </div>

                    {isScanning && (
                      <div className="absolute inset-0 bg-indigo-900/20 backdrop-blur-[1px] flex items-center justify-center">
                        <div className="bg-slate-900/90 text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 border border-indigo-500 shadow-lg">
                          <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                          <span>Reading statutory text & declarations...</span>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="p-6 text-center text-slate-300 max-w-sm">
                  <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-3 text-slate-400">
                    <Camera className="w-6 h-6" />
                  </div>
                  <h4 className="text-xs font-bold text-white mb-1">
                    {cameraError ? 'Camera Stream Unavailable' : 'Camera Feed Loading...'}
                  </h4>
                  <p className="text-[11px] text-slate-400 mb-4">
                    {cameraError || 'Allow camera access in your browser, or upload a photo of the packaging panel.'}
                  </p>

                  <label className="btn-primary !text-xs !py-2 !px-3.5 cursor-pointer inline-flex items-center gap-1.5 shadow">
                    <Upload className="w-4 h-4" />
                    <span>Upload Packaging Image</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFallbackFileUpload}
                    />
                  </label>
                </div>
              )}

              {/* Hidden Canvas for Frame Capturing */}
              <canvas ref={canvasRef} className="hidden" />
            </div>

            {/* Action Buttons Below Viewfinder */}
            <div className="w-full mt-3 flex items-center justify-between gap-2">
              <button
                onClick={() => performScan(true)}
                disabled={isScanning || (!cameraStream && !capturedImageBlob)}
                className="btn-primary flex-1 !py-2.5 !text-xs flex items-center justify-center gap-2 shadow-sm"
              >
                {isScanning ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span>Read Details Now (Scan Frame)</span>
              </button>

              <label className="btn-secondary !py-2.5 !px-3 !text-xs cursor-pointer flex items-center gap-1.5 border-slate-300 text-slate-700 hover:bg-slate-50">
                <Upload className="w-3.5 h-3.5 text-indigo-600" />
                <span>Upload File</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFallbackFileUpload}
                />
              </label>
            </div>
          </div>

          {/* Details & Extracted Declarations Column */}
          <div className="md:col-span-5 flex flex-col h-full bg-slate-50 rounded-xl border border-slate-200 p-3.5 overflow-hidden">
            <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-200">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-indigo-600" />
                <span>Readout & Detected Details</span>
              </span>

              {lastScanResult && (
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold border ${
                    lastScanResult.success && hasDeclarations
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : lastScanResult.status === 'UNREADABLE'
                      ? 'bg-amber-50 text-amber-800 border-amber-300'
                      : 'bg-red-50 text-red-800 border-red-300'
                  }`}
                >
                  {lastScanResult.status}
                </span>
              )}
            </div>

            {/* Scan Feedback Body */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {!lastScanResult && (
                <div className="h-44 flex flex-col items-center justify-center text-center text-slate-400 p-4">
                  <Scan className="w-8 h-8 mb-2 opacity-50 text-slate-400" />
                  <p className="text-xs font-medium text-slate-600">No scan performed yet</p>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
                    Point your camera at the packaging label and click "Read Details Now" to extract declarations.
                  </p>
                </div>
              )}

              {lastScanResult && !lastScanResult.success && (
                <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-xs">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Unable to read packaging text:</span>
                      <p className="mt-1 text-[11px] text-amber-800">
                        {lastScanResult.error ||
                          'The image is too blurry, rotated, or has excessive glare. Please hold package closer and ensure adequate light.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {lastScanResult?.success && !hasDeclarations && (
                <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-xs">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">No clear declarations recognized:</span>
                      <p className="mt-1 text-[11px] text-amber-800">
                        The scanner could not locate statutory declarations on this view. Make sure the panel text is upright and sharply in focus, or flip to the back panel.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Detected Declarations Card */}
              {hasDeclarations && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Recognized Statutory Fields
                  </span>

                  <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100 text-xs shadow-xs">
                    {lastScanResult.declarations.commodity_name && (
                      <div className="p-2 flex items-start justify-between gap-2">
                        <span className="text-slate-500 text-[11px]">Commodity:</span>
                        <span className="font-semibold text-slate-900 text-right">
                          {lastScanResult.declarations.commodity_name}
                        </span>
                      </div>
                    )}

                    {lastScanResult.declarations.net_quantity && (
                      <div className="p-2 flex items-start justify-between gap-2">
                        <span className="text-slate-500 text-[11px]">Net Quantity:</span>
                        <span className="font-semibold text-emerald-700 text-right">
                          {lastScanResult.declarations.net_quantity}
                        </span>
                      </div>
                    )}

                    {lastScanResult.declarations.mrp && (
                      <div className="p-2 flex items-start justify-between gap-2">
                        <span className="text-slate-500 text-[11px]">MRP:</span>
                        <span className="font-semibold text-slate-900 text-right">
                          {lastScanResult.declarations.mrp}
                        </span>
                      </div>
                    )}

                    {lastScanResult.declarations.unit_sale_price && (
                      <div className="p-2 flex items-start justify-between gap-2">
                        <span className="text-slate-500 text-[11px]">Unit Sale Price (USP):</span>
                        <span className="font-semibold text-slate-900 text-right">
                          {lastScanResult.declarations.unit_sale_price}
                        </span>
                      </div>
                    )}

                    {lastScanResult.declarations.date_of_manufacture && (
                      <div className="p-2 flex items-start justify-between gap-2">
                        <span className="text-slate-500 text-[11px]">Date of Mfg / PKD:</span>
                        <span className="font-semibold text-slate-900 text-right">
                          {lastScanResult.declarations.date_of_manufacture}
                        </span>
                      </div>
                    )}

                    {lastScanResult.declarations.expiry_date && (
                      <div className="p-2 flex items-start justify-between gap-2">
                        <span className="text-slate-500 text-[11px]">Expiry / Best Before:</span>
                        <span className="font-semibold text-slate-900 text-right">
                          {lastScanResult.declarations.expiry_date}
                        </span>
                      </div>
                    )}

                    {lastScanResult.declarations.manufacturer && (
                      <div className="p-2 flex flex-col gap-0.5">
                        <span className="text-slate-500 text-[11px]">Manufacturer / Packer:</span>
                        <span className="font-medium text-slate-800 text-[11px] leading-snug">
                          {lastScanResult.declarations.manufacturer}
                        </span>
                      </div>
                    )}

                    {lastScanResult.declarations.consumer_care && (
                      <div className="p-2 flex flex-col gap-0.5">
                        <span className="text-slate-500 text-[11px]">Consumer Care:</span>
                        <span className="font-medium text-slate-800 text-[11px] leading-snug">
                          {lastScanResult.declarations.consumer_care}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Raw Extracted Text Preview */}
              {lastScanResult?.text && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Recognized Text Excerpt
                  </span>
                  <div className="bg-slate-900 text-emerald-400 p-2.5 rounded-lg text-[11px] font-mono whitespace-pre-wrap max-h-32 overflow-y-auto leading-relaxed border border-slate-800 shadow-inner">
                    {lastScanResult.text}
                  </div>
                </div>
              )}

              {/* Thumbnail of Captured Frame */}
              {capturedImageUrl && (
                <div className="space-y-1 pt-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Captured Snapshot
                  </span>
                  <div className="relative rounded-lg overflow-hidden border border-slate-200 h-20 bg-slate-900">
                    <img
                      src={capturedImageUrl}
                      alt="Captured panel"
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Accept / Attach Action Button */}
            <div className="pt-3 mt-2 border-t border-slate-200">
              <button
                onClick={handleAcceptScan}
                disabled={!capturedImageBlob && !cameraStream}
                className="btn-primary w-full !py-2.5 !text-xs !bg-emerald-600 hover:!bg-emerald-700 flex items-center justify-center gap-2 shadow-sm font-semibold"
              >
                <Check className="w-4 h-4" />
                <span>Use This Scan for {selectedPanel.toUpperCase()} Panel</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
