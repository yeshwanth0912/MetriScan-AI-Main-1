import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload,
  Camera,
  Image as ImageIcon,
  Trash2,
  Sparkles,
  UtensilsCrossed,
  Home,
  Package,
  Globe,
  Store,
  Check,
  AlertCircle,
  Loader2,
  FileText,
  Info
} from 'lucide-react'
import { api } from '../api.js'

const IMAGE_TYPES = [
  { id: 'front', label: 'Front / Principal Panel', hint: 'Commodity name, Net quantity' },
  { id: 'back', label: 'Back Panel', hint: 'MRP, Dates, Manufacturer, Consumer care' },
  { id: 'side', label: 'Side Panel', hint: 'Nutritional info or batch' }
]

const SAMPLE_PRESETS = [
  {
    name: 'Britannia Good Day 600g',
    brand: 'Britannia',
    product_name: 'Good Day Butter Cookies',
    category: 'food',
    barcode: '8901063012345',
    premises: 'Metro Cash & Carry, Warehouse 4',
    location: 'Yeshwanthpur, Bengaluru',
    channel: 'retail',
    is_imported: false,
    notes: 'Routine legal metrology surveillance inspection at retail shelf.'
  },
  {
    name: 'Dove Deep Moisture Lotion',
    brand: 'Dove',
    product_name: 'Deep Moisture Body Lotion 400ml',
    category: 'cosmetics',
    barcode: '8901030998877',
    premises: 'Apollo Pharmacy',
    location: 'Indiranagar, Bengaluru',
    channel: 'retail',
    is_imported: false,
    notes: 'Checking unit sale price declaration and manufacturer address compliance.'
  },
  {
    name: 'Imported Extra Virgin Olive Oil',
    brand: 'Bertolli',
    product_name: 'Extra Virgin Olive Oil 1 Litre',
    category: 'food',
    barcode: '8002210112233',
    premises: 'Nature Basket Supermarket',
    location: 'Koramangala, Bengaluru',
    channel: 'retail',
    is_imported: true,
    notes: 'Imported consignment inspection: Verifying country of origin and importer sticker declarations.'
  },
  {
    name: 'E-commerce Listing Audit',
    brand: 'Tata Tea',
    product_name: 'Tata Tea Gold Leaf Tea 1kg',
    category: 'food',
    barcode: '8901052001122',
    premises: 'QuickMart E-Store Listing',
    location: 'Online Marketplace',
    channel: 'ecommerce',
    listing_url: 'https://example-marketplace.in/p/tata-tea-gold-1kg',
    listing_text: `Net Quantity: 1 kg\nMRP: Rs. 620.00 (inclusive of all taxes)\nManufacturer: Tata Consumer Products Limited, 1 Bishop Lefroy Road, Kolkata 700020\nCountry of Origin: India\nConsumer Care: 1800-345-1720 / care@tataconsumer.com\nDate of Mfg: 01/2026\nBest Before: 12 months from manufacture`,
    is_imported: false,
    notes: 'E-commerce marketplace listing audit under Rule 6(10) Legal Metrology Rules.'
  }
]

export default function NewInspection() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    brand: '', product_name: '', category: 'food', barcode: '',
    premises: '', location: '', channel: 'retail', listing_url: '', listing_text: '',
    is_imported: false, notes: ''
  })
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [dragOverPanel, setDragOverPanel] = useState(null)
  const fileInputRefs = useRef({})

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [k]: v }))
  }

  const loadPreset = (preset) => {
    setForm({
      brand: preset.brand,
      product_name: preset.product_name,
      category: preset.category,
      barcode: preset.barcode,
      premises: preset.premises,
      location: preset.location,
      channel: preset.channel,
      listing_url: preset.listing_url || '',
      listing_text: preset.listing_text || '',
      is_imported: preset.is_imported,
      notes: preset.notes
    })
  }

  const addFiles = (list, imageType) => {
    const arr = Array.from(list)
    const newItems = arr.map((file, idx) => {
      // If user uploads multiple files, assign subsequent ones to back or side
      let assignedType = imageType
      if (idx === 1 && imageType === 'front') assignedType = 'back'
      else if (idx === 2) assignedType = 'side'

      return {
        file,
        imageType: assignedType,
        id: crypto.randomUUID(),
        previewUrl: URL.createObjectURL(file)
      }
    })
    setFiles((prev) => [...prev, ...newItems])
  }

  const removeFile = (id) => {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((f) => f.id !== id)
    })
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (files.length === 0 && !form.listing_text.trim()) {
      setError('Attach at least one package photograph or provide listing text for e-commerce audit.')
      return
    }
    try {
      setBusy('Initializing inspection dossier…')
      const payload = {
        ...form,
        panel_width_mm: null,
        panel_height_mm: null
      }
      const inspection = await api.createInspection(payload)

      for (const [i, item] of files.entries()) {
        setBusy(`Uploading photograph ${i + 1} of ${files.length} (${item.imageType})…`)
        await api.uploadImage(inspection.id, item.file, item.imageType)
      }

      setBusy('Scanning label text & executing Legal Metrology rule engine…')
      await api.analyze(inspection.id)
      navigate(`/inspections/${inspection.id}`)
    } catch (err) {
      setError(err.message)
      setBusy('')
    }
  }

  return (
    <div className="space-y-4">
      {/* Sample Presets Bar */}
      <div className="p-3.5 rounded-xl border border-slate-200/80 bg-white shadow-subtle">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            <span>Quick-fill Inspection Templates</span>
          </div>
          <span className="text-[11px] text-slate-400">Click to populate sample package data</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {SAMPLE_PRESETS.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => loadPreset(p)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100/80 hover:border-slate-300 text-xs font-medium text-slate-700 active:scale-95 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
            >
              <span>{p.name}</span>
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={submit} className="grid lg:grid-cols-3 gap-4 items-start">
        {/* Left Column: Product Details */}
        <section className="panel p-4 lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-rule/60">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Product & Establishment Details
              </h2>
              <p className="text-[11px] text-slate-500">Record commodity identifiers and category</p>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, channel: 'retail' }))}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  form.channel === 'retail'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Store className="w-3.5 h-3.5" />
                <span>Physical Retail</span>
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, channel: 'ecommerce' }))}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  form.channel === 'ecommerce'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>E-Commerce</span>
              </button>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="brand">Brand Name</label>
              <input
                id="brand"
                className="field"
                value={form.brand}
                onChange={set('brand')}
                placeholder="e.g. Parle, Amul, Nestlé"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="product">Product Description / Name</label>
              <input
                id="product"
                className="field"
                value={form.product_name}
                onChange={set('product_name')}
                placeholder="e.g. Marie Biscuits, Full Cream Milk"
                required
              />
            </div>

            <div>
              <label className="label" htmlFor="category">Commodity Category</label>
              <select id="category" className="field font-medium" value={form.category} onChange={set('category')}>
                <option value="food">Food & Beverages</option>
                <option value="cosmetics">Cosmetics & Personal Care</option>
                <option value="household">Household & Detergents</option>
                <option value="other">Other Packaged Commodities</option>
              </select>
            </div>

            <div>
              <label className="label" htmlFor="barcode">Barcode / GTIN</label>
              <input
                id="barcode"
                className="field num"
                value={form.barcode}
                onChange={set('barcode')}
                placeholder="e.g. 8901234567890"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-3 border-t border-rule/60">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                checked={form.is_imported}
                onChange={set('is_imported')}
              />
              <span>Imported Commodity (Requires Importer Declarations & Country of Origin)</span>
            </label>
          </div>

          {form.channel === 'ecommerce' && (
            <div className="space-y-3 pt-3 border-t border-rule/60 bg-slate-50/70 p-3 rounded-xl">
              <div>
                <label className="label" htmlFor="url">Product Marketplace Listing URL</label>
                <input
                  id="url"
                  className="field bg-white"
                  value={form.listing_url}
                  onChange={set('listing_url')}
                  placeholder="https://amazon.in/dp/... or https://blinkit.com/prn/..."
                />
              </div>
              <div>
                <label className="label" htmlFor="listing">Mandatory Declarations on Listing Page</label>
                <textarea
                  id="listing"
                  className="field bg-white font-mono text-xs"
                  rows={5}
                  value={form.listing_text}
                  onChange={set('listing_text')}
                  placeholder="Paste mandatory fields from website: Net Quantity, MRP, Manufacturer, Country of Origin..."
                />
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-1">
                  <Info className="w-3 h-3 text-slate-400" />
                  <span>Verified directly against Rule 6(10) E-Commerce provisions.</span>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="label" htmlFor="notes">Officer Inspection Observations</label>
            <textarea
              id="notes"
              className="field"
              rows={2}
              value={form.notes}
              onChange={set('notes')}
              placeholder="Record packaging condition, seal integrity, batch discrepancies, etc."
            />
          </div>
        </section>

        {/* Right Column: Image Attachments */}
        <section className="panel p-4 space-y-4">
          <div className="pb-3 border-b border-rule/60">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-slate-500" />
              Evidence Photographs
            </h2>
            <p className="text-[11px] text-slate-500">Capture or drop high-resolution label photos</p>
          </div>

          {/* Panel Dropzones */}
          <div className="space-y-2.5">
            {IMAGE_TYPES.map(({ id, label, hint }) => {
              const count = files.filter((f) => f.imageType === id).length
              const isDrag = dragOverPanel === id

              return (
                <div
                  key={id}
                  onDragOver={(e) => { e.preventDefault(); setDragOverPanel(id) }}
                  onDragLeave={() => setDragOverPanel(null)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragOverPanel(null)
                    if (e.dataTransfer.files?.length) {
                      addFiles(e.dataTransfer.files, id)
                    }
                  }}
                  onClick={() => fileInputRefs.current[id]?.click()}
                  className={`p-3 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                    isDrag
                      ? 'border-indigo-500 bg-indigo-50/50 scale-[1.01]'
                      : count > 0
                      ? 'border-emerald-300/80 bg-emerald-50/30 hover:border-emerald-400'
                      : 'border-slate-200 hover:border-slate-300 bg-slate-50/50 hover:bg-slate-50'
                  }`}
                >
                  <input
                    ref={(el) => (fileInputRefs.current[id] = el)}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.length) {
                        addFiles(e.target.files, id)
                        e.target.value = ''
                      }
                    }}
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        count > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-500 border border-slate-200'
                      }`}>
                        {count > 0 ? <Check className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                          <span>{label}</span>
                          {count > 0 && (
                            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              {count} attached
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400">{hint}</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-medium text-slate-500 hover:text-indigo-600 bg-white border border-slate-200 px-2 py-1 rounded">
                      Browse
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Attached Files List with Thumbnails */}
          {files.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-rule/60">
              <div className="flex items-center justify-between text-2xs font-semibold text-slate-500 uppercase tracking-wider">
                <span>Selected Photographs ({files.length})</span>
                <button
                  type="button"
                  onClick={() => { files.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl)); setFiles([]) }}
                  className="text-red-600 hover:underline capitalize"
                >
                  Clear all
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto pr-1">
                {files.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center gap-2.5 p-1.5 rounded-lg border border-slate-200 bg-white shadow-subtle group"
                  >
                    <img
                      src={f.previewUrl}
                      alt={f.file.name}
                      className="w-10 h-10 object-cover rounded bg-slate-100 border border-slate-100"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-slate-800 truncate">{f.file.name}</div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400">
                        <span className="uppercase font-semibold text-slate-600">{f.imageType}</span>
                        <span>·</span>
                        <span>{(f.file.size / 1024).toFixed(0)} KB</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(f.id)}
                      className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Remove image"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {busy ? (
            <div className="p-3.5 rounded-xl border border-indigo-200 bg-indigo-50/70 text-indigo-900 text-xs flex items-center gap-3 animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600 shrink-0" />
              <span className="font-medium">{busy}</span>
            </div>
          ) : (
            <button
              type="submit"
              className="btn w-full !py-2.5 !text-xs bg-slate-900 hover:bg-indigo-700 shadow-sm flex items-center justify-center gap-2"
              disabled={!!busy}
            >
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span className="font-semibold">Create Inspection & Run AI Engine</span>
            </button>
          )}

          <p className="text-[11px] text-slate-400 text-center">
            Photographs are cryptographically hashed and archived for evidentiary integrity.
          </p>
        </section>
      </form>
    </div>
  )
}
