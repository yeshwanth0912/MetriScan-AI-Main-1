import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'

const IMAGE_TYPES = [
  ['front', 'Front / principal panel'],
  ['back', 'Back panel'],
  ['side', 'Side panel']
]

export default function NewInspection() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    brand: '', product_name: '', category: 'food', barcode: '',
    premises: '', location: '', channel: 'retail', listing_url: '', listing_text: '',
    is_imported: false, panel_width_mm: '', panel_height_mm: '', notes: ''
  })
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [k]: v }))
  }

  const addFiles = (list, imageType) =>
    setFiles((prev) => [...prev, ...Array.from(list).map((file) => ({ file, imageType, id: crypto.randomUUID() }))])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (files.length === 0 && !form.listing_text.trim()) {
      setError('Attach at least one photograph, or paste the product listing text for an online seller.')
      return
    }
    try {
      setBusy('Creating inspection…')
      const payload = {
        ...form,
        panel_width_mm: form.panel_width_mm ? Number(form.panel_width_mm) : null,
        panel_height_mm: form.panel_height_mm ? Number(form.panel_height_mm) : null
      }
      const inspection = await api.createInspection(payload)

      for (const [i, item] of files.entries()) {
        setBusy(`Uploading image ${i + 1} of ${files.length}…`)
        await api.uploadImage(inspection.id, item.file, item.imageType)
      }

      setBusy('Analysing the package…')
      await api.analyze(inspection.id)
      navigate(`/inspections/${inspection.id}`)
    } catch (err) {
      setError(err.message)
      setBusy('')
    }
  }

  return (
    <form onSubmit={submit} className="grid lg:grid-cols-3 gap-3 items-start">
      <section className="panel p-3 lg:col-span-2 space-y-3">
        <h2 className="font-semibold">Product and premises</h2>

        <div className="grid sm:grid-cols-2 gap-2">
          <div><label className="label" htmlFor="brand">Brand</label>
            <input id="brand" className="field" value={form.brand} onChange={set('brand')} /></div>
          <div><label className="label" htmlFor="product">Product name</label>
            <input id="product" className="field" value={form.product_name} onChange={set('product_name')} /></div>
          <div><label className="label" htmlFor="category">Category</label>
            <select id="category" className="field" value={form.category} onChange={set('category')}>
              <option value="food">Food</option><option value="cosmetics">Cosmetics</option>
              <option value="household">Household</option><option value="other">Other</option>
            </select></div>
          <div><label className="label" htmlFor="barcode">Barcode</label>
            <input id="barcode" className="field num" value={form.barcode} onChange={set('barcode')} /></div>
          <div><label className="label" htmlFor="premises">Premises</label>
            <input id="premises" className="field" value={form.premises} onChange={set('premises')}
              placeholder="Shop or warehouse name" /></div>
          <div><label className="label" htmlFor="location">Location</label>
            <input id="location" className="field" value={form.location} onChange={set('location')}
              placeholder="Area, city" /></div>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-1 border-t border-rule">
          <label className="flex items-center gap-2 pt-2">
            <input type="checkbox" checked={form.is_imported} onChange={set('is_imported')} />
            <span>Imported package</span>
          </label>
          <label className="flex items-center gap-2 pt-2">
            <input type="checkbox" checked={form.channel === 'ecommerce'}
              onChange={(e) => setForm((f) => ({ ...f, channel: e.target.checked ? 'ecommerce' : 'retail' }))} />
            <span>Online listing rather than a physical pack</span>
          </label>
        </div>

        {form.channel === 'ecommerce' && (
          <div className="space-y-2 pt-1">
            <div><label className="label" htmlFor="url">Listing URL</label>
              <input id="url" className="field" value={form.listing_url} onChange={set('listing_url')} /></div>
            <div><label className="label" htmlFor="listing">Listing text</label>
              <textarea id="listing" className="field font-mono text-2xs" rows={6}
                value={form.listing_text} onChange={set('listing_text')}
                placeholder="Paste the declarations shown on the product page, one per line." />
              <p className="text-2xs text-muted mt-1">
                Pasted text is checked by the same rules as a photograph, without an OCR confidence penalty.
              </p></div>
          </div>
        )}

        <div className="pt-1 border-t border-rule">
          <h3 className="font-semibold pt-2 mb-1">Panel measurement</h3>
          <p className="text-2xs text-muted mb-2">
            Character height is a physical measurement. Without the panel size in millimetres the height
            rules return “not applicable” rather than guessing from pixels.
          </p>
          <div className="grid sm:grid-cols-2 gap-2">
            <div><label className="label" htmlFor="pw">Principal panel width (mm)</label>
              <input id="pw" type="number" step="0.1" className="field num"
                value={form.panel_width_mm} onChange={set('panel_width_mm')} /></div>
            <div><label className="label" htmlFor="ph">Principal panel height (mm)</label>
              <input id="ph" type="number" step="0.1" className="field num"
                value={form.panel_height_mm} onChange={set('panel_height_mm')} /></div>
          </div>
        </div>

        <div><label className="label" htmlFor="notes">Officer notes</label>
          <textarea id="notes" className="field" rows={2} value={form.notes} onChange={set('notes')} /></div>
      </section>

      <section className="panel p-3 space-y-3">
        <h2 className="font-semibold">Photographs</h2>
        {IMAGE_TYPES.map(([value, label]) => (
          <div key={value}>
            <label className="label" htmlFor={`f-${value}`}>{label}</label>
            <input id={`f-${value}`} type="file" accept="image/jpeg,image/png,image/webp" multiple
              className="w-full text-2xs file:btn-ghost file:mr-2 file:!py-1 file:!text-2xs"
              onChange={(e) => { addFiles(e.target.files, value); e.target.value = '' }} />
          </div>
        ))}

        {files.length > 0 && (
          <ul className="space-y-1 pt-1 border-t border-rule">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-2 pt-1 text-2xs">
                <span className="num text-muted">{f.imageType}</span>
                <span className="truncate flex-1">{f.file.name}</span>
                <button type="button" className="text-fail"
                  onClick={() => setFiles((p) => p.filter((x) => x.id !== f.id))}>Remove</button>
              </li>
            ))}
          </ul>
        )}

        {error && <p role="alert" className="px-2.5 py-2 rounded border border-fail/40 bg-fail/5 text-fail">{error}</p>}

        <button className="btn w-full justify-center" disabled={!!busy}>
          {busy || 'Create and analyse'}
        </button>
        <p className="text-2xs text-muted">
          Originals are stored unmodified. Preprocessing writes a separate copy.
        </p>
      </section>
    </form>
  )
}
