import { formLimits } from '@/shared/domain/form-limits'
import { fieldIcons } from '@/shared/ui/field-icons'
import { SelectField, TextField } from '@/shared/ui/form'

import { Section, type FormProps } from './settings-form'

/** Who the company is, where it gets paid and the defaults for new estimates. */
export function CompanyTab({ form, set }: FormProps) {
  return (
    <>
      <Section title="Empresa" description="Cómo te identificas ante tus clientes.">
        <TextField
          label="Nombre comercial"
          maxLength={formLimits.companyName}
          placeholder="Reformas Abderrahim"
          icon={fieldIcons.building}
          helper="Obligatorio. Es el nombre que ve el cliente."
          value={form.name}
          onChange={set('name')}
        />
        <TextField
          label="Razón social"
          maxLength={160}
          placeholder="Reformas Abderrahim S.L."
          icon={fieldIcons.building}
          helper="El nombre legal que aparece en las facturas."
          value={form.legalName}
          onChange={set('legalName')}
        />
        <TextField
          label="NIF / CIF"
          placeholder="B12345678"
          maxLength={formLimits.taxId}
          icon={fieldIcons.id}
          value={form.taxId}
          onChange={set('taxId')}
        />
        <TextField
          label="Web"
          placeholder="https://tuempresa.es"
          icon={fieldIcons.globe}
          type="url"
          maxLength={2048}
          helper="Incluye https://, por ejemplo https://tuempresa.es."
          value={form.website}
          onChange={set('website')}
        />
      </Section>

      <Section
        title="Contacto"
        description="El teléfono se usa para recibir respuestas por WhatsApp."
      >
        <TextField
          label="Email"
          type="email"
          maxLength={formLimits.email}
          placeholder="hola@tuempresa.es"
          icon={fieldIcons.mail}
          value={form.email}
          onChange={set('email')}
        />
        <TextField
          label="Teléfono"
          type="tel"
          maxLength={formLimits.phone}
          placeholder="600 000 000"
          icon={fieldIcons.phone}
          helper="Sin prefijo se asume España (+34)."
          value={form.phone}
          onChange={set('phone')}
        />
      </Section>

      <Section title="Dirección fiscal" description="Se muestra en el documento del presupuesto.">
        <TextField
          className="sm:col-span-2"
          label="Dirección"
          placeholder="C/ Mayor 12, local 2"
          icon={fieldIcons.pin}
          maxLength={formLimits.address}
          value={form.address}
          onChange={set('address')}
        />
        <TextField
          label="Código postal"
          placeholder="08001"
          maxLength={20}
          value={form.postalCode}
          onChange={set('postalCode')}
        />
        <TextField
          label="Ciudad"
          placeholder="Barcelona"
          maxLength={100}
          value={form.city}
          onChange={set('city')}
        />
      </Section>

      <Section
        title="Cobros y valores por defecto"
        description="Se aplican a los presupuestos nuevos."
      >
        <TextField
          className="sm:col-span-2"
          label="IBAN"
          placeholder="ES00 0000 0000 0000 0000 0000"
          icon={fieldIcons.bank}
          maxLength={34}
          helper="Cuenta donde tus clientes te pagan."
          value={form.iban}
          onChange={set('iban')}
        />
        <TextField
          label="IVA por defecto (%)"
          type="number"
          min={0}
          max={100}
          step="0.01"
          placeholder="10"
          icon={fieldIcons.percent}
          helper="Entre 0 y 100."
          value={form.defaultVatRate}
          onChange={set('defaultVatRate')}
        />
        <TextField
          label="Señal por defecto (%)"
          type="number"
          min={0}
          max={100}
          step="0.01"
          placeholder="40"
          icon={fieldIcons.percent}
          helper="Primer pago al aceptar el presupuesto."
          value={form.defaultDepositPercent}
          onChange={set('defaultDepositPercent')}
        />
        <SelectField
          className="sm:col-span-2"
          label="Recordatorios por correo: facturas vencidas (cada 7 días, máx. 3), presupuestos sin respuesta a los 4 días y presupuestos que caducan en 3 días"
          value={form.autoReminders}
          options={[
            { value: 'no', label: 'Desactivados' },
            { value: 'yes', label: 'Activados' },
          ]}
          onChange={set('autoReminders')}
        />
        <SelectField
          className="sm:col-span-2"
          label="Resumen semanal por correo (cada lunes, a tu email de empresa)"
          value={form.weeklySummary}
          options={[
            { value: 'yes', label: 'Activado' },
            { value: 'no', label: 'Desactivado' },
          ]}
          onChange={set('weeklySummary')}
        />
      </Section>
    </>
  )
}
