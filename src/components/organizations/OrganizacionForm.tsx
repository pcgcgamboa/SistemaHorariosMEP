import { useEffect, useState, type FormEvent } from 'react';
import type { Organizacion } from '../../types';

interface Props {
  initial?: Organizacion | null;
  onSubmit: (data: Omit<Organizacion, 'id' | 'creadaEn' | 'actualizadaEn'>) => void;
  onCancel: () => void;
}

const EMPTY = {
  nombre: '',
  codigo: '',
  direccionRegional: '',
  circuito: '',
  activa: true,
};

export function OrganizacionForm({ initial, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initial) {
      setForm({
        nombre: initial.nombre,
        codigo: initial.codigo,
        direccionRegional: initial.direccionRegional,
        circuito: initial.circuito,
        activa: initial.activa,
      });
    } else {
      setForm(EMPTY);
    }
    setErrors({});
  }, [initial]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.nombre.trim()) errs.nombre = 'Requerido';
    if (!form.codigo.trim()) errs.codigo = 'Requerido';
    else if (!/^[A-Z0-9_-]{2,12}$/.test(form.codigo.trim()))
      errs.codigo = '2-12 caracteres: A-Z, 0-9, _ o -';
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    onSubmit({
      nombre: form.nombre.trim(),
      codigo: form.codigo.trim().toUpperCase(),
      direccionRegional: form.direccionRegional.trim(),
      circuito: form.circuito.trim(),
      activa: form.activa,
    });
  }

  return (
    <form className="org-form" onSubmit={handleSubmit} noValidate>
      <h3>{initial ? 'Editar organización' : 'Nueva organización'}</h3>

      <label className="field">
        <span>Nombre *</span>
        <input
          type="text"
          value={form.nombre}
          onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
          required
        />
        {errors.nombre && <em className="field-error">{errors.nombre}</em>}
      </label>

      <label className="field">
        <span>Código *</span>
        <input
          type="text"
          value={form.codigo}
          onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value.toUpperCase() }))}
          placeholder="LSJM"
          required
        />
        {errors.codigo && <em className="field-error">{errors.codigo}</em>}
      </label>

      <label className="field">
        <span>Dirección Regional</span>
        <input
          type="text"
          value={form.direccionRegional}
          onChange={(e) => setForm((f) => ({ ...f, direccionRegional: e.target.value }))}
        />
      </label>

      <label className="field">
        <span>Circuito</span>
        <input
          type="text"
          value={form.circuito}
          onChange={(e) => setForm((f) => ({ ...f, circuito: e.target.value }))}
        />
      </label>

      <label className="field field-checkbox">
        <input
          type="checkbox"
          checked={form.activa}
          onChange={(e) => setForm((f) => ({ ...f, activa: e.target.checked }))}
        />
        <span>Organización activa</span>
      </label>

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary">
          {initial ? 'Guardar cambios' : 'Crear organización'}
        </button>
      </div>
    </form>
  );
}
