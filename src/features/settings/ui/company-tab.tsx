import { formLimits } from '@/shared/domain/form-limits'
import { fieldIcons } from '@/shared/ui/field-icons'
import { SelectField, TextField } from '@/shared/ui/form'

import { isWebsiteOk, Section, type FormProps } from './settings-form'

/** Company identity and payment details. */
export function CompanyTab({ form, set }: FormProps) {
  return (
    <>
      <Section title="Empresa" description="Cómo te identificas ante tus clientes.">
        <TextField
          label="Nombre comercial"
          maxLength={formLimits.companyName}
          required
          showCount
          placeholder="Reformas Abderrahim"
          icon={fieldIcons.building}
          helper="Es el nombre que ve el cliente."
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
          helper={
            isWebsiteOk(form.website)
              ? 'Incluye https://, por ejemplo https://tuempresa.es.'
              : 'Escribe una dirección web válida e incluye https://.'
          }
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
          helper={
            form.email === ''
              ? 'Opcional.'
              : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
                ? 'Formato válido.'
                : 'Escribe un correo válido.'
          }
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

      <Section title="Cobros" description="Cuenta donde tus clientes te pagan.">
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
      </Section>
    </>
  )
}

export function OperatingDefaultsTab({ form, set }: FormProps) {
  return (
    <>
      <Section title="Valores por defecto" description="Se aplican a los presupuestos nuevos.">
        <TextField
          label="IVA por defecto (%)"
          type="number"
          min={0}
          max={100}
          step="0.01"
          placeholder="10"
          icon={fieldIcons.percent}
          helper="Entre 0 y 100. Se admite hasta 2 decimales."
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
          helper="Entre 0 y 100. Se admite hasta 2 decimales. Primer pago al aceptar el presupuesto."
          value={form.defaultDepositPercent}
          onChange={set('defaultDepositPercent')}
        />
      </Section>
      <Section title="Recordatorios automáticos" description="Avisos por correo a tus clientes.">
        <SelectField
          className="sm:col-span-2"
          label="Recordatorios por correo"
          value={form.autoReminders}
          options={[
            { value: 'no', label: 'Desactivados' },
            { value: 'yes', label: 'Activados' },
          ]}
          onChange={set('autoReminders')}
        />
        <p className="text-muted-foreground text-xs sm:col-span-2">
          Facturas vencidas: cada 7 días, máximo 3. Presupuestos: sin respuesta a los 4 días o que
          caducan en 3 días.
        </p>
      </Section>
    </>
  )
}
