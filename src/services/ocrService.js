/**
 * MetriScan AI — OCR Service Abstraction
 * 
 * Defines a clean, uniform interface for image pre-processing, text extraction,
 * and statutory declaration localization.
 * 
 * Strictly guarantees that NO fake, synthetic, or hardcoded declaration data
 * is ever returned when an OCR engine is not configured or unavailable.
 */

import { token } from '../api.js'

/**
 * Supported image processing options for preprocessing pipeline
 * @typedef {Object} PreprocessOptions
 * @property {number} [rotateDegrees=0] - 0, 90, 180, 270
 * @property {boolean} [enhanceContrast=true] - Apply adaptive contrast stretch
 * @property {boolean} [grayscale=false] - Convert to monochrome for noisy backgrounds
 * @property {number} [maxWidth=2048] - Constrain dimensions for faster transmission
 * @property {number} [maxHeight=2048]
 */

/**
 * Result returned by extraction routines
 * @typedef {Object} OcrExtractionResult
 * @property {boolean} success - Whether extraction completed without error
 * @property {'READY' | 'SUCCESS' | 'UNAVAILABLE' | 'ERROR' | 'UNREADABLE'} status
 * @property {string} text - Raw OCR text detected in pixels
 * @property {Record<string, any>} declarations - Keyed LMPC declarations
 * @property {Array<any>} lines - Line blocks with bounding coordinates if available
 * @property {Object} [imageQuality] - Assessment of resolution, sharpness, lighting
 * @property {string} [error] - Informative error message if extraction failed
 */

class OcrService {
  constructor() {
    this._apiEndpoint = '/api/ocr'
    this._statusCache = null
    this._lastStatusCheck = 0
  }

  /**
   * Check if an active OCR engine is configured and operational on the server
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    try {
      const status = await this.getStatus()
      return Boolean(status.available && status.ready)
    } catch {
      return false
    }
  }

  /**
   * Query current OCR engine status, model details, and configuration
   * @returns {Promise<{ available: boolean, ready: boolean, engine: string, model: string, message?: string }>}
   */
  async getStatus() {
    const now = Date.now()
    if (this._statusCache && (now - this._lastStatusCheck < 15000)) {
      return this._statusCache
    }

    try {
      const res = await fetch(`${this._apiEndpoint}/status`, {
        headers: {
          Authorization: `Bearer ${token.get()}`
        }
      })

      if (!res.ok) {
        throw new Error(`OCR service check failed with status ${res.status}`)
      }

      const data = await res.json()
      this._statusCache = data
      this._lastStatusCheck = now
      return data
    } catch (err) {
      return {
        available: false,
        ready: false,
        engine: 'none',
        model: 'none',
        message: err.message || 'OCR service endpoint unreachable'
      }
    }
  }

  /**
   * Preprocess an image (File, Blob, or Canvas) before OCR:
   * Handles rotation correction, contrast enhancement, and resolution scaling.
   * 
   * @param {File | Blob | HTMLCanvasElement | ImageData} imageSource 
   * @param {PreprocessOptions} [options]
   * @returns {Promise<{ blob: Blob, dataUrl: string, width: number, height: number }>}
   */
  async preprocessImage(imageSource, options = {}) {
    const {
      rotateDegrees = 0,
      enhanceContrast = false,
      grayscale = false,
      maxWidth = 2048,
      maxHeight = 2048,
      quality = 0.92
    } = options

    // 1. Convert source to an HTMLImageElement or ImageBitmap
    let sourceElement = null
    let needRevoke = null

    if (imageSource instanceof HTMLCanvasElement) {
      sourceElement = imageSource
    } else {
      const img = new Image()
      const url = URL.createObjectURL(imageSource)
      needRevoke = url
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = url
      })
      sourceElement = img
    }

    try {
      const origW = sourceElement.naturalWidth || sourceElement.width
      const origH = sourceElement.naturalHeight || sourceElement.height

      // Determine dimensions after rotation
      const isRotatedQuarter = (rotateDegrees % 180 !== 0)
      let targetW = isRotatedQuarter ? origH : origW
      let targetH = isRotatedQuarter ? origW : origH

      // Scale down if exceeding maximum bounds
      const scale = Math.min(1, maxWidth / targetW, maxHeight / targetH)
      targetW = Math.round(targetW * scale)
      targetH = Math.round(targetH * scale)

      const canvas = document.createElement('canvas')
      canvas.width = targetW
      canvas.height = targetH
      const ctx = canvas.getContext('2d', { willReadFrequently: true })

      if (!ctx) {
        throw new Error('Canvas 2D context not available for image preprocessing')
      }

      // Fill neutral white background to eliminate alpha artifacts
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, targetW, targetH)

      // Apply transformations
      ctx.save()
      ctx.translate(targetW / 2, targetH / 2)
      if (rotateDegrees !== 0) {
        ctx.rotate((rotateDegrees * Math.PI) / 180)
      }
      const drawW = isRotatedQuarter ? targetH : targetW
      const drawH = isRotatedQuarter ? targetW : targetH
      ctx.drawImage(sourceElement, -drawW / 2, -drawH / 2, drawW, drawH)
      ctx.restore()

      // Post-draw filters: Grayscale or Contrast enhancement if requested
      if (enhanceContrast || grayscale) {
        const imgData = ctx.getImageData(0, 0, targetW, targetH)
        const d = imgData.data

        if (grayscale) {
          for (let i = 0; i < d.length; i += 4) {
            const avg = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
            d[i] = avg
            d[i + 1] = avg
            d[i + 2] = avg
          }
        }

        if (enhanceContrast) {
          // Linear contrast stretch with midpoint pivot
          const factor = 1.2
          for (let i = 0; i < d.length; i += 4) {
            d[i] = Math.min(255, Math.max(0, factor * (d[i] - 128) + 128))
            d[i + 1] = Math.min(255, Math.max(0, factor * (d[i + 1] - 128) + 128))
            d[i + 2] = Math.min(255, Math.max(0, factor * (d[i + 2] - 128) + 128))
          }
        }

        ctx.putImageData(imgData, 0, 0)
      }

      // Export as processed JPEG Blob
      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', quality)
      })

      const dataUrl = canvas.toDataURL('image/jpeg', quality)

      return {
        blob,
        dataUrl,
        width: targetW,
        height: targetH
      }
    } finally {
      if (needRevoke) {
        URL.revokeObjectURL(needRevoke)
      }
    }
  }

  /**
   * Extract raw text and layout information from an image.
   * Strictly returns failure and empty strings if no engine is configured.
   * 
   * @param {File | Blob} imageFile 
   * @param {Object} [options]
   * @returns {Promise<OcrExtractionResult>}
   */
  async extractText(imageFile, options = {}) {
    const isReady = await this.isAvailable()
    if (!isReady) {
      return {
        success: false,
        status: 'UNAVAILABLE',
        text: '',
        declarations: {},
        lines: [],
        error: 'No active OCR engine is configured. Please check server Gemini API configuration.'
      }
    }

    try {
      const formData = new FormData()
      formData.append('image', imageFile)
      if (options.panelType) {
        formData.append('panel_type', options.panelType)
      }
      if (options.isImported !== undefined) {
        formData.append('is_imported', String(options.isImported))
      }

      const res = await fetch(`${this._apiEndpoint}/extract`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.get()}`
        },
        body: formData
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        return {
          success: false,
          status: 'ERROR',
          text: '',
          declarations: {},
          lines: [],
          error: errorData.detail || errorData.message || `OCR extraction failed with HTTP ${res.status}`
        }
      }

      const result = await res.json()
      return {
        success: Boolean(result.success),
        status: result.status || (result.success ? 'SUCCESS' : 'ERROR'),
        text: result.text || '',
        declarations: result.declarations || {},
        lines: result.lines || [],
        imageQuality: result.image_quality || null,
        error: result.error || null
      }
    } catch (err) {
      return {
        success: false,
        status: 'ERROR',
        text: '',
        declarations: {},
        lines: [],
        error: err.message || 'Network or transmission error during OCR extraction'
      }
    }
  }

  /**
   * Scan a video frame or snapshot directly from a live camera viewfinder.
   * Returns immediately with recognized text and localized statutory declarations.
   * 
   * @param {HTMLCanvasElement | Blob} frameInput 
   * @param {Object} [options]
   * @returns {Promise<OcrExtractionResult>}
   */
  async scanLiveFrame(frameInput, options = {}) {
    let blob = null
    if (frameInput instanceof HTMLCanvasElement) {
      blob = await new Promise((resolve) => frameInput.toBlob(resolve, 'image/jpeg', 0.88))
    } else {
      blob = frameInput
    }

    if (!blob) {
      return {
        success: false,
        status: 'ERROR',
        text: '',
        declarations: {},
        lines: [],
        error: 'Invalid frame input provided for live scan'
      }
    }

    return this.extractText(blob, options)
  }

  /**
   * Extract statutory Legal Metrology declarations across multiple panels.
   * Strictly avoids synthesizing default values if no text is legible.
   * 
   * @param {Array<{ file: Blob, panel: 'front' | 'back' | 'side' }>} panelImages
   * @param {Object} [options]
   * @returns {Promise<OcrExtractionResult>}
   */
  async extractDeclarations(panelImages, options = {}) {
    if (!panelImages || panelImages.length === 0) {
      return {
        success: false,
        status: 'ERROR',
        text: '',
        declarations: {},
        lines: [],
        error: 'No packaging photographs provided for declaration extraction'
      }
    }

    // Process primary front and back panels
    const results = []
    for (const item of panelImages) {
      const res = await this.extractText(item.file, { panelType: item.panel, ...options })
      results.push({ panel: item.panel, ...res })
    }

    // Combine declarations across panels
    const combinedDeclarations = {}
    let combinedText = ''
    let anySuccess = false
    let lastError = null

    for (const r of results) {
      if (r.success) {
        anySuccess = true
        if (r.text) {
          combinedText += `\n--- [${r.panel.toUpperCase()} PANEL] ---\n${r.text}`
        }
        Object.assign(combinedDeclarations, r.declarations || {})
      } else {
        lastError = r.error
      }
    }

    if (!anySuccess) {
      return {
        success: false,
        status: 'UNREADABLE',
        text: '',
        declarations: {},
        lines: [],
        error: lastError || 'Photographs could not be legibly read. Please re-upload clearer photos with proper lighting.'
      }
    }

    return {
      success: true,
      status: 'SUCCESS',
      text: combinedText.trim(),
      declarations: combinedDeclarations,
      lines: []
    }
  }
}

// Export singleton instance and class
export const ocrService = new OcrService()
export default ocrService
