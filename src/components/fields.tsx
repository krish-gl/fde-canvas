import { Check } from 'lucide-react';
import { PRODUCTS, type Product } from '../types';

export function TextField({ label, value, onChange, placeholder, mono, autoFocus }: {
  label: string; value: string; onChange: (value: string) => void; placeholder?: string; mono?: boolean; autoFocus?: boolean;
}) {
  return <label className="field-block">
    <span className="field-label">{label}</span>
    <input autoFocus={autoFocus} className={`field ${mono ? 'mono' : ''}`} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
  </label>;
}

export function TextArea({ label, value, onChange, placeholder, rows = 3 }: {
  label: string; value: string; onChange: (value: string) => void; placeholder?: string; rows?: number;
}) {
  return <label className="field-block">
    <span className="field-label">{label}</span>
    <textarea className="field" rows={rows} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
  </label>;
}

export function SelectField<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void;
}) {
  return <label className="field-block">
    <span className="field-label">{label}</span>
    <select className="field" value={value} onChange={e => onChange(e.target.value as T)}>
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>;
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={checked} className={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
    <span className="toggle-track"><span className="toggle-thumb" /></span>{label}
  </button>;
}

export function ProductPicker({ value, onChange }: { value: Product[]; onChange: (value: Product[]) => void }) {
  return <div className="product-picker">
    {PRODUCTS.map(product => {
      const on = value.includes(product.key);
      return <button type="button" key={product.key} className={`pick ${on ? 'on' : ''}`} aria-pressed={on}
        onClick={() => onChange(on ? value.filter(p => p !== product.key) : [...value, product.key])}>
        <span className="pick-box">{on && <Check size={11} strokeWidth={3} />}</span>{product.label}
      </button>;
    })}
  </div>;
}

// Open (red) / closed (green): whether the work on something is done. Separate from enabled / disabled.
export function StatusControl({ value, onChange }: { value: 'open' | 'closed'; onChange: (value: 'open' | 'closed') => void }) {
  return <div className="field-block">
    <span className="field-label">Status</span>
    <div className="status-control" role="radiogroup" aria-label="Status">
      {(['open', 'closed'] as const).map(option => <button key={option} type="button" role="radio" aria-checked={value === option}
        className={`status-option ${option} ${value === option ? 'on' : ''}`} onClick={() => onChange(option)}>
        {option === 'open' ? 'Open' : 'Closed'}
      </button>)}
    </div>
  </div>;
}
